import { useContext, useEffect, useRef } from 'react';
import { BlockTimerContext } from './useBlockTimer';

/**
 * One rest at a time across the workout screen (owner, 2026-11-06): a rest
 * between sets, rounds or rungs, or between blocks. The newest one stops the
 * one before it, with no alarm, and so does logging a block.
 * Hold, AMRAP and For Time timers are the work itself, so they aren't rests.
 *
 * It also outlives the block list: leaving moves it to the side countdown,
 * which keeps going on every screen (src/lib/sideRest.ts).
 */
interface ActiveRest {
  stop: () => void;
  secondsLeft: () => number;
  /** The block it's in, so the rest-over notification can go back there. */
  blockId?: string | number;
  /** The side countdown, which stays on every screen. */
  atSide: boolean;
}

let active: ActiveRest | null = null;

export function stopActiveRest() {
  const current = active;
  active = null;
  current?.stop();
}

/** Ends a rest shown inside a block and returns what the side countdown
 * needs. Null when there's none, or it's already at the side. */
export function takeRestForSide(): { seconds: number; blockId?: string | number } | null {
  if (!active || active.atSide) return null;
  const seconds = active.secondsLeft();
  const { blockId } = active;
  stopActiveRest();
  return seconds > 0 ? { seconds, blockId } : null;
}

/** While `running`, this is the one rest; `stop` is called if another takes over. */
export function useExclusiveRest(running: boolean, stop: () => void, secondsLeft: () => number, atSide = false) {
  const blockId = useContext(BlockTimerContext)?.blockId;
  const live = useRef({ stop, secondsLeft });
  live.current = { stop, secondsLeft };

  useEffect(() => {
    if (!running) return;
    const entry: ActiveRest = {
      stop: () => live.current.stop(),
      secondsLeft: () => live.current.secondsLeft(),
      blockId,
      atSide,
    };
    const previous = active;
    active = entry;
    previous?.stop();
    return () => {
      if (active === entry) active = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
}
