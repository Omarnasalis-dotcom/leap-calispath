/**
 * Pure maths for the world PR celebration cards
 * (assets/design_handoff_pr_celebrations/README.md). Times are seconds on
 * the card's own clock; distances are px in the handoff's 402-wide frame.
 *
 * The easing helpers are worklets so the Reanimated styles can call them on
 * the UI thread; in Jest they are plain functions.
 */

export type PRWorld = 'static' | 'endurance' | 'power';

// ── Easing ────────────────────────────────────────────────────────────────
export const clamp01 = (x: number) => {
  'worklet';
  return Math.max(0, Math.min(1, x));
};
export const easeOutCubic = (t: number) => {
  'worklet';
  return 1 - Math.pow(1 - t, 3);
};
export const easeInOutCubic = (t: number) => {
  'worklet';
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeOutBack = (t: number) => {
  'worklet';
  const c = 1.5;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
export const easeIn = (t: number) => {
  'worklet';
  return t * t;
};

// ── Shared timeline ───────────────────────────────────────────────────────
export const FILL_START = 0.6;
export const FILL_DURATION = 1.5;
/** LOCK for Static and Endurance; Power's comes from its plate count. */
export const RING_LOCK = FILL_START + FILL_DURATION;

/** Details that follow the LOCK, relative to it. */
export const AFTER_LOCK = {
  movement: 0.25,
  stats: 0.4,
  logo: 0.6,
  share: 0.8,
  save: 0.9,
  dismiss: 1.0,
} as const;

/** When the card has fully settled (actions in) — the skip-to-end frame. */
export function settledAt(lock: number): number {
  return lock + AFTER_LOCK.dismiss + 0.5;
}

/** Ring fill progress 0…1 at time t (Static and Endurance). */
export function ringProgress(t: number): number {
  'worklet';
  return easeInOutCubic(clamp01((t - FILL_START) / FILL_DURATION));
}

/** Clock time at which the ring fill reaches `fraction` (0…1) of the new value. */
export function timeAtFill(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (easeInOutCubic(mid) < f) lo = mid;
    else hi = mid;
  }
  return FILL_START + hi * FILL_DURATION;
}

// ── Values ────────────────────────────────────────────────────────────────
/** kg rounded to the 0.25 step, without trailing ".0". */
export function formatKg(v: number): string {
  const r = Math.round(v * 4) / 4;
  return String(r % 1 ? r : Math.round(r));
}

/** Gain over the previous best; null previous = first record. */
export function gainOf(value: number, previous: number | null): { gain: number; pct: number } | null {
  if (previous == null || previous <= 0) return null;
  const gain = value - previous;
  return { gain, pct: Math.round((gain / Math.max(1, previous)) * 100) };
}

/** Angle (radians, 0 = 12 o'clock, clockwise) of the PREV marker on the ring. */
export function prevMarkerAngle(previous: number, value: number): number {
  if (value <= 0) return 0;
  return (Math.min(previous, value) / value) * Math.PI * 2;
}

// ── Endurance ticks ───────────────────────────────────────────────────────
export const RING_RADIUS = 92;

export function tickLayout(reps: number, previous: number | null) {
  const n = Math.max(1, Math.min(Math.round(reps), 60));
  const per = reps / n;
  const prevTicks = previous == null ? 0 : Math.min(n, Math.floor(previous / per));
  const width = Math.max(4, Math.min(12, ((2 * Math.PI * RING_RADIUS) / n) * 0.42));
  return { n, per, prevTicks, width };
}

// ── Power plates ──────────────────────────────────────────────────────────
export const PLATE_SIZES = [20, 10, 5, 2.5, 1.25] as const;
export type PlateKg = typeof PLATE_SIZES[number];
export const PLATE_SPEC: Record<PlateKg, { w: number; h: number }> = {
  20: { w: 220, h: 24 },
  10: { w: 188, h: 19 },
  5: { w: 158, h: 15 },
  2.5: { w: 128, h: 12 },
  1.25: { w: 104, h: 10 },
};

export const POWER_STAGE = { height: 232, floor: 225, gap: 3, maxStack: 128, drop: 0.26, dropFrom: -80 } as const;

/** Greedy plates for the new weight, heaviest first (the bottom of the stack). */
export function plateBreakdown(kg: number): PlateKg[] {
  const out: PlateKg[] = [];
  let r = Math.round(kg * 4) / 4;
  for (const s of PLATE_SIZES) {
    while (r >= s - 1e-6 && out.length < 80) {
      out.push(s);
      r -= s;
    }
  }
  return out;
}

export interface PlacedPlate {
  kg: PlateKg;
  width: number;
  height: number;
  /** Resting top edge inside the 232px stage. */
  top: number;
  /** Starts falling at this time; lands at start + drop. */
  start: number;
  land: number;
  /** Running total once this plate has landed. */
  loaded: number;
  showLabel: boolean;
}

export interface PlateStack {
  plates: PlacedPlate[];
  stackTop: number;
  /** The number starts falling here and lands (the LOCK) 0.3s later. */
  numberStart: number;
  lock: number;
}

export function plateStack(kg: number): PlateStack {
  const kinds = plateBreakdown(kg);
  const { floor, gap, maxStack, drop } = POWER_STAGE;
  const rawHeight = kinds.reduce((sum, p) => sum + PLATE_SPEC[p].h + gap, 0);
  const k = rawHeight > 0 ? Math.min(1, maxStack / rawHeight) : 1;
  const step = Math.min(0.3, 1.5 / Math.max(1, kinds.length));

  let t = FILL_START;
  let y = floor;
  let loaded = 0;
  const plates = kinds.map(p => {
    const height = Math.max(3, PLATE_SPEC[p].h * k);
    const top = y - height;
    y = top - gap * k;
    const start = t;
    t += step;
    loaded += p;
    return { kg: p, width: PLATE_SPEC[p].w, height, top, start, land: start + drop, loaded, showLabel: height >= 12 };
  });

  // No plate fits a sub-1.25 kg weight: the number still slams onto the pin.
  const numberStart = (plates.length ? t : FILL_START) + 0.12;
  return { plates, stackTop: plates.length ? y : floor, numberStart, lock: numberStart + 0.3 };
}
