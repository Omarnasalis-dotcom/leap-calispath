import { useEffect, useId, useState } from 'react';
import type { WarriorProgressLog, WarriorProgressSet } from '@/api/coaching';
import { Check, ChevronDown, Minus, X } from 'lucide-react';
import { Badge } from '@/components/bits';
import { BlockConceptParser } from '@/shared/BlockConceptParser';
import { formatDate } from '@/shared/constants';
import type { BuilderBlock, BuilderDay, BuilderExercise } from './builder/types';
import { progressFor, type ExerciseProgress } from './weekInsights';
import { LastLogButton } from './builder/LastLogs';

type History = ReturnType<typeof import('./weekInsights').buildHistory>;

// Mirrors the app's labels (ProgressTrackingScreen FEEL_LABELS/MISSED_LABELS).
const FEEL_LABELS: Record<string, string> = { hard: 'Hard', ok: 'OK', good: 'Good', strong: 'Strong', beast: 'Beast' };
const MISSED_LABELS: Record<string, string> = { no_time: 'No time', too_tired: 'Too tired', injury: 'Injury', other: 'Other' };
const ROUND_STRUCTURES = new Set(['superset', 'circuit']);

/** "<Day> | <Block>" → the block half. */
function blockLabel(name: string | null): string {
  if (!name) return 'Workout';
  const sep = name.indexOf(' | ');
  return sep === -1 ? name : name.slice(sep + 3).trim() || 'Workout';
}


/** A saved note → the app's "[LOG] …" result lines and the athlete's own words
 * (same split as the app's lastTimeLog.splitLogNote). */
export function splitNote(notes: string | null): { results: string[]; own: string } {
  const results: string[] = [];
  const own: string[] = [];
  for (const raw of (notes ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('[STATUS:')) continue;
    const m = line.match(/^\[LOG\]\s*(.+)$/);
    if (!m) {
      own.push(line);
      continue;
    }
    // The app's result lines: "Weight Used: 40 KG" (the block's top weight),
    // "Completed: 3 Rounds/Reps", "Finished in: 0:14", "Ladder Progress: …".
    const weight = m[1].match(/^Weight Used:\s*(.+?)\s*KG$/i);
    if (weight) results.push(`Top weight ${weight[1]} kg`);
    else results.push(m[1].replace(/:\s*/, ' ').replace(/\s*Rounds\/Reps$/i, ' rounds'));
  }
  return { results, own: own.join(' ') };
}

const minutes = (s: number | null) => (s ? `${Math.max(1, Math.round(s / 60))} min` : null);
const key = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** What the program asked for, in plain words. */
function plannedText(ex: BuilderExercise, block: BuilderBlock): string {
  const m = block.metadata;
  const timing = m.timing_system ?? 'straight_set';
  const structure = m.structure ?? 'single';
  const target = ex.reps != null ? `${ex.reps}` : ex.hold_seconds != null ? `${ex.hold_seconds}s` : '';
  const kg = (ex.is_weighted ?? m.is_weighted) ? ' +kg' : '';
  if (timing === 'tabata') return `${m.tabata_rounds || 8} × ${m.tabata_work_seconds || 20}s on / ${m.tabata_rest_seconds || 10}s off`;
  if (structure === 'ladder') return `${BlockConceptParser.getLadderSequence(m) || 'ladder'}${kg}`;
  if (timing === 'amrap' || timing === 'fortime') return `${target ? `${target} per round` : 'per round'}${kg}`;
  if (ROUND_STRUCTURES.has(structure)) return `${m.rounds || 3} rounds × ${target || '—'}${kg}`;
  return `${ex.sets ?? '—'} × ${target || '—'}${kg}`;
}

/** One set as a chip: "8", "8 · 20 kg", "30s". Amber when under a reps target. */
export function SetChip({ s, targetReps, pr = false }: { s: WarriorProgressSet; targetReps: number | null; pr?: boolean }) {
  const parts: string[] = [];
  if (s.reps_completed != null) parts.push(String(s.reps_completed));
  if (s.hold_seconds != null) parts.push(`${s.hold_seconds}s`);
  if (s.weight_used != null && s.weight_used > 0) parts.push(`${s.weight_used} kg`);
  const short = targetReps != null && s.reps_completed != null && s.reps_completed < targetReps;
  return (
    <span
      className={`set-chip${short ? ' short' : ''}${pr ? ' pr' : ''}`}
      title={pr ? 'Personal best on this program' : short ? `Below the ${targetReps}-rep target` : undefined}
    >
      {parts.join(' · ') || '✓'}
      {pr && <span aria-label="personal best"> ★</span>}
    </span>
  );
}

export type Status = 'done' | 'missed' | 'none';

function StatusBadge({ status, detail }: { status: Status; detail?: string }) {
  if (status === 'done') return <Badge tone="ok">✓ Done{detail ? ` · ${detail}` : ''}</Badge>;
  if (status === 'missed') return <Badge tone="warn">✕ Missed{detail ? ` · ${detail}` : ''}</Badge>;
  return <Badge>Not logged</Badge>;
}

/** The block's state as a small mark before its name: ✓ done, ✕ missed, – not logged. */
function StatusMark({ status }: { status: Status }) {
  const label = status === 'done' ? 'Done' : status === 'missed' ? 'Missed' : 'Not logged';
  return (
    <span className={`wl-mark ${status}`} role="img" aria-label={label} title={label}>
      {status === 'done' ? <Check /> : status === 'missed' ? <X /> : <Minus />}
    </span>
  );
}

/** One row of segments, one per planned block: done / missed / not logged. */
export function SegmentBar({ groups, label }: { groups: Status[][]; label: string }) {
  return (
    <div className="wl-segments" role="img" aria-label={label}>
      {groups.map((g, gi) => (
        <span key={gi} className="wl-seg-group">
          {g.map((st, i) => (
            <span key={i} className={`wl-seg ${st}`} />
          ))}
        </span>
      ))}
    </div>
  );
}

/** One planned block next to what the athlete logged for it. */
function BlockLog({
  block,
  dayName,
  logs,
  dayDate,
  open,
  onToggle,
  history,
  flash,
}: {
  history: History;
  dayName: string;
  /** Just opened from an athlete note: highlighted for a moment. */
  flash: boolean;
  block: BuilderBlock;
  logs: WarriorProgressLog[];
  open: boolean;
  onToggle: () => void;
  /** The day's date: a block logged that same day doesn't repeat it. */
  dayDate: string | undefined;
}) {
  const bodyId = useId();
  // Newest log wins; earlier ones are mentioned (re-logged).
  const log = logs[0] ?? null;
  const status: Status = !log ? 'none' : log.status === 'missed' ? 'missed' : 'done';
  const { results, own } = splitNote(log?.notes ?? null);
  const sets = log && status === 'done' ? log.sets : [];
  const byExercise = new Map<string, WarriorProgressSet[]>();
  for (const s of sets) byExercise.set(key(s.exercise_name), [...(byExercise.get(key(s.exercise_name)) ?? []), s]);
  const planned = new Set(block.exercises.map((e) => key(e.exercise_name)));
  const extras = [...byExercise.keys()].filter((k) => !planned.has(k));
  const exerciseRpe = new Map(Object.entries(log?.exercise_rpe ?? {}).map(([n, r]) => [key(n), r]));
  // RPE per exercise when the athlete rated each one; a one-exercise block's
  // single rating belongs to that exercise; otherwise it's for the whole
  // block (shown in the line above) and the column is left out.
  const singleExercise = block.exercises.length === 1;
  const blockRpeOnRow = exerciseRpe.size === 0 && singleExercise && log?.rpe != null;
  // Rated once for several exercises: one merged RPE cell for the block.
  const wholeBlockRpe = exerciseRpe.size === 0 && !singleExercise && log?.rpe != null && status === 'done';
  const showRpeColumn = exerciseRpe.size > 0 || blockRpeOnRow || wholeBlockRpe;
  const rpeFor = (name: string | undefined) => exerciseRpe.get(key(name)) ?? (blockRpeOnRow ? log!.rpe : null);
  const isStraight = (block.metadata.timing_system ?? 'straight_set') === 'straight_set' && !ROUND_STRUCTURES.has(block.metadata.structure ?? 'single') && block.metadata.structure !== 'ladder';

  // Progress since the last time, per planned exercise (and extras).
  const progress = new Map<string, ExerciseProgress | null>();
  if (log && status === 'done') for (const [k, exSets] of byExercise) progress.set(k, progressFor(history, k, log.id, exSets));
  const prCount = [...progress.values()].filter((p) => p && p.prIndexes.size > 0).length;
  const sameDay = !!log && !!dayDate && formatDate(log.completed_at) === formatDate(dayDate);
  const meta = [
    log && !sameDay && formatDate(log.completed_at),
    log?.feel && `Feel ${FEEL_LABELS[log.feel] ?? log.feel}`,
    log?.rpe != null && (exerciseRpe.size > 0 ? `RPE ${log.rpe} average` : `RPE ${log.rpe}`),
    log && minutes(log.session_seconds),
    // A For Time / AMRAP / ladder result reads in the collapsed line too.
    ...results,
    logs.length > 1 && `logged ${logs.length} times`,
  ].filter(Boolean);

  return (
    <div className={`wl-block ${status}${open ? '' : ' collapsed'}${flash ? ' flash' : ''}`} data-block-id={block.db_id ?? undefined}>
      <div className="wl-block-head">
        <button
          type="button"
          className="wl-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? 'Collapse' : 'Expand'} ${blockLabel(block.name)}`}
          onClick={onToggle}
        >
          <ChevronDown className={open ? 'open' : undefined} aria-hidden="true" />
        </button>
        <StatusMark status={status} />
        <span className="wl-block-name">{blockLabel(block.name)}</span>
        <span className="wl-type">{BlockConceptParser.getStructureBadge(block.metadata)}</span>
        <span className="wl-head-spacer" />
        {prCount > 0 && <span className="wl-pr-count">★ {prCount} PR{prCount === 1 ? '' : 's'}</span>}
        {meta.length > 0 && <span className="wl-meta">{meta.join(' · ')}</span>}
        {status === 'missed' && (
          <Badge tone="warn">
            {`Missed · ${log?.missed_reason ? MISSED_LABELS[log.missed_reason] ?? log.missed_reason : 'no reason'}`}
          </Badge>
        )}
        {status === 'none' && <span className="wl-not-logged">Not logged</span>}
      </div>
      <div className="wl-block-body" id={bodyId} hidden={!open}>
        {status === 'missed' && log?.missed_detail && <div className="wl-note">“{log.missed_detail}”</div>}

        <div className="table-wrap">
          <table className="data wl-table">
            {/* Same column positions in every block, so the page scans straight down. */}
            <colgroup>
              <col className="wl-col-ex" />
              <col className="wl-col-plan" />
              <col className="wl-col-done" />
              <col className="wl-col-vs" />
              <col className="wl-col-rpe" />
            </colgroup>
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Planned</th>
                <th>Done</th>
                <th>
                  <span className="wl-vs-head">
                    vs last
                    <LastLogButton dayName={dayName} blockName={block.name ?? ''} />
                  </span>
                </th>
                <th style={{ textAlign: 'right' }}>{showRpeColumn ? 'RPE' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {block.exercises.map((ex, rowIndex) => {
                const done = (byExercise.get(key(ex.exercise_name)) ?? []).slice().sort((a, b) => (a.set_index ?? 0) - (b.set_index ?? 0));
                const target = isStraight ? ex.reps : null;
                // `done` is sorted; the progress PR indexes refer to the logged order.
                const exSets = byExercise.get(key(ex.exercise_name)) ?? [];
                const prog = progress.get(key(ex.exercise_name)) ?? null;
                return (
                  <tr key={ex.id}>
                    <td className="wl-ex">{ex.exercise_name ?? 'Exercise'}</td>
                    <td className="dim num">{plannedText(ex, block)}</td>
                    <td>
                      {done.length > 0 ? (
                        <span className="set-chips">
                          {done.map((s, i) => (
                            <SetChip key={i} s={s} targetReps={target ?? null} pr={!!prog?.prIndexes.has(exSets.indexOf(s))} />
                          ))}
                        </span>
                      ) : (
                        <span className="dim">{status === 'done' ? (results.length ? 'see result' : 'no sets entered') : '—'}</span>
                      )}
                    </td>
                    <td>{prog && <span className={`wl-vs ${prog.tone}`}>{prog.text}</span>}</td>
                    {wholeBlockRpe ? (
                      rowIndex === 0 && (
                        <td className="wl-rpe-block" rowSpan={block.exercises.length + extras.length}>
                          <span className="num">{log!.rpe}</span>
                          <span className="wl-rpe-caption">whole block</span>
                        </td>
                      )
                    ) : (
                      <td className="num" style={{ textAlign: 'right' }}>
                        {showRpeColumn ? rpeFor(ex.exercise_name) ?? '' : ''}
                      </td>
                    )}
                  </tr>
                );
              })}
              {extras.map((k) => (
                <tr key={`extra-${k}`}>
                  <td className="wl-ex">
                    {byExercise.get(k)![0].exercise_name ?? 'Exercise'} <span className="dim">(not in plan)</span>
                  </td>
                  <td className="dim">—</td>
                  <td>
                    <span className="set-chips">
                      {byExercise.get(k)!.map((s, i) => (
                        <SetChip key={i} s={s} targetReps={null} pr={!!progress.get(k)?.prIndexes.has(i)} />
                      ))}
                    </span>
                  </td>
                  <td>{progress.get(k) && <span className={`wl-vs ${progress.get(k)!.tone}`}>{progress.get(k)!.text}</span>}</td>
                  {!wholeBlockRpe && <td />}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {results.length > 0 && <div className="wl-results">{results.map((r) => <span key={r}>{r}</span>)}</div>}
        {own && <div className="wl-note">“{own}”</div>}
      </div>
    </div>
  );
}

/** A log whose block isn't in this week's plan any more (edited since). */
function OrphanLog({ log }: { log: WarriorProgressLog }) {
  const { results, own } = splitNote(log.notes);
  return (
    <div className={`wl-block ${log.status === 'missed' ? 'missed' : 'done'}`}>
      <div className="wl-block-head">
        <span className="wl-block-name">{log.block_name ?? 'Workout'}</span>
        <span style={{ flex: 1 }} />
        <StatusBadge status={log.status === 'missed' ? 'missed' : 'done'} />
      </div>
      <div className="wl-meta">
        {[formatDate(log.completed_at), log.feel && `Feel ${FEEL_LABELS[log.feel] ?? log.feel}`, log.rpe != null && `RPE ${log.rpe}`]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {log.sets.length > 0 && (
        <span className="set-chips" style={{ marginTop: 6 }}>
          {log.sets.map((s, i) => (
            <span key={i} className="set-chip">
              {s.exercise_name ?? 'Set'} {s.reps_completed ?? ''}
              {s.weight_used ? ` · ${s.weight_used} kg` : ''}
              {s.hold_seconds ? ` · ${s.hold_seconds}s` : ''}
            </span>
          ))}
        </span>
      )}
      {results.length > 0 && <div className="wl-results">{results.map((r) => <span key={r}>{r}</span>)}</div>}
      {own && <div className="wl-note">“{own}”</div>}
    </div>
  );
}

export const blockStatus = (log: WarriorProgressLog | undefined): Status =>
  !log ? 'none' : log.status === 'missed' ? 'missed' : 'done';

export interface WeekLogsSummary {
  planned: number;
  done: number;
  missed: number;
  avgRpe: number | null;
  totalSeconds: number;
}

/** Groups a week's logs under its planned days and blocks. */
export function buildWeek(days: BuilderDay[], logs: WarriorProgressLog[]) {
  const sorted = [...logs].sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const byBlock = new Map<string, WarriorProgressLog[]>();
  for (const l of sorted) if (l.block_id) byBlock.set(l.block_id, [...(byBlock.get(l.block_id) ?? []), l]);
  const plannedIds = new Set(days.flatMap((d) => d.blocks.map((b) => b.db_id).filter(Boolean) as string[]));
  const orphans = sorted.filter((l) => !l.block_id || !plannedIds.has(l.block_id));

  let done = 0;
  let missed = 0;
  for (const id of plannedIds) {
    const latest = byBlock.get(id)?.[0];
    if (latest?.status === 'missed') missed++;
    else if (latest) done++;
  }
  const completed = sorted.filter((l) => l.status === 'completed');
  const rpes = completed.map((l) => l.rpe).filter((r): r is number => r != null);
  const summary: WeekLogsSummary = {
    planned: plannedIds.size,
    done,
    missed,
    avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    totalSeconds: completed.reduce((sum, l) => sum + (l.session_seconds ?? 0), 0),
  };
  return { byBlock, orphans, summary };
}

/** The athlete's own words this week (notes, and why a block was missed),
 * in program order, each pointing at its block. */
export interface AthleteNote {
  blockId: string;
  dayName: string;
  blockName: string;
  text: string;
  missed: boolean;
  at: string;
}

export function athleteNotes(days: BuilderDay[], logs: WarriorProgressLog[]): AthleteNote[] {
  const { byBlock } = buildWeek(days, logs);
  const out: AthleteNote[] = [];
  for (const day of days) {
    for (const b of day.blocks) {
      const log = b.db_id ? byBlock.get(b.db_id)?.[0] : undefined;
      if (!log) continue;
      const missed = log.status === 'missed';
      const text = missed ? log.missed_detail?.trim() ?? '' : splitNote(log.notes).own;
      if (text) out.push({ blockId: b.db_id!, dayName: day.name, blockName: blockLabel(b.name), text, missed, at: log.completed_at });
    }
  }
  return out;
}

/** The week, day by day: every planned block with what was logged for it.
 * `focus` (from an athlete note) opens that block and scrolls to it. */
export function WeekLogs({
  days,
  logs,
  history,
  focus,
}: {
  days: BuilderDay[];
  logs: WarriorProgressLog[];
  history: History;
  focus?: { blockId: string; nonce: number } | null;
}) {
  const { byBlock, orphans } = buildWeek(days, logs);
  // Blocks start collapsed (one-line summary each); this holds the ones opened.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Days start collapsed too: each shows its header (date, bar, count).
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const toggleDay = (name: string) =>
    setOpenDays((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  const [flashId, setFlashId] = useState<string | null>(null);
  useEffect(() => {
    if (!focus) return;
    const day = days.find((d) => d.blocks.some((b) => b.db_id === focus.blockId));
    if (!day) return;
    setOpenDays((prev) => new Set(prev).add(day.name));
    setOpened((prev) => new Set(prev).add(focus.blockId));
    setFlashId(focus.blockId);
    // After the day and block have rendered open.
    const frame = window.requestAnimationFrame(() =>
      document
        .querySelector(`[data-block-id="${focus.blockId}"]`)
        ?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }),
    );
    const clear = window.setTimeout(() => setFlashId(null), 1600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
    // Only when a note is clicked (nonce changes), not when the week data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  const allIds = days.flatMap((d) => d.blocks.map((b) => b.db_id).filter(Boolean) as string[]);
  const allDayNames = days.filter((d) => d.blocks.some((b) => b.db_id)).map((d) => d.name);
  const allOpen =
    allIds.length > 0 && allIds.every((id) => opened.has(id)) && allDayNames.every((n) => openDays.has(n));

  return (
    <div className="wl">
      {allIds.length > 0 && (
        <div className="wl-expand-row">
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              setOpened(allOpen ? new Set() : new Set(allIds));
              setOpenDays(allOpen ? new Set() : new Set(allDayNames));
            }}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
      )}
      {days.map((day) => {
        const blocks = day.blocks.filter((b) => b.db_id);
        if (blocks.length === 0) return null;
        const latest = blocks.map((b) => byBlock.get(b.db_id!)?.[0]).filter(Boolean) as WarriorProgressLog[];
        const doneCount = latest.filter((l) => l.status === 'completed').length;
        const missedCount = latest.filter((l) => l.status === 'missed').length;
        const date = latest.map((l) => l.completed_at).sort().at(-1);
        const statuses = blocks.map((b) => blockStatus(byBlock.get(b.db_id!)?.[0]));
        return (
          <section key={day.id} className={`wl-day${openDays.has(day.name) ? '' : ' collapsed'}`}>
            <div className="wl-day-head">
              <button
                type="button"
                className="wl-toggle"
                aria-expanded={openDays.has(day.name)}
                aria-label={`${openDays.has(day.name) ? 'Collapse' : 'Expand'} ${day.name}`}
                onClick={() => toggleDay(day.name)}
              >
                <ChevronDown className={openDays.has(day.name) ? 'open' : undefined} aria-hidden="true" />
              </button>
              <h3>
                <button type="button" className="wl-day-title" onClick={() => toggleDay(day.name)}>
                  {day.name}
                </button>
              </h3>
              <span className="wl-day-date">{date ? formatDate(date) : 'not trained yet'}</span>
              <span className="wl-head-spacer" />
              <SegmentBar groups={[statuses]} label={`${doneCount} of ${blocks.length} blocks done`} />
              <span className="wl-day-count num">
                {doneCount}/{blocks.length}
                {missedCount > 0 && <span className="wl-missed-count"> · {missedCount} missed</span>}
              </span>
            </div>
            {openDays.has(day.name) &&
              blocks.map((b) => (
                <BlockLog
                  key={b.id}
                  block={b}
                  dayName={day.name}
                  logs={byBlock.get(b.db_id!) ?? []}
                  dayDate={date}
                  open={opened.has(b.db_id!)}
                  onToggle={() => toggle(b.db_id!)}
                  history={history}
                  flash={flashId === b.db_id}
                />
              ))}
          </section>
        );
      })}

      {orphans.length > 0 && (
        <section className="wl-day">
          <div className="wl-day-head">
            <h3>Other logs</h3>
            <span className="dim">blocks no longer in this week's plan</span>
          </div>
          {orphans.map((l) => (
            <OrphanLog key={l.id} log={l} />
          ))}
        </section>
      )}

      {/* days come from the plan; a week with logs but no plan still shows them */}
      {days.length === 0 && logs.length === 0 && <div className="empty"><span className="label">Nothing planned or logged this week</span></div>}
    </div>
  );
}

