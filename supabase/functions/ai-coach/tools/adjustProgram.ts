import { ToolDefinition } from "./types.ts";

export const adjustProgram: ToolDefinition = {
  name: "adjust_program",
  description:
    "Make a targeted, in-place change to one or more specific exercises in the athlete's CURRENT week — not a new week (append_week's job) and not a new program (create_program's job). Use for a single issue: swap an exercise causing pain, bump/reduce sets or reps, adjust rest. Only works on an AI Coach-owned program.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string" },
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
    const { data, error } = await userClient.rpc("ai_coach_adjust_program", {
      p_warrior_program_id: input.warrior_program_id,
      p_changes: input.changes,
    });
    if (error) throw new Error(`adjust_program failed: ${error.message}`);
    return data;
  },
};
