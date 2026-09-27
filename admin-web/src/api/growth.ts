import { supabase } from '@/lib/supabase';

export interface GrowthFunnelStep {
  step_order: number;
  step: string;
  users: number;
  // Only set when a step has its own base (e.g. "came back after day 7"
  // counts only signups at least 7 days old).
  eligible: number | null;
}

export interface GrowthAnalytics {
  days: number;
  funnel: GrowthFunnelStep[];
  daily: Array<{ day: string; active_users: number }>;
  events: Array<{ event: string; events: number; users: number }>;
}

export async function fetchGrowthAnalytics(days: number): Promise<GrowthAnalytics> {
  const { data, error } = await supabase.rpc('admin_get_growth_analytics', { p_days: days });
  if (error) throw new Error(error.message);
  return data as GrowthAnalytics;
}
