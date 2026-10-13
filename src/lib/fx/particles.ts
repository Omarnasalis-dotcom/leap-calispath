/**
 * Deterministic particle tables (same maths as the Journey achievements
 * handoff, `SP()` / `burst()` / `orbit()`), precomputed once per effect so
 * the per-frame worklets only read numbers and allocate nothing.
 */
import { clamp01, easeOutCubic, seg } from './easing';

export interface BurstOptions {
  count: number;
  colors: readonly string[];
  /** Travel distance (design px at badge scale 1). */
  dist?: number;
  /** Spark size (px). */
  size?: number;
  /** Start radius from the centre. */
  r0?: number;
  /** Angle window (radians, 0 = right, clockwise). Omit for a full circle. */
  a0?: number;
  a1?: number;
  seed?: number;
}

export interface BurstParticle {
  angle: number;
  dist: number;
  size: number;
  delay: number;
  color: string;
}

export interface OrbitParticle {
  phase: number;
  size: number;
  color: string;
}

/** The handoff's seeded jitter pair for particle i. */
export function jitter(i: number, seed: number): { j: number; k: number } {
  return { j: ((i * 37 + seed * 11) % 17) / 17, k: ((i * 53 + seed * 7) % 13) / 13 };
}

export function buildBurst(o: BurstOptions): BurstParticle[] {
  const { count, colors, dist = 60, size = 5, seed = 1 } = o;
  return Array.from({ length: count }, (_, i) => {
    const { j, k } = jitter(i, seed);
    const angle = o.a0 != null && o.a1 != null
      ? o.a0 + (o.a1 - o.a0) * ((i + k * 0.6) / count)
      : (i / count) * Math.PI * 2 + k * 0.4;
    return {
      angle,
      dist: dist * (0.65 + k * 0.55),
      size: size * (0.7 + j * 0.6),
      delay: j * 0.12,
      color: colors[i % colors.length],
    };
  });
}

export function buildOrbit(count: number, colors: readonly string[]): OrbitParticle[] {
  return Array.from({ length: count }, (_, i) => ({
    phase: (i / count) * Math.PI * 2,
    size: 3 + (i % 3),
    color: colors[i % colors.length],
  }));
}

export interface SparkFrame {
  x: number;
  y: number;
  opacity: number;
  rotate: number;
}

/** A burst spark's offset from its centre at time t (seconds). */
export const sparkAt = (
  t: number, t0: number, angle: number, dist: number, delay: number,
  life: number, r0: number, gravity: boolean,
): SparkFrame => {
  'worklet';
  const a = t - t0;
  const p = clamp01((a - delay) / life);
  const ep = easeOutCubic(p);
  const r = r0 + dist * ep;
  return {
    x: Math.cos(angle) * r,
    y: Math.sin(angle) * r + (gravity ? p * p * 30 : 0),
    opacity: a >= 0 && p > 0 && p < 1 ? 1 - p : 0,
    rotate: 45 + p * 140,
  };
};

export interface OrbitFrame {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

/**
 * An orbiting particle on an ellipse (rx, ry), accelerating, with a little
 * depth (front larger and brighter). Fades in over 0.3 s from t0 and out
 * over the last 0.5 s before t1.
 */
export const orbitAt = (
  t: number, t0: number, t1: number, phase: number, rx: number, ry: number, speed: number,
): OrbitFrame => {
  'worklet';
  const life = seg(t, t0, t0 + 0.3) * (1 - seg(t, t1 - 0.5, t1));
  if (life <= 0) return { x: 0, y: 0, scale: 1, opacity: 0 };
  const e = t - t0;
  const th = phase + e * speed * (1 + e * 0.6);
  const z = Math.sin(th);
  return {
    x: Math.cos(th) * rx,
    y: Math.sin(th) * ry - Math.cos(th) * 8,
    scale: 1 + z * 0.25,
    opacity: life * (0.55 + z * 0.45),
  };
};
