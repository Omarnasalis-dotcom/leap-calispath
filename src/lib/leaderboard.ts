// Leaderboard system for Strength trials
// Rank by best time (fastest wins)

import { supabase } from './supabase';
import { LEAP_SYSTEM_PROFILE_ID } from '../constants/system';

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  tier: number;
  best_time_seconds: number;
  rank: number;
  is_current_user: boolean;
  country?: string;
  gender?: string;
}

export interface PersonalBest {
  tier: number;
  best_time_seconds: number | null;
  rank: number | null;
  total_attempts: number;
}

// Short-lived module cache for the *shared* tier leaderboard payloads (the raw
// DB rows), keyed by tier + scope. Mirrors the { data, timestamp } module-cache
// pattern in OneMMService / PowerService / ActivityStatsService, but with a
// short 30s TTL: the board is shared across users, so a fresh result from anyone
// should surface quickly. The per-user fields (is_current_user / personalBest)
// are re-derived from the cached shared rows on every call, so they are never
// stale for the caller. Invalidated on the local user's own relevant submission
// (see invalidate*LeaderboardCache) so they never see a board that hides the
// result they just logged. Each fetch here is a ~100-row MAX/SUM scan, so this
// also cuts the most-repeated payload + the biggest recurring read CPU cost.
const LEADERBOARD_CACHE_TTL = 30 * 1000; // 30 seconds

type CachedBoard = { data: any[]; timestamp: number };
const strengthBoardCache = new Map<string, CachedBoard>();
const powerBoardCache = new Map<string, CachedBoard>();

function boardCacheKey(tier: number, communityId?: string | null): string {
  return `${tier}:${communityId || 'global'}`;
}

/** Clear cached Strength tier boards. Call after the local user logs a trial. */
export function invalidateStrengthLeaderboardCache(): void {
  strengthBoardCache.clear();
}

/** Clear cached Power tier boards. Call after the local user logs a power PB. */
export function invalidatePowerLeaderboardCache(): void {
  powerBoardCache.clear();
}

/**
 * Get leaderboard for a specific tier
 * Returns ranked list of all users with best times for that tier
 */
/** Rows the tier board shows; your own row beyond them comes back as `outside`. */
export const TIER_BOARD_SIZE = 100;

export async function getTierLeaderboard(
  tier: number,
  currentUserId: string,
  communityId?: string | null
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null; outside: LeaderboardEntry | null }> {
  // The payload includes the caller's own row (p_include_me), so the cache is per user.
  const key = `${currentUserId}:${boardCacheKey(tier, communityId)}`;
  const cached = strengthBoardCache.get(key);

  let data: any[];
  if (cached && Date.now() - cached.timestamp < LEADERBOARD_CACHE_TTL) {
    data = cached.data;
  } else {
    // Use RPC function that bypasses RLS. RPCs are POSTs, which supabase-js
    // never retries on its own (it only retries GETs) — a gateway blip comes
    // back as an empty-bodied error, so give that one more try.
    // Hidden athletes are filtered by the server (leaderboard_hidden); with
    // p_include_me your own row comes back with its true rank past #100.
    const fetchBoard = () => supabase
      .rpc('get_tier_leaderboard', { tier_num: tier, p_community_id: communityId || null, p_include_me: true });
    let { data: fetched, error, status } = await fetchBoard();
    if (error && (!error.code || status >= 500)) {
      await new Promise(resolve => setTimeout(resolve, 800));
      ({ data: fetched, error, status } = await fetchBoard());
    }

    // Throw, never return an empty board: callers show "couldn't load"
    // (or keep the board they have) instead of "no one yet" (audit M6).
    if (error || !fetched) {
      console.error('Error fetching leaderboard:', { status, code: error?.code, message: error?.message });
      throw new Error(`Leaderboard load failed (${status ?? '?'}): ${error?.message ?? 'no data'}`);
    }
    data = Array.isArray(fetched) ? fetched : [];
    strengthBoardCache.set(key, { data, timestamp: Date.now() });
  }

  // Convert to entries with ranking (the server's rank: visible athletes only)
  const all: LeaderboardEntry[] = data.map((record: any, index: number) => ({
    user_id: record.user_id,
    display_name: record.display_name || 'Unknown Warrior',
    tier,
    best_time_seconds: record.best_time,
    rank: Number(record.rank ?? index + 1),
    is_current_user: record.user_id === currentUserId,
    country: record.country,
    gender: record.gender,
  }));
  const entries = all.filter(e => e.rank <= TIER_BOARD_SIZE);
  const outside = all.find(e => e.is_current_user && e.rank > TIER_BOARD_SIZE) ?? null;

  // Find personal best (true rank, even past the board)
  const personalEntry = all.find(e => e.is_current_user);
  const personalBest: PersonalBest | null = personalEntry
    ? {
        tier,
        best_time_seconds: personalEntry.best_time_seconds,
        rank: personalEntry.rank,
        total_attempts: Number(data.find((r: any) => r.user_id === currentUserId)?.total_attempts || 0),
      }
    : null;

  return { entries, personalBest, outside };
}

/**
 * Get Power tier leaderboard
 * Rank by total score (highest wins)
 */
export async function getPowerTierLeaderboard(
  tier: number,
  currentUserId: string,
  communityId?: string | null
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null }> {
  const key = boardCacheKey(tier, communityId);
  const cached = powerBoardCache.get(key);

  let data: any[];
  if (cached && Date.now() - cached.timestamp < LEADERBOARD_CACHE_TTL) {
    data = cached.data;
  } else {
    // Server function (hidden athletes filtered); the app used to read
    // profiles directly, which couldn't honour "Hide me from leaderboards".
    const { data: fetched, error } = await supabase
      .rpc('get_power_tier_board', { p_tier: tier, p_community_id: communityId || null });

    if (error || !fetched) {
      console.error('Error fetching power leaderboard:', error);
      throw new Error(`Power leaderboard load failed: ${error?.message ?? 'no data'}`);
    }
    data = Array.isArray(fetched) ? fetched : [];
    powerBoardCache.set(key, { data, timestamp: Date.now() });
  }

  const entries: LeaderboardEntry[] = data.map((record: any, index: number) => ({
    user_id: record.user_id,
    display_name: record.display_name || 'Unknown Warrior',
    tier,
    best_time_seconds: Number(record.power_points) || 0,
    rank: Number(record.rank ?? index + 1),
    is_current_user: record.user_id === currentUserId,
    country: record.country,
    gender: record.gender,
  }));

  const personalEntry = entries.find(e => e.is_current_user);
  const personalBest: PersonalBest | null = personalEntry
    ? {
        tier,
        best_time_seconds: personalEntry.best_time_seconds,
        rank: personalEntry.rank,
        total_attempts: 1,
      }
    : null;

  return { entries, personalBest };
}

/**
 * Get Glory leaderboard (Clash ranking)
 */
export async function getGloryLeaderboard(
  currentUserId: string
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null }> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, glory_score, strength_tier, country, gender')
    .neq('id', LEAP_SYSTEM_PROFILE_ID)
    .order('glory_score', { ascending: false })
    .limit(100);

  if (error || !data) {
    console.error('Error fetching glory leaderboard:', error);
    return { entries: [], personalBest: null };
  }

  const entries: LeaderboardEntry[] = (Array.isArray(data) ? data : []).map((record: any, index: number) => ({
    user_id: record.id,
    display_name: record.display_name || 'Unknown Warrior',
    tier: record.strength_tier,
    best_time_seconds: record.glory_score, // We reuse this field for glory points
    rank: index + 1,
    is_current_user: record.id === currentUserId,
    country: record.country,
    gender: record.gender,
  }));

  const personalEntry = entries.find(e => e.is_current_user);
  const personalBest: PersonalBest | null = personalEntry
    ? {
        tier: personalEntry.tier,
        best_time_seconds: personalEntry.best_time_seconds,
        rank: personalEntry.rank,
        total_attempts: 0,
      }
    : null;

  return { entries, personalBest };
}

/**
 * Strength tiers the user has completed at least one trial on (progression
 * or practice). Returns null when the lookup fails — unlike
 * getUserPersonalBests, which returns [] on error — so callers never mistake
 * a network blip for "no trials completed".
 */
export async function getCompletedTrialTiers(userId: string): Promise<Set<number> | null> {
  const { data, error } = await supabase
    .from('trial_history')
    .select('tier_attempted')
    .eq('user_id', userId)
    .eq('completed', true);
  if (error || !Array.isArray(data)) return null;
  return new Set(data.map((r: any) => Number(r.tier_attempted)));
}

/**
 * Get user's personal best times for all tiers they've attempted
 */
export async function getUserPersonalBests(userId: string): Promise<PersonalBest[]> {
  const { data, error } = await supabase
    .from('trial_history')
    .select('tier_attempted, time_seconds')
    .eq('user_id', userId)
    .eq('completed', true);

  if (error || !data) {
    console.error('Error fetching personal bests:', error);
    return [];
  }

  // Group by tier and find best time
  const tierBests = new Map<number, { time: number; attempts: number }>();
  
  for (const record of (Array.isArray(data) ? data : [])) {
    const tier = record.tier_attempted;
    const time = record.time_seconds;
    
    if (!tierBests.has(tier)) {
      tierBests.set(tier, { time, attempts: 1 });
    } else {
      const current = tierBests.get(tier)!;
      if (time < current.time) {
        current.time = time;
      }
      current.attempts++;
    }
  }

  return Array.from(tierBests.entries()).map(([tier, data]) => ({
    tier,
    best_time_seconds: data.time,
    rank: null, // Would need full leaderboard to calculate
    total_attempts: data.attempts,
  }));
}

/**
 * Format time for display (e.g., "2:34" or "45.2s")
 */
export function formatLeaderboardTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get ordinal suffix for rank (1st, 2nd, 3rd, 4th...)
 */
export function getOrdinalRank(rank: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = rank % 100;
  return rank + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}


export interface RankChange {
  /** Rank your previous best had on this board. */
  from: number;
  /** Rank of the new best. */
  to: number;
  /** Athletes on the board, you included. */
  of: number;
}

/**
 * Where a new trial best moved you on a tier board: the previous best's rank
 * (among everyone else's bests) and the new one's. Lower times rank higher;
 * a tie goes to the athlete who set it first, so you rank after equal times.
 */
export function rankChange(entries: { user_id: string; best_time_seconds: number }[], userId: string, newTime: number, previous: number): RankChange {
  const others = entries.filter(e => e.user_id !== userId);
  return {
    from: 1 + others.filter(e => e.best_time_seconds <= previous).length,
    to: 1 + others.filter(e => e.best_time_seconds <= newTime).length,
    of: others.length + 1,
  };
}
