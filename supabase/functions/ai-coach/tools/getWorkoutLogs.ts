import { ToolDefinition } from "./types.ts";

// Thin wrapper over get_warrior_progress — already patched (see
// 20260821171000_allow_warrior_self_access_progress.sql) to allow the
// warrior themselves to call it, not just their coach/an admin. Must go
// through the user-scoped client so auth.uid() inside that RPC resolves to
// the athlete, not the edge function's own identity.
export const getWorkoutLogs: ToolDefinition = {
  name: "get_workout_logs",
  description:
    "Get the athlete's actual logged performance (sets/reps/weight/hold completed, RPE, feel, pain notes, bodyweight trend) for their active program, block by block, week by week. Use this before reviewing a week or deciding on an adjustment — never guess at their performance.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program" },
    },
    required: ["warrior_program_id"],
  },
  handler: async (userClient, input) => {
    const { data, error } = await userClient.rpc("get_warrior_progress", {
      p_warrior_program_id: input.warrior_program_id,
    });
    if (error) throw new Error(`get_workout_logs failed: ${error.message}`);
    return data;
  },
};
