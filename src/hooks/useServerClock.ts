import { useCallback, useEffect, useRef, useState } from 'react';
import { betterClockSample, ClockSample } from '../lib/teamChallenge';

/**
 * Server time for Team Challenge, so every phone on a team shows the same
 * timer. Feed it each TimedResult from TeamChallengeService via `sync`; it
 * keeps the most accurate offset (shortest round trip). While `tickMs` is
 * set, `now` re-renders on that interval. Like useWallClockTimer, time comes
 * from the clock rather than counted ticks, so backgrounding loses nothing.
 */
export function useServerClock(tickMs: number | null) {
  const sampleRef = useRef<ClockSample | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const serverNow = useCallback(() => Date.now() + (sampleRef.current?.offsetMs ?? 0), []);

  const sync = useCallback(
    (sample: { clockOffsetMs: number; roundTripMs: number }) => {
      sampleRef.current = betterClockSample(sampleRef.current, {
        offsetMs: sample.clockOffsetMs,
        roundTripMs: sample.roundTripMs,
      });
      setNow(serverNow());
    },
    [serverNow],
  );

  useEffect(() => {
    if (tickMs == null) return;
    const id = setInterval(() => setNow(serverNow()), tickMs);
    return () => clearInterval(id);
  }, [tickMs, serverNow]);

  return { now, serverNow, sync, synced: sampleRef.current != null };
}
