import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appendWeekToClientProgram,
  fetchCoachWeekNote,
  fetchWarriorProgress,
  saveCoachWeekNote,
  type AssignmentRow,
  type ClientProgramBlockPayload,
  type WarriorProgressBodyweight,
  type WarriorProgressLog,
} from '@/api/coaching';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate } from '@/shared/constants';
import { Badge, ErrorNote } from '@/components/bits';
import { downloadWeekExportPayload, fetchWeekExportPayload } from '@/shared/ProgramExportBuilder';
import { buildImportBlocksPayload, resolveImportedExercises, validateWeekImportPayload } from '@/shared/ProgramImportParser';
import { loadTemplateWeeks } from './builder/builderIO';

/** program_blocks.name is stored as "<Day> | <Block>" (see builderIO.ts /
 * useProgramBuilder.ts) — this is the same string get_warrior_progress
 * returns as block_name, so it's split back apart here to lay logs out into
 * day columns. The day half is returned verbatim (not matched against a
 * fixed weekday list) — a real program can name a day anything ("DAY 1",
 * "Push"), and forcing it through a weekday-only filter was silently
 * dropping every day that didn't match, which looked like blocks with no
 * exercises since the whole day never rendered. */
function splitBlockName(blockName: string | null): { day: string | null; label: string } {
  if (!blockName) return { day: null, label: 'Workout' };
  const sep = blockName.indexOf(' | ');
  if (sep === -1) return { day: null, label: blockName };
  const day = blockName.slice(0, sep).trim();
  const label = blockName.slice(sep + 3).trim() || 'Workout';
  return { day: day || null, label };
}

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

/** `label` is the block name with its "<Day> | " prefix already stripped —
 * the day is implied by the column this card sits in, so repeating it here
 * would be noise. Falls back to the raw block_name for logs whose block
 * doesn't parse into a known weekday (see the "Other logs" section below). */
function LogRow({ log, label }: { log: WarriorProgressLog; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const isMissed = log.status === 'missed';
  const hasSets = log.sets.length > 0;

  return (
    <div
      style={{
        padding: '8px 0',
        borderBottom: '1px solid var(--hairline)',
        cursor: hasSets ? 'pointer' : 'default',
      }}
      onClick={() => hasSets && setExpanded((v) => !v)}
    >
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'nowrap' }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
        <Badge tone={isMissed ? undefined : 'ok'}>{isMissed ? 'Missed' : 'Done'}</Badge>
      </div>
      <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
        {formatDate(log.completed_at)}
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
            <div key={i} style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span className="dim">Set {s.set_index ?? i + 1}</span>
              <span>{s.exercise_name ?? 'Exercise'}</span>
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

/** Downloads the selected week's prescribed structure + the warrior's actual
 * results as one JSON file — mirrors mobile's handleExportWeek
 * (ProgressTrackingScreen.tsx), round-trips through ImportWeekButton below. */
function ExportWeekButton({
  assignment,
  selectedWeek,
  visibleLogs,
  bodyweightTrend,
}: {
  assignment: AssignmentRow;
  selectedWeek: number | null;
  visibleLogs: WarriorProgressLog[];
  bodyweightTrend: WarriorProgressBodyweight[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function handleExport() {
    if (selectedWeek === null) return;
    setBusy(true);
    setError(null);
    try {
      const note = await fetchCoachWeekNote(assignment.id, selectedWeek);
      const payload = await fetchWeekExportPayload({
        templateId: assignment.template_id,
        templateName: assignment.template_name ?? 'Program',
        weekNumber: selectedWeek,
        warriorId: assignment.warrior_id,
        warriorDisplayName: assignment.warrior_name ?? 'Warrior',
        warriorStrengthTier: assignment.warrior_strength_tier ?? 0,
        logs: visibleLogs
          .filter((l) => !!l.block_id)
          .map((l) => ({
            blockId: l.block_id!,
            status: l.status,
            feel: l.feel,
            rpe: l.rpe,
            missedReason: l.missed_reason,
            missedDetail: l.missed_detail,
            sessionSeconds: l.session_seconds,
            notes: l.notes ?? '',
            sets: l.sets,
          })),
        bodyweightTrend,
        coachWeekNote: note?.note ?? '',
      });
      downloadWeekExportPayload(payload, `${assignment.warrior_name ?? 'warrior'}_week${selectedWeek}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Export failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
      <button className="btn small" disabled={busy || selectedWeek === null} onClick={() => void handleExport()}>
        {busy ? 'Exporting…' : `Export week${selectedWeek !== null ? ` ${selectedWeek}` : ''}`}
      </button>
      {error && <ErrorNote error={error} />}
    </span>
  );
}

/** Picks a week-export JSON file (this one's own output, or a hand-edited
 * variant) and appends it onto the client's program as a brand-new week.
 * Always append-only, same guarantee as mobile's handleImportWeek — an
 * import never overwrites or archives existing weeks. */
function ImportWeekButton({ assignment }: { assignment: AssignmentRow }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('That file is not valid JSON.');
      }
      const validation = validateWeekImportPayload(parsed);
      if (!validation.valid) throw new Error(validation.error ?? 'The file is not in the expected shape.');

      const data = parsed as { blocks: unknown[] };
      const resolved = await resolveImportedExercises(data.blocks, profile!.id);
      const blocks = buildImportBlocksPayload(data, resolved) as ClientProgramBlockPayload[];
      await appendWeekToClientProgram(assignment.id, blocks);

      setSuccess(`Added ${validation.blockCount} block(s) as a new week.`);
      void queryClient.invalidateQueries({ queryKey: ['template-weeks'] });
      void queryClient.invalidateQueries({ queryKey: ['archived-weeks'] });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Import failed.'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <span className="row" style={{ gap: 8, alignItems: 'center' }}>
      <input
        ref={inputRef}
        type="file"
        accept="application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <button
        type="button"
        className="btn small"
        disabled={busy || !profile}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Importing…' : 'Import week'}
      </button>
      {success && (
        <span className="dim" style={{ fontSize: 12 }}>
          {success}
        </span>
      )}
      {error && <ErrorNote error={error} />}
    </span>
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

  // The real day columns for this week come from the assignment's own
  // template structure (same source WeekGrid reads), not a fixed weekday
  // list — a program can have any day names/count. Shares the
  // ['template-weeks', templateId] cache key with the builder/client grid,
  // so edits made there are already reflected here.
  const templateWeeksQ = useQuery({
    queryKey: ['template-weeks', assignment.template_id],
    queryFn: () => loadTemplateWeeks(assignment.template_id),
  });

  const dayColumns = useMemo(() => {
    if (selectedWeek === null) return [];
    return (templateWeeksQ.data?.weeks[selectedWeek] ?? []).map((d) => d.name);
  }, [templateWeeksQ.data, selectedWeek]);

  // Logs whose block's day doesn't match any current column (the day was
  // deleted from the template after being logged, or the block has no
  // day prefix at all) fall into "unscheduled" instead of being dropped.
  const { byDay, unscheduled } = useMemo(() => {
    const byDay = new Map<string, Array<{ log: WarriorProgressLog; label: string }>>();
    const unscheduled: Array<{ log: WarriorProgressLog; label: string }> = [];
    const canonicalByKey = new Map(dayColumns.map((d) => [d.trim().toUpperCase(), d]));
    for (const log of visibleLogs) {
      const { day, label } = splitBlockName(log.block_name);
      const canonical = day ? canonicalByKey.get(day.trim().toUpperCase()) : undefined;
      if (canonical) {
        const list = byDay.get(canonical) ?? [];
        list.push({ log, label });
        byDay.set(canonical, list);
      } else {
        unscheduled.push({ log, label: day ? `${day} — ${label}` : label });
      }
    }
    return { byDay, unscheduled };
  }, [visibleLogs, dayColumns]);

  return (
    <div className="panel-body">
      {error && <ErrorNote error={error} />}
      {isLoading && <div className="skeleton" style={{ height: 120 }} />}
      {data && (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <div className="row" style={{ gap: 6 }}>
              {availableWeeks.length > 1 &&
                availableWeeks.map((w) => (
                  <button
                    key={w}
                    className={`btn small${w === selectedWeek ? ' primary' : ''}`}
                    onClick={() => setSelectedWeek(w)}
                  >
                    Week {w}
                  </button>
                ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <ExportWeekButton
                assignment={assignment}
                selectedWeek={selectedWeek}
                visibleLogs={visibleLogs}
                bodyweightTrend={data.bodyweight_trend}
              />
              <ImportWeekButton assignment={assignment} />
            </div>
          </div>

          {selectedWeek !== null && <WeekNote warriorProgramId={assignment.id} weekNumber={selectedWeek} />}

          {data.bodyweight_trend.length > 0 && (
            <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
              Latest bodyweight: <strong>{data.bodyweight_trend[0].weight_kg}kg</strong> (
              {formatDate(data.bodyweight_trend[0].logged_at)})
            </div>
          )}

          {visibleLogs.length === 0 ? (
            <div className="empty">
              <span className="label">
                {data.logs.length === 0 ? 'No workout logs recorded yet' : 'Nothing logged this week yet'}
              </span>
            </div>
          ) : dayColumns.length === 0 ? (
            // Template structure for this week couldn't be resolved (deleted
            // template, or the week was removed since) — fall back to a flat
            // list instead of an empty-looking grid with nothing to show.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {templateWeeksQ.isLoading && <div className="skeleton" style={{ height: 80 }} />}
              {visibleLogs.map((log) => (
                <LogRow key={log.id} log={log} label={splitBlockName(log.block_name).label} />
              ))}
            </div>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridAutoFlow: 'column',
                  gridAutoColumns: 'minmax(150px, 1fr)',
                  gap: 10,
                  overflowX: 'auto',
                }}
              >
                {dayColumns.map((dayName) => {
                  const entries = byDay.get(dayName) ?? [];
                  return (
                    <div key={dayName} className="panel" style={{ background: 'var(--surface-2)' }}>
                      <div className="panel-head" style={{ padding: '8px 10px' }}>
                        <span style={{ fontWeight: 800, fontSize: 11, letterSpacing: '0.02em' }}>
                          {dayName.toUpperCase()}
                        </span>
                      </div>
                      <div
                        className="panel-body"
                        style={{
                          padding: '6px 10px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          maxHeight: 320,
                          overflowY: 'auto',
                        }}
                      >
                        {entries.length === 0 ? (
                          <span className="dim" style={{ fontSize: 12 }}>
                            No log
                          </span>
                        ) : (
                          entries.map(({ log, label }) => <LogRow key={log.id} log={log} label={label} />)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {unscheduled.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="label" style={{ marginBottom: 6 }}>
                    Other logs
                  </div>
                  {unscheduled.map(({ log, label }) => (
                    <LogRow key={log.id} log={log} label={label} />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
