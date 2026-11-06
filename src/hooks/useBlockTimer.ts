import { createContext, useCallback, useContext, useEffect, useRef } from 'react';

export type BlockTimerKind = 'rest' | 'hold' | 'amrap' | 'fortime';

/** A timer running inside a workout block. `at` is its end time, or its start
 * time when it counts up, so a closed card can show it without a re-render
 * from the timer on every tick. */
export interface LiveBlockTimer {
  kind: BlockTimerKind;
  at: number;
  countUp: boolean;
}

export interface BlockTimerReporter {
  blockId?: string | number;
  report: (owner: object, timer: LiveBlockTimer | null) => void;
  ended: (kind: BlockTimerKind) => void;
}

/** Running AMRAP and For Time timers, which end if the block list is left. */
const workRunning = new Set<object>();
export const workTimerRunning = () => workRunning.size > 0;

/** Provided by WarriorBlockCard. Without it (log sheet, tests) reports go nowhere. */
export const BlockTimerContext = createContext<BlockTimerReporter | null>(null);

/**
 * Tells the block card a timer is running, for the countdown on its closed
 * card. Returns the function to call when the timer reaches its end by
 * itself: not when the athlete cancels or resets it.
 * `seconds` is read when `running` turns true: seconds left, or seconds
 * elapsed with `countUp`.
 */
export function useBlockTimer(kind: BlockTimerKind, running: boolean, seconds: number, countUp = false) {
  const reporter = useContext(BlockTimerContext);
  const owner = useRef({}).current;
  const secondsRef = useRef(seconds);
  secondsRef.current = seconds;

  useEffect(() => {
    if (!running || !reporter) return;
    const ms = secondsRef.current * 1000;
    reporter.report(owner, { kind, at: countUp ? Date.now() - ms : Date.now() + ms, countUp });
    const isWork = kind === 'amrap' || kind === 'fortime';
    if (isWork) workRunning.add(owner);
    return () => {
      if (isWork) workRunning.delete(owner);
      reporter.report(owner, null);
    };
  }, [running, reporter, owner, kind, countUp]);

  return useCallback(() => reporter?.ended(kind), [reporter, kind]);
}

/** The timer a closed card shows: the next to end, else one counting up. */
export function nextBlockTimer(timers: LiveBlockTimer[]): LiveBlockTimer | null {
  const countdowns = timers.filter(x => !x.countUp).sort((a, b) => a.at - b.at);
  return countdowns[0] ?? timers[0] ?? null;
}

/** Seconds to show for a timer at `now`, never below 0. */
export function blockTimerSeconds(timer: LiveBlockTimer, now: number): number {
  return timer.countUp
    ? Math.max(0, Math.floor((now - timer.at) / 1000))
    : Math.max(0, Math.ceil((timer.at - now) / 1000));
}
