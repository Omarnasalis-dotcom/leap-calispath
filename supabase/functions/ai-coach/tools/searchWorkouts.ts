import { ToolDefinition } from "./types.ts";

const GOAL_TAGS = ["muscle_up", "handstand", "front_lever", "back_lever", "pistol", "general_strength", "conditioning"];
const CATEGORIES = ["PULL", "PUSH", "LEGS", "CORE", "FULL_BODY"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
const RESULT_LIMIT = 8;
const FETCH_CAP = 50;

// Rebuild plan Phase 4.1 (docs/features/ai-coach-rebuild-plan.md): the first
// step of Match->Clone->Adapt — find real Workout Library days close to
// what the athlete needs, instead of generating one from scratch.
//
// `category`/`kind='workout'`/`status='published'` are hard WHERE filters —
// there is no such thing as "the nearest unpublished workout". `tier`/
// `goal_tag` are deliberately NOT filters: they rank the results instead.
// A hard `tier_min <= x AND tier_max >= x` filter would return nothing on a
// thin library and leave the AI stuck, which is exactly the over-strict
// failure mode the plan calls out (see PHASE 4 note in the plan doc) — the
// system prompt's job is to pick the nearest ranked result and say so
// plainly, never to get an empty list and generate from scratch instead.
//
// No is_free/Pro filtering here: the whole ai-coach endpoint already
// rejects non-Pro callers before any tool runs (see canAccessPro in
// index.ts) — every caller that reaches this tool already has full access,
// so re-filtering by is_free here would just be dead code.
export const searchWorkouts: ToolDefinition = {
  name: "search_workouts",
  description:
    "Search the Workout Library for real, already-built training days close to what the athlete needs — this is the FIRST step of building or extending a program from the library, before search_exercises or writing anything from scratch. Returns up to 8 candidates ranked by fit, never an empty list just because tier or goal don't match exactly — if nothing is a close fit, the closest ranked result still comes back; call get_workout_detail on the best one, tell the athlete plainly if it's not a perfect match, and use adjust_program/replace_block_exercises to close the gap rather than generating a whole day from nothing.",
  input_schema: {
    type: "object",
    properties: {
      focus: { type: "string", enum: CATEGORIES, description: "Which body-part/day focus to search. Required — every search needs a starting category." },
      difficulty: { type: "string", enum: DIFFICULTIES, description: "Optional. If given, only workouts at this exact difficulty are returned." },
      goal_tag: { type: "string", enum: GOAL_TAGS, description: "Optional. Ranks workouts tagged for this specific skill goal first — does not exclude untagged ones." },
      tier: { type: "integer", description: "Optional. The athlete's strength_tier (from get_user_context) — ranks workouts whose tier_min/tier_max band is closest first, does not exclude out-of-band ones." },
    },
    required: ["focus"],
  },
  handler: async (userClient, input) => {
    const focus = typeof input.focus === "string" ? input.focus.trim().toUpperCase() : "";
    if (!CATEGORIES.includes(focus)) {
      throw new Error(`search_workouts: "focus" must be one of ${CATEGORIES.join(", ")}.`);
    }
    const difficulty = typeof input.difficulty === "string" ? input.difficulty.trim().toLowerCase() : null;
    const goalTag = typeof input.goal_tag === "string" ? input.goal_tag.trim().toLowerCase() : null;
    const tier = typeof input.tier === "number" && Number.isFinite(input.tier) ? input.tier : null;

    let query = userClient
      .from("standalone_workouts")
      .select("id, title, category, difficulty, duration_minutes, goal_tags, tier_min, tier_max, standalone_workout_blocks(name, order_index)")
      .eq("kind", "workout")
      .eq("status", "published")
      .eq("category", focus)
      .limit(FETCH_CAP);
    if (difficulty) query = query.eq("difficulty", difficulty);

    const { data, error } = await query;
    if (error) throw new Error(`search_workouts failed: ${error.message}`);

    const scored = (data ?? []).map((row: any) => {
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
      const blocks = (row.standalone_workout_blocks ?? [])
        .slice()
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
      return {
        score,
        result: {
          id: row.id,
          title: row.title,
          focus: row.category,
          difficulty: row.difficulty,
          duration_minutes: row.duration_minutes,
          block_names: blocks.map((b: any) => b.name),
        },
      };
    });

    scored.sort((a, b) => a.score - b.score || a.result.title.localeCompare(b.result.title));

    return { results: scored.slice(0, RESULT_LIMIT).map((s) => s.result) };
  },
};
