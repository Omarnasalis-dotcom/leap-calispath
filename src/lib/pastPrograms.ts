import { supabase } from './supabase';

// Programs the warrior has switched away from (status 'completed'). Starting
// a new program never deletes the old one, so these keep their blocks and
// workout logs and can be made active again with restoreProgram(). Only
// LEAP/AI Coach programs are listed — a human coach's assignment isn't
// self-service (see 20261001010000_add_past_programs_restore.sql).
export interface PastProgram {
  id: string;
  name: string;
  min_access_tier: 'first' | 'pro' | null;
  is_ai_coach: boolean;
  assigned_at: string;
  sessions_done: number;
  last_activity_at: string;
}

export async function getPastPrograms(): Promise<PastProgram[]> {
  const { data, error } = await supabase.rpc('get_past_programs');
  if (error) throw error;
  return (data as PastProgram[]) || [];
}

/** Makes a past program active again; the current one moves to past programs. Raises PRO_REQUIRED when the program needs a higher tier. */
export async function restoreProgram(warriorProgramId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_program', { p_warrior_program_id: warriorProgramId });
  if (error) throw error;
}

/** Permanently removes a past program from the list; it can't be restored afterwards. Its workout logs are kept. */
export async function deletePastProgram(warriorProgramId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_past_program', { p_warrior_program_id: warriorProgramId });
  if (error) throw error;
}
