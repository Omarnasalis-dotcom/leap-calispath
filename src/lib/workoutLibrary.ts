// Standalone Workouts Library — browse-and-filter query layer for the two
// new Workout Library content types (single-session "Workouts" and short
// timed "Quick Workouts"). Sibling to templateLibrary.ts, which owns the
// existing tier-matched Program recommendations — that logic is untouched;
// this file only covers the two new, purely browse-and-filter types with
// no "recommended for you" concept.

import { supabase } from './supabase';

export type StandaloneWorkoutKind = 'workout' | 'quick_workout';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
// Mirrors the DB CHECK constraint (standalone_workouts_goal_tags_check,
// 20260825010000) exactly — enum-constrained, not free text. The app's
// OTHER library system (program_templates.matching_criteria->>'goal') is
// unconstrained free text matched by exact jsonb containment, which is
// why "muscle-up" and "Muscle Up" silently fail to match there. Keep this
// list and the DB constraint in sync by hand if it ever grows.
export type GoalTag =
  | 'muscle_up' | 'handstand' | 'front_lever' | 'back_lever' | 'pistol'
  | 'general_strength' | 'conditioning';
export type QuickWorkoutFormat = 'amrap' | 'emom' | 'fortime' | 'tabata';
export type StandaloneWorkoutStatus = 'draft' | 'published' | 'archived';

export interface StandaloneWorkoutSummary {
  id: string;
  kind: StandaloneWorkoutKind;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: Difficulty | null;
  format: QuickWorkoutFormat | null;
  duration_minutes: number | null;
  is_free: boolean;
  cover_image_url: string | null;
  goal_tags: GoalTag[];
  tier_min: number | null;
  tier_max: number | null;
  // Timing-pattern fields (20260827040000) — EMOM/Tabata/For Time only,
  // NULL for AMRAP and for any pre-existing content authored before these
  // existed. See docs/features/quick-workout-timing-patterns.md for what
  // each format does with these.
  interval_seconds: number | null; // EMOM: seconds per round. NULL -> 60.
  rounds: number | null; // Tabata: total work/rest cycles, NULL -> derived from duration. For Time: target round count, NULL -> uncapped stopwatch.
  // Skill tag (20260906020000) — shown on the browse card beside the
  // category badge. is_skill toggles it; skill_label is the custom text
  // ("Handstand"), falling back to "Skills" when checked but blank.
  is_skill: boolean;
  skill_label: string | null;
}

export interface StandaloneWorkoutExercise {
  exercise_id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  work_seconds: number | null;
  is_weighted: boolean;
  notes: string | null;
  order_index: number;
}

// A Workout is one full training day, built from ordered blocks/phases
// (Warm-Up, Skills, Strength, Cool-Down, ...) — same "DAY | BLOCK" idea as
// every other training day in this app (program_blocks/block_exercises).
// Quick Workouts are effectively flat — one implicit block — since
// AMRAP/EMOM/Tabata content is inherently a single continuous circuit.
export interface StandaloneWorkoutBlock {
  id: string;
  name: string;
  order_index: number;
  exercises: StandaloneWorkoutExercise[];
}

export interface StandaloneWorkoutDetail extends StandaloneWorkoutSummary {
  blocks: StandaloneWorkoutBlock[];
}

// Admin-authoring row/input shapes — status is only ever meaningful to an
// admin (regular browsing only ever sees status='published' rows via RLS,
// so StandaloneWorkoutSummary above deliberately omits it).
export interface StandaloneWorkoutAdminRow extends StandaloneWorkoutSummary {
  status: StandaloneWorkoutStatus;
}

export interface StandaloneWorkoutExerciseInput {
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  work_seconds: number | null;
  is_weighted: boolean;
  notes: string | null;
  order_index: number;
}

export interface StandaloneWorkoutBlockInput {
  name: string;
  order_index: number;
  exercises: StandaloneWorkoutExerciseInput[];
}

export interface SaveStandaloneWorkoutInput {
  id: string | null; // null = create new
  kind: StandaloneWorkoutKind;
  title: string;
  description: string | null;
  category: string | null;
  difficulty: Difficulty | null;
  format: QuickWorkoutFormat | null;
  duration_minutes: number | null;
  is_free: boolean;
  status: StandaloneWorkoutStatus;
  blocks: StandaloneWorkoutBlockInput[];
  // Cover photos are web-only authored (admin-web upload UI) — mobile has
  // no upload UI, but must still round-trip whatever's already set. The
  // RPC's p_cover_image_url defaults to NULL when omitted, which would
  // silently wipe out an admin-set cover on every mobile-side edit save
  // otherwise.
  cover_image_url: string | null;
  goal_tags: GoalTag[];
  tier_min: number | null;
  tier_max: number | null;
  interval_seconds: number | null;
  rounds: number | null;
  // Optional — omitted here, the RPC's own DEFAULTs keep existing content's
  // skill tag untouched (mobile has no authoring UI for this field yet).
  is_skill?: boolean;
  skill_label?: string | null;
}

export interface StandaloneWorkoutFilters {
  category?: string;
  difficulty?: Difficulty;
  format?: QuickWorkoutFormat;
  // Matches ANY of the given tags (overlap, not containment) — an athlete
  // chasing muscle-up work should also see a day tagged both muscle_up
  // and handstand, not just an exact-set match.
  goalTags?: GoalTag[];
  // A workout is a candidate if its own range overlaps this tier at all,
  // not only if it's fully contained — see the query below.
  tier?: number;
}

export async function getStandaloneWorkouts(
  kind: StandaloneWorkoutKind,
  filters: StandaloneWorkoutFilters = {}
): Promise<StandaloneWorkoutSummary[]> {
  let query = supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, cover_image_url, goal_tags, tier_min, tier_max, interval_seconds, rounds, is_skill, skill_label')
    .eq('kind', kind)
    .eq('status', 'published')
    .order('created_at', { ascending: false });

  if (filters.category) query = query.eq('category', filters.category);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.format) query = query.eq('format', filters.format);
  if (filters.goalTags && filters.goalTags.length > 0) query = query.overlaps('goal_tags', filters.goalTags);
  // Range overlap, NULL meaning unbounded on that side — two separate .or()
  // calls, each internally OR'd, AND'd together by PostgREST's default
  // (chained filter calls AND). A workout tagged tier_min=6 (no tier_max)
  // still matches a tier-9 athlete; one tagged tier_max=2 (no tier_min)
  // still matches a tier-0 athlete.
  if (filters.tier !== undefined) {
    query = query
      .or(`tier_min.is.null,tier_min.lte.${filters.tier}`)
      .or(`tier_max.is.null,tier_max.gte.${filters.tier}`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Builds and activates a real one-week program from a caller-chosen,
 * ordered set of standalone Workouts (kind='workout' only) — each id
 * becomes one training day, in array order. Server-side (RPC) re-validates
 * ownership/Pro-lock/id-eligibility; see create_custom_program_from_workouts
 * in supabase/migrations for the authoritative rules.
 */
export async function createCustomProgramFromWorkouts(
  workoutIds: string[]
): Promise<{ warriorProgramId: string; templateId: string }> {
  const { data, error } = await supabase.rpc('create_custom_program_from_workouts', {
    p_workout_ids: workoutIds,
  });
  if (error) throw error;
  return { warriorProgramId: data.warrior_program_id, templateId: data.template_id };
}

export async function getStandaloneWorkoutDetail(workoutId: string): Promise<StandaloneWorkoutDetail | null> {
  const { data: workout, error: workoutError } = await supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, cover_image_url, goal_tags, tier_min, tier_max, interval_seconds, rounds, is_skill, skill_label')
    .eq('id', workoutId)
    .maybeSingle();
  if (workoutError) throw workoutError;
  if (!workout) return null;

  const { data: blockRows, error: blocksError } = await supabase
    .from('standalone_workout_blocks')
    .select(
      'id, name, order_index, standalone_workout_exercises(exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index, exercise_library(name))'
    )
    .eq('workout_id', workoutId)
    .order('order_index', { ascending: true });
  if (blocksError) throw blocksError;

  const blocks: StandaloneWorkoutBlock[] = (blockRows ?? []).map((block: any) => ({
    id: block.id,
    name: block.name,
    order_index: block.order_index ?? 0,
    exercises: (Array.isArray(block.standalone_workout_exercises) ? block.standalone_workout_exercises : [])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((row: any) => ({
        exercise_id: row.exercise_id,
        name: row.exercise_library?.name ?? 'Unknown Exercise',
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

  return { ...workout, blocks };
}

/**
 * Admin-only: every standalone workout regardless of status (draft/
 * published/archived). Works purely because of the "Admin manages all
 * standalone workouts" RLS policy — a non-admin caller gets the normal
 * published-only rows back instead of an error, same as getStandaloneWorkouts.
 */
export async function getAllStandaloneWorkoutsForAdmin(): Promise<StandaloneWorkoutAdminRow[]> {
  const { data, error } = await supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, status, cover_image_url, goal_tags, tier_min, tier_max, interval_seconds, rounds, is_skill, skill_label')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/**
 * Admin-only atomic create-or-update via save_standalone_workout — the
 * workout row and its full exercise list are replaced as one unit
 * server-side. See the RPC definition for the ADMIN_ONLY rejection a
 * non-admin caller gets.
 */
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
  if (error) throw error;
  return data as string;
}

/** Admin-only: cascades to standalone_workout_blocks/_exercises via the FK. */
export async function deleteStandaloneWorkout(workoutId: string): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').delete().eq('id', workoutId);
  if (error) throw error;
}
