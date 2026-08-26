import { ToolDefinition } from "./types.ts";

// Fills a real, pre-existing gap found while writing the rebuild's prompt
// (docs/features/ai-coach-rebuild-plan.md, PHASE 6/9.1 step 12): both
// adjust_program's schema and the plan's own step 12 claimed
// block_exercise_id comes "from get_workout_logs" — but get_warrior_progress
// (what that tool wraps) never actually includes block_exercise_id in its
// output, and it only returns anything once sets are logged, so it can't
// supply ids for a freshly cloned, unlogged program either. adjust_program
// has apparently had no working source for its own required input since it
// shipped. RLS already allows a warrior to read their own program_blocks/
// block_exercises directly ("Warriors can read their block exercises",
// 20260614102615) — nothing ever queried and surfaced them to the model.
export const getProgramStructure: ToolDefinition = {
  name: "get_program_structure",
  description:
    "Get the real block_id and block_exercise_id values for one week of the athlete's active program — this is the ONLY source for the ids adjust_program and replace_block_exercises require. Call this before either of those, every time: right after cloning a program from the library (the ids do not exist until the clone is created), and before any exercise-level edit to an already-written week. Never guess, remember, or reuse an id from an earlier turn without re-fetching — a week can have been edited since.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program." },
      week_number: { type: "integer", description: "Which week to inspect. Defaults to the program's current week if omitted." },
    },
    required: ["warrior_program_id"],
  },
  handler: async (userClient, input) => {
    const warriorProgramId = input.warrior_program_id as string;

    const { data: wp, error: wpError } = await userClient
      .from("warrior_programs")
      .select("template_id, current_week")
      .eq("id", warriorProgramId)
      .maybeSingle();
    if (wpError) throw new Error(`get_program_structure failed: ${wpError.message}`);
    if (!wp) throw new Error(`get_program_structure: program ${warriorProgramId} not found, or it isn't yours.`);

    const weekNumber = typeof input.week_number === "number" ? input.week_number : (wp.current_week ?? 1);

    const { data: blockRows, error } = await userClient
      .from("program_blocks")
      .select(
        "id, name, order_index, week_number, block_exercises(id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index, exercise_library(name))"
      )
      .eq("template_id", wp.template_id)
      .eq("week_number", weekNumber);
    if (error) throw new Error(`get_program_structure failed: ${error.message}`);

    const blocks = (blockRows ?? [])
      .slice()
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((block: any) => ({
        block_id: block.id,
        name: block.name,
        exercises: (Array.isArray(block.block_exercises) ? block.block_exercises : [])
          .slice()
          .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((ex: any) => ({
            block_exercise_id: ex.id,
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

    if (blocks.length === 0) {
      throw new Error(`get_program_structure: week ${weekNumber} has no blocks — check the week number against get_user_context's current_week.`);
    }

    return { week_number: weekNumber, blocks };
  },
};
