import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteCoachWeekData,
  fetchWarriorProgress,
  fetchArchivedWeeks,
  fetchAssignment,
  fetchExercises,
  fetchLoggedBlocks,
  fetchWarriorPrograms,
  setAssignmentStatus,
} from '@/api/coaching';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { useAuth } from '@/auth/AuthProvider';
import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { useUnsavedChanges } from '@/components/UnsavedChanges';
import { ApplyTemplateForm } from './ApplyTemplateForm';
import { PackagePanel } from '../PackagePanel';
import { ReviewsPanel } from '../ReviewsPanel';
import { loadTemplateWeeks, saveTemplateWeeks, StaleProgramError } from './builderIO';
import { StaleNotice } from './StaleNotice';
import { LoggedBlocksProvider } from './LoggedBlocks';
import { LastLogsProvider } from './LastLogs';
import { WeekGrid } from './WeekGrid';
import type { BuilderWeeks } from './types';
import { PageHeader } from '@/components/layout';
import { useToast } from '@/components/Toast';
import { formatDate, programSource } from '@/shared/constants';

/** A week's days as new, unsaved copies numbered for week `nextNum`. */
function cloneDays(days: BuilderWeeks[number], nextNum: number): BuilderWeeks[number] {
  return days.map((d) => ({
    ...d,
    id: `${d.id}-w${nextNum}-${Math.random().toString(36).slice(2, 7)}`,
    blocks: d.blocks.map((b) => ({
      ...b,
      id: `${b.id}-w${nextNum}-${Math.random().toString(36).slice(2, 7)}`,
      db_id: null,
      exercises: b.exercises.map((e) => ({ ...e, id: `${e.id}-${Math.random().toString(36).slice(2, 7)}` })),
    })),
  }));
}

/** Keyed by the program, so switching to another one (e.g. after "Start as
 * a new program") starts the editor fresh instead of reusing its state. */
export function ClientProgramGrid() {
  const { assignmentId = '' } = useParams();
  return <ClientProgramEditor key={assignmentId} assignmentId={assignmentId} />;
}

function ClientProgramEditor({ assignmentId }: { assignmentId: string }) {
  const { profile, isAdmin, isCoachPaused } = useAuth();
  const navigate = useNavigate();
  // ?week=N opens that week; ?from=<path> is where "Save & return" and the
  // back link go (e.g. Program analytics with this client open).
  const [searchParams] = useSearchParams();
  const weekParam = Number(searchParams.get('week')) || null;
  const from = searchParams.get('from');
  const safeFrom = from && from.startsWith('/') && !from.startsWith('//') ? from : null;
  // ?add=1 (from the coaching dashboard's "Build week N"): open with the
  // next week already drafted as a copy of the last one, ready to edit.
  const addParam = searchParams.get('add') === '1';
  const backLabel = !safeFrom
    ? 'Clients'
    : safeFrom === '/coaching' || safeFrom.startsWith('/coaching?')
      ? 'Dashboard'
      : safeFrom.startsWith('/coaching/analytics')
      ? 'Program analytics'
      : safeFrom.includes('/progress')
        ? 'Week logs'
        : 'Back';
  // Set when "Save & return" is pressed; returns once the save cleared `dirty`.
  const returnAfterSave = useRef(false);
  const [saved, setSaved] = useState(0);
  const weekInitialized = useRef(false);
  // The load the ?add=1 draft was made from (re-applied if the same load
  // runs again, never after a save brings a fresh one).
  const draftFor = useRef<object | null>(null);
  const queryClient = useQueryClient();
  const clipboard = useBuilderClipboard();

  const [weeks, setWeeks] = useState<BuilderWeeks>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);
  // Logged blocks whose "already logged" warning the coach has accepted
  // since the program was last loaded.
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const unsaved = useUnsavedChanges(dirty, "this athlete's program");

  const assignmentQ = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => fetchAssignment(assignmentId),
    enabled: !!assignmentId,
  });
  const templateId = assignmentQ.data?.template_id;
  // The athlete's other programs, to switch between them right here.
  const programsQ = useQuery({
    queryKey: ['warrior-programs', assignmentQ.data?.warrior_id],
    queryFn: () => fetchWarriorPrograms(assignmentQ.data!.warrior_id),
    enabled: !!assignmentQ.data?.warrior_id,
  });
  const programs = programsQ.data ?? [];
  const activeProgram = programs.find((p) => p.status === 'active');

  const exercisesQ = useQuery({ queryKey: ['exercises'], queryFn: fetchExercises });
  const exerciseOptions = useMemo(
    () =>
      (exercisesQ.data ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        youtube_url: e.youtube_url,
        pickable: isAdmin || e.created_by === profile?.id,
      })),
    [exercisesQ.data, isAdmin, profile?.id],
  );

  const loadQ = useQuery({
    queryKey: ['template-weeks', templateId],
    queryFn: () => loadTemplateWeeks(templateId as string),
    enabled: !!templateId,
  });
  const loggedQ = useQuery({
    queryKey: ['logged-blocks', assignmentId],
    queryFn: () => fetchLoggedBlocks(assignmentId),
    enabled: !!assignmentId,
  });
  const savedExerciseKeys = useMemo(
    () =>
      new Set(
        Object.values(loadQ.data?.weeks ?? {}).flatMap((ds) => ds.flatMap((d) => d.blocks.flatMap((b) => b.exercises.map((e) => e.id)))),
      ),
    [loadQ.data],
  );
  // Every log of this program, for each block's "last time" button.
  const progressQ = useQuery({
    queryKey: ['warrior-progress', assignmentId],
    queryFn: () => fetchWarriorProgress(assignmentId),
    enabled: !!assignmentId,
  });
  const archivedQ = useQuery({
    queryKey: ['archived-weeks', templateId],
    queryFn: () => fetchArchivedWeeks(templateId as string),
    enabled: !!templateId,
  });

  useEffect(() => {
    if (!loadQ.data) return;
    setWeeks(loadQ.data.weeks);
    const nums = Object.keys(loadQ.data.weeks).map(Number);
    // First load: the week asked for, else the first. After a save (reload):
    // stay on the week being edited instead of jumping back to week 1.
    // Read the flag here, not inside the updater: React runs updaters later,
    // after the flag below has already flipped.
    const firstLoad = !weekInitialized.current;
    weekInitialized.current = true;
    if (addParam && (draftFor.current === null || draftFor.current === loadQ.data)) {
      const isNew = draftFor.current === null;
      draftFor.current = loadQ.data;
      const last = Math.max(...nums);
      const nextNum = last + 1;
      setWeeks({ ...loadQ.data.weeks, [nextNum]: cloneDays(loadQ.data.weeks[last] ?? [], nextNum) });
      setActiveWeek(nextNum);
      setDirty(true);
      setAcknowledged(new Set());
      if (isNew) toast(`Week ${nextNum} drafted from week ${last}. Edit it, then save.`);
      return;
    }
    // Without ?week: the client's current week, like the app opens it (the
    // last week when current_week isn't built), not week 1 (often archived).
    const currentWeek = assignmentQ.data?.current_week;
    const fallback = currentWeek && nums.includes(currentWeek) ? currentWeek : Math.max(...nums);
    const start = weekParam && nums.includes(weekParam) ? weekParam : fallback;
    setActiveWeek((current) => (!firstLoad && nums.includes(current) ? current : start));
    setDirty(false);
    setAcknowledged(new Set());
  }, [loadQ.data]);

  // After "Save & return" succeeds: leave once `dirty` is false, so the
  // unsaved-changes guard doesn't stop it.
  useEffect(() => {
    if (saved > 0 && returnAfterSave.current && !dirty && safeFrom) {
      returnAfterSave.current = false;
      navigate(safeFrom);
    }
  }, [saved, dirty, safeFrom, navigate]);

  const weekNums = useMemo(() => Object.keys(weeks).map(Number).sort((a, b) => a - b), [weeks]);
  const days = weeks[activeWeek] ?? [];

  function duplicateWeek() {
    const nextNum = Math.max(...weekNums, 0) + 1;
    const cloned = cloneDays(days, nextNum);
    setWeeks((w) => ({ ...w, [nextNum]: cloned }));
    setActiveWeek(nextNum);
    setDirty(true);
  }

  const saveMutation = useMutation({
    // force: "Save anyway" after a stale-check refusal.
    mutationFn: (force: boolean = false) =>
      saveTemplateWeeks({
        templateId: templateId!,
        name: loadQ.data?.name ?? assignmentQ.data!.template_name ?? 'Program',
        // Kept as it is: this editor has no description field.
        description: loadQ.data?.description ?? '',
        weeks,
        expectedFingerprint: force ? undefined : loadQ.data?.fingerprint,
      }),
    onSuccess: (result) => {
      setSaved((n) => n + 1);
      setDirty(false);
      setSaveError(null);
      const message =
        result.undeletableCount > 0
          ? `Saved — ${result.undeletableCount} removed block(s) kept (already logged)`
          : 'Saved';
      setFlash(message);
      toast(message);
      window.setTimeout(() => setFlash(null), 3000);
      void queryClient.invalidateQueries({ queryKey: ['template-weeks', templateId] });
      void queryClient.invalidateQueries({ queryKey: ['logged-blocks', assignmentId] });
    },
    onError: (err: Error) => setSaveError(err),
  });

  const toast = useToast();
  const deleteWeekMutation = useMutation({
    mutationFn: () => deleteCoachWeekData(templateId!, activeWeek),
    onSuccess: () => {
      toast('Week deleted');
      void queryClient.invalidateQueries({ queryKey: ['template-weeks', templateId] });
      void queryClient.invalidateQueries({ queryKey: ['archived-weeks', templateId] });
    },
  });

  if (assignmentQ.error) {
    return (
      <div className="page">
        <ErrorNote error={assignmentQ.error} />
      </div>
    );
  }

  const a = assignmentQ.data;

  return (
    <div className="page wide">
      <PageHeader
        back={{ label: backLabel, to: safeFrom ?? '/coaching/clients' }}
        title={a?.warrior_name ?? '…'}
        sub={
          <>
            {programs.length > 1 ? (
              <select
                className="field program-switch"
                aria-label="Program"
                value={assignmentId}
                onChange={(e) =>
                  navigate(`/coaching/clients/${e.target.value}${safeFrom ? `?from=${encodeURIComponent(safeFrom)}` : ''}`)
                }
              >
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.template_name ?? 'Program'} · {p.status === 'active' ? 'active' : p.status === 'paused' ? 'paused' : 'past'} ·
                    since {formatDate(p.assigned_at)}
                  </option>
                ))}
              </select>
            ) : (
              a?.template_name
            )}{' '}
            · coach {a?.coach_name ?? '—'}
            {clipboard.clipboard && (
              <>
                {' '}
                <Badge tone="accent">clipboard: {clipboard.clipboard.type}</Badge>
              </>
            )}
          </>
        }
        actions={
          <>
                        {dirty && !flash && <Badge tone="warn">unsaved</Badge>}
            <button className="btn" disabled={isCoachPaused} onClick={() => setShowApply((s) => !s)}>
              {showApply ? 'Close' : 'Apply template…'}
            </button>
            <button
              className={`btn${safeFrom ? '' : ' primary'}`}
              disabled={!templateId || !loadQ.data || loadQ.isFetching || saveMutation.isPending || isCoachPaused}
              onClick={() => {
                returnAfterSave.current = false;
                saveMutation.mutate(false);
              }}
            >
              {saveMutation.isPending && !returnAfterSave.current ? 'Saving…' : safeFrom ? 'Save' : 'Save program'}
            </button>
            {safeFrom && (
              <button
                className="btn primary"
                disabled={!templateId || !loadQ.data || loadQ.isFetching || saveMutation.isPending || isCoachPaused}
                title={`Save, then go back to ${backLabel}`}
                onClick={() => {
                  returnAfterSave.current = true;
                  // Nothing to save: just go back.
                  if (!dirty) navigate(safeFrom);
                  else saveMutation.mutate(false);
                }}
              >
                {saveMutation.isPending && returnAfterSave.current ? 'Saving…' : `Save & return`}
              </button>
            )}
          </>
        }
      />

      {isCoachPaused && (
        <div className="notice">
          Your coaching access is paused by an admin. You can still view this client's program, but
          editing and saving is disabled until it's resumed.
        </div>
      )}
      {loadQ.error && <ErrorNote error={loadQ.error} />}
      {saveError instanceof StaleProgramError ? (
        <StaleNotice
          message={saveError.message}
          reloading={loadQ.isFetching}
          saving={saveMutation.isPending}
          onReload={() => {
            setSaveError(null);
            void loadQ.refetch();
          }}
          onSaveAnyway={() => saveMutation.mutateAsync(true).then(() => undefined)}
        />
      ) : (
        saveError && <ErrorNote error={saveError} />
      )}
      {(assignmentQ.isLoading || loadQ.isLoading) && <div className="skeleton" style={{ height: 200 }} />}

      {a && programSource(a.coach_id) === 'coach' && (
        <PackagePanel
          coachId={a.coach_id}
          warriorId={a.warrior_id}
          warriorName={a.warrior_name ?? null}
          canEdit={!isCoachPaused}
        />
      )}
      {a && programSource(a.coach_id) === 'coach' && <ReviewsPanel coachId={a.coach_id} warriorId={a.warrior_id} />}

      {a && a.status !== 'active' && (
        <div className="notice program-inactive">
          <span>
            You're viewing a {a.status === 'paused' ? 'paused' : 'past'} program.{' '}
            {activeProgram
              ? `${a.warrior_name ?? 'The athlete'} is on "${activeProgram.template_name ?? 'another program'}".`
              : `${a.warrior_name ?? 'The athlete'} has no active program.`}
          </span>
          <ConfirmButton
            label="Make this the active program"
            disabled={isCoachPaused}
            title={`Switch ${a.warrior_name ?? 'the athlete'} to "${a.template_name ?? 'this program'}"?`}
            body={`It becomes their program right away${activeProgram ? `, and "${activeProgram.template_name ?? 'the current one'}" moves to their past programs` : ''}. Nothing is deleted, and you can switch back anytime.`}
            confirmLabel="Make active"
            onConfirm={async () => {
              await setAssignmentStatus(assignmentId, 'active');
              toast(`${a.warrior_name ?? 'Athlete'} is now on "${a.template_name ?? 'this program'}".`);
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] }),
                queryClient.invalidateQueries({ queryKey: ['warrior-programs'] }),
                queryClient.invalidateQueries({ queryKey: ['assignments'] }),
                queryClient.invalidateQueries({ queryKey: ['coach-dashboard'] }),
              ]);
            }}
          />
        </div>
      )}

      {showApply && (
        <ApplyTemplateForm
          warriorProgramId={assignmentId}
          startNew={
            assignmentQ.data &&
            (programSource(assignmentQ.data.coach_id) !== 'coach' || isAdmin || assignmentQ.data.coach_id === profile?.id)
              ? {
                  coachId:
                    programSource(assignmentQ.data.coach_id) === 'coach' ? assignmentQ.data.coach_id : (profile?.id ?? ''),
                  warriorId: assignmentQ.data.warrior_id,
                  warriorName: assignmentQ.data.warrior_name ?? null,
                }
              : undefined
          }
          onApplied={(result) => {
            if (result?.newProgramId) {
              toast('New program started. The previous one is in their past programs.');
              navigate(`/coaching/clients/${result.newProgramId}${safeFrom ? `?from=${encodeURIComponent(safeFrom)}` : ''}`);
              return;
            }
            setShowApply(false);
            void queryClient.invalidateQueries({ queryKey: ['template-weeks', templateId] });
            void queryClient.invalidateQueries({ queryKey: ['archived-weeks', templateId] });
          }}
        />
      )}

      {templateId && (
        <>
          <div className="row" style={{ borderBottom: '1px solid var(--hairline)', paddingBottom: 10 }}>
            {weekNums.map((w) => (
              <button
                key={w}
                className={`btn small${w === activeWeek ? ' primary' : ''}`}
                onClick={() => setActiveWeek(w)}
              >
                Week {w}
                {archivedQ.data?.has(w) && ' 🗄'}
              </button>
            ))}
            {archivedQ.data?.has(activeWeek) && (
              <Badge tone="warn">Archived — hidden from warrior</Badge>
            )}
            <button className="btn small" disabled={isCoachPaused} onClick={duplicateWeek}>
              + Duplicate week
            </button>
            <ConfirmButton
              label="Delete week"
              danger
              // Deleting reloads the program, which would drop unsaved edits.
              disabled={isCoachPaused || dirty}
              ariaLabel={dirty ? 'Delete week (save or reload first)' : 'Delete week'}
              title={`Delete week ${activeWeek}?`}
              body="Removes every block and exercise logged against this week for this client."
              confirmLabel="Delete"
              onConfirm={() => deleteWeekMutation.mutateAsync()}
            />
          </div>

          <LoggedBlocksProvider
            athleteName={a?.warrior_name ?? ''}
            logged={loggedQ.data ?? new Map()}
            savedExerciseKeys={savedExerciseKeys}
            acknowledged={acknowledged}
            onAcknowledge={(blockDbId) => setAcknowledged((prev) => new Set(prev).add(blockDbId))}
          >
            <LastLogsProvider
              logs={progressQ.data?.logs ?? []}
              activeWeek={activeWeek}
              progressPath={`/coaching/clients/${assignmentId}/progress`}
            >
            <WeekGrid
              days={days}
              exerciseOptions={exerciseOptions}
              readOnly={isCoachPaused}
              onCommit={(days) => {
                setWeeks((w) => ({ ...w, [activeWeek]: days }));
                setDirty(true);
              }}
            />
            </LastLogsProvider>
          </LoggedBlocksProvider>
        </>
      )}
      {unsaved.dialog}
    </div>
  );
}
