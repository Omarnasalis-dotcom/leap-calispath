import { supabase } from '@/lib/supabase';
import type {
  CoachChatFlagKind,
  CoachChatFlagRow,
  CoachChatFlagSeverity,
  CoachChatFlagStatus,
  CoachChatThread,
  CoachChatUserRow,
} from '@/shared/types';

// Every RPC here checks ai_coach_chat_reviewers (owner only), not is_admin —
// migration 20261030120000_ai_coach_chat_review.sql.

export async function fetchCoachChatUsers(search: string, issuesOnly: boolean): Promise<CoachChatUserRow[]> {
  const { data, error } = await supabase.rpc('admin_coach_chat_users', {
    p_search: search.trim() || null,
    p_issues_only: issuesOnly,
    p_limit: 200,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachChatUserRow[];
}

export async function fetchCoachChatThread(userId: string, before: string | null): Promise<CoachChatThread> {
  const { data, error } = await supabase.rpc('admin_coach_chat_turns', {
    p_user_id: userId,
    p_before: before,
    p_limit: 100,
  });
  if (error) throw new Error(error.message);
  return data as CoachChatThread;
}

export async function flagCoachTurn(
  turnId: string,
  kind: CoachChatFlagKind,
  severity: CoachChatFlagSeverity,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_flag_coach_turn', {
    p_turn_id: turnId,
    p_kind: kind,
    p_severity: severity,
    p_note: note,
  });
  if (error) throw new Error(error.message);
}

export async function updateCoachFlag(
  flagId: string,
  changes: { status?: CoachChatFlagStatus; note?: string; fixRef?: string },
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_coach_flag', {
    p_flag_id: flagId,
    p_status: changes.status ?? null,
    p_note: changes.note ?? null,
    p_fix_ref: changes.fixRef ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCoachFlag(flagId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_coach_flag', { p_flag_id: flagId });
  if (error) throw new Error(error.message);
}

export async function fetchCoachFlags(status: CoachChatFlagStatus | null): Promise<CoachChatFlagRow[]> {
  const { data, error } = await supabase.rpc('admin_coach_flags', { p_status: status });
  if (error) throw new Error(error.message);
  return (data ?? []) as CoachChatFlagRow[];
}
