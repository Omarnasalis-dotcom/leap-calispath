import { ToolDefinition } from "./types.ts";
import { transformBlocksForInsert, BLOCKS_SCHEMA } from "./blockHelpers.ts";

export const appendWeek: ToolDefinition = {
  name: "append_week",
  description:
    "Add a new week onto the athlete's existing AI Coach-owned program (get_user_context's active_program.is_ai_coach_owned must be true — this fails for a program owned by a real human coach, by design). Only call this after showing the athlete a Week X → Week X+1 comparison and getting an explicit confirmation. Only include blocks that are new or changed — the app carries forward anything from the prior week that isn't overridden.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string" },
      blocks: BLOCKS_SCHEMA,
    },
    required: ["warrior_program_id", "blocks"],
  },
  handler: async (userClient, input) => {
    const blocks = transformBlocksForInsert(input.blocks as never[]);
    const { data, error } = await userClient.rpc("ai_coach_append_week", {
      p_warrior_program_id: input.warrior_program_id,
      p_blocks: blocks,
    });
    if (error) throw new Error(`append_week failed: ${error.message}`);
    return data;
  },
};
