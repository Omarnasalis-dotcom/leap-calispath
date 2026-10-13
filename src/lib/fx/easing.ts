/**
 * Easing and timeline helpers for UI-thread animations. Every function is a
 * worklet so Reanimated styles can call it; in Jest they're plain functions.
 */

export const clamp01 = (x: number) => {
  'worklet';
  return Math.max(0, Math.min(1, x));
};

/** Progress 0…1 of `t` through the window [a, b]. */
export const seg = (t: number, a: number, b: number) => {
  'worklet';
  return b <= a ? (t >= b ? 1 : 0) : clamp01((t - a) / (b - a));
};

export const easeOutCubic = (t: number) => {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
};

export const easeOutQuart = (t: number) => {
  'worklet';
  return 1 - Math.pow(1 - t, 4);
};

export const easeInCubic = (t: number) => {
  'worklet';
  return t * t * t;
};

export const easeInOutCubic = (t: number) => {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** Overshoot, `c` = how far (1.5 is the sibling cards' entry). */
export const easeOutBack = (t: number, c = 1.5) => {
  'worklet';
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** One sine bump 0 → 1 → 0 over [t0, t0 + dur]; 0 outside. */
export const bump = (t: number, t0: number, dur: number) => {
  'worklet';
  const a = t - t0;
  return a > 0 && a < dur ? Math.sin((a / dur) * Math.PI) : 0;
};

/** A decaying flash: `peak` at t0, 0 after `dur`. */
export const flashAt = (t: number, t0: number, dur: number, peak: number) => {
  'worklet';
  const a = t - t0;
  return a >= 0 && a < dur ? peak * (1 - a / dur) : 0;
};
