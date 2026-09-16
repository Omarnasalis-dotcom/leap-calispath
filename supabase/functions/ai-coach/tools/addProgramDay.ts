import { ToolDefinition } from "./types.ts";
import { BLOCKS_SCHEMA, resolveExerciseIds, validateBlockStructure } from "./blockHelpers.ts";

// Direct Build incremental staging (2026-09-16): closes the real cost/
// timeout failure two live 4-day/2-skill builds hit — propose_new_program
// validates an entire program atomically, so any single miss anywhere (one
// bad rounds/sets pair among 15-20+ blocks, one misspelled name among 100+)
// forced a full regenerate of the WHOLE program, and a few of those in a
// row was slow enough to hit what looks like a platform wall-clock timeout,
// not just our own MAX_TOOL_TURNS.
//
// This tool validates and stages ONE day at a time — roughly 1/4 the
// payload of a 4-day build, so each individual generation is faster, and a
// mistake on one day only costs re-calling this for that one day, not
// resending everything. Deliberately checks structure only (block-phase
// completeness, per-day variety, rounds->sets, conditional metadata,
// exercise-name resolution) — NOT athlete-fit or split coverage, since
// those need either the build brief (not sent here) or every day at once
// (split coverage can't be judged from one day alone). Those still run
// exactly as before, in propose_new_program, once every day is staged.
//
// Not a write action — nothing here touches the database in a way that
// outlives the request; see tools/types.ts's RequestContext for why this
// state is safe to keep in a plain in-memory Map. Same non-database-write
// reasoning as save_build_brief, so also excluded from index.ts's
// WRITE_TOOL_NAMES.
export const addProgramDay: ToolDefinition = {
  name: "add_program_day",
  description:
    "Validate and stage ONE day's blocks for a program you're building — not a write, and not visible to the athlete. Use this instead of writing all days into one propose_new_program call whenever the build has 3+ days or any skill goal: call it once per day as you write each one, then call propose_new_program with no `blocks` argument once every day is staged (it will assemble and validate the full program from what you've staged here). If propose_new_program then rejects the assembled program, fix it by re-calling this for just the one offending day — never by rewriting every day again.",
  input_schema: {
    type: "object",
    properties: {
      day_name: { type: "string", description: 'e.g. "PULL DAY 1" — every block in `blocks` must belong to this one day.' },
      blocks: BLOCKS_SCHEMA,
    },
    required: ["day_name", "blocks"],
  },
  handler: async (userClient, input, context) => {
    const dayName = typeof input.day_name === "string" ? input.day_name.trim() : "";
    if (!dayName) {
      throw new Error(`"day_name" is required and must be a non-empty string.`);
    }
    const blocks = (input.blocks as never[]) ?? [];
    if (blocks.length === 0) {
      throw new Error(`"blocks" is empty — a day needs at least its Warm-Up and Cool-Down blocks.`);
    }

    validateBlockStructure(blocks, { requireDayPhases: true });
    await resolveExerciseIds(userClient, blocks);

    context.programDraft.days.set(dayName, blocks);
    return { day_accepted: true, days_staged: [...context.programDraft.days.keys()] };
  },
};
