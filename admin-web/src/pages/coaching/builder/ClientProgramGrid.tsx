import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteCoachWeekData,
  fetchArchivedWeeks,
  fetchAssignment,
  fetchExercises,
} from '@/api/coaching';
import { Badge, ConfirmButton, ErrorNote } from '@/components/bits';
import { useAuth } from '@/auth/AuthProvider';
import { useBuilderClipboard } from '@/contexts/BuilderClipboardContext';
import { ApplyTemplateForm } from './ApplyTemplateForm';
import { loadTemplateWeeks, saveTemplateWeeks } from './builderIO';
import { WeekGrid } from './WeekGrid';
import type { BuilderWeeks } from './types';

export function ClientProgramGrid() {
  const { profile, isAdmin, isCoachPaused } = useAuth();
  const { assignmentId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clipboard = useBuilderClipboard();

  const [weeks, setWeeks] = useState<BuilderWeeks>({ 1: [] });
  const [activeWeek, setActiveWeek] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showApply, setShowApply] = useState(false);

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
  const archivedQ = useQuery({
    queryKey: ['archived-weeks', templateId],
    queryFn: () => fetchArchivedWeeks(templateId as string),
    enabled: !!templateId,
  });

  useEffect(() => {
    if (!loadQ.data) return;
    setWeeks(loadQ.data.weeks);
    setActiveWeek(Math.min(...Object.keys(loadQ.data.weeks).map(Number)));
    setDirty(false);
  }, [loadQ.data]);

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
    mutationFn: () =>
      saveTemplateWeeks({ templateId: templateId!, name: assignmentQ.data!.template_name ?? 'Program', description: '', weeks }),
    onSuccess: (result) => {
      setDirty(false);
      setSaveError(null);
      setFlash(
        result.undeletableCount > 0
          ? `Saved — ${result.undeletableCount} removed block(s) kept (already logged)`
          : 'Saved',
      );
      window.setTimeout(() => setFlash(null), 3000);
      void queryClient.invalidateQueries({ queryKey: ['template-weeks', templateId] });
    },
    onError: (err: Error) => setSaveError(err),
  });

  const deleteWeekMutation = useMutation({
    mutationFn: () => deleteCoachWeekData(templateId!, activeWeek),
    onSuccess: () => {
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
      <div className="page-head">
        <div>
          <div className="label" style={{ marginBottom: 4 }}>
            <button className="btn small" onClick={() => navigate('/coaching')}>
              ← Clients
            </button>
          </div>
          <h1>{a?.warrior_name ?? '…'}</h1>
          <div className="sub">
            {a?.template_name} · coach {a?.coach_name ?? '—'}
            {clipboard.clipboard && (
              <>
                {' '}
                <Badge tone="accent">clipboard: {clipboard.clipboard.type}</Badge>
              </>
            )}
          </div>
        </div>
        <div className="row">
          {flash && <Badge tone="ok">{flash}</Badge>}
          {dirty && !flash && <Badge tone="warn">unsaved</Badge>}
          <button className="btn" disabled={isCoachPaused} onClick={() => setShowApply((s) => !s)}>
            {showApply ? 'Close' : 'Apply template…'}
          </button>
          <button
            className="btn primary"
            disabled={!templateId || saveMutation.isPending || isCoachPaused}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save program'}
          </button>
        </div>
      </div>

      {isCoachPaused && (
        <div className="notice">
          Your coaching access is paused by an admin. You can still view this client's program, but
          editing and saving is disabled until it's resumed.
        </div>
      )}
      {loadQ.error && <ErrorNote error={loadQ.error} />}
      {saveError && <ErrorNote error={saveError} />}
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
              disabled={isCoachPaused}
              title={`Delete week ${activeWeek}?`}
              body="Removes every block and exercise logged against this week for this client."
              confirmLabel="Delete"
              onConfirm={() => deleteWeekMutation.mutateAsync()}
            />
          </div>

          <WeekGrid
            days={days}
            exerciseOptions={exerciseOptions}
            readOnly={isCoachPaused}
            onCommit={(days) => {
              setWeeks((w) => ({ ...w, [activeWeek]: days }));
              setDirty(true);
            }}
          />
        </>
      )}
    </div>
  );
}
