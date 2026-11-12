import { supabase } from '@/lib/supabase';
import type {
  AdminUserProfile,
  AdminUserRow,
  TrialHistoryRow,
  UserPerformance,
} from '@/shared/types';

export type PlanFilter = 'free' | 'first' | 'pro' | 'max';
export type RoleFilter = 'admin' | 'coach';
export type ActiveFilter = '7d' | '30d' | 'inactive30';

export interface UserFilters {
  plan?: PlanFilter | null;
  role?: RoleFilter | null;
  active?: ActiveFilter | null;
  tier?: number | null;
}

export interface UserSearchParams extends UserFilters {
  query: string;
  sort: string;
  desc: boolean;
  page: number;
  pageSize: number;
}

export async function searchUsers(params: UserSearchParams): Promise<AdminUserRow[]> {
  const { data, error } = await supabase.rpc('admin_search_users', {
    p_query: params.query || null,
    p_sort: params.sort,
    p_desc: params.desc,
    p_limit: params.pageSize,
    p_offset: params.page * params.pageSize,
    // Filters (migration 20261112130000) only when set, so a plain search
    // never depends on them.
    ...(params.plan ? { p_plan: params.plan } : {}),
    ...(params.role ? { p_role: params.role } : {}),
    ...(params.active ? { p_active: params.active } : {}),
    ...(params.tier != null ? { p_tier: params.tier } : {}),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserRow[];
}

/** Every user matching a search + filters (200 per request), for export. */
export async function searchAllUsers(params: Omit<UserSearchParams, 'page' | 'pageSize'>): Promise<AdminUserRow[]> {
  const rows: AdminUserRow[] = [];
  for (let page = 0; ; page++) {
    const batch = await searchUsers({ ...params, page, pageSize: 200 });
    rows.push(...batch);
    const total = Number(batch[0]?.total_count ?? 0);
    if (batch.length < 200 || rows.length >= total) return rows;
  }
}

export async function fetchUserProfile(userId: string): Promise<AdminUserProfile> {
  const { data, error } = await supabase.rpc('admin_get_user_profile', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data as AdminUserProfile;
}

export async function fetchUserTrialHistory(userId: string): Promise<TrialHistoryRow[]> {
  const { data, error } = await supabase.rpc('admin_get_user_trial_history', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TrialHistoryRow[];
}

export async function fetchUserPerformance(userId: string): Promise<UserPerformance> {
  const { data, error } = await supabase.rpc('admin_get_user_performance', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  return data as UserPerformance;
}

export async function grantRole(
  userId: string,
  role: 'admin' | 'coach',
  enabled: boolean,
): Promise<void> {
  const { data, error } = await supabase.rpc('admin_grant_role', {
    p_user_id: userId,
    p_role: role,
    p_enabled: enabled,
  });
  if (error) throw new Error(error.message);
  const result = data as { success: boolean; error?: string };
  if (!result?.success) {
    throw new Error(
      result?.error === 'LAST_ADMIN'
        ? 'Refused: this is the last admin account.'
        : result?.error ?? 'Role change failed',
    );
  }
}

export async function setCoachingPaused(
  userId: string,
  paused: boolean,
  reason: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_coaching_paused', {
    p_user_id: userId,
    p_paused: paused,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
}

export async function grantAccess(
  userId: string,
  tier: 'first' | 'pro' | 'max',
  durationType: '1month' | '3month' | '6month',
): Promise<void> {
  const { data, error } = await supabase.rpc('admin_grant_access', {
    p_user_id: userId,
    p_tier: tier,
    p_duration_type: durationType,
  });
  if (error) throw new Error(error.message);
  const result = data as { success: boolean; error?: string };
  if (!result?.success) {
    throw new Error(result?.error ?? 'Grant failed');
  }
}

export async function revokeAccess(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_revoke_access', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const result = data as { success: boolean; error?: string };
  if (!result?.success) {
    throw new Error(
      result?.error === 'REAL_SUBSCRIPTION_CANNOT_BE_REVOKED_HERE'
        ? 'Refused: this user has a real store subscription (App Store or Google Play). Only they can cancel it, in the store.'
        : result?.error ?? 'Revoke failed',
    );
  }
}

export async function clearDuplicateSubscriptionFlag(userId: string): Promise<void> {
  const { data, error } = await supabase.rpc('admin_clear_duplicate_subscription_flag', {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  const result = data as { success: boolean; error?: string };
  if (!result?.success) {
    throw new Error(result?.error ?? 'Clear failed');
  }
}

/** One athlete's programs, newest first (admin RLS reads all). */
export interface UserProgramRow {
  id: string;
  template_id: string;
  coach_id: string | null;
  status: string | null;
  current_week: number | null;
  assigned_at: string;
  template_name: string | null;
  coach_name: string | null;
}

export async function fetchUserPrograms(userId: string): Promise<UserProgramRow[]> {
  const { data, error } = await supabase
    .from('warrior_programs')
    .select(
      'id, template_id, coach_id, status, current_week, assigned_at, ' +
        'template:program_templates!warrior_programs_template_id_fkey(name), ' +
        'coach:profiles!warrior_programs_coach_id_fkey(display_name)',
    )
    .eq('warrior_id', userId)
    .order('assigned_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<
    Omit<UserProgramRow, 'template_name' | 'coach_name'> & {
      template: { name: string } | null;
      coach: { display_name: string | null } | null;
    }
  >).map(({ template, coach, ...r }) => ({ ...r, template_name: template?.name ?? null, coach_name: coach?.display_name ?? null }));
}

/** The athlete's latest finished workout on any program (missed logs don't count). */
export async function fetchLastWorkout(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('completed_at, notes')
    .eq('warrior_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as Array<{ completed_at: string; notes: string | null }>).find(
    (r) => !(r.notes ?? '').startsWith('[STATUS:MISSED]'),
  );
  return row?.completed_at ?? null;
}
