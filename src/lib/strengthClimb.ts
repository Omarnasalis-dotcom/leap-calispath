/**
 * Pure rules for the Strength "Climb" screen
 * (assets/design_handoff_strength_v3/README.md).
 *
 * Tiers are 0 (Helot) … 9 (Eternity), shown as "TIER n OF 9" like the
 * profile header. There's no progress *within* a tier — a tier is passed
 * by its trial or not — so nothing here invents a percentage.
 */

import { TIER_NAMES } from '../types';

export const MAX_STRENGTH_TIER = 9;
export const TIER_COUNT = MAX_STRENGTH_TIER + 1;

/**
 * 'placed' = below your tier but you've never completed its trial — you were
 * placed past it by the onboarding assessment.
 */
export type TierStatus = 'current' | 'complete' | 'placed' | 'locked';

/**
 * `completedTiers` = tiers with at least one completed trial of your own.
 * Until it's known (undefined), tiers below yours read as complete.
 */
export function tierStatus(tier: number, currentTier: number, completedTiers?: ReadonlySet<number>): TierStatus {
  if (tier === currentTier) return 'current';
  if (tier > currentTier) return 'locked';
  return completedTiers && !completedTiers.has(tier) ? 'placed' : 'complete';
}

/** Tiers below yours are behind you whether earned or placed. */
export const isBehind = (s: TierStatus) => s === 'complete' || s === 'placed';

/** M'SS" — e.g. 160 → 2'40". Lower is better. */
export function fmtTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"`;
}

export const tierName = (tier: number) => (TIER_NAMES[tier] ?? '').toUpperCase();
export const tierTitle = (tier: number) => TIER_NAMES[tier] ?? '';

/** Progress-bar fill for a card: tiers behind you are full, everything else empty. */
export function tierBarFill(status: TierStatus): number {
  return isBehind(status) ? 1 : 0;
}

export function tierCaption(tier: number, currentTier: number, completedTiers?: ReadonlySet<number>): string {
  const status = tierStatus(tier, currentTier, completedTiers);
  if (status === 'complete') return 'Tier complete';
  if (status === 'placed') return 'Placed by your assessment';
  if (status === 'locked') return `Complete ${tierTitle(tier - 1)} to unlock`;
  return tier >= MAX_STRENGTH_TIER ? 'The final trial' : `Pass the trial to reach ${tierTitle(tier + 1)}`;
}

/** Overall climb: how many tiers are behind you, out of 9. */
export function climbPercent(currentTier: number): number {
  return Math.round((Math.min(MAX_STRENGTH_TIER, Math.max(0, currentTier)) / MAX_STRENGTH_TIER) * 100);
}

export interface TimeEntry {
  user_id: string;
  best_time_seconds: number;
}

export interface CardStats {
  rank: string;
  rankOf: string;
  gap: string;
  ranked: boolean;
  king: boolean;
}

/** RANK / GAP TO #1 on a tier card, from that tier's (time-ascending) board. */
export function cardStats(entries: TimeEntry[], userId: string | undefined, status: TierStatus): CardStats {
  const n = entries.length;
  const idx = userId ? entries.findIndex(e => e.user_id === userId) : -1;
  if (idx >= 0) {
    return {
      rank: `#${idx + 1}`,
      rankOf: `of ${n}`,
      gap: idx === 0 ? 'KING' : `+${fmtTime(entries[idx].best_time_seconds - entries[0].best_time_seconds)}`,
      ranked: true,
      king: idx === 0,
    };
  }
  return {
    rank: '—',
    rankOf: n === 0 ? 'no entries yet' : status !== 'locked' ? `unranked · ${n}` : `of ${n}`,
    gap: '—',
    ranked: false,
    king: false,
  };
}

export const warriorsLabel = (n: number) => `${n} ${n === 1 ? 'WARRIOR' : 'WARRIORS'}`;
