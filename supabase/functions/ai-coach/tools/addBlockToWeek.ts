import { ToolDefinition } from "./types.ts";
import { transformBlocksForInsert, BLOCKS_SCHEMA, resolveExerciseIds, validateBlockStructure, daysMissingFromWeek } from "./blockHelpers.ts";

// Fills the gap neither propose_append_week (only ever writes a brand-new week
// number) nor adjust_program (only UPDATEs exercises already in a block,
// never INSERTs) can cover: adding a new block to an existing day of a week
// that's already written (whole new days go through propose_add_day), in place, without bumping current_week. Direct-write,
// no confirmation card — purely additive, same risk class append_week
// (now propose_append_week) used to be before it got a card.
export const addBlockToWeek: ToolDefinition = {
  name: "add_block_to_week",
  description:
    "Add one or more new blocks (e.g. a Skills block) to a day that already exists in a week that's already written, without creating a new week and without touching that week's existing blocks. Only works on an AI Coach-owned program. Never for a whole new day — that is propose_add_day (week in progress) or propose_append_week (next week); a block for a day the week doesn't have is refused. Not for building a new week (propose_append_week) or editing exercises already in a block (adjust_program). The RPC rejects a block name that already exists in that week — use adjust_program to edit it instead, or pick a different name. Only call this after confirming with the athlete what you're about to add.",
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
    // Not day-complete by requirement here either — this adds one or more
    // supplementary blocks to a week that already has its own Warm-Up/
    // Cool-Down; a single added block (e.g. "add a Skills block") is not
    // itself a whole day. Empty blocks are still rejected.
    validateBlockStructure((input.blocks as never[]) ?? [], { requireDayPhases: false });
    const { data: programRows } = await userClient
      .from("warrior_programs")
      .select("template_id")
      .eq("id", input.warrior_program_id as string);
    const templateId = (programRows as Array<{ template_id?: string }> | null)?.[0]?.template_id;
    if (templateId) {
      const { data: weekRows } = await userClient
        .from("program_blocks")
        .select("name")
        .eq("template_id", templateId)
        .eq("week_number", input.week_number as number);
      const missingDays = daysMissingFromWeek((input.blocks as never[]) ?? [], ((weekRows ?? []) as Array<{ name: string }>).map((r) => r.name));
      if (missingDays.length > 0) {
        throw new Error(
          `Week ${input.week_number} has no day named ${missingDays.map((d) => `"${d}"`).join(", ")}. add_block_to_week only adds blocks to an existing day. For a whole new day use propose_add_day while the week is in progress, or include it in propose_append_week for the next week.`
        );
      }
    }
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
