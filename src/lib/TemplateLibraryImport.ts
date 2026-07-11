// Workout Templates Library — coach-side import flow.
// Reuses ProgramImportParser's generic validation/exercise-resolution
// (decoupled from the weekly-append flow) but needs its own payload
// builder. Library templates support multi-week progression (week_number
// is read from each block, defaulting to 1 when absent) — the same
// week_number column and WarriorProgramScreen week-navigation already
// used by regular coach master templates, just reused here.

import { supabase } from './supabase';
import { validateWeekImportPayload, resolveImportedExercises } from './ProgramImportParser';
import { BlockConceptParser } from './BlockConceptParser';
import { deriveTrainingDaysPerWeek, MatchingCriteria } from './templateLibrary';

export interface ImportSummary {
  template_name: string;
  training_days_per_week: number;
  week_count: number;
  block_count: number;
  exercise_match_count: { by_id: number; by_name: number; newly_created: number };
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
  return (data.blocks as any[]).map((block, blockIdx) => {
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
        .filter((ex: any) => !!ex.exercise_id),
    };
  });
}

// Read-only classification for the confirmation screen — mirrors
// resolveImportedExercises's id-then-name tiers but performs no writes
// (no auto-create), so calling this doesn't affect exercise_library.
async function classifyExercises(blocks: any[]): Promise<ImportSummary['exercise_match_count']> {
  const idsReferenced = new Set<string>();
  const namesReferenced = new Set<string>();
  blocks.forEach((b) =>
    (b.exercises || []).forEach((ex: any) => {
      if (ex.exercise_id) idsReferenced.add(ex.exercise_id);
      else if (ex.name) namesReferenced.add(ex.name.trim());
    })
  );

  let byId = 0;
  if (idsReferenced.size > 0) {
    const { data } = await supabase.from('exercise_library').select('id').in('id', Array.from(idsReferenced));
    byId = (data || []).length;
  }

  let byName = 0;
  for (const name of namesReferenced) {
    const { data } = await supabase.from('exercise_library').select('id').ilike('name', name).limit(1).maybeSingle();
    if (data) byName++;
  }

  const total = idsReferenced.size + namesReferenced.size;
  return { by_id: byId, by_name: byName, newly_created: Math.max(0, total - byId - byName) };
}

export async function computeImportSummary(data: any): Promise<ImportSummary> {
  const blocks = (data.blocks as any[]) || [];
  const week1Blocks = blocks.filter((b) => blockWeekNumber(b) === 1);
  const weekCount = new Set(blocks.map((b) => blockWeekNumber(b))).size;

  return {
    template_name: (data.template_name || 'IMPORTED TEMPLATE').toString(),
    training_days_per_week: deriveTrainingDaysPerWeek(week1Blocks.map((b, i) => blockDisplayName(b, i))),
    week_count: weekCount,
    block_count: blocks.length,
    exercise_match_count: await classifyExercises(blocks),
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
 * status/published_at are never taken from the file. Never touches
 * save_program_template (used for the coach's private templates) or its
 * existing-template update path, since import here always creates a brand
 * new draft.
 */
export async function importLibraryTemplate(
  data: any,
  coachId: string
): Promise<{ templateId: string; summary: ImportSummary }> {
  const validation = validateWeekImportPayload(data);
  if (!validation.valid) {
    throw new Error(validation.error || 'The file is not in the expected shape.');
  }

  const summary = await computeImportSummary(data);
  const resolved = await resolveImportedExercises(data.blocks, coachId);
  const blocks = buildLibraryTemplateBlocksPayload(data, resolved);

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
