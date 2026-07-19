import { supabase } from '@/lib/supabase';
import type { CommunityRow } from '@/shared/types';

export async function fetchCommunities(): Promise<CommunityRow[]> {
  const { data, error } = await supabase.rpc('admin_get_communities');
  if (error) throw new Error(error.message);
  return (data ?? []) as CommunityRow[];
}
