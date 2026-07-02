import { supabase } from './supabase';

export type ClientProgramWriteMode = 'append' | 'archive' | 'overwrite';

interface BlockPayloadExercise {
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  is_weighted: boolean;
  notes: string;
}

interface BlockPayload {
  name: string;
  notes: string;
  order_index: number;
  week_number: number;
  exercises: BlockPayloadExercise[];
}

// Fetches every block (all weeks) of a template in the jsonb shape
// append_weeks_to_client_program / overwrite_client_program /
// archive_and_append_client_program all expect for p_blocks. week_number
// here is the block's own week within this template — the RPCs handle
// offsetting it onto the target client's program.
export async function fetchTemplateBlocksPayload(templateId: string): Promise<BlockPayload[]> {
  const { data: blocksData, error: blocksError } = await supabase
    .from('program_blocks')
    .select('id, name, notes, order_index, week_number')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true });
  if (blocksError) throw blocksError;

  const blockIds = (blocksData || []).map(b => b.id);
  let allExercisesData: any[] = [];
  if (blockIds.length > 0) {
    const { data, error } = await supabase
      .from('block_exercises')
      .select('id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index')
      .in('block_id', blockIds)
      .order('order_index', { ascending: true });
    if (error) throw error;
    allExercisesData = data || [];
  }

  const exercisesByBlock: Record<string, any[]> = {};
  allExercisesData.forEach(ex => {
    if (!exercisesByBlock[ex.block_id]) exercisesByBlock[ex.block_id] = [];
    exercisesByBlock[ex.block_id].push(ex);
  });

  return (blocksData || []).map(block => ({
    name: block.name || '',
    notes: block.notes || '',
    order_index: block.order_index || 0,
    week_number: block.week_number || 1,
    exercises: (exercisesByBlock[block.id] || []).map((ex: any) => ({
      exercise_id: ex.exercise_id,
      sets: ex.sets,
      reps: ex.reps,
      rest_seconds: ex.rest_seconds,
      hold_seconds: ex.hold_seconds,
      is_weighted: !!ex.is_weighted,
      notes: ex.notes || '',
    })),
  }));
}

// Copies a master template's blocks onto an existing client assignment,
// using whichever of the three write RPCs matches the coach's chosen mode.
// The master template itself is never touched — all three RPCs derive
// their target template_id from the warrior_programs row, which always
// points at the client's own clone.
export async function applyTemplateToExistingClient(
  mode: ClientProgramWriteMode,
  warriorProgramId: string,
  sourceTemplateId: string
): Promise<void> {
  const blocks = await fetchTemplateBlocksPayload(sourceTemplateId);
  const rpcName = mode === 'append'
    ? 'append_weeks_to_client_program'
    : mode === 'archive'
      ? 'archive_and_append_client_program'
      : 'overwrite_client_program';

  const { error } = await supabase.rpc(rpcName, {
    p_warrior_program_id: warriorProgramId,
    p_blocks: blocks,
  });
  if (error) throw error;
}
