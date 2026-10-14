/**
 * Timeline and data maths for the Journey achievement celebration
 * (assets/design_handoff_journey_achievements, "Shared timeline").
 * Seconds on the celebration's own clock.
 */
import { JourneyAchievementState, PointsEntry } from './journeyPoints';

/** The moment each badge locks in (success haptic + bell), by level. */
export const LOCK_BY_LEVEL: Record<number, number> = { 1: 1.3, 2: 1.5, 3: 1.6, 4: 1.6, 5: 1.65, 6: 1.85, 7: 2.0, 8: 2.4 };

/** Content cascade after the lock, relative to it. */
export const AFTER = {
  title: 0.1, warm: 0.2, skipped: 0.3, stats: 0.35, countFrom: 0.45, countTo: 1.25, logo: 0.6, done: 0.8, share: 0.85, end: 1.5,
} as const;

export interface CelebrationTimeline {
  lock: number;
  end: number;
}

export function celebrationTimeline(level: number): CelebrationTimeline {
  const lock = LOCK_BY_LEVEL[level] ?? LOCK_BY_LEVEL[1];
  return { lock, end: lock + AFTER.end };
}

/** Light ticks during the reveal, before the lock. */
export const REVEAL_TICKS: Record<number, number[]> = { 1: [0.9], 2: [0.9, 1.2], 3: [0.9, 1.2], 5: [0.9], 6: [1.0, 1.25, 1.55], 7: [1.0], 8: [0.8, 1.0, 2.05] };

/** Medium impacts during the reveal (DETERMINED's hammer strikes, ELITE's gem). */
export const REVEAL_MEDIUM: Record<number, number[]> = { 4: [0.8, 1.2], 7: [1.6] };

/** Heavy impacts during the reveal (LEGEND's prismatic burst). */
export const REVEAL_HEAVY: Record<number, number[]> = { 8: [1.2] };

/** Levels whose lock also lands a heavy impact. */
export const HEAVY_LOCK = new Set([4, 5, 8]);

/** LEGEND's lock: success twice and the bell twice (the "chord"). */
export const DOUBLE_LOCK = new Set([8]);

/** Peak of the glow disc behind the badge at the lock, by level. */
export const HERO_GLOW_PEAK: Record<number, number> = { 1: 0.5, 2: 0.6, 3: 0.6, 4: 0.7, 5: 0.8, 6: 0.85, 7: 0.9, 8: 1 };

/** WARRIOR's slam: the whole card shakes ±7 px for 0.45 s from the lock. */
export const cardShake = (t: number, level: number, lock: number) => {
  'worklet';
  if (level !== 5) return 0;
  const a = t - lock;
  return a > 0 && a < 0.45 ? Math.sin(a * 70) * 7 * (1 - a / 0.45) : 0;
};

export interface CelebrationData {
  level: number;
  /** The badge shown before the upgrade: the last one already celebrated (0 = empty slot). */
  previousLevel: number;
  /** Lower levels earned in the same jump (listed in the skipped line). */
  skipped: number[];
  fromPoints: number;
  toPoints: number;
  /** null at LEGEND (no next badge). */
  nextThreshold: number | null;
}

/**
 * What to celebrate from a summary, or null. The points count up from what
 * the athlete had before this call's awards; for a celebration that's been
 * waiting (no new awards) they count from the badge's own threshold.
 */
export function celebrationFrom(state: JourneyAchievementState | undefined, newAwards: PointsEntry[], thresholdOf: (level: number) => number): CelebrationData | null {
  const pending = state?.pending;
  if (!state || !pending) return null;
  const earnedNow = newAwards.reduce((s, a) => s + (a.points || 0), 0);
  const fromPoints = earnedNow > 0
    ? Math.max(0, state.lifetime - earnedNow)
    : Math.min(state.lifetime, thresholdOf(pending.level));
  return {
    level: pending.level,
    previousLevel: pending.previous_level,
    skipped: pending.skipped,
    fromPoints,
    toPoints: state.lifetime,
    nextThreshold: state.next_threshold,
  };
}
