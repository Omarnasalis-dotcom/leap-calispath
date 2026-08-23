import { ToolDefinition } from "./types.ts";
import { transformBlocksForInsert, BLOCKS_SCHEMA, resolveExerciseIds } from "./blockHelpers.ts";

export const appendWeek: ToolDefinition = {
  name: "append_week",
  description:
    "Add a new week onto the athlete's existing AI Coach-owned program (get_user_context's active_program.is_ai_coach_owned must be true — this fails for a program owned by a real human coach, by design). Only call this after showing the athlete a Week X → Week X+1 comparison and getting an explicit confirmation. " +
    "Block matching is by EXACT name (day_name + block_name combined) against the prior week: reuse the exact same name to update a block (its exercises are fully replaced by what you send — add, remove, or modify exercises freely by just writing the block's complete new exercise list), use a new name to create a brand-new block, or omit it entirely to carry it forward unchanged (exercises included) — this really happens automatically now. To drop a block that existed in the prior week without replacing it, list its exact name in removed_block_names instead of touching blocks.",
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
    },
    required: ["warrior_program_id", "blocks"],
  },
  handler: async (userClient, input) => {
    const idMap = await resolveExerciseIds(userClient, (input.blocks as never[]) ?? []);
    const blocks = transformBlocksForInsert(input.blocks as never[], idMap);
    const { data, error } = await userClient.rpc("ai_coach_append_week", {
      p_warrior_program_id: input.warrior_program_id,
      p_blocks: blocks,
      p_removed_block_names: input.removed_block_names ?? null,
    });
    if (error) throw new Error(`append_week failed: ${error.message}`);
    return data;
  },
};
