import { ToolDefinition } from "./types.ts";

// Non-write "signal" tool — same pattern as propose_end_program /
// propose_new_program. Only ever shows a confirmation card; CoachScreen.tsx
// calls ai_coach_delete_week directly if the athlete taps confirm.
export const proposeDeleteWeek: ToolDefinition = {
  name: "propose_delete_week",
  description:
    "Propose deleting one specific written week from the athlete's current program — this does NOT delete anything. It shows the athlete a confirmation card in the chat; the week is only actually deleted if they explicitly tap it. Only call this when get_user_context's active_program.is_ai_coach_owned is true. The RPC behind this will refuse if the week already has logged workout history, or if it's the only week left in the program — if that happens, relay the reason plainly rather than retrying differently.",
  input_schema: {
    type: "object",
    properties: {
      week_number: { type: "integer", description: "The week number to delete." },
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this." },
    },
    required: ["week_number", "reason"],
  },
  handler: async () => {
    return { proposed: true };
  },
};
