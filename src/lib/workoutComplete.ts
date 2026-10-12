/**
 * Pure maths for the Workout Complete milestone card
 * (assets/design_handoff_workout_complete/README.md). Times are seconds on
 * the card's own clock; distances are px in the handoff's 402-wide frame.
 * Worklets so the Reanimated styles can call them on the UI thread.
 */
import { clamp01, easeInOutCubic, easeOutCubic } from './prCelebration';

export const WC_RING = { size: 212, mid: 106, radius: 90, stroke: 12 } as const;
export const WC_C = 2 * Math.PI * WC_RING.radius;

/** Segments start lighting here. */
const HERO_START = 0.6;
/** Gaps closing at 100%. */
export const FUSE_DURATION = 0.35;
/** Details that follow the content anchor (C0), relative to it. */
export const WC_AFTER = { title: 0.25, motes: 0.3, stats: 0.4, logo: 0.6, share: 0.8, done: 0.9 } as const;

export interface WCTimeline {
  /** Seconds per segment fill. */
  segDur: number;
  /** Seconds between segment starts. */
  step: number;
  /** Last segment lands. */
  lock: number;
  /** Gaps fully closed (100% only; equals lock otherwise). */
  fuse: number;
  /** Anchor for the content cascade. */
  c0: number;
  /** Every animation has settled (tap-to-skip target). */
  end: number;
}

export function wcTimeline(n: number, full: boolean): WCTimeline {
  const count = Math.max(1, n);
  const d = Math.max(1.4, Math.min(2.2, 1.2 + count * 0.125));
  const segDur = count === 1 ? d : Math.min(0.45, (d / count) * 1.4);
  const step = count === 1 ? 0 : (d - segDur) / (count - 1);
  const lock = HERO_START + d;
  const fuse = full ? lock + FUSE_DURATION : lock;
  const c0 = fuse;
  return { segDur, step, lock, fuse, c0, end: c0 + WC_AFTER.done + 0.5 };
}

export const segmentStart = (i: number, tl: WCTimeline) => {
  'worklet';
  return HERO_START + i * tl.step;
};

export const segmentLand = (i: number, tl: WCTimeline) => {
  'worklet';
  return HERO_START + i * tl.step + tl.segDur;
};

/** Fill 0…1 of segment `i` at time `t` (a single block sweeps like the Static ring). */
export const segmentProgress = (t: number, i: number, n: number, tl: WCTimeline) => {
  'worklet';
  const raw = clamp01((t - segmentStart(i, tl)) / tl.segDur);
  return n === 1 ? easeInOutCubic(raw) : easeOutCubic(raw);
};

/** Gap-closing progress 0…1 (100% only). */
export const fuseProgress = (t: number, tl: WCTimeline) => {
  'worklet';
  if (tl.fuse === tl.lock) return 0;
  return easeInOutCubic(clamp01((t - tl.lock) / FUSE_DURATION));
};

export interface WCGeometry {
  /** Gap length in px along the ring (before any fuse). */
  gapLen: number;
  segLen: number;
  /** Start of each segment, px along the ring from 12 o'clock. */
  starts: number[];
}

export function ringGeometry(n: number): WCGeometry {
  const count = Math.max(1, n);
  const gapDeg = count === 1 ? 0 : Math.min(8, (360 / count) * 0.12);
  const gapLen = (gapDeg / 360) * WC_C;
  const segLen = (WC_C - count * gapLen) / count;
  return { gapLen, segLen, starts: Array.from({ length: count }, (_, i) => i * (segLen + gapLen) + gapLen / 2) };
}

/**
 * Centre counter: climbs only while a completed segment fills, so it holds
 * still across missed ones and lands exactly on `pct`.
 */
export const completionCount = (t: number, pct: number, completed: number[], n: number, tl: WCTimeline) => {
  'worklet';
  if (completed.length === 0) return 0;
  let sum = 0;
  for (let k = 0; k < completed.length; k++) sum += segmentProgress(t, completed[k], n, tl);
  return Math.round((pct * sum) / completed.length);
};

export function completionPct(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/** m:ss, or h:mm:ss from an hour. */
export function formatSessionDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Program name size steps (the Text still shrinks to fit 2 lines). */
export function programNameSize(name: string): number {
  return name.length <= 22 ? 30 : name.length <= 32 ? 26 : 22;
}

/**
 * Stats grid on 6 columns: 4 stats → 2×2 (span 3); 5 → 3 on top (span 2)
 * + 2 below (span 3). Returns each stat's span.
 */
export function statSpans(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (count === 5 && i < 3 ? 2 : 3));
}

/** Value text drops to 20px when long for its cell. */
export function statValueSize(value: string, span: number): number {
  return value.length > (span === 2 ? 5 : 6) ? 20 : 24;
}

/** Settled outer glow: 100% .3, partial .22, 0% .12. */
export const cardGlow = (t: number, tl: WCTimeline, fillFrac: number, full: boolean, none: boolean) => {
  'worklet';
  if (t < tl.lock) return 0.12 + fillFrac * 0.1;
  if (none) return 0.12;
  if (full) return t < tl.fuse ? 0.5 : 0.3 + 0.2 * (1 - clamp01((t - tl.fuse) / 0.9));
  return 0.22 + 0.1 * (1 - clamp01((t - tl.lock) / 0.9));
};
