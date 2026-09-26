import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';

export type HoldPhase = 'idle' | 'ready' | 'run' | 'stopped';

export const HOLD_COUNTDOWN = 3;

/**
 * Static hold timer (handoff §1.4): 3-2-1 get-ready, then counts up until
 * stop(). Wall-clock based and re-synced on returning to the foreground, so
 * backgrounding the phone mid-hold neither pauses nor stretches the time.
 * `seconds` is fractional while running; stop() freezes it to whole seconds
 * (what submit_static_hold stores).
 */
export function useHoldTimer() {
  const [phase, setPhase] = useState<HoldPhase>('idle');
  const [countdown, setCountdown] = useState(HOLD_COUNTDOWN);
  const [seconds, setSeconds] = useState(0);

  const t0 = useRef<number | null>(null);
  const phaseRef = useRef<HoldPhase>('idle');
  const lastCd = useRef(HOLD_COUNTDOWN);
  const setPhaseBoth = (p: HoldPhase) => { phaseRef.current = p; setPhase(p); };

  const tick = useCallback(() => {
    if (t0.current == null) return;
    const elapsed = (Date.now() - t0.current) / 1000;
    if (elapsed < HOLD_COUNTDOWN) {
      const cd = HOLD_COUNTDOWN - Math.floor(elapsed);
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
    setSeconds(elapsed - HOLD_COUNTDOWN);
  }, []);

  useEffect(() => {
    if (phase !== 'ready' && phase !== 'run') return;
    const iv = setInterval(tick, 100);
    const sub = AppState.addEventListener('change', s => { if (s === 'active') tick(); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [phase, tick]);

  const start = useCallback(() => {
    t0.current = Date.now();
    lastCd.current = HOLD_COUNTDOWN;
    setCountdown(HOLD_COUNTDOWN);
    setSeconds(0);
    setPhaseBoth('ready');
    SoundService.playTick();
  }, []);

  const stop = useCallback(() => {
    if (phaseRef.current !== 'run' || t0.current == null) return;
    const final = Math.floor((Date.now() - t0.current) / 1000 - HOLD_COUNTDOWN);
    t0.current = null;
    setSeconds(Math.max(0, final));
    setPhaseBoth('stopped');
  }, []);

  const reset = useCallback(() => {
    t0.current = null;
    setSeconds(0);
    setCountdown(HOLD_COUNTDOWN);
    setPhaseBoth('idle');
  }, []);

  /** ±1s ADJUST on a stopped hold. */
  const adjust = useCallback((d: number) => setSeconds(s => Math.max(0, Math.round(s) + d)), []);

  return { phase, countdown, seconds, start, stop, reset, adjust };
}
