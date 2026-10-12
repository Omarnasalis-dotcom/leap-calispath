// Stats for the workout finish card, computed from what was actually saved
// (workout_logs + workout_set_logs) instead of an in-memory counter — so
// re-logging a block, a missed block, an app restart or reopening a finished
// day all give the same numbers.

export interface SessionStatsBlock {
  id: string | number;
  exercises: { sets?: string | number | null; reps?: string | number | null }[];
}

export interface SessionStatsLog {
  block_id: string | number;
  notes: string | null;
  completed_at: string;
  workout_set_logs?: { reps_completed: number | null }[] | null;
}

export interface SessionStats {
  totalReps: number;
  exercisesDone: number;
  sessionSeconds: number;
}

const prescribedReps = (block: SessionStatsBlock): number =>
  block.exercises.reduce((sum, ex) => {
    const sets = parseInt(String(ex.sets || '1'), 10) || 1;
    const reps = parseInt(String(ex.reps || '0'), 10) || 0;
    return sum + sets * reps;
  }, 0);

const sameLocalDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

/**
 * @param blocks   the day's loggable blocks
 * @param logs     workout_logs rows for those blocks (any order); the latest
 *                 per block is the one that counts, like the block list
 * @param sessionStartMs when this screen/day was opened — an earlier start
 *                 than the first log on the same day, since the first block
 *                 takes time before it's logged
 */
export function computeSessionStats(
  blocks: SessionStatsBlock[],
  logs: SessionStatsLog[],
  sessionStartMs: number,
): SessionStats {
  const latest = new Map<string, SessionStatsLog>();
  for (const log of logs) {
    const key = String(log.block_id);
    const prev = latest.get(key);
    if (!prev || new Date(log.completed_at) >= new Date(prev.completed_at)) latest.set(key, log);
  }

  let totalReps = 0;
  let exercisesDone = 0;
  const times: number[] = [];
  for (const block of blocks) {
    const log = latest.get(String(block.id));
    if (!log) continue;
    times.push(new Date(log.completed_at).getTime());
    if ((log.notes || '').startsWith('[STATUS:MISSED]')) continue;
    exercisesDone += block.exercises.length;
    // Hold-time rows carry no reps. A block marked done without per-set
    // logging has no rep rows at all, so its plan stands in.
    const logged = (log.workout_set_logs || []).reduce((s, r) => s + (r.reps_completed || 0), 0);
    totalReps += logged > 0 ? logged : prescribedReps(block);
  }

  let sessionSeconds = 0;
  if (times.length > 0) {
    // A day logged across several days is timed on its last day only.
    const end = Math.max(...times);
    const sameDay = times.filter((ms) => sameLocalDay(ms, end));
    let start = Math.min(...sameDay);
    if (sessionStartMs < start && sameLocalDay(sessionStartMs, end)) start = sessionStartMs;
    sessionSeconds = Math.max(0, Math.floor((end - start) / 1000));
  }

  return { totalReps, exercisesDone, sessionSeconds };
}
