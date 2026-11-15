import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Vibration } from 'react-native';
import { SoundServiceInstance } from '../lib/SoundService';
import { useBackgroundTimerAlerts } from './useBackgroundTimerAlerts';
import { useKeepAwakeWhile } from './useKeepAwakeWhile';
import { t } from '../i18n';

// Coach Test Week timers: the 60 s minute of a max-reps item and the
// stopwatch of a max-hold item, both after a 5 s get-ready.
//
// Owned by the workout runner, not by TestItemSheet, so closing the sheet
// doesn't stop it (same rule as the block timers, which stay mounted when a
// block is closed). Wall-clock based: a locked phone or the app in the
// background never stretches the minute, the screen stays on while it runs,
// and a notification says when the minute is up if the app isn't open.
// Sounds come from timeouts here, so the screen doesn't re-render every
// tick; the sheet and the card draw the clock with useTestTimerNow.

export const TEST_PREP_SECONDS = 5;
export const TEST_MINUTE_SECONDS = 60;

export type TestTimerKind = 'max_reps' | 'max_hold';

export interface TestTimer {
  blockId: string;
  kind: TestTimerKind;
  /** When the get-ready began; the clock itself starts TEST_PREP_SECONDS later. */
  startedAt: number;
  /** max_reps: the minute ran out. Stays until restarted, reset or saved. */
  timeUp: boolean;
}

export interface TestTimerView {
  /** Get-ready seconds left (5..1), 0 once the clock runs. */
  prepLeft: number;
  /** max_reps: seconds left in the minute. */
  minuteLeft: number;
  /** max_hold: seconds held so far. */
  heldSecs: number;
}

export function testTimerView(timer: TestTimer, now: number): TestTimerView {
  if (timer.timeUp) return { prepLeft: 0, minuteLeft: 0, heldSecs: 0 };
  const elapsed = Math.max(0, now - timer.startedAt);
  const clockSecs = Math.max(0, Math.floor((elapsed - TEST_PREP_SECONDS * 1000) / 1000));
  return {
    prepLeft: Math.max(0, TEST_PREP_SECONDS - Math.floor(elapsed / 1000)),
    minuteLeft: Math.max(0, TEST_MINUTE_SECONDS - clockSecs),
    heldSecs: clockSecs,
  };
}

/** Re-renders the caller every `ms` while `active`, and on return to the app. */
export function useTestTimerNow(active: boolean, ms = 200): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const iv = setInterval(tick, ms);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') tick(); });
    return () => {
      clearInterval(iv);
      sub.remove();
    };
  }, [active, ms]);
  return now;
}

// A sound more than this late (JS was asleep in the background) is skipped:
// the get-ready ticks and the go bell only make sense on time.
const LATE_MS = 1000;

export interface TestTimerControls {
  timer: TestTimer | null;
  /** Starts (or restarts) the get-ready for this item; replaces any other item's timer. */
  start: (blockId: string, kind: TestTimerKind) => void;
  /** Stops this item's timer with no result (blockId omitted: whatever runs). */
  cancel: (blockId?: string) => void;
  /** max_hold: stops and returns the whole seconds held (null if still in the get-ready). */
  stopHold: (blockId: string) => number | null;
  /** A max-reps minute is running: leaving the block list asks first, like
   * AMRAP. A function that reads the live timer, so a handler registered
   * earlier (Android back) never sees a stale value. */
  isWorkRunning: () => boolean;
}

/** `onMinuteUp` fires once when a max-reps minute ends by itself. */
export function useTestItemTimer(onMinuteUp: (blockId: string) => void): TestTimerControls {
  const [timer, setTimerState] = useState<TestTimer | null>(null);
  const timerRef = useRef<TestTimer | null>(null);
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onUpRef = useRef(onMinuteUp);
  onUpRef.current = onMinuteUp;

  const setTimer = (next: TestTimer | null) => {
    timerRef.current = next;
    setTimerState(next);
  };
  const clearTimeouts = () => {
    timeouts.current.forEach(clearTimeout);
    timeouts.current = [];
  };

  const finishMinute = useCallback(() => {
    const cur = timerRef.current;
    if (!cur || cur.kind !== 'max_reps' || cur.timeUp) return;
    clearTimeouts();
    setTimer({ ...cur, timeUp: true });
    SoundServiceInstance.playDigitalBuzzer();
    Vibration.vibrate([0, 500, 200, 500]);
    onUpRef.current(cur.blockId);
  }, []);

  const start = useCallback((blockId: string, kind: TestTimerKind) => {
    clearTimeouts();
    const startedAt = Date.now();
    setTimer({ blockId, kind, startedAt, timeUp: false });
    SoundServiceInstance.playTick();
    const at = (ms: number, fn: (lateMs: number) => void) => {
      timeouts.current.push(setTimeout(() => fn(Date.now() - (startedAt + ms)), ms));
    };
    for (let s = 1; s < TEST_PREP_SECONDS; s++) {
      at(s * 1000, (late) => { if (late < LATE_MS) SoundServiceInstance.playTick(); });
    }
    at(TEST_PREP_SECONDS * 1000, (late) => {
      if (late >= LATE_MS) return;
      SoundServiceInstance.playBoxingBell();
      Vibration.vibrate(200);
    });
    if (kind === 'max_reps') at((TEST_PREP_SECONDS + TEST_MINUTE_SECONDS) * 1000, () => finishMinute());
  }, [finishMinute]);

  const cancel = useCallback((blockId?: string) => {
    if (blockId && timerRef.current?.blockId !== blockId) return;
    clearTimeouts();
    setTimer(null);
  }, []);

  const stopHold = useCallback((blockId: string) => {
    const cur = timerRef.current;
    if (!cur || cur.blockId !== blockId) return null;
    const { prepLeft, heldSecs } = testTimerView(cur, Date.now());
    clearTimeouts();
    setTimer(null);
    return prepLeft > 0 ? null : heldSecs;
  }, []);

  // Back in the app after the minute ended in the background: end it now
  // (the overdue timeout may run first; finishMinute only acts once).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const cur = timerRef.current;
      if (s !== 'active' || !cur || cur.kind !== 'max_reps' || cur.timeUp) return;
      if (Date.now() >= cur.startedAt + (TEST_PREP_SECONDS + TEST_MINUTE_SECONDS) * 1000) finishMinute();
    });
    return () => sub.remove();
  }, [finishMinute]);

  useEffect(() => clearTimeouts, []);

  const isWorkRunning = useCallback(() => {
    const cur = timerRef.current;
    return !!cur && cur.kind === 'max_reps' && !cur.timeUp;
  }, []);

  const running = !!timer && !timer.timeUp;
  useKeepAwakeWhile(running, 'test-item-timer');
  useBackgroundTimerAlerts(() => {
    const cur = timerRef.current;
    if (!cur || cur.kind !== 'max_reps' || cur.timeUp) return [];
    const endsAt = cur.startedAt + (TEST_PREP_SECONDS + TEST_MINUTE_SECONDS) * 1000;
    return [{ inSeconds: (endsAt - Date.now()) / 1000, title: t('timerAlerts.minuteDone'), body: t('timerAlerts.minuteDoneBody') }];
  });

  return { timer, start, cancel, stopHold, isWorkRunning };
}
