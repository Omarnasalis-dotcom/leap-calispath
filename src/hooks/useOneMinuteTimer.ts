import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';

export type OneMinutePhase = 'idle' | 'ready' | 'run';

export const ONE_MINUTE_COUNTDOWN = 3;
export const ONE_MINUTE_SECONDS = 60;

/**
 * Endurance 60s timer (handoff §3.3): 3-2-1 get-ready, then 60 seconds of
 * rep tapping. Wall-clock based — every tick recomputes from the start
 * timestamp, and it re-syncs the moment the app returns to the foreground —
 * so a backgrounded phone can't stretch or freeze the minute.
 *
 * `onFinish(taps)` fires once, at 0s or on stop().
 */
export function useOneMinuteTimer(onFinish: (taps: number) => void) {
  const [phase, setPhase] = useState<OneMinutePhase>('idle');
  const [countdown, setCountdown] = useState(ONE_MINUTE_COUNTDOWN);
  const [left, setLeft] = useState(ONE_MINUTE_SECONDS);
  const [taps, setTaps] = useState(0);

  const t0 = useRef<number | null>(null);
  const tapsRef = useRef(0);
  const phaseRef = useRef<OneMinutePhase>('idle');
  const lastCd = useRef(ONE_MINUTE_COUNTDOWN);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const setPhaseBoth = (p: OneMinutePhase) => { phaseRef.current = p; setPhase(p); };

  const reset = useCallback(() => {
    t0.current = null;
    tapsRef.current = 0;
    lastCd.current = ONE_MINUTE_COUNTDOWN;
    setPhaseBoth('idle');
    setCountdown(ONE_MINUTE_COUNTDOWN);
    setLeft(ONE_MINUTE_SECONDS);
    setTaps(0);
  }, []);

  const finish = useCallback(() => {
    if (phaseRef.current !== 'run') return;
    const count = tapsRef.current;
    reset();
    onFinishRef.current(count);
  }, [reset]);

  const tick = useCallback(() => {
    if (t0.current == null) return;
    const elapsed = (Date.now() - t0.current) / 1000;
    if (elapsed < ONE_MINUTE_COUNTDOWN) {
      const cd = ONE_MINUTE_COUNTDOWN - Math.floor(elapsed);
      if (cd !== lastCd.current) {
        lastCd.current = cd;
        SoundService.playTick();
      }
      setCountdown(cd);
      return;
    }
    if (phaseRef.current === 'ready') {
      setPhaseBoth('run');
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
    }
    const remaining = Math.max(0, ONE_MINUTE_SECONDS - (elapsed - ONE_MINUTE_COUNTDOWN));
    if (remaining <= 0) {
      Vibration.vibrate([0, 500, 200, 500]);
      SoundService.playDigitalBuzzer(2);
      finish();
      return;
    }
    setLeft(remaining);
  }, [finish]);

  useEffect(() => {
    if (phase === 'idle') return;
    const iv = setInterval(tick, 100);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') tick(); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [phase, tick]);

  const start = useCallback(() => {
    reset();
    t0.current = Date.now();
    setPhaseBoth('ready');
    SoundService.playTick();
  }, [reset]);

  /** STOP: ends the minute early and hands the tapped count to onFinish. */
  const stop = useCallback(() => {
    if (phaseRef.current === 'ready') { reset(); return; }
    finish();
  }, [finish, reset]);

  const addRep = useCallback(() => {
    if (phaseRef.current !== 'run') return false;
    tapsRef.current += 1;
    setTaps(tapsRef.current);
    return true;
  }, []);

  return { phase, countdown, left, taps, start, stop, cancel: reset, addRep };
}
