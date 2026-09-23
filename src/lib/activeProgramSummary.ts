// Lightweight "what's up next" lookup for the Profile tab's Active Program
// card. Runs the same queries + pure helpers (computeDisplayWeeks /
// computeWeekStats) as TrainingCenterScreen's load(), minus the all-time
// logs and hub-only extras, so the day named here always matches the
// TRAIN tab's "next up".

import { supabase } from './supabase';
import { computeDisplayWeeks, computeWeekStats, HubBlock, HubWorkoutLog } from './trainingCenter';

export interface ActiveProgramSummary {
  /** First not-yet-fully-logged day this week, or null once the week is done. */
  nextUpDayName: string | null;
}

/** Resolves to null when the athlete has no active program. */
export async function getActiveProgramSummary(userId: string): Promise<ActiveProgramSummary | null> {
  const { data: assignment, error } = await supabase
    .from('warrior_programs')
    .select('id, template_id, current_week')
    .eq('warrior_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!assignment) return null;

  const currentRawWeek = assignment.current_week || 1;
  const [archivedRes, blocksRes] = await Promise.all([
    supabase.from('program_week_archive').select('week_number').eq('template_id', assignment.template_id),
    supabase
      .from('program_blocks')
      .select('id, name, order_index, week_number')
      .eq('template_id', assignment.template_id)
      .order('order_index', { ascending: true }),
  ]);

  const archivedRawWeekNumbers = (archivedRes.data || []).map((w: any) => w.week_number);
  const blocks: HubBlock[] = blocksRes.data || [];
  const { filteredBlocks } = computeDisplayWeeks(blocks, archivedRawWeekNumbers, currentRawWeek);

  const weekBlockIds = filteredBlocks.filter((b) => (b.week_number ?? 1) === currentRawWeek).map((b) => b.id);
  const { data: logs } = await supabase
    .from('workout_logs')
    .select('block_id, notes')
    .eq('warrior_program_id', assignment.id)
    .in('block_id', weekBlockIds);

  const { nextUpDayName } = computeWeekStats(filteredBlocks, currentRawWeek, (logs || []) as HubWorkoutLog[]);
  return { nextUpDayName };
}
