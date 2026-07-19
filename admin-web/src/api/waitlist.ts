import { supabase } from '@/lib/supabase';
import type { InviteRequestRow } from '@/shared/types';

// invite_requests is admin-gated by the existing "Admins manage invite
// requests" FOR-ALL RLS policy — direct table access is the sanctioned path.

export async function fetchInviteRequests(): Promise<InviteRequestRow[]> {
  const { data, error } = await supabase
    .from('invite_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as InviteRequestRow[];
}

export async function setInviteRequestStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('invite_requests').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}
