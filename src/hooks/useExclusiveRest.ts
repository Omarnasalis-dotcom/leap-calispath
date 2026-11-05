import { useEffect, useRef } from 'react';

/**
 * One rest at a time across the workout screen (owner, 2026-11-06): a rest
 * between sets, rounds or rungs, or between blocks. The newest one stops the
 * one before it, with no alarm, and so does logging a block.
 * Hold, AMRAP and For Time timers are the work itself, so they aren't rests.
 */
let active: { stop: () => void } | null = null;

export function stopActiveRest() {
  const current = active;
  active = null;
  current?.stop();
}

/** While `running`, this is the one rest; `stop` is called if another takes over. */
export function useExclusiveRest(running: boolean, stop: () => void) {
  const stopRef = useRef(stop);
  stopRef.current = stop;

  useEffect(() => {
    if (!running) return;
    const entry = { stop: () => stopRef.current() };
    const previous = active;
    active = entry;
    previous?.stop();
    return () => {
      if (active === entry) active = null;
    };
  }, [running]);
}
