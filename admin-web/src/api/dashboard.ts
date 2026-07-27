import { supabase } from '@/lib/supabase';
import type {
  DashboardOverview,
  DashboardTrendWeek,
  RetentionCurvePoint,
  TierDistributionRow,
} from '@/shared/types';

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const { data, error } = await supabase.rpc('admin_get_dashboard_overview');
  if (error) throw new Error(error.message);
  return data as DashboardOverview;
}

export async function fetchDashboardTrends(weeksBack = 8): Promise<DashboardTrendWeek[]> {
  const { data, error } = await supabase.rpc('admin_get_dashboard_trends', {
    p_weeks_back: weeksBack,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as DashboardTrendWeek[];
}

export async function fetchRetentionCurve(weeksBack = 8): Promise<RetentionCurvePoint[]> {
  const { data, error } = await supabase.rpc('admin_get_retention_curve', {
    p_weeks: weeksBack,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as RetentionCurvePoint[];
}

export async function fetchTierDistribution(): Promise<TierDistributionRow[]> {
  const { data, error } = await supabase.rpc('admin_get_tier_distribution');
  if (error) throw new Error(error.message);
  return (data ?? []) as TierDistributionRow[];
}
