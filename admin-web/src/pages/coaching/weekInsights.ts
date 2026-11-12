// Numbers and plain-language hints for a client's week logs: progress per
// exercise since the last time, personal bests on this program, week
// totals, and simple coaching rules. Pure functions over the logs the
// panel already loads (get_warrior_progress) and the plan (template weeks).
import type { WarriorProgressLog, WarriorProgressSet } from '@/api/coaching';
import type { BuilderBlock, BuilderDay } from './builder/types';

export const exKey = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
export const blockLabelOf = (name: string | null) => {
  if (!name) return 'Workout';
  const sep = name.indexOf(' | ');
  return sep === -1 ? name : name.slice(sep + 3).trim() || 'Workout';
};

type Kind = 'kg' | 'reps' | 's';
const UNIT: Record<Kind, string> = { kg: 'kg', reps: 'rep', s: 's' };

/** How an exercise is measured: weight if any set had one, else reps, else hold. */
function kindOf(sets: WarriorProgressSet[]): Kind | null {
  if (sets.some((s) => (s.weight_used ?? 0) > 0)) return 'kg';
  if (sets.some((s) => s.reps_completed != null)) return 'reps';
  if (sets.some((s) => s.hold_seconds != null)) return 's';
  return null;
}

function valueOf(s: WarriorProgressSet, kind: Kind): number | null {
  if (kind === 'kg') return (s.weight_used ?? 0) > 0 ? s.weight_used : null;
  if (kind === 'reps') return s.reps_completed;
  return s.hold_seconds;
}

const best = (sets: WarriorProgressSet[], kind: Kind) =>
  Math.max(-Infinity, ...sets.map((s) => valueOf(s, kind)).filter((v): v is number => v != null));

interface Entry {
  at: string;
  logId: string;
  sets: WarriorProgressSet[];
}

/** Every completed log's sets, per exercise, oldest first. */
export function buildHistory(allLogs: WarriorProgressLog[]): Map<string, Entry[]> {
  const history = new Map<string, Entry[]>();
  const completed = allLogs.filter((l) => l.status === 'completed').sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  for (const log of completed) {
    const byEx = new Map<string, WarriorProgressSet[]>();
    for (const s of log.sets) byEx.set(exKey(s.exercise_name), [...(byEx.get(exKey(s.exercise_name)) ?? []), s]);
    for (const [k, sets] of byEx) history.set(k, [...(history.get(k) ?? []), { at: log.completed_at, logId: log.id, sets }]);
  }
  return history;
}

export interface ExerciseProgress {
  /** "▲ +2 reps", "▼ −5 kg", "= same", "first time" */
  text: string;
  tone: 'up' | 'down' | 'same' | 'new';
  /** Indexes (into the sets as given) that beat every earlier set on this program. */
  prIndexes: Set<number>;
}

/** This log's sets of one exercise against the last time and against its best. */
export function progressFor(history: Map<string, Entry[]>, exercise: string, logId: string, sets: WarriorProgressSet[]): ExerciseProgress | null {
  const kind = kindOf(sets);
  if (!kind || sets.length === 0) return null;
  const entries = history.get(exKey(exercise)) ?? [];
  const at = entries.find((e) => e.logId === logId)?.at;
  const earlier = at ? entries.filter((e) => e.at < at) : [];
  const previous = earlier.at(-1);
  if (!previous) return { text: 'first time', tone: 'new', prIndexes: new Set() };

  const prevKind = kindOf(previous.sets);
  const now = best(sets, kind);
  const allTime = best(earlier.flatMap((e) => e.sets), kind);
  const prIndexes = new Set<number>();
  if (Number.isFinite(allTime)) sets.forEach((s, i) => (valueOf(s, kind) ?? -Infinity) > allTime && prIndexes.add(i));

  if (prevKind !== kind) return { text: 'changed', tone: 'same', prIndexes };
  const delta = Math.round((now - best(previous.sets, kind)) * 10) / 10;
  if (delta === 0) return { text: '= same', tone: 'same', prIndexes };
  const unit = UNIT[kind] + (kind === 'reps' && Math.abs(delta) !== 1 ? 's' : '');
  return delta > 0
    ? { text: `▲ +${delta} ${unit}`, tone: 'up', prIndexes }
    : { text: `▼ −${Math.abs(delta)} ${unit}`, tone: 'down', prIndexes };
}

/** Reps and kg lifted (reps × kg) in a week's completed logs. */
export function weekTotals(logs: WarriorProgressLog[]): { reps: number; volume: number } {
  let reps = 0;
  let volume = 0;
  for (const l of logs) {
    if (l.status !== 'completed') continue;
    for (const s of l.sets) {
      reps += s.reps_completed ?? 0;
      if ((s.weight_used ?? 0) > 0 && s.reps_completed) volume += s.reps_completed * s.weight_used!;
    }
  }
  return { reps, volume: Math.round(volume) };
}

export interface Insight {
  tone: 'good' | 'watch' | 'info';
  text: string;
}

const ROUNDS = new Set(['superset', 'circuit', 'ladder']);
const isStraight = (b: BuilderBlock) =>
  (b.metadata.timing_system ?? 'straight_set') === 'straight_set' && !ROUNDS.has(b.metadata.structure ?? 'single');
const list = (names: string[]) =>
  names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

function latestByBlock(logs: WarriorProgressLog[]) {
  const m = new Map<string, WarriorProgressLog>();
  for (const l of [...logs].sort((a, b) => b.completed_at.localeCompare(a.completed_at))) {
    if (l.block_id && !m.has(l.block_id)) m.set(l.block_id, l);
  }
  return m;
}

/** Simple rules a coach would check, in plain words. */
export function computeInsights(input: {
  days: BuilderDay[];
  logs: WarriorProgressLog[];
  prevDays: BuilderDay[];
  prevLogs: WarriorProgressLog[];
  allLogs: WarriorProgressLog[];
  isCurrentWeek: boolean;
  history: Map<string, Entry[]>;
}): Insight[] {
  const { days, logs, prevDays, prevLogs, allLogs, isCurrentWeek, history } = input;
  const out: Insight[] = [];
  const latest = latestByBlock(logs);
  const prevLatest = latestByBlock(prevLogs);
  const blocks = days.flatMap((d) => d.blocks.filter((b) => b.db_id).map((b) => ({ day: d.name, block: b })));

  // Personal bests this week.
  let prs = 0;
  for (const l of logs) {
    if (l.status !== 'completed') continue;
    const byEx = new Map<string, WarriorProgressSet[]>();
    for (const s of l.sets) byEx.set(exKey(s.exercise_name), [...(byEx.get(exKey(s.exercise_name)) ?? []), s]);
    for (const [k, sets] of byEx) prs += progressFor(history, k, l.id, sets)?.prIndexes.size ? 1 : 0;
  }
  if (prs > 0) out.push({ tone: 'good', text: `${prs} personal best${prs === 1 ? '' : 's'} this week (★ in the sets below).` });

  // Easy two weeks running, by block name.
  const prevRpeByLabel = new Map<string, number>();
  for (const d of prevDays) for (const b of d.blocks) {
    const l = b.db_id ? prevLatest.get(b.db_id) : undefined;
    if (l?.status === 'completed' && l.rpe != null) prevRpeByLabel.set(exKey(blockLabelOf(b.name)), l.rpe);
  }
  const easy = new Set<string>();
  const hard = new Set<string>();
  for (const { block } of blocks) {
    const l = latest.get(block.db_id!);
    if (l?.status !== 'completed' || l.rpe == null) continue;
    const label = blockLabelOf(block.name);
    const prev = prevRpeByLabel.get(exKey(label));
    if (l.rpe <= 3 && prev != null && prev <= 3) easy.add(label);
    if (l.rpe >= 9) hard.add(label);
  }
  if (easy.size) out.push({ tone: 'watch', text: `${list([...easy])} rated RPE 3 or lower two weeks running: room to progress.` });
  if (hard.size) out.push({ tone: 'watch', text: `${list([...hard])} felt very hard (RPE 9 or more): check recovery or ease off.` });

  // Sets under target in straight-set blocks.
  const short: string[] = [];
  for (const { day, block } of blocks) {
    if (!isStraight(block)) continue;
    const l = latest.get(block.db_id!);
    if (l?.status !== 'completed') continue;
    for (const ex of block.exercises) {
      if (ex.reps == null) continue;
      const sets = l.sets.filter((s) => exKey(s.exercise_name) === exKey(ex.exercise_name) && s.reps_completed != null);
      const under = sets.filter((s) => s.reps_completed! < ex.reps!).length;
      if (sets.length >= 2 && under >= Math.ceil(sets.length / 2)) short.push(`${ex.exercise_name} under target in ${under} of ${sets.length} sets (${day})`);
    }
  }
  for (const s of short.slice(0, 3)) out.push({ tone: 'watch', text: `${s}.` });

  // The same day missed two weeks running.
  const missedDays = (ds: BuilderDay[], lat: Map<string, WarriorProgressLog>) =>
    new Set(ds.filter((d) => d.blocks.some((b) => b.db_id && lat.get(b.db_id)?.status === 'missed')).map((d) => exKey(d.name)));
  const nowMissed = missedDays(days, latest);
  const prevMissed = missedDays(prevDays, prevLatest);
  const twice = days.filter((d) => nowMissed.has(exKey(d.name)) && prevMissed.has(exKey(d.name))).map((d) => d.name);
  if (twice.length) out.push({ tone: 'watch', text: `Missed ${list(twice)} two weeks running.` });

  // Gone quiet (current week only).
  if (isCurrentWeek) {
    const last = allLogs.filter((l) => l.status === 'completed').map((l) => l.completed_at).sort().at(-1);
    const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000) : null;
    if (daysSince != null && daysSince >= 5) out.push({ tone: 'watch', text: `No workout logged for ${daysSince} days.` });
    if (daysSince == null) out.push({ tone: 'info', text: 'No workout logged on this program yet.' });
  }

  return out;
}
