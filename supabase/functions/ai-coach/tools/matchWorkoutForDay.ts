import { ToolDefinition } from "./types.ts";
import { parseConceptNotes } from "./blockHelpers.ts";

const GOAL_TAGS = ["muscle_up", "handstand", "front_lever", "back_lever", "pistol", "general_strength", "conditioning"];
const CATEGORIES = ["PULL", "PUSH", "LEGS", "CORE", "FULL_BODY"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const FETCH_CAP = 50;

// Per-day-latency pass (2026-09-18): search_workouts + get_workout_detail
// used to cost the day-building path a full extra round trip every single
// day — rank candidates, then a second tool turn just to read the one it
// already picked. This collapses both into the ranking query from
// search_workouts (same scoring, same fields) plus the block/exercise
// fetch from get_workout_detail (same shape), run back to back in one
// handler so the model gets its match WITH full block detail in one turn.
//
// Both older tools stay registered — search_workouts/get_workout_detail
// are still what propose_program_from_workouts' explicit as-is path uses
// (system-prompt.ts §11: the athlete names a specific workout, there's
// nothing to rank), and nothing about this tool changes their behavior.
export const matchWorkoutForDay: ToolDefinition = {
  name: "match_workout_for_day",
  description:
    "Find the best real Workout Library day for this focus/tier/goal AND return its full blocks and exercises in one call — this replaces calling search_workouts then get_workout_detail for the day-building path (§11 step 0). Never an empty result just because tier or goal don't match exactly — the closest ranked match still comes back with its real blocks; tell the athlete plainly if it's not a perfect match, then edit every block yourself. Returns the single best match by default; set `choices` to 2 if you genuinely need to pick between two close options before deciding.",
  input_schema: {
    type: "object",
    properties: {
      focus: { type: "string", enum: CATEGORIES, description: "Which body-part/day focus to search. Required — every search needs a starting category." },
      difficulty: { type: "string", enum: DIFFICULTIES, description: "Optional. If given, only workouts at this exact difficulty are considered." },
      goal_tag: { type: "string", enum: GOAL_TAGS, description: "Optional. Ranks workouts tagged for this specific skill goal first — does not exclude untagged ones." },
      tier: { type: "integer", description: "Optional. The athlete's strength_tier (from get_user_context) — ranks workouts whose tier_min/tier_max band is closest first, does not exclude out-of-band ones." },
      choices: { type: "integer", enum: [1, 2], description: "How many ranked matches to return with full detail. Omit for 1 (the default and normal case)." },
    },
    required: ["focus"],
  },
  handler: async (userClient, input) => {
    const focus = typeof input.focus === "string" ? input.focus.trim().toUpperCase() : "";
    if (!CATEGORIES.includes(focus)) {
      throw new Error(`match_workout_for_day: "focus" must be one of ${CATEGORIES.join(", ")}.`);
    }
    const difficulty = typeof input.difficulty === "string" ? input.difficulty.trim().toLowerCase() : null;
    const goalTag = typeof input.goal_tag === "string" ? input.goal_tag.trim().toLowerCase() : null;
    const tier = typeof input.tier === "number" && Number.isFinite(input.tier) ? input.tier : null;
    const choices = input.choices === 2 ? 2 : 1;

    let query = userClient
      .from("standalone_workouts")
      .select("id, title, description, category, difficulty, duration_minutes, goal_tags, tier_min, tier_max")
      .eq("kind", "workout")
      .eq("status", "published")
      .eq("category", focus)
      .limit(FETCH_CAP);
    if (difficulty) query = query.eq("difficulty", difficulty);

    const { data, error } = await query;
    if (error) throw new Error(`match_workout_for_day failed: ${error.message}`);
    if (!data || data.length === 0) {
      return { matches: [] };
    }

    const scored = data.map((row: any) => {
      let score = 0;
      if (goalTag) {
        const tags: string[] = row.goal_tags ?? [];
        if (!tags.includes(goalTag)) score += 1000;
      }
      if (tier !== null) {
        const min: number | null = row.tier_min;
        const max: number | null = row.tier_max;
        if (min !== null && tier < min) score += min - tier;
        else if (max !== null && tier > max) score += tier - max;
      }
      return { score, row };
    });
    scored.sort((a, b) => a.score - b.score || a.row.title.localeCompare(b.row.title));

    const top = scored.slice(0, choices).map((s) => s.row);
    const topIds = top.map((row: any) => row.id);

    const { data: blockRows, error: blocksError } = await userClient
      .from("standalone_workout_blocks")
      .select(
        "workout_id, id, name, notes, order_index, standalone_workout_exercises(exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index, exercise_library(name))"
      )
      .in("workout_id", topIds);
    if (blocksError) throw new Error(`match_workout_for_day failed: ${blocksError.message}`);

    const blocksByWorkout = new Map<string, any[]>();
    for (const block of blockRows ?? []) {
      const list = blocksByWorkout.get(block.workout_id) ?? [];
      list.push(block);
      blocksByWorkout.set(block.workout_id, list);
    }

    const matches = top.map((row: any) => {
      const blocks = (blocksByWorkout.get(row.id) ?? [])
        .slice()
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((block: any) => {
          const { metadata, coach_notes } = parseConceptNotes(block.notes);
          return {
            name: block.name,
            metadata,
            coach_notes,
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
          };
        });
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        focus: row.category,
        difficulty: row.difficulty,
        duration_minutes: row.duration_minutes,
        goal_tags: row.goal_tags ?? [],
        tier_min: row.tier_min,
        tier_max: row.tier_max,
        blocks,
      };
    });

    return { matches };
  },
};
