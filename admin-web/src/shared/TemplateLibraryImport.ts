// Workout Templates Library — coach-side import flow.
// Verbatim mirror of src/lib/TemplateLibraryImport.ts — keep in sync
// manually. Reuses ProgramImportParser's generic validation/exercise-
// resolution (decoupled from the weekly-append flow) but needs its own
// payload builder. Library templates support multi-week progression
// (week_number is read from each block, defaulting to 1 when absent).

import { supabase } from '@/lib/supabase';
import { validateWeekImportPayload, resolveImportedExercises, resolvedExerciseId, unresolvedError, type ChooseExercises } from './ProgramImportParser';
import { BlockConceptParser } from './BlockConceptParser';
import { deriveTrainingDaysPerWeek, type MatchingCriteria } from './templateLibrary';

export interface ImportSummary {
  template_name: string;
  training_days_per_week: number;
  week_count: number;
  block_count: number;
  exercise_match_count: { by_id: number; by_name: number; newly_created: number; removed: number };
}

function blockDisplayName(block: any, blockIdx: number): string {
  return block.day_name && block.block_name
    ? `${block.day_name} | ${block.block_name}`
    : (block.name || block.block_name || `IMPORTED BLOCK ${blockIdx + 1}`);
}

function blockWeekNumber(block: any): number {
  if (block.week_number == null) return 1;
  return parseInt(String(block.week_number), 10) || 1;
}

export function buildLibraryTemplateBlocksPayload(data: any, resolved: Map<string, string>) {
  const unresolved: string[] = [];
  const payload = (data.blocks as any[]).map((block, blockIdx) => {
    const notes = block.metadata
      ? BlockConceptParser.stringify(block.metadata, block.coach_notes || '')
      : (block.coach_notes || block.notes || '');

    return {
      name: blockDisplayName(block, blockIdx),
      notes,
      order_index: block.order_index ?? blockIdx,
      week_number: blockWeekNumber(block),
      exercises: (block.exercises || [])
        .map((ex: any) => {
          const exerciseId = resolvedExerciseId(resolved, ex);
          if (!exerciseId) unresolved.push(String(ex.name || ex.exercise_id || 'an exercise'));
          return {
            exercise_id: exerciseId,
            sets: ex.sets != null ? parseInt(String(ex.sets), 10) || null : null,
            reps: ex.reps != null ? parseInt(String(ex.reps), 10) || null : null,
            rest_seconds: ex.rest_seconds != null ? parseInt(String(ex.rest_seconds), 10) || null : null,
            hold_seconds: ex.hold_seconds != null ? parseInt(String(ex.hold_seconds), 10) || null : null,
            notes: ex.notes || '',
          };
        })
        .filter((ex: any) => !!ex.exercise_id),
    };
  });
  if (unresolved.length > 0) throw unresolvedError(unresolved);
  return payload;
}

/** `matchCounts` comes from resolveImportedExercises, so "newly_created" is
 * what the coach actually chose to add, not a guess made before asking. */
export function computeImportSummary(data: any, matchCounts: ImportSummary['exercise_match_count']): ImportSummary {
  const blocks = (data.blocks as any[]) || [];
  const week1Blocks = blocks.filter((b) => blockWeekNumber(b) === 1);
  const weekCount = new Set(blocks.map((b) => blockWeekNumber(b))).size;

  return {
    template_name: (data.template_name || 'IMPORTED TEMPLATE').toString(),
    training_days_per_week: deriveTrainingDaysPerWeek(week1Blocks.map((b, i) => blockDisplayName(b, i))),
    week_count: weekCount,
    block_count: blocks.length,
    exercise_match_count: matchCounts,
  };
}

// Optional pass-through: a source file may already include matching_criteria
// / equipment_tags (e.g. authored specifically for this library, not just a
// generic weekly export). Applied only if well-formed — an malformed or
// partial block is silently dropped rather than failing the whole import,
// since the coach can always set/fix it afterward via the filter editor.
// A file's own "status" field is deliberately never honored: publishing
// only ever happens through the explicit Publish action and its validation
// gate, never implicitly from an uploaded file.
function extractMatchingCriteria(data: any): MatchingCriteria | null {
  const criteria = data?.matching_criteria;
  if (!criteria || typeof criteria !== 'object') return null;

  const goal = criteria.goal;
  const min = criteria.tier_range?.min;
  const max = criteria.tier_range?.max;
  if (typeof goal !== 'string' || !goal.trim()) return null;
  if (typeof min !== 'number' || typeof max !== 'number') return null;

  return { goal: goal.trim(), tier_range: { min, max } };
}

function extractEquipmentTags(data: any): string[] {
  if (!Array.isArray(data?.equipment_tags)) return [];
  return data.equipment_tags.filter((t: any) => typeof t === 'string' && t.trim().length > 0);
}

/**
 * Validates, resolves exercises, and inserts a new draft library template
 * (is_library_template = true, status = 'draft' always). If the source file
 * already includes well-formed matching_criteria/equipment_tags, those are
 * applied immediately rather than left for the coach to re-enter — but
 * status/published_at are never taken from the file. Import here always
 * creates a brand new draft.
 */
export async function importLibraryTemplate(
  data: any,
  coachId: string,
  chooseExercises: ChooseExercises
): Promise<{ templateId: string; summary: ImportSummary }> {
  const validation = validateWeekImportPayload(data);
  if (!validation.valid) {
    throw new Error(validation.error || 'The file is not in the expected shape.');
  }

  const { resolved, blocks: keptBlocks, counts } = await resolveImportedExercises(data.blocks, coachId, chooseExercises);
  const fileData = { ...data, blocks: keptBlocks };
  const summary = computeImportSummary(data, counts);
  const blocks = buildLibraryTemplateBlocksPayload(fileData, resolved);

  const templateName = (data.template_name || 'IMPORTED TEMPLATE').toString();
  const description = (data.description || '').toString();
  const matchingCriteria = extractMatchingCriteria(data);
  const equipmentTags = extractEquipmentTags(data);

  const { data: templateId, error } = await supabase.rpc('import_library_template', {
    p_name: templateName,
    p_description: description,
    p_blocks: blocks,
    p_matching_criteria: matchingCriteria,
    p_equipment_tags: equipmentTags,
  });
  if (error) throw error;

  return { templateId, summary };
}
