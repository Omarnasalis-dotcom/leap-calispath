import { supabase } from '@/lib/supabase';
import { resolveImportedExercises } from '@/shared/ProgramImportParser';
import { BlockConceptParser, ConceptMetadata } from '@/shared/BlockConceptParser';

// Admin-only authoring for standalone_workouts/standalone_workout_blocks/
// _exercises (Workouts + Quick Workouts) — mirrors the mobile app's
// src/lib/workoutLibrary.ts admin functions exactly, calling the same
// save_standalone_workout RPC and relying on the same "Admin manages all
// standalone workouts/blocks" FOR-ALL RLS policies for the all-statuses
// list read and the direct delete (see
// supabase/migrations/20260822060000_add_standalone_workout_blocks.sql).
//
// A Workout is one full training day built from ordered blocks/phases
// (Warm-Up, Skills, Strength, Cool-Down, ...) — same idea as a real program
// day, just without weeks or CONCEPT metadata. Quick Workouts are
// effectively flat (one implicit block) since AMRAP/EMOM/Tabata content is
// inherently a single continuous circuit.

export type StandaloneWorkoutKind = 'workout' | 'quick_workout';
export type StandaloneWorkoutStatus = 'draft' | 'published' | 'archived';

export interface StandaloneWorkoutRow {
  id: string;
  kind: StandaloneWorkoutKind;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: string | null;
  format: string | null;
  duration_minutes: number | null;
  is_free: boolean;
  status: StandaloneWorkoutStatus;
  cover_image_url: string | null;
  goal_tags: string[];
  tier_min: number | null;
  tier_max: number | null;
  // Timing-pattern fields (20260827040000) — see
  // docs/features/quick-workout-timing-patterns.md.
  interval_seconds: number | null;
  rounds: number | null;
  // Skill tag (20260906020000) — shown on the browse card beside the
  // category badge. is_skill toggles the tag on/off; skill_label is the
  // custom text (e.g. "Handstand"), falling back to "Skills" when blank.
  is_skill: boolean;
  skill_label: string | null;
}

// supabase/migrations/20260825010000_add_standalone_workout_matching_fields.sql
export const GOAL_TAG_VALUES = [
  'muscle_up', 'handstand', 'front_lever', 'back_lever', 'pistol',
  'general_strength', 'conditioning',
] as const;

export interface StandaloneWorkoutExerciseRow {
  exercise_id: string;
  exercise_name?: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  work_seconds: number | null;
  is_weighted: boolean;
  notes: string | null;
  order_index: number;
}

export interface StandaloneWorkoutBlockRow {
  id: string;
  name: string;
  // [CONCEPT:{json}] notes encoding — same as program_blocks.notes, parsed
  // via BlockConceptParser. Only meaningful for kind:"workout"; kind:
  // "quick_workout" blocks keep this as plain passthrough text (or null).
  notes: string | null;
  order_index: number;
  exercises: StandaloneWorkoutExerciseRow[];
}

export interface StandaloneWorkoutDetail extends StandaloneWorkoutRow {
  blocks: StandaloneWorkoutBlockRow[];
}

export async function fetchStandaloneWorkouts(): Promise<StandaloneWorkoutRow[]> {
  const { data, error } = await supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, status, cover_image_url, goal_tags, tier_min, tier_max, interval_seconds, rounds, is_skill, skill_label')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StandaloneWorkoutRow[];
}

export async function fetchStandaloneWorkoutDetail(id: string): Promise<StandaloneWorkoutDetail> {
  const { data: workout, error: workoutError } = await supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, status, cover_image_url, goal_tags, tier_min, tier_max, interval_seconds, rounds, is_skill, skill_label')
    .eq('id', id)
    .single();
  if (workoutError) throw new Error(workoutError.message);

  const { data: blockRows, error: blocksError } = await supabase
    .from('standalone_workout_blocks')
    .select(
      'id, name, notes, order_index, standalone_workout_exercises(exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index, exercise_library(name))',
    )
    .eq('workout_id', id)
    .order('order_index', { ascending: true });
  if (blocksError) throw new Error(blocksError.message);

  const blocks: StandaloneWorkoutBlockRow[] = (blockRows ?? []).map((block: any) => ({
    id: block.id,
    name: block.name,
    notes: block.notes ?? null,
    order_index: block.order_index ?? 0,
    exercises: (Array.isArray(block.standalone_workout_exercises) ? block.standalone_workout_exercises : [])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((row: any) => ({
        exercise_id: row.exercise_id,
        exercise_name: row.exercise_library?.name ?? 'Unknown exercise',
        sets: row.sets,
        reps: row.reps,
        rest_seconds: row.rest_seconds,
        hold_seconds: row.hold_seconds,
        work_seconds: row.work_seconds,
        is_weighted: row.is_weighted ?? false,
        notes: row.notes,
        order_index: row.order_index ?? 0,
      })),
  }));

  return { ...(workout as StandaloneWorkoutRow), blocks };
}

export interface SaveStandaloneWorkoutBlockInput {
  name: string;
  // CONCEPT-prefixed for kind:"workout" blocks (see BlockConceptParser),
  // raw passthrough for kind:"quick_workout" — same encoding program_blocks
  // already uses, so this content parses identically if ever compared.
  notes: string | null;
  order_index: number;
  exercises: Array<{
    exercise_id: string;
    sets: number | null;
    reps: number | null;
    rest_seconds: number | null;
    hold_seconds: number | null;
    work_seconds: number | null;
    is_weighted: boolean;
    notes: string | null;
    order_index: number;
  }>;
}

export interface SaveStandaloneWorkoutInput {
  id: string | null;
  kind: StandaloneWorkoutKind;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: string | null;
  format: string | null;
  duration_minutes: number | null;
  is_free: boolean;
  status: StandaloneWorkoutStatus;
  blocks: SaveStandaloneWorkoutBlockInput[];
  cover_image_url: string | null;
  goal_tags: string[];
  tier_min: number | null;
  tier_max: number | null;
  interval_seconds: number | null;
  rounds: number | null;
  // Optional — omitted by callers that don't author these (e.g. JSON import
  // defaults them via the RPC's own DEFAULTs).
  is_skill?: boolean;
  skill_label?: string | null;
}

export async function saveStandaloneWorkout(input: SaveStandaloneWorkoutInput): Promise<string> {
  const { data, error } = await supabase.rpc('save_standalone_workout', {
    p_workout_id: input.id,
    p_kind: input.kind,
    p_title: input.title,
    p_description: input.description,
    p_category: input.category,
    p_difficulty: input.difficulty,
    p_format: input.format,
    p_duration_minutes: input.duration_minutes,
    p_is_free: input.is_free,
    p_status: input.status,
    p_blocks: input.blocks,
    p_cover_image_url: input.cover_image_url,
    p_goal_tags: input.goal_tags,
    p_tier_min: input.tier_min,
    p_tier_max: input.tier_max,
    p_interval_seconds: input.interval_seconds,
    p_rounds: input.rounds,
    p_is_skill: input.is_skill ?? false,
    p_skill_label: input.skill_label ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteStandaloneWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Bulk row actions (list-view multi-select) and the list-view cover upload
// below all go straight to the table rather than through
// save_standalone_workout — they only ever touch one column (or delete the
// row outright), and the "Admin manages all standalone workouts" FOR ALL
// RLS policy already covers it, so there's nothing the RPC's full
// block-replace logic would add.

export async function bulkDeleteStandaloneWorkouts(ids: string[]): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').delete().in('id', ids);
  if (error) throw new Error(error.message);
}

export async function bulkSetStandaloneWorkoutStatus(ids: string[], status: StandaloneWorkoutStatus): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').update({ status }).in('id', ids);
  if (error) throw new Error(error.message);
}

export async function setStandaloneWorkoutSkillTag(id: string, isSkill: boolean, skillLabel: string | null): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').update({ is_skill: isSkill, skill_label: skillLabel }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setStandaloneWorkoutCoverImage(id: string, coverImageUrl: string): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').update({ cover_image_url: coverImageUrl }).eq('id', id);
  if (error) throw new Error(error.message);
}

const COVER_BUCKET = 'workout-covers';

/**
 * Uploads a cover image under a fresh random filename (not tied to a
 * workout id — a new workout doesn't have one yet at upload time) and
 * returns its public URL. Admin-only per the bucket's storage.objects RLS
 * (supabase/migrations/20260822070000_add_standalone_workout_cover_image.sql).
 */
export async function uploadWorkoutCoverImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(COVER_BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(COVER_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------- JSON import ----------
// One workout per file — see docs/features/workout-content-import-format.md
// for the schema this validates against.

export interface ImportedStandaloneWorkoutExercise {
  exercise_id?: string;
  name?: string;
  sets?: number | string | null;
  reps?: number | string | null;
  rest_seconds?: number | string | null;
  hold_seconds?: number | string | null;
  work_seconds?: number | string | null;
  is_weighted?: boolean;
  notes?: string | null;
}

export interface ImportedStandaloneWorkoutBlock {
  // kind:"quick_workout" shape — unchanged.
  name?: string;
  notes?: string | null;
  // kind:"workout"-only — same block shape as Master Template's
  // MasterTemplateExportBlock, minus week_number (this is always a single
  // day). block_name replaces `name`, coach_notes replaces `notes`;
  // metadata is required per block when present in this shape.
  day_name?: string;
  block_name?: string;
  metadata?: ConceptMetadata;
  coach_notes?: string | null;
  order_index?: number;
  exercises?: ImportedStandaloneWorkoutExercise[];
}

export interface ImportedStandaloneWorkout {
  kind?: string;
  title?: string;
  description?: string | null;
  category?: string | null;
  difficulty?: string | null;
  format?: string | null;
  duration_minutes?: number | string | null;
  is_free?: boolean;
  blocks?: ImportedStandaloneWorkoutBlock[];
  goal_tags?: string[];
  tier_min?: number | string | null;
  tier_max?: number | string | null;
  interval_seconds?: number | string | null;
  rounds?: number | string | null;
  is_skill?: boolean;
  skill_label?: string | null;
}

const DIFFICULTY_VALUES = ['beginner', 'intermediate', 'advanced'];
const FORMAT_VALUES = ['amrap', 'emom', 'fortime', 'tabata'];
const CATEGORY_VALUES = ['PULL', 'PUSH', 'LEGS', 'CORE', 'FULL_BODY'];

// Case-insensitive match against the exact values the DB CHECK constraint
// (difficulty/format) or the app's own filter chips (category) require —
// returns the canonical casing, or null if nothing matches at all.
function normalizeAgainst(value: string | null | undefined, allowed: string[]): string | null {
  if (!value) return null;
  const hit = allowed.find((a) => a.toLowerCase() === value.trim().toLowerCase());
  return hit ?? null;
}

export function validateStandaloneWorkoutImport(data: any): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not a valid JSON object.' };
  }
  if (data.kind !== 'workout' && data.kind !== 'quick_workout') {
    return { valid: false, error: '"kind" must be "workout" or "quick_workout".' };
  }
  if (typeof data.title !== 'string' || !data.title.trim()) {
    return { valid: false, error: '"title" is required.' };
  }
  if (!Array.isArray(data.blocks) || data.blocks.length === 0) {
    return { valid: false, error: '"blocks" must be a non-empty array — one entry per phase (Warm-Up, Strength, Cool-Down, ...).' };
  }
  for (const block of data.blocks) {
    if (data.kind === 'quick_workout') {
      if (block?.metadata !== undefined || block?.day_name !== undefined || block?.block_name !== undefined || block?.coach_notes !== undefined) {
        return { valid: false, error: '"metadata", "day_name", "block_name" and "coach_notes" are not supported on quick_workout blocks.' };
      }
    }
    // kind:"workout" blocks use block_name/metadata (Master Template's
    // shape); kind:"quick_workout" blocks keep the original name-only shape.
    const blockName = data.kind === 'workout' ? block?.block_name : block?.name;
    if (typeof blockName !== 'string' || !blockName.trim()) {
      return { valid: false, error: data.kind === 'workout' ? 'Every block needs a "block_name".' : 'Every block needs a name.' };
    }
    if (data.kind === 'workout' && (typeof block.metadata !== 'object' || block.metadata === null || Array.isArray(block.metadata))) {
      return { valid: false, error: `Block "${blockName}" is missing "metadata".` };
    }
    if (!Array.isArray(block.exercises) || block.exercises.length === 0) {
      return { valid: false, error: `Block "${blockName}" needs a non-empty "exercises" array.` };
    }
    for (const ex of block.exercises) {
      const hasId = typeof ex?.exercise_id === 'string' && ex.exercise_id.length > 0;
      const hasName = typeof ex?.name === 'string' && ex.name.trim().length > 0;
      if (!hasId && !hasName) {
        return { valid: false, error: `An exercise in block "${blockName}" needs an exercise_id or a name to match against.` };
      }
    }
  }
  // difficulty/format are DB CHECK-constrained — reject up front with a
  // clear message instead of letting a raw Postgres constraint error surface
  // from save_standalone_workout after the user has already clicked Import.
  if (data.difficulty && !normalizeAgainst(data.difficulty, DIFFICULTY_VALUES)) {
    return { valid: false, error: `"difficulty" must be one of: ${DIFFICULTY_VALUES.join(', ')}.` };
  }
  if (data.kind === 'quick_workout' && data.format && !normalizeAgainst(data.format, FORMAT_VALUES)) {
    return { valid: false, error: `"format" must be one of: ${FORMAT_VALUES.join(', ')}.` };
  }
  // goal_tags/tier_min/tier_max are DB CHECK-constrained too (see
  // 20260825010000_add_standalone_workout_matching_fields.sql) — same
  // up-front-rejection reasoning as difficulty/format above.
  if (data.goal_tags !== undefined) {
    if (!Array.isArray(data.goal_tags)) {
      return { valid: false, error: '"goal_tags" must be an array of strings.' };
    }
    const bad = data.goal_tags.find((t: unknown) => !GOAL_TAG_VALUES.includes(t as any));
    if (bad !== undefined) {
      return { valid: false, error: `"goal_tags" contains "${bad}" — must be one of: ${GOAL_TAG_VALUES.join(', ')}.` };
    }
  }
  const tierMin = data.tier_min === '' || data.tier_min == null ? null : Number(data.tier_min);
  const tierMax = data.tier_max === '' || data.tier_max == null ? null : Number(data.tier_max);
  if (tierMin !== null && (!Number.isInteger(tierMin) || tierMin < 0 || tierMin > 9)) {
    return { valid: false, error: '"tier_min" must be a whole number from 0 to 9.' };
  }
  if (tierMax !== null && (!Number.isInteger(tierMax) || tierMax < 0 || tierMax > 9)) {
    return { valid: false, error: '"tier_max" must be a whole number from 0 to 9.' };
  }
  if (tierMin !== null && tierMax !== null && tierMin > tierMax) {
    return { valid: false, error: '"tier_min" cannot be greater than "tier_max".' };
  }
  // interval_seconds/rounds are DB CHECK-constrained (> 0 or NULL) — same
  // up-front-rejection reasoning as everything else above.
  const intervalSeconds = data.interval_seconds === '' || data.interval_seconds == null ? null : Number(data.interval_seconds);
  if (intervalSeconds !== null && (!Number.isInteger(intervalSeconds) || intervalSeconds <= 0)) {
    return { valid: false, error: '"interval_seconds" must be a positive whole number.' };
  }
  const rounds = data.rounds === '' || data.rounds == null ? null : Number(data.rounds);
  if (rounds !== null && (!Number.isInteger(rounds) || rounds <= 0)) {
    return { valid: false, error: '"rounds" must be a positive whole number.' };
  }
  // skill_label is DB CHECK-constrained (<= 40 chars) — same
  // up-front-rejection reasoning as everything else above.
  if (data.skill_label != null && typeof data.skill_label !== 'string') {
    return { valid: false, error: '"skill_label" must be a string.' };
  }
  if (typeof data.skill_label === 'string' && data.skill_label.length > 40) {
    return { valid: false, error: '"skill_label" must be 40 characters or fewer.' };
  }
  return { valid: true };
}

// Parses a numeric field without losing a legitimate 0 — `parseInt(...) ||
// null` (the pattern the Program-template importer uses) silently turns 0
// into null since 0 is falsy. Empty/omitted stays null; a non-numeric
// string also becomes null.
function parseNullableInt(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Resolves every exercise across every block (existing id, matched-by-name,
 * or newly created — reuses the exact same resolveImportedExercises helper
 * Program JSON import already relies on, which already expects exactly
 * this blocks[].exercises[] shape) then creates the workout via
 * save_standalone_workout, always as a draft so it gets reviewed/published
 * deliberately rather than going live straight from an import.
 */
export async function importStandaloneWorkoutFromJson(
  data: ImportedStandaloneWorkout,
  adminId: string,
): Promise<string> {
  const inputBlocks = data.blocks ?? [];
  const resolved = await resolveImportedExercises(inputBlocks, adminId);

  const unresolvedNames: string[] = [];

  const blocks: SaveStandaloneWorkoutBlockInput[] = inputBlocks.map((block, bi) => {
    const exercises = (block.exercises ?? [])
      .map((ex, i) => {
        const key = ex.exercise_id ? `id:${ex.exercise_id}` : `name:${(ex.name ?? '').trim().toLowerCase()}`;
        const exercise_id = resolved.get(key);
        if (!exercise_id) {
          // Only reachable when exercise_id was stale/invalid AND no name
          // was given as a fallback — validateStandaloneWorkoutImport lets
          // this through (it only checks a name-or-id is *present*, not
          // that the id actually resolves), so without this check the
          // exercise would silently vanish from the saved block.
          const blockLabel = data.kind === 'workout' ? block.block_name : block.name;
          unresolvedNames.push(ex.name || ex.exercise_id || `block "${blockLabel}" exercise #${i + 1}`);
          return null;
        }
        return {
          exercise_id,
          sets: parseNullableInt(ex.sets),
          reps: parseNullableInt(ex.reps),
          rest_seconds: parseNullableInt(ex.rest_seconds),
          hold_seconds: parseNullableInt(ex.hold_seconds),
          work_seconds: parseNullableInt(ex.work_seconds),
          is_weighted: !!ex.is_weighted,
          notes: ex.notes || null,
          order_index: i,
        };
      })
      .filter((ex): ex is NonNullable<typeof ex> => ex !== null);

    if (data.kind === 'workout') {
      // Same "{day_name} | {block_name}" join program_blocks.name already
      // uses for Master Template days, and the same [CONCEPT:{...}] notes
      // prefix program_blocks.notes already uses — so this content parses
      // identically to a Master Template day if ever cross-referenced.
      const name = block.day_name ? `${block.day_name} | ${block.block_name}` : (block.block_name ?? '').trim();
      return {
        name,
        notes: BlockConceptParser.stringify(block.metadata ?? {}, block.coach_notes ?? ''),
        order_index: block.order_index ?? bi,
        exercises,
      };
    }

    return {
      name: (block.name ?? '').trim(),
      notes: block.notes ?? null,
      order_index: block.order_index ?? bi,
      exercises,
    };
  });

  if (unresolvedNames.length > 0) {
    throw new Error(`Could not resolve exercise(s): ${unresolvedNames.join(', ')}. Fix the exercise_id or name and try again.`);
  }

  return saveStandaloneWorkout({
    id: null,
    kind: data.kind as StandaloneWorkoutKind,
    title: data.title!.trim(),
    description: data.description?.trim() || null,
    cover_image_url: null, // JSON import doesn't carry a cover photo — set one after import via Edit
    category: normalizeAgainst(data.category, CATEGORY_VALUES) ?? data.category?.trim().toUpperCase() ?? null,
    difficulty: normalizeAgainst(data.difficulty, DIFFICULTY_VALUES),
    format: data.kind === 'quick_workout' ? normalizeAgainst(data.format, FORMAT_VALUES) : null,
    duration_minutes: data.kind === 'quick_workout' ? parseNullableInt(data.duration_minutes) : null,
    is_free: !!data.is_free,
    status: 'draft',
    blocks,
    goal_tags: Array.isArray(data.goal_tags) ? data.goal_tags : [],
    tier_min: parseNullableInt(data.tier_min),
    tier_max: parseNullableInt(data.tier_max),
    interval_seconds: data.kind === 'quick_workout' ? parseNullableInt(data.interval_seconds) : null,
    rounds: data.kind === 'quick_workout' ? parseNullableInt(data.rounds) : null,
    is_skill: !!data.is_skill,
    skill_label: data.skill_label?.trim() || null,
  });
}
