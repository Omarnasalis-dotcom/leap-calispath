/**
 * What the in-block loggers (AMRAP, For Time, ladder, circuit rounds) hand
 * the workout screen so their progress survives the app being closed mid
 * workout. Timers are kept as wall-clock anchors (when the countdown ends /
 * when the stopwatch started), so on reopen they pick up where the clock
 * really is, including time that passed while the app was closed. A timer
 * that ran out while closed comes back finished, without a buzzer.
 */

/** Superset / circuit round: the steppers' values and typed kg per exercise. */
export interface RoundSaved {
  reps: Record<string, number>;
  kg: Record<string, string>;
}

export interface AmrapSaved {
  rounds: number;
  finished: boolean;
  /** Countdown end (ms since epoch) while running, else null. */
  endAt: number | null;
  /** Seconds left when not running. */
  timeLeft: number;
}

export function restoreAmrap(saved: AmrapSaved | undefined, timeCapSeconds: number, now: number) {
  if (!saved) return { rounds: 0, finished: false, running: false, timeLeft: timeCapSeconds };
  if (saved.endAt !== null) {
    const left = Math.max(0, Math.ceil((saved.endAt - now) / 1000));
    return left > 0
      ? { rounds: saved.rounds, finished: false, running: true, timeLeft: left }
      : { rounds: saved.rounds, finished: true, running: false, timeLeft: 0 };
  }
  return { rounds: saved.rounds, finished: saved.finished, running: false, timeLeft: saved.timeLeft };
}

export interface ForTimeSaved {
  rounds: number;
  capped: boolean;
  hasStarted: boolean;
  /** Stopwatch start (ms since epoch) while running, else null. */
  startAt: number | null;
  /** Seconds on the stopwatch when not running. */
  elapsed: number;
  manualMode: boolean;
  manualMins: string;
  manualSecs: string;
}

export function restoreForTime(saved: ForTimeSaved | undefined, timeCapSeconds: number, now: number) {
  const fresh = { rounds: 0, capped: false, hasStarted: false, running: false, elapsed: 0, manualMode: false, manualMins: '', manualSecs: '' };
  if (!saved) return fresh;
  const base = { ...fresh, rounds: saved.rounds, hasStarted: saved.hasStarted, manualMode: saved.manualMode, manualMins: saved.manualMins, manualSecs: saved.manualSecs };
  if (saved.startAt !== null) {
    const secs = Math.max(0, Math.floor((now - saved.startAt) / 1000));
    if (timeCapSeconds > 0 && secs >= timeCapSeconds) return { ...base, capped: true, running: false, elapsed: timeCapSeconds };
    return { ...base, running: true, elapsed: secs };
  }
  return { ...base, capped: saved.capped, elapsed: saved.elapsed };
}

export interface LadderSaved {
  selectedIndex: number | null;
  extraReps: number;
  currentRoundIndex: number;
  /** While the timer runs: its end (countdown) or start (counting up), ms since epoch. */
  anchorAt: number | null;
  /** Timer seconds when not running (a For Time ladder's finish time). */
  timeLeft: number;
}

export function restoreLadder(
  saved: LadderSaved | undefined,
  opts: { countUp: boolean; isRestMode: boolean; restSeconds: number; rungCount: number },
  now: number,
) {
  const fresh = { selectedIndex: null as number | null, extraReps: 0, currentRoundIndex: 0, active: false, timeLeft: 0 };
  if (!saved) return fresh;
  const base = { ...fresh, selectedIndex: saved.selectedIndex, extraReps: saved.extraReps, currentRoundIndex: saved.currentRoundIndex };
  if (saved.anchorAt === null) return { ...base, timeLeft: saved.timeLeft };
  if (opts.countUp) {
    const secs = Math.max(0, Math.floor((now - saved.anchorAt) / 1000));
    if (opts.restSeconds > 0 && secs >= opts.restSeconds) return { ...base, timeLeft: opts.restSeconds };
    return { ...base, active: true, timeLeft: secs };
  }
  const left = Math.max(0, Math.ceil((saved.anchorAt - now) / 1000));
  if (left > 0) return { ...base, active: true, timeLeft: left };
  // Ran out while closed. A rest between rungs moves on to the next rung,
  // exactly as it does when the rest finishes on screen.
  if (opts.isRestMode) {
    const next = Math.min(Math.max(0, opts.rungCount - 1), saved.currentRoundIndex + 1);
    return { ...base, currentRoundIndex: next, selectedIndex: next, extraReps: 0, timeLeft: 0 };
  }
  return { ...base, timeLeft: 0 };
}
