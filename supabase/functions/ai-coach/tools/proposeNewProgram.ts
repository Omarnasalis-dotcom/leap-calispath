import { ToolDefinition } from "./types.ts";
import { BLOCKS_SCHEMA, resolveExerciseIds, validateBlockStructure } from "./blockHelpers.ts";

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
    // Structural ceiling, not a prompt hope: writing week 2+ upfront for a
    // program that hasn't been trained yet has no real performance data
    // behind it — the prompt already discourages this, but under enough
    // pressure ("just build all 10 weeks, don't ask questions") a model can
    // be talked past prose guidance. This makes the ceiling a hard tool
    // error instead, same pattern as resolveExerciseIds/validateBlockStructure
    // below — surfaced as a tool result the model must react to in this
    // turn, never silently truncated later by hitting max_tokens on an
    // oversized blocks array.
    const blocks = (input.blocks as Array<{ week_number?: number }>) ?? [];
    const weekNumbers = new Set(blocks.map((b) => b.week_number ?? 1));
    if (weekNumbers.size > 2) {
      throw new Error(
        `This proposes ${weekNumbers.size} weeks in one call, but at most 2 can be built at once. Programming further weeks before any training has actually happened isn't coaching, it's a guess. Resend with only weeks ${[...weekNumbers].sort((a, b) => a - b).slice(0, 2).join(" and ")} — the rest comes from append_week once the athlete has logged real training.`
      );
    }

    // Same reasoning as resolveExerciseIds below: reject here, as a tool
    // error the model can see and fix in this same turn, rather than
    // surfacing after the athlete already tapped Start on an incomplete card.
    validateBlockStructure((input.blocks as never[]) ?? [], { requireDayPhases: true });
    // Resolve here so an unknown exercise name comes back as a tool error the
    // model can fix in this same turn, rather than surfacing after the athlete
    // has already tapped Start on a card that looked complete.
    await resolveExerciseIds(userClient, (input.blocks as never[]) ?? []);
    return { proposed: true };
  },
};
