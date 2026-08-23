import { ToolDefinition } from "./types.ts";
import { transformBlocksForInsert, BLOCKS_SCHEMA, resolveExerciseIds } from "./blockHelpers.ts";

// Fills the gap neither append_week (only ever writes a brand-new week
// number) nor adjust_program (only UPDATEs exercises already in a block,
// never INSERTs) can cover: adding a new block/day to a week that's
// already written, in place, without bumping current_week. Direct-write,
// no confirmation card — purely additive, same risk class as append_week.
export const addBlockToWeek: ToolDefinition = {
  name: "add_block_to_week",
  description:
    "Add one or more brand-new blocks (days) to a week that's already written, without creating a new week and without touching any of that week's existing blocks. Only works on an AI Coach-owned program. Use this when the athlete wants to add a day to their current (or any past) week in place — not for building a whole new week from scratch (append_week's job) or editing exercises already in a block (adjust_program's job). The RPC rejects a block name that already exists in that week — use adjust_program to edit it instead, or pick a different name. Only call this after confirming with the athlete what you're about to add.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program — never ask the athlete for this, you already have it." },
      week_number: { type: "integer", description: "Which already-written week to add the block(s) to." },
      blocks: BLOCKS_SCHEMA,
    },
    required: ["warrior_program_id", "week_number", "blocks"],
  },
  handler: async (userClient, input) => {
    const idMap = await resolveExerciseIds(userClient, (input.blocks as never[]) ?? []);
    const blocks = transformBlocksForInsert(input.blocks as never[], idMap);
    const { data, error } = await userClient.rpc("ai_coach_add_block_to_week", {
      p_warrior_program_id: input.warrior_program_id,
      p_week_number: input.week_number,
      p_blocks: blocks,
    });
    if (error) throw new Error(`add_block_to_week failed: ${error.message}`);
    return data;
  },
};
