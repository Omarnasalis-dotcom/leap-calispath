import { supabase } from '@/lib/supabase';
import type { DashboardOverview, DashboardTrendWeek } from '@/shared/types';

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
