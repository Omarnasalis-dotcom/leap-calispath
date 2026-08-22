import { supabase } from '@/lib/supabase';

// Admin-only authoring for standalone_workouts/standalone_workout_exercises
// (Workouts + Quick Workouts) — mirrors the mobile app's src/lib/workoutLibrary.ts
// admin functions exactly, calling the same save_standalone_workout RPC and
// relying on the same "Admin manages all standalone workouts" FOR-ALL RLS
// policy for the all-statuses list read and the direct delete (see
// supabase/migrations/20260822050000_add_standalone_workout_admin_authoring.sql).

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
}

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

export interface StandaloneWorkoutDetail extends StandaloneWorkoutRow {
  exercises: StandaloneWorkoutExerciseRow[];
}

export async function fetchStandaloneWorkouts(): Promise<StandaloneWorkoutRow[]> {
  const { data, error } = await supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, status')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StandaloneWorkoutRow[];
}

export async function fetchStandaloneWorkoutDetail(id: string): Promise<StandaloneWorkoutDetail> {
  const { data: workout, error: workoutError } = await supabase
    .from('standalone_workouts')
    .select('id, kind, title, description, category, difficulty, format, duration_minutes, is_free, status')
    .eq('id', id)
    .single();
  if (workoutError) throw new Error(workoutError.message);

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('standalone_workout_exercises')
    .select('exercise_id, sets, reps, rest_seconds, hold_seconds, work_seconds, is_weighted, notes, order_index, exercise_library(name)')
    .eq('workout_id', id)
    .order('order_index', { ascending: true });
  if (exercisesError) throw new Error(exercisesError.message);

  const exercises: StandaloneWorkoutExerciseRow[] = (exerciseRows ?? []).map((row: any) => ({
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
  }));

  return { ...(workout as StandaloneWorkoutRow), exercises };
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
    p_exercises: input.exercises,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function deleteStandaloneWorkout(id: string): Promise<void> {
  const { error } = await supabase.from('standalone_workouts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
