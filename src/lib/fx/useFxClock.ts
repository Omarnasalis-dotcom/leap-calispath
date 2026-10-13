import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  cancelAnimation, Easing, runOnJS, SharedValue, useFrameCallback, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { isJankyRun, JANK_FRAME_MS, reportJank } from './quality';

export interface FxClock {
  /** Seconds since the animation started; stops at `end`. */
  clock: SharedValue<number>;
  /** 0 → 1 over 200 ms under Reduce Motion, otherwise 1. Multiply into opacities. */
  fade: SharedValue<number>;
  /** Jump to the final frame (tap to skip). */
  skip: () => void;
  /** True once Reduce Motion was detected (the clock started at `end`). */
  reduceMotion: SharedValue<boolean>;
}

/**
 * One clock for a whole animation: every style is a pure function of
 * `clock.value`, computed on the UI thread. It runs once from 0 to `end`
 * and stops there, so nothing keeps animating on the final frame.
 *
 * While it runs, a frame callback counts slow frames; a janky run switches
 * this device to the lite profile for later effects. The callback turns
 * itself off at the end.
 */
export function useFxClock(end: number): FxClock {
  const clock = useSharedValue(0);
  const fade = useSharedValue(1);
  const reduceMotion = useSharedValue(false);
  const frames = useSharedValue(0);
  const slow = useSharedValue(0);
  const monitoring = useRef(true);

  const finishMonitor = (total: number, slowCount: number) => {
    if (!monitoring.current) return;
    monitoring.current = false;
    monitor.setActive(false);
    if (isJankyRun(total, slowCount)) reportJank();
  };

  const monitor = useFrameCallback((info) => {
    'worklet';
    if (reduceMotion.value) return;
    const dt = info.timeSincePreviousFrame;
    if (dt != null && clock.value > 0 && clock.value < end) {
      frames.value += 1;
      if (dt > JANK_FRAME_MS) slow.value += 1;
    }
    if (clock.value >= end) runOnJS(finishMonitor)(frames.value, slow.value);
  }, false);

  const run = (from: number) => {
    cancelAnimation(clock);
    clock.value = from;
    clock.value = withTiming(end, { duration: Math.max(0, end - from) * 1000, easing: Easing.linear });
  };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(rm => {
        if (!alive) return;
        if (rm) {
          reduceMotion.value = true;
          cancelAnimation(clock);
          clock.value = end;
          fade.value = 0;
          fade.value = withTiming(1, { duration: 200 });
        } else {
          monitor.setActive(true);
          run(0);
        }
      })
      .catch(() => { if (alive) { monitor.setActive(true); run(0); } });
    return () => {
      alive = false;
      cancelAnimation(clock);
      monitor.setActive(false);
    };
    // Runs once per mount; `end` is fixed for an animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (clock.value < end) {
      // A skipped run isn't a performance signal.
      monitoring.current = false;
      monitor.setActive(false);
      run(end);
    }
  };

  return { clock, fade, skip, reduceMotion };
}
