// Verbatim mirror of src/lib/ProgramImportParser.ts — keep in sync manually.

import { supabase } from '@/lib/supabase';
import { BlockConceptParser } from './BlockConceptParser';

export interface ImportValidationResult {
  valid: boolean;
  error?: string;
  blockCount?: number;
}

// Checks the shape produced by ProgramExportBuilder's WeekExportPayload
// (or a close hand-edited variant of it) before anything gets written.
export function validateWeekImportPayload(data: any): ImportValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not a valid JSON object.' };
  }
  if (!Array.isArray(data.blocks) || data.blocks.length === 0) {
    return { valid: false, error: 'No blocks found in the file.' };
  }
  for (const block of data.blocks) {
    const blockName = block?.block_name || block?.name || 'UNNAMED BLOCK';
    if (!block || typeof blockName !== 'string' || !blockName.trim()) {
      return { valid: false, error: 'Every block needs a name.' };
    }
    if (!Array.isArray(block.exercises)) {
      return { valid: false, error: `Block "${blockName}" is missing its exercises list.` };
    }
    for (const ex of block.exercises) {
      const hasId = typeof ex?.exercise_id === 'string' && ex.exercise_id.length > 0;
      const hasName = typeof ex?.name === 'string' && ex.name.trim().length > 0;
      if (!hasId && !hasName) {
        return { valid: false, error: `An exercise in block "${blockName}" has neither an exercise_id nor a name to match against.` };
      }
    }
  }
  return { valid: true, blockCount: data.blocks.length };
}

// Resolves every imported exercise to a real exercise_library id: reuses
// exercise_id if it still exists, otherwise matches by exact
// case-insensitive name, otherwise creates a new entry owned by the
// importing coach — same as adding one manually via the Exercise Library.
export async function resolveImportedExercises(blocks: any[], coachId: string): Promise<Map<string, string>> {
  const idsReferenced = new Set<string>();
  blocks.forEach(b => (b.exercises || []).forEach((ex: any) => {
    if (ex.exercise_id) idsReferenced.add(ex.exercise_id);
  }));

  const resolved = new Map<string, string>();

  if (idsReferenced.size > 0) {
    const { data, error } = await supabase
      .from('exercise_library')
      .select('id')
      .in('id', Array.from(idsReferenced));
    if (error) throw error;
    const validIds = new Set((data || []).map(r => r.id));
    idsReferenced.forEach(id => {
      if (validIds.has(id)) resolved.set(`id:${id}`, id);
    });
  }

  for (const block of blocks) {
    for (const ex of block.exercises || []) {
      const idKey = ex.exercise_id ? `id:${ex.exercise_id}` : null;
      if (idKey && resolved.has(idKey)) continue;

      const name = (ex.name || '').trim();
      if (!name) continue; // must have resolved via a still-valid id above

      const nameKey = `name:${name.toLowerCase()}`;
      if (resolved.has(nameKey)) continue;

      const { data: existing, error: findErr } = await supabase
        .from('exercise_library')
        .select('id')
        .ilike('name', name)
        .limit(1)
        .maybeSingle();
      if (findErr) throw findErr;

      if (existing) {
        resolved.set(nameKey, existing.id);
      } else {
        // difficulty/category default the same way the CSV import already
        // does for a row that doesn't specify one — leaving them null
        // crashes ExerciseLibraryScreen's list (ex.difficulty.toUpperCase()).
        const { data: created, error: createErr } = await supabase
          .from('exercise_library')
          .insert({ name, created_by: coachId, difficulty: 'beginner', category: '' })
          .select('id')
          .single();
        if (createErr) throw createErr;
        resolved.set(nameKey, created.id);
      }
    }
  }

  return resolved;
}

// Converts a validated import payload into the p_blocks jsonb shape the
// append_weeks_to_client_program RPC expects. An imported file is always
// treated as one week's worth of blocks (week_number 1 within this
// source) — the RPC offsets it onto the client's next actual week number.
export function buildImportBlocksPayload(data: any, resolved: Map<string, string>) {
  return (data.blocks as any[]).map((block, blockIdx) => {
    const notes = block.metadata
      ? BlockConceptParser.stringify(block.metadata, block.coach_notes || '')
      : (block.coach_notes || block.notes || '');

    const name = block.day_name && block.block_name
      ? `${block.day_name} | ${block.block_name}`
      : (block.name || block.block_name || `IMPORTED BLOCK ${blockIdx + 1}`);

    return {
      name,
      notes,
      order_index: block.order_index ?? blockIdx,
      week_number: 1,
      exercises: (block.exercises || [])
        .map((ex: any) => {
          const key = ex.exercise_id ? `id:${ex.exercise_id}` : `name:${(ex.name || '').trim().toLowerCase()}`;
          return {
            exercise_id: resolved.get(key),
            sets: ex.sets != null ? parseInt(String(ex.sets), 10) || null : null,
            reps: ex.reps != null ? parseInt(String(ex.reps), 10) || null : null,
            rest_seconds: ex.rest_seconds != null ? parseInt(String(ex.rest_seconds), 10) || null : null,
            hold_seconds: ex.hold_seconds != null ? parseInt(String(ex.hold_seconds), 10) || null : null,
            is_weighted: !!ex.is_weighted,
            notes: ex.notes || '',
          };
        })
        .filter((ex: any) => !!ex.exercise_id),
    };
  });
}
