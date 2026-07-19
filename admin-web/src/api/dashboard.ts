import { supabase } from '@/lib/supabase';
import type { DashboardOverview } from '@/shared/types';

export async function fetchDashboardOverview(): Promise<DashboardOverview> {
  const { data, error } = await supabase.rpc('admin_get_dashboard_overview');
  if (error) throw new Error(error.message);
  return data as DashboardOverview;
}
