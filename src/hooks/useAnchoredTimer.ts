import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Countdown measured from its end time, not by counting ticks. While
 * `running`, the end is fixed at start (now + `secondsLeft`) and every sync
 * sets `secondsLeft` from the clock, so time spent in the background is
 * never lost (counting `prev - 1` lost it, and on iOS the overdue tick can
 * fire before the AppState event on return). `onDone` fires once at 0.
 * Pausing = running false; resuming re-anchors from the seconds left.
 */
export function useAnchoredCountdown(
  running: boolean,
  secondsLeft: number,
  setSecondsLeft: (s: number) => void,
  onDone: () => void,
) {
  const endRef = useRef<number | null>(null);
  const live = useRef({ secondsLeft, setSecondsLeft, onDone });
  live.current = { secondsLeft, setSecondsLeft, onDone };

  useEffect(() => {
    if (!running) {
      endRef.current = null;
      return;
    }
    endRef.current = Date.now() + live.current.secondsLeft * 1000;
    const sync = () => {
      const end = endRef.current;
      if (end === null) return;
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      if (left <= 0) {
        endRef.current = null;
        live.current.setSecondsLeft(0);
        live.current.onDone();
        return;
      }
      if (left !== live.current.secondsLeft) live.current.setSecondsLeft(left);
    };
    const interval = setInterval(sync, 250);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') sync(); });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [running]);
}

/**
 * Stopwatch measured from its start time (now − `elapsed` when it starts),
 * with an optional cap: at `capSeconds` it stops at the cap and `onCap`
 * fires once.
 */
export function useAnchoredStopwatch(
  running: boolean,
  elapsed: number,
  setElapsed: (s: number) => void,
  capSeconds: number,
  onCap: () => void,
) {
  const startRef = useRef<number | null>(null);
  const live = useRef({ elapsed, setElapsed, capSeconds, onCap });
  live.current = { elapsed, setElapsed, capSeconds, onCap };

  useEffect(() => {
    if (!running) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now() - live.current.elapsed * 1000;
    const sync = () => {
      const start = startRef.current;
      if (start === null) return;
      const secs = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const cap = live.current.capSeconds;
      if (cap > 0 && secs >= cap) {
        startRef.current = null;
        live.current.setElapsed(cap);
        live.current.onCap();
        return;
      }
      if (secs !== live.current.elapsed) live.current.setElapsed(secs);
    };
    const interval = setInterval(sync, 250);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') sync(); });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [running]);
}
