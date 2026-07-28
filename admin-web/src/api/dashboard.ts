import { supabase } from '@/lib/supabase';
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
