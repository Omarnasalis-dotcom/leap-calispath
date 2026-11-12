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
} from '@/api/coaching';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { useAuth } from '@/auth/AuthProvider';
import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { useUnsavedChanges } from '@/components/UnsavedChanges';
import { ApplyTemplateForm } from './ApplyTemplateForm';
import { loadTemplateWeeks, saveTemplateWeeks, StaleProgramError } from './builderIO';
import { StaleNotice } from './StaleNotice';
import { LoggedBlocksProvider } from './LoggedBlocks';
import { LastLogsProvider } from './LastLogs';
import { WeekGrid } from './WeekGrid';
import type { BuilderWeeks } from './types';
import { PageHeader } from '@/components/layout';
import { useToast } from '@/components/Toast';

export function ClientProgramGrid() {
  const { profile, isAdmin, isCoachPaused } = useAuth();
  const { assignmentId = '' } = useParams();
  const navigate = useNavigate();
  // ?week=N opens that week; ?from=<path> is where "Save & return" and the
  // back link go (e.g. Program analytics with this client open).
  const [searchParams] = useSearchParams();
  const weekParam = Number(searchParams.get('week')) || null;
  const from = searchParams.get('from');
  const safeFrom = from && from.startsWith('/') && !from.startsWith('//') ? from : null;
  const backLabel = !safeFrom
    ? 'Clients'
    : safeFrom.startsWith('/coaching/analytics')
      ? 'Program analytics'
      : safeFrom.includes('/progress')
        ? 'Week logs'
        : 'Back';
  // Set when "Save & return" is pressed; returns once the save cleared `dirty`.
  const returnAfterSave = useRef(false);
  const [saved, setSaved] = useState(0);
  const weekInitialized = useRef(false);
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
    const start = weekParam && nums.includes(weekParam) ? weekParam : Math.min(...nums);
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
    const cloned = days.map((d) => ({
      ...d,
      id: `${d.id}-w${nextNum}-${Math.random().toString(36).slice(2, 7)}`,
      blocks: d.blocks.map((b) => ({
        ...b,
        id: `${b.id}-w${nextNum}-${Math.random().toString(36).slice(2, 7)}`,
        db_id: null,
        exercises: b.exercises.map((e) => ({ ...e, id: `${e.id}-${Math.random().toString(36).slice(2, 7)}` })),
      })),
    }));
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
        back={{ label: backLabel, to: safeFrom ?? '/coaching' }}
        title={a?.warrior_name ?? '…'}
        sub={
          <>
            {a?.template_name} · coach {a?.coach_name ?? '—'}
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

      {showApply && (
        <ApplyTemplateForm
          warriorProgramId={assignmentId}
          onApplied={() => {
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
