import { supabase } from './supabase';
import { AI_COACH_SYSTEM_PROFILE_ID } from '../constants/system';

// The AI Coach start screen's third card ("Review my week and build the
// next") is live once the athlete's active AI Coach program has a week with
// every workout logged. Before that it shows greyed with "after your first
// week".

interface BlockRow {
  id: string;
  week_number: number | null;
}

/**
 * Whether any week up to the current one has all its workouts logged.
 * week_number can be null on some programs: counted as week 1, the same
 * fallback the Journey uses.
 */
export function hasFinishedWeek(blocks: BlockRow[], loggedBlockIds: Set<string>, currentWeek: number): boolean {
  const byWeek = new Map<number, BlockRow[]>();
  for (const b of blocks) {
    const week = b.week_number || 1;
    if (week > currentWeek) continue;
    byWeek.set(week, [...(byWeek.get(week) ?? []), b]);
  }
  for (const weekBlocks of byWeek.values()) {
    if (weekBlocks.length > 0 && weekBlocks.every((b) => loggedBlockIds.has(String(b.id)))) return true;
  }
  return false;
}

/** Never throws: anything unexpected leaves the card greyed. */
export async function fetchWeekReviewReady(userId: string): Promise<boolean> {
  try {
    const { data: program, error } = await supabase
      .from('warrior_programs')
      .select('id, template_id, current_week, coach_id')
      .eq('warrior_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    if (error || !program || program.coach_id !== AI_COACH_SYSTEM_PROFILE_ID) return false;
    const [{ data: blocks, error: blocksError }, { data: logs, error: logsError }] = await Promise.all([
      supabase.from('program_blocks').select('id, week_number').eq('template_id', program.template_id),
      supabase.from('workout_logs').select('block_id').eq('warrior_program_id', program.id),
    ]);
    if (blocksError || logsError) return false;
    const logged = new Set((logs ?? []).map((l: { block_id: string }) => String(l.block_id)));
    return hasFinishedWeek((blocks ?? []) as BlockRow[], logged, program.current_week || 1);
  } catch {
    return false;
  }
}
