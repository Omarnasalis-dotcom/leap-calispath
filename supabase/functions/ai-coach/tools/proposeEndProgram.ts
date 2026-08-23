import { ToolDefinition } from "./types.ts";

// Non-write "signal" tool — same pattern as propose_new_program /
// recommend_test. Only ever shows a confirmation card; CoachScreen.tsx
// calls ai_coach_end_program directly if the athlete taps confirm.
export const proposeEndProgram: ToolDefinition = {
  name: "propose_end_program",
  description:
    "Propose ending the athlete's current program without replacing it — this does NOT end anything. It shows the athlete a confirmation card in the chat; the program is only actually ended if they explicitly tap it. Only call this when get_user_context's active_program.is_ai_coach_owned is true — if the active program is coach-assigned, you cannot end it this way at all; explain that to the athlete and suggest they talk to their coach or use the app's own program screen instead.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this." },
    },
    required: ["reason"],
  },
  handler: async () => {
    return { proposed: true };
  },
};
