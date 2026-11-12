import { supabase } from '@/lib/supabase';
import { isSystemCoach } from '@/shared/constants';
import type {
  DashboardOverview,
  DashboardTrendWeek,
  RecentPulse,
  RetentionCurvePoint,
  TierDistributionRow,
  WorldParticipation,
} from '@/shared/types';

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const { data, error } = await supabase.rpc('admin_get_dashboard_overview');
  if (error) throw new Error(error.message);
  return data as DashboardOverview;
}

export async function fetchDashboardTrends(
  weeksBack = 8,
  groupId: number | null = null,
): Promise<DashboardTrendWeek[]> {
  const { data, error } = await supabase.rpc('admin_get_dashboard_trends', {
    p_weeks_back: weeksBack,
    p_group_id: groupId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DashboardTrendWeek[];
}

export async function fetchRetentionCurve(
  weeksBack = 8,
  groupId: number | null = null,
): Promise<RetentionCurvePoint[]> {
  const { data, error } = await supabase.rpc('admin_get_retention_curve', {
    p_weeks: weeksBack,
    p_group_id: groupId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RetentionCurvePoint[];
}

export async function fetchWorldParticipation(
  groupId: number | null = null,
): Promise<WorldParticipation> {
  const { data, error } = await supabase.rpc('admin_get_world_participation', {
    p_group_id: groupId,
  });
  if (error) throw new Error(error.message);
  return data as WorldParticipation;
}

export async function fetchTierDistribution(): Promise<TierDistributionRow[]> {
  const { data, error } = await supabase.rpc('admin_get_tier_distribution');
  if (error) throw new Error(error.message);
  return (data ?? []) as TierDistributionRow[];
}

export async function fetchRecentPulse(hours = 24): Promise<RecentPulse> {
  const { data, error } = await supabase.rpc('admin_get_recent_pulse', {
    p_hours: hours,
  });
  if (error) throw new Error(error.message);
  return data as RecentPulse;
}

/** AI Coach engagement for the Dashboard (admin_get_ai_coach_engagement,
 * migration 20261112120000). Totals only. */
export interface AiCoachEngagement {
  days: number;
  programs: { active_athletes: number; trained_athletes: number };
  chat: {
    people: number;
    messages: number;
    daily: Array<{ day: string; messages: number; people: number }>;
  };
  health: {
    turns: number;
    issues: number;
    /** Turns flagged automatically, by outcome; 'ok' here = a tool error or a corrected claim. */
    by_outcome: Array<{ outcome: string; turns: number }>;
  };
  cost: { usd: number; requests: number };
}

export async function fetchAiCoachEngagement(days = 7): Promise<AiCoachEngagement> {
  const { data, error } = await supabase.rpc('admin_get_ai_coach_engagement', { p_days: days });
  if (error) throw new Error(error.message);
  const d = data as AiCoachEngagement;
  return { ...d, cost: { usd: Number(d.cost?.usd ?? 0), requests: Number(d.cost?.requests ?? 0) } };
}

/** Real coaches only: Leap and AI Coach are system profiles flagged is_coach
 * (the overview RPC's `coaches` counts them). */
export async function fetchHumanCoachCount(): Promise<number> {
  const { data, error } = await supabase.from('profiles').select('id').eq('is_coach', true);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: string }>).filter((r) => !isSystemCoach(r.id)).length;
}
