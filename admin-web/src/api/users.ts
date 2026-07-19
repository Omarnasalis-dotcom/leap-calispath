import { supabase } from '@/lib/supabase';
import type {
  AdminUserProfile,
  AdminUserRow,
  TrialHistoryRow,
} from '@/shared/types';

export interface UserSearchParams {
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
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserRow[];
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
