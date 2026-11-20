// Verbatim mirror of src/lib/ProgramImportParser.ts — keep in sync manually.

import { supabase } from '@/lib/supabase';
import { fetchAllRows, fetchByIds } from '@/lib/fetchAll';
import { BlockConceptParser } from './BlockConceptParser';
import { findLibraryMatch, suggestLibraryExercises, type LibraryExerciseName } from './exerciseNameMatch';
import { isTestKind, testMovementIds } from './testItems';

export interface ImportValidationResult {
  valid: boolean;
  error?: string;
  blockCount?: number;
  /** Blocks marked as test items (test_kind). */
  testBlockCount?: number;
}

/** Why a block marked as a test item (metadata.test_kind) can't be imported,
 * or null. Matches what submit_program_test_item and _block_concept accept
 * (supabase/migrations/20261114190000_coach_test_week.sql), so a bad file is
 * stopped here instead of failing when the athlete logs the item. */
export function testBlockError(block: any, blockName: string): string | null {
  const m = block?.metadata;
  if (!m || typeof m !== 'object' || m.test_kind == null || m.test_kind === '') return null;
  const where = `Test block "${blockName}"`;
  if (!isTestKind(m.test_kind)) {
    return `${where}: test_kind must be max_reps, one_rm, max_hold or form_check.`;
  }
  const kind = m.test_kind;
  const ids = testMovementIds(kind);
  const movement = m.test_movement;
  if (kind === 'max_reps' || kind === 'one_rm') {
    if (typeof movement !== 'string' || !ids.includes(movement)) {
      return `${where}: test_movement must be one of ${ids.join(', ')}.`;
    }
  } else if (kind === 'max_hold' && movement != null && movement !== '') {
    if (typeof movement !== 'string' || !ids.includes(movement)) {
      return `${where}: test_movement must be one of ${ids.join(', ')}, or left out.`;
    }
  }
  // The server reads the concept tag with a non-greedy regex up to the
  // first "]": a list, an object or a "]" would hide the whole tag.
  for (const [key, value] of Object.entries(m)) {
    if (value !== null && typeof value === 'object') {
      return `${where}: metadata "${key}" must be a single value, not a list or object.`;
    }
    if (typeof value === 'string' && value.includes(']')) {
      return `${where}: metadata "${key}" can't contain "]".`;
    }
  }
  if (m.is_tier_trial) return `${where}: a block can't be both a test item and a tier trial.`;
  if (!Array.isArray(block.exercises) || block.exercises.length !== 1) {
    return `${where} needs exactly one exercise: it names the item and gives the demo video.`;
  }
  return null;
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
  let testBlockCount = 0;
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
    const testError = testBlockError(block, blockName);
    if (testError) return { valid: false, error: testError };
    if (block.metadata?.test_kind) testBlockCount++;
  }
  return { valid: true, blockCount: data.blocks.length, testBlockCount };
}

/** One exercise line of a block, as the coach sees it in "View block". */
export interface ImportBlockPreviewExercise {
  name: string;
  /** "3 × 10 · rest 90s", "3 × 30s", or "" when the file gives no numbers. */
  detail: string;
  /** The unmatched exercise this preview was opened for. */
  isThis: boolean;
  /** Another exercise in this block the library also doesn't have. */
  alsoUnmatched: boolean;
}

/** A whole block from the import file, for the coach to decide in context. */
export interface ImportBlockPreview {
  /** "PUSH DAY | Circuit A" (week prefixed when the file has several weeks). */
  label: string;
  /** "Circuit · 3 rounds", "Superset · 4 rounds", "AMRAP 12 min", "Straight sets". */
  kind: string;
  exercises: ImportBlockPreviewExercise[];
}

export interface UnmatchedExercise {
  /** The name as written in the file. */
  name: string;
  /** Close library names, best first (may be empty). */
  suggestions: LibraryExerciseName[];
  /** Every block in the file that uses this name, in full. */
  blocks: ImportBlockPreview[];
  /** How many blocks would be left with no exercises if it were removed. */
  emptiesBlocks: number;
}

/** The coach's answer for one unmatched name: an existing library exercise,
 * add the name to the library as a new exercise, or leave it out of the
 * imported block(s). */
export type ExerciseChoice =
  | { name: string; exerciseId: string }
  | { name: string; create: true }
  | { name: string; remove: true };

/** Shows the coach the names nothing matched; resolves with one choice per
 * name, or null if they cancelled the import. */
export type ChooseExercises = (unmatched: UnmatchedExercise[]) => Promise<ExerciseChoice[] | null>;

export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled.');
    this.name = 'ImportCancelledError';
  }
}

export function isImportCancelled(err: unknown): boolean {
  return err instanceof ImportCancelledError || (err as any)?.name === 'ImportCancelledError';
}

export interface ResolvedImportExercises {
  /** `id:<file id>` / `name:<lowercased file name>` -> exercise_library id. */
  resolved: Map<string, string>;
  /** The file's blocks with every exercise the coach removed left out (new
   * arrays; the input is never changed). Build the payload from these. */
  blocks: any[];
  counts: { by_id: number; by_name: number; newly_created: number; removed: number };
}

const nameKey = (name: string) => `name:${name.trim().toLowerCase()}`;

/** Every library exercise (id, name, video), paged past the 1,000-row cap. */
export async function fetchLibraryNames(): Promise<LibraryExerciseName[]> {
  return fetchAllRows<LibraryExerciseName>((from, to) =>
    supabase.from('exercise_library').select('id, name, youtube_url').order('created_at').order('id').range(from, to),
  );
}

function blockMetadata(block: any): Record<string, any> {
  if (block?.metadata && typeof block.metadata === 'object') return block.metadata;
  return BlockConceptParser.parse(block?.coach_notes || block?.notes || '').metadata || {};
}

/** "Circuit · 3 rounds" etc. English, like the rest of the coaching tools. */
export function describeBlockKind(block: any): string {
  const m = blockMetadata(block);
  const timing = m.timing_system || (m.type === 'amrap' || m.type === 'fortime' ? m.type : undefined);
  const structure = m.structure || (m.type && m.type !== 'amrap' && m.type !== 'fortime' ? m.type : undefined);
  const cap = m.time_cap_min || m.timer_seconds;
  if (m.test_kind) return 'Test item';
  if (timing === 'amrap') return `AMRAP${cap ? ` ${cap} min` : ''}`;
  if (timing === 'fortime') return `For time${cap ? ` · ${cap} min cap` : ''}`;
  if (timing === 'tabata') return 'Tabata';
  const rounds = m.rounds ? ` · ${m.rounds} rounds` : '';
  if (structure === 'circuit') return `Circuit${rounds}`;
  if (structure === 'superset') return `Superset${rounds}`;
  if (structure === 'ladder') return 'Ladder';
  return 'Straight sets';
}

function exerciseDetail(ex: any): string {
  const num = (v: unknown) => (v === null || v === undefined || String(v).trim() === '' ? '' : String(v).trim());
  const sets = num(ex.sets), reps = num(ex.reps), hold = num(ex.hold_seconds), work = num(ex.work_seconds), rest = num(ex.rest_seconds);
  const each = reps || (hold && hold !== '0' ? `${hold}s` : '') || (work && work !== '0' ? `${work}s` : '');
  const main = sets && each ? `${sets} × ${each}` : each || (sets ? `${sets} sets` : '');
  const restPart = rest && rest !== '0' ? `rest ${rest}s` : '';
  return [main, restPart].filter(Boolean).join(' · ');
}

function blockLabel(block: any, index: number, multiWeek: boolean): string {
  const base = block?.day_name && block?.block_name
    ? `${block.day_name} | ${block.block_name}`
    : (block?.block_name || block?.name || block?.day_name || `Block ${index + 1}`);
  const week = Number(block?.week_number) || 1;
  return multiWeek ? `Week ${week} · ${base}` : String(base);
}

/** The name-path key of an exercise, or null when it resolved by its id or
 * has no name. */
function lookupKey(ex: any, resolved: Map<string, string>): string | null {
  if (ex?.exercise_id && resolved.has(`id:${ex.exercise_id}`)) return null;
  const name = (ex?.name || '').trim();
  return name ? nameKey(name) : null;
}

/** Full previews of every block that uses `key`, plus how many of those
 * blocks would end up empty without it. Pure; exported for tests. */
export function previewBlocksFor(
  key: string,
  blocks: any[],
  resolved: Map<string, string>,
  unmatchedKeys: Set<string>
): { blocks: ImportBlockPreview[]; emptiesBlocks: number } {
  const multiWeek = new Set(blocks.map(b => Number(b?.week_number) || 1)).size > 1;
  const out: ImportBlockPreview[] = [];
  let emptiesBlocks = 0;
  blocks.forEach((block, i) => {
    const exercises: any[] = block?.exercises || [];
    const keys = exercises.map(ex => lookupKey(ex, resolved));
    if (!keys.includes(key)) return;
    if (keys.every(k => k === key)) emptiesBlocks++;
    out.push({
      label: blockLabel(block, i, multiWeek),
      kind: describeBlockKind(block),
      exercises: exercises.map((ex, j) => ({
        name: String(ex?.name || ex?.exercise_id || 'Unnamed exercise').trim(),
        detail: exerciseDetail(ex),
        isThis: keys[j] === key,
        alsoUnmatched: keys[j] !== key && keys[j] !== null && unmatchedKeys.has(keys[j]!),
      })),
    });
  });
  return { blocks: out, emptiesBlocks };
}

// Resolves every imported exercise to a real exercise_library id: its
// exercise_id if that still exists, else its name (same name ignoring case,
// spacing, punctuation and a plural "s"). Anything still unmatched goes to the
// coach through `choose`, with the full blocks it sits in: pick a library
// exercise, add it as new, or remove it from the block(s). Nothing is ever
// added to the shared library without the coach seeing it (until 2026-11
// every unmatched name was silently inserted, which filled the library with
// near-copies like "Child Pose" next to "Childe Pose").
export async function resolveImportedExercises(
  blocks: any[],
  coachId: string,
  choose: ChooseExercises
): Promise<ResolvedImportExercises> {
  const idsReferenced = new Set<string>();
  blocks.forEach(b => (b.exercises || []).forEach((ex: any) => {
    if (ex.exercise_id) idsReferenced.add(ex.exercise_id);
  }));

  const resolved = new Map<string, string>();
  const counts = { by_id: 0, by_name: 0, newly_created: 0, removed: 0 };

  if (idsReferenced.size > 0) {
    const data = await fetchByIds<{ id: string }>(Array.from(idsReferenced), (chunk, from, to) =>
      supabase.from('exercise_library').select('id').in('id', chunk).order('id').range(from, to),
    );
    const validIds = new Set(data.map(r => r.id));
    idsReferenced.forEach(id => {
      if (validIds.has(id)) resolved.set(`id:${id}`, id);
    });
    counts.by_id = validIds.size;
  }

  // One entry per distinct name that still needs a name lookup.
  const names = new Map<string, string>();
  for (const block of blocks) {
    for (const ex of block.exercises || []) {
      const key = lookupKey(ex, resolved);
      if (key && !names.has(key)) names.set(key, ex.name.trim());
    }
  }
  if (names.size === 0) return { resolved, blocks, counts };

  const library = await fetchLibraryNames();
  const unmatchedNames: Array<[string, string]> = [];
  for (const [key, name] of names) {
    const hit = findLibraryMatch(name, library);
    if (hit) {
      resolved.set(key, hit.id);
      counts.by_name++;
    } else {
      unmatchedNames.push([key, name]);
    }
  }
  if (unmatchedNames.length === 0) return { resolved, blocks, counts };

  const unmatchedKeys = new Set(unmatchedNames.map(([key]) => key));
  const unmatched: UnmatchedExercise[] = unmatchedNames.map(([key, name]) => ({
    name,
    suggestions: suggestLibraryExercises(name, library),
    ...previewBlocksFor(key, blocks, resolved, unmatchedKeys),
  }));

  const choices = await choose(unmatched);
  if (!choices) throw new ImportCancelledError();

  const toCreate: string[] = [];
  const toRemove = new Set<string>();
  for (const item of unmatched) {
    const choice = choices.find(c => nameKey(c.name) === nameKey(item.name));
    if (!choice) throw new Error(`No choice was made for "${item.name}".`);
    if ('exerciseId' in choice) {
      resolved.set(nameKey(item.name), choice.exerciseId);
      counts.by_name++;
    } else if ('remove' in choice) {
      toRemove.add(nameKey(item.name));
    } else {
      toCreate.push(item.name);
    }
  }

  if (toCreate.length > 0) {
    // difficulty/category default the same way the CSV import does for a row
    // that doesn't specify one — leaving them null crashes
    // ExerciseLibraryScreen's list (ex.difficulty.toUpperCase()).
    const { data: created, error: createErr } = await supabase
      .from('exercise_library')
      .insert(toCreate.map(name => ({ name, created_by: coachId, difficulty: 'beginner', category: '' })))
      .select('id, name');
    if (createErr) throw createErr;
    for (const row of (created || []) as LibraryExerciseName[]) resolved.set(nameKey(row.name), row.id);
    counts.newly_created = (created || []).length;
  }

  // Removed exercises are left out of new block objects; the rest of each
  // block (its other exercises, order, rounds, notes) imports unchanged.
  const outBlocks = toRemove.size === 0 ? blocks : blocks.map(block => {
    const exercises: any[] = block?.exercises || [];
    const kept = exercises.filter(ex => {
      const key = lookupKey(ex, resolved);
      return !(key && toRemove.has(key));
    });
    counts.removed += exercises.length - kept.length;
    return kept.length === exercises.length ? block : { ...block, exercises: kept };
  });

  return { resolved, blocks: outBlocks, counts };
}

// Converts a validated import payload into the p_blocks jsonb shape the
// append_weeks_to_client_program RPC expects. An imported file is always
// treated as one week's worth of blocks (week_number 1 within this
// source) — the RPC offsets it onto the client's next actual week number.
export function buildImportBlocksPayload(data: any, resolved: Map<string, string>) {
  const unresolved: string[] = [];
  const payload = (data.blocks as any[]).map((block, blockIdx) => {
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
        .map((ex: any, exIdx: number) => {
          const exerciseId = resolvedExerciseId(resolved, ex);
          if (!exerciseId) unresolved.push(String(ex.name || ex.exercise_id || 'an exercise'));
          return {
            exercise_id: exerciseId,
            // File order. Without it every row got 0 and the block's
            // exercises came back in no fixed order.
            order_index: exIdx,
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
  if (unresolved.length > 0) throw unresolvedError(unresolved);
  return payload;
}

/** The exercise_library id an imported exercise resolved to: by its id when
 * that id still exists, otherwise by its name. (Looking it up by a stale id
 * only, as the builders used to, lost every exercise whose id had changed
 * even though its name matched; the block kept its note and lost the
 * exercise.) */
export function resolvedExerciseId(resolved: Map<string, string>, ex: { exercise_id?: unknown; name?: unknown }): string | undefined {
  const byId = ex.exercise_id ? resolved.get(`id:${ex.exercise_id}`) : undefined;
  return byId ?? resolved.get(`name:${String(ex.name ?? '').trim().toLowerCase()}`);
}

/** Thrown instead of silently dropping exercises nothing matched. */
export function unresolvedError(names: string[]): Error {
  return new Error(`Could not match these exercises: ${[...new Set(names)].join(', ')}. Fix their exercise_id or name in the file and import again.`);
}
