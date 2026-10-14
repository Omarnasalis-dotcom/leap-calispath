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

/** Light ticks during the reveal, before the lock (levels 1–3; later levels add their own). */
export const REVEAL_TICKS: Record<number, number[]> = { 1: [0.9], 2: [0.9, 1.2], 3: [0.9, 1.2] };

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
