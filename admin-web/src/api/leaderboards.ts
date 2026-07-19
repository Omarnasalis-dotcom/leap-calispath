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

export async function fetchPowerLeaderboard() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, power_points, power_tier, country')
    .gt('power_points', 0)
    .order('power_points', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

export async function fetchGloryLeaderboard() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, glory_score, strength_tier, country')
    .gt('glory_score', 0)
    .order('glory_score', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}
