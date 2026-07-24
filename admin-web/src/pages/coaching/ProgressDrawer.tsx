import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCoachWeekNote,
  fetchWarriorProgress,
  saveCoachWeekNote,
  type AssignmentRow,
  type WarriorProgressLog,
} from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';

// Mirrors ProgressTrackingScreen.tsx's FEEL_LABELS/MISSED_LABELS.
const FEEL_LABELS: Record<string, string> = { hard: 'Hard', ok: 'OK', good: 'Good', strong: 'Strong', beast: 'Beast' };
const MISSED_LABELS: Record<string, string> = {
  no_time: 'No time',
  too_tired: 'Too tired',
  injury: 'Injury',
  other: 'Other',
};

function WeekNote({ warriorProgramId, weekNumber }: { warriorProgramId: string; weekNumber: number }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const noteQ = useQuery({
    queryKey: ['coach-week-note', warriorProgramId, weekNumber],
    queryFn: () => fetchCoachWeekNote(warriorProgramId, weekNumber),
  });
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setNote(noteQ.data?.note ?? '');
    setDirty(false);
  }, [noteQ.data]);

  const saveMutation = useMutation({
    mutationFn: () => saveCoachWeekNote({ warriorProgramId, weekNumber, coachId: profile!.id, note }),
    onSuccess: () => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ['coach-week-note', warriorProgramId, weekNumber] });
    },
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      <span className="label">Coach note for week {weekNumber}</span>
      <textarea
        className="field"
        rows={2}
        placeholder="Leave feedback or instructions for this week…"
        value={note}
        disabled={noteQ.isLoading}
        onChange={(e) => {
          setNote(e.target.value);
          setDirty(true);
        }}
        aria-label={`Coach note for week ${weekNumber}`}
      />
      {saveMutation.error && <ErrorNote error={saveMutation.error} />}
      {dirty && (
        <button
          className="btn small primary"
          style={{ alignSelf: 'flex-start' }}
          disabled={saveMutation.isPending || !profile}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save note'}
        </button>
      )}
    </div>
  );
}

function LogRow({ log }: { log: WarriorProgressLog }) {
  const [expanded, setExpanded] = useState(false);
  const isMissed = log.status === 'missed';
  const hasSets = log.sets.length > 0;

  return (
    <div
      style={{ padding: '8px 0', borderBottom: '1px solid var(--hairline)', cursor: hasSets ? 'pointer' : 'default' }}
      onClick={() => hasSets && setExpanded((v) => !v)}
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700 }}>{log.block_name ?? 'Workout'}</span>
        <Badge tone={isMissed ? undefined : 'ok'}>{isMissed ? 'Missed' : 'Done'}</Badge>
      </div>
      <div className="dim" style={{ fontSize: 12 }}>
        Week {log.week_number ?? 1} · {formatDate(log.completed_at)}
      </div>
      {isMissed ? (
        <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
          {log.missed_reason ? MISSED_LABELS[log.missed_reason] ?? log.missed_reason : 'No reason given'}
          {log.missed_detail ? ` — ${log.missed_detail}` : ''}
        </div>
      ) : (
        <div className="row" style={{ gap: 10, marginTop: 4, fontSize: 12 }}>
          {log.feel && <span>{FEEL_LABELS[log.feel] ?? log.feel}</span>}
          {log.rpe !== null && <span className="dim">RPE {log.rpe}</span>}
        </div>
      )}
      {expanded && hasSets && (
        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: '1px solid var(--hairline)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {log.sets.map((s, i) => (
            <div key={i} className="row" style={{ fontSize: 12, gap: 8, flexWrap: 'nowrap' }}>
              <span className="dim" style={{ width: 52 }}>
                Set {s.set_index ?? i + 1}
              </span>
              <span style={{ flex: 1 }}>{s.exercise_name ?? 'Exercise'}</span>
              <span>
                {s.reps_completed !== null ? `${s.reps_completed} reps` : ''}
                {s.weight_used !== null ? ` @ ${s.weight_used}kg` : ''}
                {s.hold_seconds !== null ? ` ${s.hold_seconds}s hold` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      {hasSets && (
        <div className="dim" style={{ fontSize: 11, marginTop: 4 }}>
          {expanded ? '▲ Hide sets' : `▼ ${log.sets.length} set${log.sets.length === 1 ? '' : 's'} logged`}
        </div>
      )}
    </div>
  );
}

export function ProgressDrawer({ assignment }: { assignment: AssignmentRow }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['warrior-progress', assignment.id],
    queryFn: () => fetchWarriorProgress(assignment.id),
  });
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const availableWeeks = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.logs.map((l) => l.week_number ?? 1))].sort((a, b) => a - b);
  }, [data]);

  useEffect(() => {
    if (selectedWeek === null && availableWeeks.length > 0) {
      setSelectedWeek(availableWeeks[availableWeeks.length - 1]);
    }
  }, [availableWeeks, selectedWeek]);

  const visibleLogs = useMemo(() => {
    if (!data) return [];
    if (selectedWeek === null) return data.logs;
    return data.logs.filter((l) => (l.week_number ?? 1) === selectedWeek);
  }, [data, selectedWeek]);

  return (
    <div className="panel-body">
      {error && <ErrorNote error={error} />}
      {isLoading && <div className="skeleton" style={{ height: 120 }} />}
      {data && (
        <>
          {availableWeeks.length > 1 && (
            <div className="row" style={{ marginBottom: 10 }}>
              {availableWeeks.map((w) => (
                <button
                  key={w}
                  className={`btn small${w === selectedWeek ? ' primary' : ''}`}
                  onClick={() => setSelectedWeek(w)}
                >
                  Week {w}
                </button>
              ))}
            </div>
          )}

          {selectedWeek !== null && <WeekNote warriorProgramId={assignment.id} weekNumber={selectedWeek} />}

          {data.bodyweight_trend.length > 0 && (
            <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
              Latest bodyweight: <strong>{data.bodyweight_trend[0].weight_kg}kg</strong> (
              {formatDate(data.bodyweight_trend[0].logged_at)})
            </div>
          )}

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {visibleLogs.length === 0 ? (
              <div className="empty">
                <span className="label">
                  {data.logs.length === 0 ? 'No workout logs recorded yet' : 'Nothing logged this week yet'}
                </span>
              </div>
            ) : (
              visibleLogs.map((log) => <LogRow key={log.id} log={log} />)
            )}
          </div>
        </>
      )}
    </div>
  );
}
