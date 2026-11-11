import { supabase } from '@/lib/supabase';

// Reuses the app's existing SECURITY DEFINER leaderboard RPCs (top-N,
// fixed internal LIMIT). Profiles-based boards select only columns on the
// post-lockdown safe grant list — no PII columns here.

export async function fetchTierLeaderboard(tier: number) {
  const { data, error } = await supabase.rpc('get_tier_leaderboard', {
    tier_num: tier,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function fetchGlobalWellRounded() {
  const { data, error } = await supabase.rpc('get_global_well_rounded_leaderboard');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function fetchStaticWellRounded() {
  const { data, error } = await supabase.rpc('get_static_well_rounded_leaderboard');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function fetchOneMMWellRounded() {
  const { data, error } = await supabase.rpc('get_onemm_well_rounded_leaderboard');
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** The app's own Power board for one level (1 Voltaic, 2 Ampere, 3 Tesla):
 * hidden athletes are already left out, so it matches what athletes see.
 * (Reading profiles directly showed people Fair Play had hidden.) */
export async function fetchPowerLeaderboard(tier: number): Promise<Array<Record<string, unknown>>> {
  if (tier === 0) return fetchPowerLeaderboardAllLevels();
  const { data, error } = await supabase.rpc('get_power_tier_board', {
    p_tier: tier,
    p_community_id: null,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** All three level boards in one list, highest points first and re-ranked;
 * each row keeps its level. Still the app's boards, so hidden athletes stay out. */
async function fetchPowerLeaderboardAllLevels(): Promise<Array<Record<string, unknown>>> {
  const boards = await Promise.all([1, 2, 3].map((level) => fetchPowerLeaderboard(level)));
  return boards
    .flatMap((rows, i) => rows.map((r): Record<string, unknown> => ({ ...r, power_level: i + 1 })))
    .sort((a, b) => Number(b.power_points ?? 0) - Number(a.power_points ?? 0))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}
