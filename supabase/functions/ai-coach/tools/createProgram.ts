import { ToolDefinition } from "./types.ts";
import { transformBlocksForInsert, BLOCKS_SCHEMA } from "./blockHelpers.ts";

export const createProgram: ToolDefinition = {
  name: "create_program",
  description:
    "Create a brand-new training program and assign it to the athlete, replacing any current active program. Only call this after New Athlete Assessment or Build a Program has gathered enough (goal, days/week, equipment) and you've confirmed with the athlete in one line.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short program name, e.g. 'Muscle-Up Focus B4'" },
      description: { type: "string" },
      blocks: BLOCKS_SCHEMA,
    },
    required: ["name", "blocks"],
  },
  handler: async (userClient, input) => {
    const blocks = transformBlocksForInsert(input.blocks as never[]);
    const { data, error } = await userClient.rpc("ai_coach_create_program", {
      p_name: input.name,
      p_description: input.description ?? "",
      p_blocks: blocks,
    });
    if (error) throw new Error(`create_program failed: ${error.message}`);
    return data;
  },
};
