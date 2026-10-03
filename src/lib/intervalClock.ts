/**
 * A run of back-to-back intervals (Tabata work/rest, Quick Workout
 * EMOM/Tabata plans), as plain numbers so timers can catch up after the app
 * was in the background and schedule alerts for what's coming.
 *
 * Position = the interval being run (`index`) and the whole seconds left in
 * it (`left`). An interval of `left` seconds ends when `left` reaches 0 and
 * the next one starts at its full length; past the last interval the run is
 * done.
 */

export interface IntervalPosition {
  index: number;
  left: number;
  done: boolean;
}

/** Moves a position on by `deltaSecs` whole seconds. */
export function advanceIntervals(
  durations: number[],
  index: number,
  left: number,
  deltaSecs: number,
): IntervalPosition {
  let i = index;
  let l = left;
  let d = Math.max(0, Math.floor(deltaSecs));
  if (i >= durations.length) return { index: durations.length, left: 0, done: true };
  while (d >= l) {
    d -= l;
    i += 1;
    if (i >= durations.length) return { index: durations.length, left: 0, done: true };
    l = Math.max(1, durations[i]);
  }
  return { index: i, left: l - d, done: false };
}

/**
 * When each following interval starts, in seconds from now (`index` is the
 * interval that starts; `index === durations.length` is the end of the
 * run). `offsetSecs` delays everything (a get-ready countdown still
 * running). At most `max` entries.
 */
export function upcomingBoundaries(
  durations: number[],
  index: number,
  left: number,
  offsetSecs = 0,
  max = 60,
): { index: number; inSeconds: number }[] {
  const out: { index: number; inSeconds: number }[] = [];
  let at = offsetSecs + Math.max(0, left);
  for (let i = index + 1; i <= durations.length && out.length < max; i++) {
    out.push({ index: i, inSeconds: at });
    if (i < durations.length) at += Math.max(1, durations[i]);
  }
  return out;
}
