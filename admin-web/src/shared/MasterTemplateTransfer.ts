// Adapted from src/lib/MasterTemplateTransfer.ts — same payload shape and
// query logic (kept in sync manually), trimmed of the native (expo-file-system
// / expo-sharing) branch since admin-web only ever runs in a browser.
//
// Export/import for a coach's reusable master template — distinct from
// ProgramExportBuilder/ProgramImportParser, which operate on one warrior's
// assigned week (merging in their logged results). A master template has no
// warrior or logs attached, and an import here always spans every week in
// the file (not offset onto an existing assignment's next week).
import { supabase } from '@/lib/supabase';
import { BlockConceptParser, type ConceptMetadata } from './BlockConceptParser';

export interface MasterTemplateExportBlock {
  day_name: string;
  block_name: string;
  week_number: number;
  order_index: number;
  metadata: ConceptMetadata;
  coach_notes: string;
  exercises: Array<{
    exercise_id: string;
    name: string;
    sets: string;
    reps: string;
    rest_seconds: string;
    hold_seconds: string;
  }>;
}

export interface MasterTemplateExportPayload {
  exported_at: string;
  template_name: string;
  description: string;
  blocks: MasterTemplateExportBlock[];
}

/** Pulls every block/exercise across all weeks for a master template — same
 * query shape ProgramExportBuilder uses for a single week, just without a
 * week_number filter and without any log merging. */
export async function fetchMasterTemplateExportPayload(
  templateId: string,
  templateName: string,
  description: string,
): Promise<MasterTemplateExportPayload> {
  const { data: blocksData, error: blocksError } = await supabase
    .from('program_blocks')
    .select('id, name, notes, order_index, week_number')
    .eq('template_id', templateId)
    .order('week_number', { ascending: true })
    .order('order_index', { ascending: true });
  if (blocksError) throw new Error(blocksError.message);

  const blockIds = (blocksData ?? []).map((b) => b.id);
  let allExercisesData: Array<Record<string, unknown>> = [];
  if (blockIds.length > 0) {
    const { data, error } = await supabase
      .from('block_exercises')
      .select('id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, order_index, exercise_library(name)')
      .in('block_id', blockIds)
      .order('order_index', { ascending: true });
    if (error) throw new Error(error.message);
    allExercisesData = (data ?? []) as Array<Record<string, unknown>>;
  }

  const exercisesByBlock = new Map<string, Array<Record<string, unknown>>>();
  for (const ex of allExercisesData) {
    const blockId = ex.block_id as string;
    const list = exercisesByBlock.get(blockId) ?? [];
    list.push(ex);
    exercisesByBlock.set(blockId, list);
  }

  const blocks: MasterTemplateExportBlock[] = (blocksData ?? []).map((block) => {
    const parsed = BlockConceptParser.parse(block.notes);

    let dayName = block.name ?? '';
    let blockName = 'Workout Routine';
    if (dayName.includes(' | ')) {
      const parts = dayName.split(' | ');
      dayName = parts[0].trim();
      blockName = parts.slice(1).join(' | ').trim();
    }

    const exercisesData = exercisesByBlock.get(block.id) ?? [];

    return {
      day_name: dayName,
      block_name: blockName,
      week_number: block.week_number || 1,
      order_index: block.order_index ?? 0,
      metadata: parsed.metadata,
      coach_notes: parsed.cleanNotes,
      exercises: exercisesData.map((ex) => ({
        exercise_id: ex.exercise_id as string,
        name: (ex.exercise_library as { name?: string } | null)?.name ?? 'Unnamed exercise',
        sets: String(ex.sets ?? ''),
        reps: String(ex.reps ?? ''),
        rest_seconds: String(ex.rest_seconds ?? ''),
        hold_seconds: String(ex.hold_seconds ?? ''),
      })),
    };
  });

  return {
    exported_at: new Date().toISOString(),
    template_name: templateName,
    description: description || '',
    blocks,
  };
}

/** Triggers a browser download of the payload as a .json file. */
export function downloadMasterTemplateExportPayload(payload: MasterTemplateExportPayload, fileNameHint: string): void {
  const json = JSON.stringify(payload, null, 2);
  const safeName = fileNameHint.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'master_template';
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${safeName}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Converts a validated import payload (validate with ProgramImportParser's
 * validateWeekImportPayload — the block/exercise shape is identical) into
 * the p_blocks shape save_program_template expects. Unlike a client-week
 * import, week_number is preserved as-is from the file rather than forced
 * to 1 — this creates a brand new multi-week template from scratch, not an
 * addition to an existing assignment. */
export function buildMasterTemplateBlocksPayload(data: { blocks: unknown[] }, resolved: Map<string, string>) {
  return (data.blocks as Array<Record<string, any>>).map((block, blockIdx) => {
    const notes = block.metadata
      ? BlockConceptParser.stringify(block.metadata, block.coach_notes || '')
      : (block.coach_notes || block.notes || '');

    const name = block.day_name && block.block_name
      ? `${block.day_name} | ${block.block_name}`
      : (block.name || block.block_name || `Imported block ${blockIdx + 1}`);

    return {
      db_id: null,
      name,
      notes,
      order_index: block.order_index ?? blockIdx,
      week_number: block.week_number || 1,
      exercises: ((block.exercises ?? []) as Array<Record<string, any>>)
        .map((ex) => {
          const key = ex.exercise_id ? `id:${ex.exercise_id}` : `name:${(ex.name || '').trim().toLowerCase()}`;
          return {
            exercise_id: resolved.get(key),
            sets: ex.sets != null ? parseInt(String(ex.sets), 10) || null : null,
            reps: ex.reps != null ? parseInt(String(ex.reps), 10) || null : null,
            rest_seconds: ex.rest_seconds != null ? parseInt(String(ex.rest_seconds), 10) || null : null,
            hold_seconds: ex.hold_seconds != null ? parseInt(String(ex.hold_seconds), 10) || null : null,
            notes: ex.notes || '',
          };
        })
        .filter((ex) => !!ex.exercise_id),
    };
  });
}
