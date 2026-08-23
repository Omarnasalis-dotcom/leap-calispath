import { ToolDefinition } from "./types.ts";
import { BLOCKS_SCHEMA, resolveExerciseIds } from "./blockHelpers.ts";

// Replaces the old create_program entirely — there is no tool left that
// writes a new program directly. This only signals a proposed action back
// to the client (same non-write "signal" pattern recommend_test already
// uses); index.ts captures the full input into the response's
// programAction field, transformed into the exact shape
// ai_coach_create_program expects, so CoachScreen.tsx can call that RPC
// directly once the athlete taps confirm — the AI never triggers the
// write itself.
export const proposeNewProgram: ToolDefinition = {
  name: "propose_new_program",
  description:
    "Propose a brand-new training program to the athlete — this does NOT create anything. It shows the athlete a confirmation card in the chat; the program is only actually created if they explicitly tap it. Only call this after New Athlete Assessment or Build a Program has gathered enough (goal, days/week, equipment) and you've confirmed with the athlete in one line what you're about to propose.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short program name, e.g. 'Muscle-Up Focus B4'" },
      description: { type: "string" },
      reason: { type: "string", description: "One sentence shown to the athlete on the confirmation card explaining why you're proposing this." },
      blocks: BLOCKS_SCHEMA,
    },
    required: ["name", "blocks", "reason"],
  },
  handler: async (userClient, input) => {
    // Resolve here so an unknown exercise name comes back as a tool error the
    // model can fix in this same turn, rather than surfacing after the athlete
    // has already tapped Start on a card that looked complete.
    await resolveExerciseIds(userClient, (input.blocks as never[]) ?? []);
    return { proposed: true };
  },
};
