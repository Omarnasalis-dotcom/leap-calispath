import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { SoundServiceInstance } from '../lib/SoundService';
import { t } from '../i18n';
import { useBackgroundTimerAlerts } from './useBackgroundTimerAlerts';

/** Get-ready countdown before a hold timer starts. */
export const HOLD_READY_SECONDS = 5;

export type HoldPhase = 'idle' | 'ready' | 'holding' | 'done';

/**
 * Hold timer: start → 5 s get-ready countdown → the hold counting down →
 * buzzer. stop() cancels. Counted from wall-clock end times, so it keeps
 * time while the app is in the background, and notifies when the hold ends
 * there. Moved out of WarriorExerciseRow (2026-10-16; not Static World's useHoldTimer) so the superset/circuit
 * round cards run the exact same timer.
 */
export function useExerciseHoldTimer(holdSecs: number) {
  const [holdPhase, setHoldPhase] = useState<HoldPhase>('idle');
  const [holdLeft, setHoldLeft] = useState(0);
  const holdEndRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<any>(null);
  // The length this run started with (holdSecs may change while it runs).
  const runSecsRef = useRef(holdSecs);

  // Phase/seconds mirrored in refs so the interval reads them without
  // side effects inside state updaters.
  const holdPhaseRef = useRef<HoldPhase>('idle');
  const holdLeftRef = useRef(0);
  const setPhase = (p: HoldPhase) => {
    holdPhaseRef.current = p;
    setHoldPhase(p);
  };
  const setLeft = (n: number) => {
    holdLeftRef.current = n;
    setHoldLeft(n);
  };

  const stopHold = () => {
    clearInterval(holdIntervalRef.current);
    holdEndRef.current = null;
    setPhase('idle');
    setLeft(0);
  };

  const startHold = () => {
    if (holdSecs <= 0) return;
    runSecsRef.current = holdSecs;
    holdEndRef.current = Date.now() + HOLD_READY_SECONDS * 1000;
    setLeft(HOLD_READY_SECONDS);
    setPhase('ready');
    SoundServiceInstance.playTick();
  };

  const tickHold = () => {
    if (holdEndRef.current === null) return;
    const remaining = Math.max(0, Math.ceil((holdEndRef.current - Date.now()) / 1000));
    if (holdPhaseRef.current === 'ready') {
      if (remaining <= 0) {
        // The hold starts when the get-ready ended (maybe while the app was
        // in the background), not when this tick ran.
        holdEndRef.current = holdEndRef.current + runSecsRef.current * 1000;
        setPhase('holding');
        SoundServiceInstance.playBoxingBell();
        tickHold();
        return;
      } else if (remaining !== holdLeftRef.current) {
        setLeft(remaining);
        SoundServiceInstance.playTick();
      }
    } else if (holdPhaseRef.current === 'holding') {
      if (remaining !== holdLeftRef.current) setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(holdIntervalRef.current);
        holdEndRef.current = null;
        setPhase('done');
        SoundServiceInstance.playDigitalBuzzer(3);
      }
    }
  };

  const holdRunning = holdPhase === 'ready' || holdPhase === 'holding';
  useEffect(() => {
    if (!holdRunning) return;
    clearInterval(holdIntervalRef.current);
    holdIntervalRef.current = setInterval(tickHold, 250);
    return () => clearInterval(holdIntervalRef.current);
  }, [holdRunning]);

  // Catch up straight away when the app returns to the foreground.
  useEffect(() => {
    if (!holdRunning) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') tickHold();
    });
    return () => sub.remove();
  }, [holdRunning]);

  // Hold done while the app is in the background.
  useBackgroundTimerAlerts(() => {
    const now = Date.now();
    if (holdEndRef.current !== null && holdPhaseRef.current === 'ready') {
      const startIn = (holdEndRef.current - now) / 1000;
      return [{ inSeconds: startIn + runSecsRef.current, title: t('timerAlerts.holdDone'), body: t('timerAlerts.holdDoneBody') }];
    }
    if (holdEndRef.current !== null && holdPhaseRef.current === 'holding') {
      return [{ inSeconds: (holdEndRef.current - now) / 1000, title: t('timerAlerts.holdDone'), body: t('timerAlerts.holdDoneBody') }];
    }
    return [];
  });

  return { holdPhase, holdLeft, holdRunning, startHold, stopHold };
}
