import { POWER_LEVELS, getPowerLevel } from './powerLogic';
import { STATIC_LEVELS, getStaticLevel } from './staticLogic';

/**
 * Honest-progress helpers for the world screens.
 *
 * The one rule that matters most (design handoff): never hard-code a full
 * ring stroke or 100% bar width — always compute from the real ratio so a
 * value of 0 renders visibly empty.
 */

export const clamp01 = (n: number): number => {
  if (Number.isNaN(n) || n == null || n <= 0) return 0;
  return n >= 1 ? 1 : n;
};

// ---------------------------------------------------------------------------
// Power

export interface WorldLevel {
  name: string;
  minPoints: number;
}

export interface LevelProgress {
  /** 0–1 fill toward the next level threshold (1 at max level). */
  progress: number;
  /** Next level to reach, or null at max level. */
  nextLevel: WorldLevel | null;
  /** Points remaining to the next level (0 at max level). */
  gap: number;
}

/**
 * Power "LEVEL GAP" circle (handoff §0.4): progress WITHIN the current
 * level (0 at its floor, 1 at the next level's threshold) and the points
 * still needed. At the top level: progress 1, gap 0, nextLevel null.
 */
export function powerWithinLevel(totalPoints: number): LevelProgress {
  const current = getPowerLevel(totalPoints);
  const next = current.id < 3 ? POWER_LEVELS[current.id + 1] : null;
  if (!next) return { progress: 1, nextLevel: null, gap: 0 };
  const span = next.minPoints - current.minPoints;
  return {
    progress: clamp01((totalPoints - current.minPoints) / span),
    nextLevel: next,
    gap: Math.max(0, next.minPoints - totalPoints),
  };
}

// ---------------------------------------------------------------------------
// Static

/** New-user goal on the Static goal card: a 30-second wall handstand. */
export const STATIC_HOLD_TARGET_SECONDS = 30;

/** Static equivalent of powerWithinLevel: progress inside Stone/Iron/Titan. */
export function staticWithinLevel(totalPoints: number): LevelProgress {
  const currentId = getStaticLevel(totalPoints);
  const current = STATIC_LEVELS[currentId];
  const next = currentId < 3 ? STATIC_LEVELS[(currentId + 1) as 2 | 3] : null;
  if (!next) return { progress: 1, nextLevel: null, gap: 0 };
  return {
    progress: clamp01((totalPoints - current.minPoints) / (next.minPoints - current.minPoints)),
    nextLevel: next,
    gap: Math.max(0, next.minPoints - totalPoints),
  };
}

// ---------------------------------------------------------------------------
// Well-Rounded Athlete

/**
 * WRA bar milestones. The bar fills from 0 toward the NEXT milestone rather
 * than a fixed 5000 max, so early points visibly move it (11 pts -> 44% of
 * 25) instead of rendering as a 0.2% speck.
 */
export const WRA_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export interface WraMilestoneProgress {
  /** Milestone being worked toward (the top one once it's reached). */
  target: number;
  /** Points still needed; 0 once the top milestone is reached. */
  remaining: number;
  /** True once the top milestone is reached. */
  maxed: boolean;
}

export function wraMilestoneProgress(score: number): WraMilestoneProgress {
  const safe = Number.isFinite(score) && score > 0 ? score : 0;
  const next = WRA_MILESTONES.find((m) => safe < m);
  if (next === undefined) {
    return { target: WRA_MILESTONES[WRA_MILESTONES.length - 1], remaining: 0, maxed: true };
  }
  return { target: next, remaining: next - safe, maxed: false };
}
