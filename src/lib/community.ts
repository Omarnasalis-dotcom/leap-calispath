// Community feature — create/join/leave and the current user's community
// status. join_code is never fetched directly (it's not in the granted
// column list — see 20260710140000_add_communities_table.sql); it only
// ever gets passed to join_community, which resolves it server-side.

import { supabase } from './supabase';

export interface CommunityActionResult {
  success: boolean;
  error?: string;
  community_id?: string;
}

export interface MyCommunity {
  id: string;
  name: string;
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

  const { data: community, error: communityError } = await supabase
    .from('communities')
    .select('id, name')
    .eq('id', profile.community_id)
    .maybeSingle();

  if (communityError || !community) {
    return null;
  }

  return community;
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
