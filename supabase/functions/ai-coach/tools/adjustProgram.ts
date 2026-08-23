import { ToolDefinition } from "./types.ts";
import { isUuid } from "./blockHelpers.ts";

export const adjustProgram: ToolDefinition = {
  name: "adjust_program",
  description:
    "Make a targeted, in-place change to one or more specific exercises, identified by block_exercise_id (from get_workout_logs) — works on any already-written week, not just the current one. Not a new week (append_week's job) and not a new program (propose_new_program's job). Use for a single issue: swap an exercise causing pain, bump/reduce sets or reps, adjust rest. Only works on an AI Coach-owned program.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program — never ask the athlete for this, you already have it." },
      changes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            block_exercise_id: { type: "string", description: "From get_workout_logs's block/exercise data" },
            sets: { type: "integer" },
            reps: { type: "integer" },
            rest_seconds: { type: "integer" },
            hold_seconds: { type: "integer" },
            is_weighted: { type: "boolean" },
            new_exercise_id: { type: "string", description: "From search_exercises, to swap this exercise entirely" },
          },
          required: ["block_exercise_id"],
        },
      },
    },
    required: ["warrior_program_id", "changes"],
  },
  handler: async (userClient, input) => {
    const changes = (input.changes as Array<{ block_exercise_id?: unknown; new_exercise_id?: unknown }>) ?? [];
    for (const change of changes) {
      if (!isUuid(change.block_exercise_id)) {
        throw new Error(`block_exercise_id "${change.block_exercise_id}" is not a real ID — it must come from get_workout_logs's block/exercise data, not be guessed or constructed.`);
      }
      if (change.new_exercise_id !== undefined && !isUuid(change.new_exercise_id)) {
        throw new Error(`new_exercise_id "${change.new_exercise_id}" is not a real exercise ID — it looks like a name, not a search_exercises result. Call search_exercises first.`);
      }
    }
    const { data, error } = await userClient.rpc("ai_coach_adjust_program", {
      p_warrior_program_id: input.warrior_program_id,
      p_changes: input.changes,
    });
    if (error) throw new Error(`adjust_program failed: ${error.message}`);
    return data;
  },
};
