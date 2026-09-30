import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Elapsed time measured from a start timestamp rather than counted ticks, so
 * it stays right after the app has been in the background (the interval
 * only triggers re-renders). `capSec` stops the clock at the cap and calls
 * `onCap` once.
 */
export function useWallClockTimer(capSec: number | null, onCap?: () => void) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [stoppedAt, setStoppedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const onCapRef = useRef(onCap);
  onCapRef.current = onCap;
  const capFired = useRef(false);

  const running = startedAt != null && stoppedAt == null;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running]);

  const rawElapsed = startedAt == null ? 0 : ((stoppedAt ?? now) - startedAt) / 1000;
  const elapsed = capSec != null ? Math.min(capSec, Math.max(0, rawElapsed)) : Math.max(0, rawElapsed);

  useEffect(() => {
    if (running && capSec != null && rawElapsed >= capSec && !capFired.current) {
      capFired.current = true;
      setStoppedAt(startedAt! + capSec * 1000);
      onCapRef.current?.();
    }
  }, [running, capSec, rawElapsed, startedAt]);

  const start = useCallback(() => {
    const t = Date.now();
    capFired.current = false;
    setStartedAt(t);
    setStoppedAt(null);
    setNow(t);
  }, []);

  /** Freezes the clock; returns elapsed seconds at that moment. */
  const stop = useCallback((): number => {
    if (startedAt == null) return 0;
    const t = stoppedAt ?? Date.now();
    setStoppedAt(t);
    const secs = (t - startedAt) / 1000;
    return capSec != null ? Math.min(capSec, secs) : secs;
  }, [startedAt, stoppedAt, capSec]);

  const reset = useCallback(() => {
    capFired.current = false;
    setStartedAt(null);
    setStoppedAt(null);
  }, []);

  return { elapsed, running, started: startedAt != null, start, stop, reset };
}
