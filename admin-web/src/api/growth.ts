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

/** One anonymous deleted-account record (no id, email or name). */
export interface DeletedAccount {
  deleted_at: string;
  signed_up_at: string | null;
  platform: 'ios' | 'android' | 'web' | null;
  plan: string | null;
  strength_tier: number | null;
  onboarded: boolean | null;
  last_active_at: string | null;
  workouts_logged: number | null;
  country: string | null;
  reason: string | null;
  reason_note: string | null;
}

export interface DeletedAccounts {
  days: number;
  total: number;
  weekly: Array<{ week_start: string; deletions: number }>;
  reasons: Array<{ reason: string; deletions: number }>;
  rows: DeletedAccount[];
}

export async function fetchDeletedAccounts(days: number): Promise<DeletedAccounts> {
  const { data, error } = await supabase.rpc('admin_get_deleted_accounts', { p_days: days });
  if (error) throw new Error(error.message);
  return data as DeletedAccounts;
}
