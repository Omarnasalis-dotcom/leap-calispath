import { ToolDefinition } from "./types.ts";

// Rebuild plan Phase 4.2: the second step of Match->Clone->Adapt — once
// search_workouts has narrowed to a candidate, this pulls its real blocks
// and exercises so the AI can judge fit and describe it to the athlete
// accurately (real exercise names, real sets/reps) instead of guessing
// from the title alone. Mirrors admin-web's fetchStandaloneWorkoutDetail
// shape, read through the caller's own RLS (published workouts are
// open to any authenticated user — see 20260822030000/20260822060000).
export const getWorkoutDetail: ToolDefinition = {
  name: "get_workout_detail",
  description:
    "Get the full blocks and exercises for ONE workout from the Workout Library, by id (from search_workouts' results). Call this on your top pick before describing it to the athlete or proposing it — never describe a workout's contents from its title alone.",
  input_schema: {
    type: "object",
    properties: {
      workout_id: { type: "string", description: "The id of the workout to inspect, from search_workouts' results." },
    },
    required: ["workout_id"],
  },
  handler: async (userClient, input) => {
    const workoutId = input.workout_id as string;

    const { data: workout, error: workoutError } = await userClient
      .from("standalone_workouts")
      .select("id, title, description, category, difficulty, duration_minutes, goal_tags, tier_min, tier_max")
      .eq("id", workoutId)
      .eq("kind", "workout")
      .eq("status", "published")
      .maybeSingle();
    if (workoutError) throw new Error(`get_workout_detail failed: ${workoutError.message}`);
    if (!workout) throw new Error(`get_workout_detail: workout ${workoutId} not found (or not a published workout).`);

    const { data: blockRows, error: blocksError } = await userClient
      .from("standalone_workout_blocks")
      .select(
        "id, name, order_index, standalone_workout_exercises(exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index, exercise_library(name))"
      )
      .eq("workout_id", workoutId);
    if (blocksError) throw new Error(`get_workout_detail failed: ${blocksError.message}`);

    const blocks = (blockRows ?? [])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((block: any) => ({
        name: block.name,
        exercises: (Array.isArray(block.standalone_workout_exercises) ? block.standalone_workout_exercises : [])
          .slice()
          .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((ex: any) => ({
            exercise_id: ex.exercise_id,
            name: ex.exercise_library?.name ?? "Unknown exercise",
            sets: ex.sets,
            reps: ex.reps,
            rest_seconds: ex.rest_seconds,
            hold_seconds: ex.hold_seconds,
            is_weighted: ex.is_weighted,
            notes: ex.notes,
          })),
      }));

    return {
      id: workout.id,
      title: workout.title,
      description: workout.description,
      focus: workout.category,
      difficulty: workout.difficulty,
      duration_minutes: workout.duration_minutes,
      goal_tags: workout.goal_tags ?? [],
      tier_min: workout.tier_min,
      tier_max: workout.tier_max,
      blocks,
    };
  },
};
