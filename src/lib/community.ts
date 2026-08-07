// Community feature — create/join/leave and the current user's community
// status. join_code is never fetched directly (it's not in the granted
// column list — see 20260710140000_add_communities_table.sql); it only
// ever gets passed to join_community, which resolves it server-side. The
// one exception is get_my_community_join_code below — a SECURITY DEFINER
// RPC that lets a community's creator read their own code back.

import { supabase } from './supabase';

export interface CommunityActionResult {
  success: boolean;
  error?: string;
  community_id?: string;
}

export interface MyCommunity {
  id: string;
  name: string;
  created_by: string;
}

export async function getMyCommunity(userId: string): Promise<MyCommunity | null> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('community_id')
    .eq('id', userId)
    .maybeSingle();

  if (profileError || !profile?.community_id) {
    return null;
  }

  return getCommunityById(profile.community_id);
}

// Skips the profiles.community_id lookup getMyCommunity does — for the
// initial profile-screen load, profile.community_id is already known (it's
// on the AuthContext profile object fetched moments earlier), so this saves
// a redundant round trip and lets CommunitySection render immediately
// instead of popping in after the rest of the screen. Mutation paths
// (create/join/leave) still use getMyCommunity: they need the freshly
// re-queried community_id, since AuthContext's copy won't reflect the
// change until refreshProfile()'s own round trip lands.
export async function getCommunityById(communityId: string): Promise<MyCommunity | null> {
  const { data: community, error } = await supabase
    .from('communities')
    .select('id, name, created_by')
    .eq('id', communityId)
    .maybeSingle();

  if (error || !community) {
    return null;
  }

  return community;
}

// Only ever succeeds for the community's own creator — the RPC checks
// created_by = auth.uid() server-side and returns null for anyone else, so
// this is safe to call speculatively without a client-side ownership check
// first.
export async function getMyCommunityJoinCode(communityId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_community_join_code', {
    p_community_id: communityId,
  });

  if (error || !data) {
    return null;
  }
  return data as string;
}

export async function createCommunity(name: string, joinCode: string): Promise<CommunityActionResult> {
  const { data, error } = await supabase.rpc('create_community', {
    p_name: name.trim(),
    p_join_code: joinCode.trim(),
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return data as CommunityActionResult;
}

export async function joinCommunity(joinCode: string): Promise<CommunityActionResult> {
  const { data, error } = await supabase.rpc('join_community', {
    p_join_code: joinCode.trim(),
  });

  if (error) {
    return { success: false, error: error.message };
  }
  return data as CommunityActionResult;
}

export async function leaveCommunity(): Promise<CommunityActionResult> {
  const { data, error } = await supabase.rpc('leave_community');

  if (error) {
    return { success: false, error: error.message };
  }
  return data as CommunityActionResult;
}

export function formatCommunityError(code?: string): string {
  switch (code) {
    case 'NAME_TAKEN':
      return 'That community name is already taken.';
    case 'CODE_TAKEN':
      return 'That join code is already in use — pick a different one.';
    case 'NAME_AND_CODE_REQUIRED':
      return 'Enter a name and join code.';
    case 'CODE_NOT_FOUND':
      return 'No community found with that code.';
    case 'FORBIDDEN':
      return 'You must be signed in.';
    default:
      return code || 'Something went wrong. Please try again.';
  }
}
