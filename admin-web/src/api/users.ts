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
        ? 'Refused: this user has a real Apple subscription. It can only be cancelled through Apple/RevenueCat directly.'
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
