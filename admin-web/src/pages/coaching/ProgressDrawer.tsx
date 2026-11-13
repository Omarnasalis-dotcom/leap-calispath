import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
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
import { ErrorNote } from '@/components/bits';
import { downloadWeekExportPayload, fetchWeekExportPayload } from '@/shared/ProgramExportBuilder';
import { buildImportBlocksPayload, resolveImportedExercises, validateWeekImportPayload } from '@/shared/ProgramImportParser';
import { loadTemplateWeeks } from './builder/builderIO';
import { athleteNotes, blockStatus, buildWeek, SegmentBar, WeekLogs } from './WeekLogs';
import { LastLogsProvider } from './builder/LastLogs';
import { buildHistory, computeInsights, weekTotals } from './weekInsights';

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

/** "▲ 12%" / "▼ 0.8" against last week. `neutral`: no good/bad colour (RPE). */
function Delta({
  now,
  before,
  percent = false,
  neutral = false,
  format,
  sameText = '= last week',
}: {
  now: number;
  before: number;
  percent?: boolean;
  neutral?: boolean;
  format?: (d: number) => string;
  sameText?: string;
}) {
  const d = percent ? (before ? (now - before) / before : 0) : now - before;
  if (Math.abs(d) < 0.0001) return <span className="wl-delta same">{sameText}</span>;
  const text = format ? format(d) : percent ? `${Math.round(Math.abs(d) * 100)}%` : `${Math.round(Math.abs(d) * 10) / 10}`;
  return (
    <span className={`wl-delta ${neutral ? 'same' : d > 0 ? 'up' : 'down'}`} title="Change from last week">
      {d > 0 ? '▲' : '▼'} {text}
    </span>
  );
}

export function ProgressDrawer({
  assignment,
  initialWeek,
  onWeekChange,
}: {
  assignment: AssignmentRow;
  /** Open on this week (e.g. coming back from editing it). */
  initialWeek?: number | null;
  /** Lets the page keep the shown week in its address. */
  onWeekChange?: (week: number) => void;
}) {
  const location = useLocation();
  const { data, isLoading, error } = useQuery({
    queryKey: ['warrior-progress', assignment.id],
    queryFn: () => fetchWarriorProgress(assignment.id),
  });
  // The plan (days, blocks, exercises) for every week: shares the builder's
  // cache, so edits made there show here.
  const templateWeeksQ = useQuery({
    queryKey: ['template-weeks', assignment.template_id],
    queryFn: () => loadTemplateWeeks(assignment.template_id),
  });
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Every program week, plus any week that only has logs.
  const weeks = useMemo(() => {
    const set = new Set<number>(Object.keys(templateWeeksQ.data?.weeks ?? {}).map(Number));
    for (const l of data?.logs ?? []) set.add(l.week_number ?? 1);
    return [...set].sort((a, b) => a - b);
  }, [templateWeeksQ.data, data]);

  // Opens on the athlete's current week, else the latest week with a log.
  useEffect(() => {
    if (selectedWeek !== null || weeks.length === 0 || !data) return;
    const current = assignment.current_week ?? null;
    const lastLogged = Math.max(0, ...data.logs.map((l) => l.week_number ?? 1));
    setSelectedWeek(
      initialWeek && weeks.includes(initialWeek)
        ? initialWeek
        : current && weeks.includes(current)
          ? current
          : lastLogged || weeks[weeks.length - 1],
    );
  }, [weeks, selectedWeek, data, assignment.current_week, initialWeek]);

  useEffect(() => {
    if (selectedWeek !== null) onWeekChange?.(selectedWeek);
  }, [selectedWeek, onWeekChange]);

  // "Edit week N program": opens the program editor on that week, with a
  // way back to exactly here (this page, this client, this week).
  const editWeekHref = (() => {
    if (selectedWeek === null) return null;
    const back = new URLSearchParams(location.search);
    back.set('week', String(selectedWeek));
    const from = `${location.pathname}?${back.toString()}`;
    return `/coaching/clients/${assignment.id}?week=${selectedWeek}&from=${encodeURIComponent(from)}`;
  })();

  const visibleLogs = useMemo(
    () => (data?.logs ?? []).filter((l) => selectedWeek !== null && (l.week_number ?? 1) === selectedWeek),
    [data, selectedWeek],
  );
  const days = selectedWeek !== null ? templateWeeksQ.data?.weeks[selectedWeek] ?? [] : [];
  const idx = selectedWeek !== null ? weeks.indexOf(selectedWeek) : -1;
  const week = buildWeek(days, visibleLogs);
  const { summary } = week;

  // Last week, for the change line and the two-weeks-running rules.
  const prevWeek = idx > 0 ? weeks[idx - 1] : null;
  const prevDays = prevWeek !== null ? templateWeeksQ.data?.weeks[prevWeek] ?? [] : [];
  const prevLogs = (data?.logs ?? []).filter((l) => prevWeek !== null && (l.week_number ?? 1) === prevWeek);
  const prev = prevWeek !== null ? buildWeek(prevDays, prevLogs).summary : null;
  const totals = weekTotals(visibleLogs);
  const prevTotals = prevWeek !== null ? weekTotals(prevLogs) : null;
  const history = useMemo(() => buildHistory(data?.logs ?? []), [data]);
  // The athlete's notes this week; clicking one opens its block below.
  const notes = useMemo(() => athleteNotes(days, visibleLogs), [days, visibleLogs]);
  const [focus, setFocus] = useState<{ blockId: string; nonce: number } | null>(null);
  // More than one note: collapsed until opened (like the days and blocks).
  const [notesOpen, setNotesOpen] = useState(false);
  const showNotes = notes.length === 1 || notesOpen;
  const insights =
    selectedWeek !== null && data
      ? computeInsights({
          days,
          logs: visibleLogs,
          prevDays,
          prevLogs,
          allLogs: data.logs,
          isCurrentWeek: selectedWeek === assignment.current_week,
          history,
        })
      : [];

  // Every week's completion, for the program timeline.
  const timeline = weeks.map((w) => {
    const wDays = templateWeeksQ.data?.weeks[w] ?? [];
    const wLogs = (data?.logs ?? []).filter((l) => (l.week_number ?? 1) === w);
    const sm = buildWeek(wDays, wLogs).summary;
    return { week: w, pct: sm.planned ? Math.round((sm.done / sm.planned) * 100) : null, logged: wLogs.length > 0 };
  });
  // A training day counts as done when every block in it is done.
  const dayGroups = days
    .map((d) => d.blocks.filter((b) => b.db_id).map((b) => blockStatus(week.byBlock.get(b.db_id!)?.[0])))
    .filter((g) => g.length > 0);
  const daysDone = dayGroups.filter((g) => g.every((st) => st === 'done')).length;
  const bodyweight = data?.bodyweight_trend[0];

  return (
    <div className="panel-body wl-root">
      {(error || templateWeeksQ.error) && <ErrorNote error={error ?? templateWeeksQ.error} />}
      {(isLoading || templateWeeksQ.isLoading) && <div className="skeleton" style={{ height: 160 }} />}
      {data && templateWeeksQ.data && selectedWeek !== null && (
        <>
          <div className="wl-toolbar">
            <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
              <button className="btn small" disabled={idx <= 0} onClick={() => setSelectedWeek(weeks[idx - 1])} aria-label="Previous week">
                ‹
              </button>
              <select
                className="field"
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                aria-label="Week"
              >
                {weeks.map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                    {w === assignment.current_week ? ' (current)' : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn small"
                disabled={idx < 0 || idx >= weeks.length - 1}
                onClick={() => setSelectedWeek(weeks[idx + 1])}
                aria-label="Next week"
              >
                ›
              </button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {editWeekHref && (
                <Link className="btn small primary" to={editWeekHref}>
                  Edit week {selectedWeek} program
                </Link>
              )}
              <ExportWeekButton
                assignment={assignment}
                selectedWeek={selectedWeek}
                visibleLogs={visibleLogs}
                bodyweightTrend={data.bodyweight_trend}
              />
              <ImportWeekButton assignment={assignment} />
            </div>
          </div>

          {timeline.length > 1 && (
            <nav className="wl-timeline" aria-label="Program weeks">
              {timeline.map((t) => (
                <button
                  key={t.week}
                  type="button"
                  className={`wl-tl-week${t.week === selectedWeek ? ' selected' : ''}`}
                  aria-current={t.week === selectedWeek ? 'true' : undefined}
                  title={t.pct == null ? `Week ${t.week}` : `Week ${t.week}: ${t.pct}% done`}
                  onClick={() => setSelectedWeek(t.week)}
                >
                  <span className="wl-tl-bar">
                    <span className={`wl-tl-fill${t.pct === 100 ? ' full' : ''}`} style={{ height: `${t.pct ?? 0}%` }} />
                  </span>
                  <span className="wl-tl-label num">
                    W{t.week}
                    {t.week === assignment.current_week && <span className="wl-tl-now" aria-label="current week" />}
                  </span>
                </button>
              ))}
            </nav>
          )}

          <section className="wl-overview" aria-label={`Week ${selectedWeek} overview`}>
            <div className="wl-overview-main">
              <span className="label">Week {selectedWeek}{selectedWeek === assignment.current_week ? ' · current' : ''}</span>
              <div className="wl-overview-headline">
                <span className="num">{daysDone}</span>
                <span className="wl-overview-of">
                  of {dayGroups.length} training day{dayGroups.length === 1 ? '' : 's'} done
                </span>
              </div>
              <span className="wl-change-line">
                {summary.done} of {summary.planned} blocks
                {prev && (
                  <>
                    <span aria-hidden="true">·</span> last week {prev.done} of {prev.planned}
                    <Delta
                      now={summary.planned ? summary.done / summary.planned : 0}
                      before={prev.planned ? prev.done / prev.planned : 0}
                      format={(d) => `${Math.round(Math.abs(d) * 100)} pts`}
                      sameText="same rate"
                    />
                  </>
                )}
              </span>
              <SegmentBar groups={dayGroups} label={`${summary.done} of ${summary.planned} blocks done this week, ${daysDone} of ${dayGroups.length} days`} />
              <div className="wl-legend" aria-hidden="true">
                <span><i className="wl-seg done" /> Done</span>
                <span><i className="wl-seg missed" /> Missed</span>
                <span><i className="wl-seg none" /> Not logged</span>
              </div>
            </div>
            <dl className="wl-facts">
              <div>
                <dt>Missed</dt>
                <dd className={`num${summary.missed > 0 ? ' warn' : ''}`}>{summary.missed}</dd>
              </div>
              <div>
                <dt>Average RPE</dt>
                <dd className="num">
                  {summary.avgRpe ?? '—'}
                  {prev?.avgRpe != null && summary.avgRpe != null && <Delta now={summary.avgRpe} before={prev.avgRpe} neutral />}
                </dd>
              </div>
              {(summary.totalSeconds > 0 || (prev?.totalSeconds ?? 0) > 0) && (
              <div>
                <dt>Time trained</dt>
                <dd className="num">
                  {summary.totalSeconds > 0 ? `${Math.round(summary.totalSeconds / 60)} min` : '—'}
                  {prev && prev.totalSeconds > 0 && <Delta now={summary.totalSeconds / 60} before={prev.totalSeconds / 60} format={(d) => `${Math.round(Math.abs(d))} min`} />}
                </dd>
              </div>
              )}
              <div>
                <dt>Reps</dt>
                <dd className="num">
                  {totals.reps ? totals.reps.toLocaleString() : '—'}
                  {prevTotals && prevTotals.reps > 0 && <Delta now={totals.reps} before={prevTotals.reps} percent />}
                </dd>
              </div>
              <div>
                <dt>Volume</dt>
                <dd className="num">
                  {totals.volume ? `${totals.volume.toLocaleString()} kg` : '—'}
                  {prevTotals && prevTotals.volume > 0 && <Delta now={totals.volume} before={prevTotals.volume} percent />}
                </dd>
              </div>
              <div>
                <dt>Bodyweight</dt>
                <dd className="num">
                  {bodyweight ? `${bodyweight.weight_kg} kg` : '—'}
                  {bodyweight && <span className="wl-fact-sub">{formatDate(bodyweight.logged_at)}</span>}
                </dd>
              </div>
            </dl>
          </section>

          {insights.length > 0 && (
            <section className="wl-insights" aria-label="Insights">
              <span className="label">Insights</span>
              <ul>
                {insights.map((i) => (
                  <li key={i.text} className={i.tone}>
                    <span className="wl-insight-dot" aria-hidden="true" />
                    {i.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {notes.length > 0 && (
            <section className="wl-insights wl-notes" aria-label="Athlete notes">
              {notes.length > 1 ? (
                <button
                  type="button"
                  className="wl-notes-toggle"
                  aria-expanded={notesOpen}
                  aria-controls="wl-notes-list"
                  onClick={() => setNotesOpen((o) => !o)}
                >
                  <ChevronDown className={notesOpen ? 'open' : undefined} aria-hidden="true" />
                  <span className="label">Athlete notes · {notes.length}</span>
                </button>
              ) : (
                <span className="label">Athlete note</span>
              )}
              <ul id="wl-notes-list" hidden={!showNotes}>
                {notes.map((n) => (
                  <li key={n.blockId}>
                    <button
                      type="button"
                      className="wl-note-link"
                      onClick={() => setFocus((f) => ({ blockId: n.blockId, nonce: (f?.nonce ?? 0) + 1 }))}
                    >
                      <span className="wl-note-where">
                        {n.dayName} · {n.blockName}
                        {n.missed ? ' · missed' : ''} · {formatDate(n.at)}
                      </span>
                      <span className="wl-note-text">“{n.text}”</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <WeekNote warriorProgramId={assignment.id} weekNumber={selectedWeek} />

          <LastLogsProvider logs={data.logs} activeWeek={selectedWeek} progressPath={null}>
            <WeekLogs days={days} logs={visibleLogs} history={history} focus={focus} />
          </LastLogsProvider>
        </>
      )}
      {data && templateWeeksQ.data && weeks.length === 0 && (
        <div className="empty">
          <span className="label">No weeks in this program yet</span>
        </div>
      )}
    </div>
  );
}
