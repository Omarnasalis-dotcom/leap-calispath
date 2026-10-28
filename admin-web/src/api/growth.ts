import { supabase } from '@/lib/supabase';

export interface GrowthFunnelStep {
  step_order: number;
  step: string;
  users: number;
  // Only set when a step has its own base (e.g. "came back after day 7"
  // counts only signups at least 7 days old).
  eligible: number | null;
  // How many of `users` have since deleted their account (counted from
  // their anonymous deleted_accounts record).
  deleted: number;
}

export interface GrowthAnalytics {
  days: number;
  tz: string;
  funnel: GrowthFunnelStep[];
  // Local calendar days in `tz`; `partial` marks today.
  daily: Array<{ day: string; active_users: number; partial: boolean }>;
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

/** The Nov 2026 offers, from admin_get_offer_analytics (people, not taps). */
export interface OfferAnalytics {
  days: number;
  moments: Array<{
    moment: 'assessment' | 'program_complete' | 'banner';
    shown: number;
    claimed: number;
    code_tapped: number;
    dismissed: number;
    paywall: number;
    bought: number;
  }>;
  add_week: { tapped: number; paywall: number; bought: number };
  // Logged by the RevenueCat webhook. period_type: INTRO = intro offer,
  // PROMOTIONAL = offer code, NORMAL = full price.
  store: Array<{
    event: 'store_purchase' | 'store_renewal';
    period_type: string;
    tier: string;
    platform: 'ios' | 'android' | null;
    events: number;
    users: number;
  }>;
  codes: Array<{ platform: string; submitted: number; unlocked: number }>;
}

export async function fetchOfferAnalytics(days: number): Promise<OfferAnalytics> {
  const { data, error } = await supabase.rpc('admin_get_offer_analytics', { p_days: days });
  if (error) throw new Error(error.message);
  return data as OfferAnalytics;
}
