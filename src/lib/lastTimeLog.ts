// "Last time" for an exercise in the workout runner (2026-10-30, owner
// decisions): the most recent earlier week this exercise was logged in the
// active program, on any day — its sets (reps / weight / hold), the block's
// RPE and feel, its result lines and the athlete's own note. Matched by the
// set's exercise_id, since program edits recreate block_exercises.

export interface LastTimeSet {
  setIndex: number;
  reps: number | null;
  weight: number | null;
  hold: number | null;
  planned: boolean; // filled from the plan, not typed by the athlete
}

export type LastTimeResult =
  | { kind: 'finished'; value: string }
  | { kind: 'completed'; value: string }
  | { kind: 'ladder'; value: string }
  | { kind: 'weight'; value: string };

export interface LastTimeLog {
  weekNumber: number; // raw program week; the screen maps it to the display week
  dayName: string;
  completedAt: string;
  sets: LastTimeSet[];
  notDone: boolean; // only a 0-rep row: the athlete logged the block but skipped this exercise
  rpe: number | null;
  feel: string | null;
  results: LastTimeResult[];
  note: string;
}

export interface LastTimeSourceLog {
  block_id: string;
  notes: string | null;
  feel: string | null;
  rpe: number | null;
  completed_at: string;
  workout_set_logs?: Array<{
    block_exercise_id: string | null;
    exercise_id?: string | null;
    set_index: number;
    reps_completed: number | null;
    weight_used: number | string | null;
    hold_seconds: number | string | null;
    source?: string | null;
  }> | null;
}

const PLANNED_SOURCES = new Set(['planned', 'planned_backfill', 'tabata_backfill']);

const toNum = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Splits a saved log note into the "[LOG] ..." result lines and the
// athlete's own words. '[STATUS:MISSED]' notes never reach here.
export function splitLogNote(notes: string | null): { results: LastTimeResult[]; note: string } {
  const results: LastTimeResult[] = [];
  const own: string[] = [];
  for (const raw of (notes || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^\[LOG\]\s*(Finished in|Completed|Ladder Progress|Weight Used):\s*(.*)$/i);
    if (!m) {
      if (!line.startsWith('[LOG]')) own.push(line);
      continue;
    }
    const label = m[1].toLowerCase();
    const value = m[2].trim();
    if (label === 'finished in') results.push({ kind: 'finished', value });
    else if (label === 'completed') results.push({ kind: 'completed', value: value.replace(/\s*Rounds\/Reps$/i, '') });
    else if (label === 'ladder progress') results.push({ kind: 'ladder', value });
    else results.push({ kind: 'weight', value: value.replace(/\s*KG$/i, '') });
  }
  return { results, note: own.join('\n') };
}

// exerciseId -> every logged session of it, newest first.
export function indexLastTimeLogs(
  logs: LastTimeSourceLog[],
  blockInfo: Map<string, { weekNumber: number; dayName: string }>,
  exerciseIdByBlockExercise: Map<string, string>,
): Map<string, LastTimeLog[]> {
  const index = new Map<string, LastTimeLog[]>();
  for (const log of logs) {
    if ((log.notes || '').startsWith('[STATUS:MISSED]')) continue;
    const info = blockInfo.get(String(log.block_id));
    if (!info) continue;
    const byExercise = new Map<string, LastTimeSet[]>();
    for (const s of log.workout_set_logs || []) {
      const exId = s.exercise_id ?? (s.block_exercise_id ? exerciseIdByBlockExercise.get(String(s.block_exercise_id)) : undefined);
      if (!exId) continue;
      const list = byExercise.get(exId) ?? [];
      list.push({
        setIndex: s.set_index,
        reps: s.reps_completed,
        weight: toNum(s.weight_used),
        hold: toNum(s.hold_seconds),
        planned: PLANNED_SOURCES.has(s.source ?? ''),
      });
      byExercise.set(exId, list);
    }
    if (byExercise.size === 0) continue;
    const { results, note } = splitLogNote(log.notes);
    byExercise.forEach((sets, exId) => {
      sets.sort((a, b) => a.setIndex - b.setIndex);
      const notDone = sets.every(s => !s.reps && s.weight === null && s.hold === null);
      // The block's "Weight Used" line only adds something when no set carries a weight.
      const hasSetWeight = sets.some(s => (s.weight ?? 0) > 0);
      const entry: LastTimeLog = {
        weekNumber: info.weekNumber,
        dayName: info.dayName,
        completedAt: log.completed_at,
        sets: notDone ? [] : sets,
        notDone,
        rpe: log.rpe,
        feel: log.feel,
        results: results.filter(r => r.kind !== 'weight' || !hasSetWeight),
        note,
      };
      const list = index.get(exId) ?? [];
      list.push(entry);
      index.set(exId, list);
    });
  }
  index.forEach(list => list.sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1)));
  return index;
}

// The newest session of this exercise from a week before `beforeWeek`.
export function lastTimeFor(index: Map<string, LastTimeLog[]>, exerciseId: string | null | undefined, beforeWeek: number): LastTimeLog | undefined {
  if (!exerciseId) return undefined;
  return index.get(String(exerciseId))?.find(l => l.weekNumber < beforeWeek);
}
