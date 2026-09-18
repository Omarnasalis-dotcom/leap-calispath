import { ToolDefinition } from "./types.ts";
import { transformBlocksForInsert, BLOCKS_SCHEMA, resolveExerciseIds, validateBlockStructure, computeAppendWeekOrdering } from "./blockHelpers.ts";

// Weekly review → new week card (2026-09-18, live-build fix): append_week
// used to be a real write tool — the model called it directly right after
// the athlete's "yes" in chat, with no card and no explicit tap, unlike
// every other program change in this app. Retired in favor of this
// non-write "signal" tool, same propose→confirm pattern as
// propose_new_program/propose_add_day: this only validates, resolves
// exercise ids, and computes the real block order (computeAppendWeekOrdering,
// same fix as the old append_week tool used) — index.ts captures the
// result into the response's programAction field (type "append_week"),
// and CoachScreen.tsx's confirm tap calls ai_coach_append_week directly.
// The AI never writes the new week itself.
export const proposeAppendWeek: ToolDefinition = {
  name: "propose_append_week",
  description:
    "Propose adding a new week onto the athlete's existing AI Coach-owned program (get_user_context's active_program.is_ai_coach_owned must be true — this fails for a program owned by a real human coach, by design) — this does NOT write anything until the athlete taps the card. Only call this after showing the athlete a Week X → Week X+1 comparison and getting an explicit confirmation (system-prompt.ts §12 Step 3). " +
    "Block matching is by EXACT name (day_name + block_name combined) against the prior week: reuse the exact same name to update a block (its exercises are fully replaced by what you send — add, remove, or modify exercises freely by just writing the block's complete new exercise list), use a new name to create a brand-new block, or omit it entirely to carry it forward unchanged (exercises included) — this happens automatically. To drop a block that existed in the prior week without replacing it, list its exact name in removed_block_names instead of touching blocks.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program — never ask the athlete for this, you already have it." },
      blocks: BLOCKS_SCHEMA,
      removed_block_names: {
        type: "array",
        items: { type: "string" },
        description: "Exact names (day_name + block_name combined, e.g. \"PULL DAY 1 | Core\") of blocks from the prior week to drop entirely — they will not appear in the new week and are not carried forward.",
      },
      reason: { type: "string", description: "One short sentence shown to the athlete on the confirmation card, summarizing what's changing this week." },
    },
    required: ["warrior_program_id", "blocks", "reason"],
  },
  handler: async (userClient, input) => {
    // Day-completeness (requireDayPhases) does NOT apply here — carry-forward
    // means a day's Warm-Up/Cool-Down legitimately being absent from THIS
    // call (unchanged from last week) is correct, not a bug. A block that
    // IS sent still can't be empty, though.
    validateBlockStructure((input.blocks as never[]) ?? [], { requireDayPhases: false });
    // Real bug fixed 2026-09-18 (live build): the new week used to come
    // back with blocks in a shuffled order because the model edited some
    // blocks and not others — its order_index is only ever relative to the
    // blocks it sent this turn, not the whole week. Computes the real
    // order server-side instead of trusting it, and the trusted week
    // number (never the model's own claim) for the card's title.
    const { orderedBlocks, carryOrderOverrides, newWeekNumber } = await computeAppendWeekOrdering(
      userClient,
      input.warrior_program_id as string,
      (input.blocks as never[]) ?? [],
      input.removed_block_names as string[] | undefined
    );
    const idMap = await resolveExerciseIds(userClient, orderedBlocks as never[]);
    const resolvedBlocks = transformBlocksForInsert(orderedBlocks as never[], idMap);
    return {
      proposed: true,
      week_number: newWeekNumber,
      resolved_blocks: resolvedBlocks,
      carry_order_overrides: carryOrderOverrides,
    };
  },
};
