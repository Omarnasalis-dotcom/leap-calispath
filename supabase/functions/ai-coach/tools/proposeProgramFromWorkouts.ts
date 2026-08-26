import { ToolDefinition } from "./types.ts";

// Rebuild plan Phase 4.3: non-write "signal" tool, same pattern as
// propose_new_program/propose_end_program/propose_delete_week — only ever
// shows a confirmation card; index.ts's buildProgramAction turns this into
// the programAction.type: 'create_from_workouts' the client renders, and
// CoachScreen.tsx calls ai_coach_create_program_from_workouts (3.1)
// directly if the athlete taps confirm. Existence/publish-status/paywall
// are re-verified there, not here — this tool only ever proposes.
export const proposeProgramFromWorkouts: ToolDefinition = {
  name: "propose_program_from_workouts",
  description:
    "Propose assembling a program from real Workout Library days you've already found with search_workouts and inspected with get_workout_detail — this does NOT create anything. It shows the athlete a confirmation card in the chat; the program is only actually created if they explicitly tap it. Only call this after the athlete has confirmed in the conversation which day(s) they want, in order — never guess an order they haven't agreed to.",
  input_schema: {
    type: "object",
    properties: {
      workout_ids: {
        type: "array",
        items: { type: "string" },
        description: "The chosen workouts' ids, in day order (max 7). Each becomes one training day.",
      },
      name: { type: "string", description: "Short program name shown on the confirmation card, e.g. 'Push/Pull/Legs Foundations'." },
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this." },
    },
    required: ["workout_ids", "name", "reason"],
  },
  handler: async () => {
    return { proposed: true };
  },
};
