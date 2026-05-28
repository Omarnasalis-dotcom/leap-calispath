// Leaderboard system for Strength trials
// Rank by best time (fastest wins)

import { supabase } from './supabase';

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

/**
 * Get leaderboard for a specific tier
 * Returns ranked list of all users with best times for that tier
 */
export async function getTierLeaderboard(
  tier: number,
  currentUserId: string
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null }> {
  // Use RPC function that bypasses RLS
  const { data, error } = await supabase
    .rpc('get_tier_leaderboard', { tier_num: tier });

  if (error || !data) {
    console.error('Error fetching leaderboard:', error);
    return { entries: [], personalBest: null };
  }

  // Convert to entries with ranking
  const entries: LeaderboardEntry[] = (Array.isArray(data) ? data : []).map((record: any, index: number) => ({
    user_id: record.user_id,
    display_name: record.display_name || 'Unknown Warrior',
    tier,
    best_time_seconds: record.best_time,
    rank: index + 1,
    is_current_user: record.user_id === currentUserId,
    country: record.country,
    gender: record.gender,
  }));

  // Find personal best
  const personalEntry = entries.find(e => e.is_current_user);
  const personalBest: PersonalBest | null = personalEntry
    ? {
        tier,
        best_time_seconds: personalEntry.best_time_seconds,
        rank: personalEntry.rank,
        total_attempts: Number(data.find((r: any) => r.user_id === currentUserId)?.total_attempts || 0),
      }
    : null;

  return { entries, personalBest };
}

/**
 * Get Power tier leaderboard
 * Rank by total score (highest wins)
 */
export async function getPowerTierLeaderboard(
  tier: number,
  currentUserId: string
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null }> {
  const { data, error } = await supabase
    .from('power_assessments')
    .select(`
      user_id,
      pullup_1rm,
      dip_1rm,
      squat_1rm,
      muscleup_1rm,
      power_tier,
      profiles:user_id (display_name, power_points, country, gender)
    `)
    .eq('power_tier', tier)
    .order('power_points', { foreignTable: 'profiles', ascending: false })
    .limit(100);

  if (error || !data) {
    console.error('Error fetching power leaderboard:', error);
    return { entries: [], personalBest: null };
  }

  const entries: LeaderboardEntry[] = (Array.isArray(data) ? data : []).map((record: any, index: number) => ({
    user_id: record.user_id,
    display_name: record.profiles?.display_name || 'Unknown Warrior',
    tier,
    best_time_seconds: record.pullup_1rm + record.dip_1rm + record.squat_1rm + (record.muscleup_1rm * 2),
    rank: index + 1,
    is_current_user: record.user_id === currentUserId,
    country: record.profiles?.country,
    gender: record.profiles?.gender,
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

export async function getStaticMovementLeaderboard(
  movementId: string,
  currentUserId: string
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null }> {
  const { data, error } = await supabase
    .from('static_holds')
    .select(`
      user_id,
      hold_seconds,
      points,
      profiles:user_id (display_name)
    `)
    .eq('movement_id', movementId)
    .order('points', { ascending: false })
    .limit(100);

  if (error || !data) {
    console.error('Error fetching static leaderboard:', error);
    return { entries: [], personalBest: null };
  }

  const entries: LeaderboardEntry[] = (Array.isArray(data) ? data : []).map((record: any, index: number) => ({
    user_id: record.user_id,
    display_name: record.profiles?.display_name || 'Unknown Warrior',
    tier: 0,
    best_time_seconds: record.hold_seconds,
    rank: index + 1,
    is_current_user: record.user_id === currentUserId,
  }));

  const personalEntry = entries.find(e => e.is_current_user);
  const personalBest: PersonalBest | null = personalEntry
    ? {
        tier: 0,
        best_time_seconds: personalEntry.best_time_seconds,
        rank: personalEntry.rank,
        total_attempts: 1,
      }
    : null;

  return { entries, personalBest };
}

export async function getStaticLevelLeaderboard(
  level: 1 | 2 | 3,
  currentUserId: string,
  movements: string[]
): Promise<{ entries: LeaderboardEntry[]; personalBest: PersonalBest | null }> {
  const { data, error } = await supabase
    .from('static_holds')
    .select(`
      user_id,
      movement_id,
      points,
      profiles:user_id (display_name)
    `)
    .in('movement_id', movements);

  if (error || !data) {
    console.error('Error fetching static level leaderboard:', error);
    return { entries: [], personalBest: null };
  }

  const userScores = new Map<string, { total: number; display_name: string }>();
  for (const record of (Array.isArray(data) ? data : [])) {
    const profiles = record.profiles as any;
    const displayName = Array.isArray(profiles) 
      ? (profiles[0]?.display_name || 'Unknown Warrior')
      : (profiles?.display_name || 'Unknown Warrior');
      
    const existing = userScores.get(record.user_id) || { total: 0, display_name: displayName };
    existing.total += record.points;
    userScores.set(record.user_id, existing);
  }

  const sorted = Array.from(userScores.entries())
    .sort((a, b) => b[1].total - a[1].total);

  const entries: LeaderboardEntry[] = sorted.map(([user_id, data], index) => ({
    user_id,
    display_name: data.display_name,
    tier: level,
    best_time_seconds: data.total,
    rank: index + 1,
    is_current_user: user_id === currentUserId,
  }));

  const personalEntry = entries.find(e => e.is_current_user);
  const personalBest: PersonalBest | null = personalEntry
    ? {
        tier: level,
        best_time_seconds: personalEntry.best_time_seconds,
        rank: personalEntry.rank,
        total_attempts: 1,
      }
    : null;

  return { entries, personalBest };
}
