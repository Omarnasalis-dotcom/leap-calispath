import { POWER_LEVELS, getPowerLevel } from './powerLogic';
import { STATIC_LEVELS, getStaticLevel } from './staticLogic';
import { ONEMM_MOVEMENTS } from './oneMMLogic';

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

export function powerLevelProgress(totalPoints: number): LevelProgress {
  const current = getPowerLevel(totalPoints);
  const next = current.id < 3 ? POWER_LEVELS[current.id + 1] : null;
  if (!next) return { progress: 1, nextLevel: null, gap: 0 };
  return {
    progress: clamp01(totalPoints / next.minPoints),
    nextLevel: next,
    gap: Math.max(0, next.minPoints - totalPoints),
  };
}

/**
 * Per-exercise ring on the Power screen: each of the 4 movements fills toward
 * its "fair share" (a quarter) of the next level's point threshold.
 */
export function powerMovementProgress(movementPoints: number, totalPoints: number): number {
  const { nextLevel } = powerLevelProgress(totalPoints);
  if (!nextLevel) return clamp01(movementPoints > 0 ? 1 : 0);
  return clamp01(movementPoints / (nextLevel.minPoints / 4));
}

// ---------------------------------------------------------------------------
// Static

/** Handoff: hold rings fill toward a 30-second target. */
export const STATIC_HOLD_TARGET_SECONDS = 30;

export function staticHoldProgress(seconds: number): number {
  return clamp01(seconds / STATIC_HOLD_TARGET_SECONDS);
}

export function staticLevelProgress(totalPoints: number): LevelProgress {
  const currentId = getStaticLevel(totalPoints);
  const next = currentId < 3 ? STATIC_LEVELS[(currentId + 1) as 2 | 3] : null;
  if (!next) return { progress: 1, nextLevel: null, gap: 0 };
  return {
    progress: clamp01(totalPoints / next.minPoints),
    nextLevel: next,
    gap: Math.max(0, next.minPoints - totalPoints),
  };
}

// ---------------------------------------------------------------------------
// 1MM

/**
 * Visual ring denominators only (not scoring logic): a movement's ring reads
 * full once the athlete logs this many reps in a minute. The 20-rep knee
 * push-up target comes straight from the design handoff.
 */
export const ONEMM_TARGETS: Record<string, number> = {
  knee_push_ups: 20,
  inverted_row: 15,
  bench_dips: 20,
  air_squats: 30,
  incline_push_ups: 20,
  assisted_pull_ups: 12,
  push_ups: 30,
  pull_ups: 15,
  dips: 20,
  goblet_squats: 25,
  deadlift: 20,
  muscle_ups: 8,
  hspu: 10,
  fl_press: 5,
  fl_pull_ups: 8,
  planche_push_ups: 8,
};

const DEFAULT_ONEMM_TARGET = 20;

export function oneMMTarget(movementId: string): number {
  return ONEMM_TARGETS[movementId] ?? DEFAULT_ONEMM_TARGET;
}

export function oneMMProgress(movementId: string, reps: number): number {
  return clamp01(reps / oneMMTarget(movementId));
}

export function oneMMMovementName(movementId: string): string {
  return ONEMM_MOVEMENTS.find((m) => m.id === movementId)?.name ?? movementId;
}

// ---------------------------------------------------------------------------
// Rank-based progress (Static / 1MM milestone cards and score rings)

/**
 * Fill toward stealing the next rank. Unranked (rank <= 0) is honestly empty —
 * the original app rendered this bar 100% full for unranked users, which was
 * the single most misleading bug in the audit.
 */
export function rankGapProgress(score: number, gapToNext: number, rank: number): number {
  if (rank <= 0 || score <= 0) return 0;
  if (rank === 1) return 1;
  return clamp01(score / (score + Math.max(0, gapToNext)));
}
