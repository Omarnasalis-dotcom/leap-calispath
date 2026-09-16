import { ToolDefinition } from "./types.ts";
import { isUuid, parseConceptNotes, validateBlockStructure } from "./blockHelpers.ts";

// Closes the "frozen structure after cloning" gap (2026-09-16): adjust_program
// and replace_block_exercises can only ever touch a block's exercises, never
// its timing_system/structure/rounds/time_cap/ladder/tabata fields — a
// workout cloned via propose_program_from_workouts as straight_set + single
// stayed that way forever, with no way to actually apply system-prompt.ts
// §16's role table once a real athlete's numbers called for something else.
//
// Metadata-only, never exercises — same division of labor as
// adjust_program/replace_block_exercises already establish. Takes an array
// of changes, one call for the whole program's worth of fixes — same
// reasoning as adjust_program's own changes[] array: the required Adapt
// pass (§11) can touch every block in a freshly cloned program without
// spending one rate-limited unit per block. Fetches each block's CURRENT
// metadata + exercises first and validates the RESULTING merged state
// before writing anything, same pre-flight-reject pattern proposeNewProgram/
// appendWeek already use — a violation surfaces as a tool error naming the
// exact block and field, which the model can see and fix in this same turn.
export const updateBlockStructure: ToolDefinition = {
  name: "update_block_structure",
  description:
    "Change one or more blocks' timing_system, structure, rounds, rest_after_round, time_cap_min, or ladder_*/tabata_* fields in the athlete's active AI-owned program — this is how you fix a cloned block that doesn't fit the athlete (for example a straight_set/single Pull block that should be a descending ladder for an advanced athlete, per §16's role table). Never touches exercises — use adjust_program or replace_block_exercises for those. Batch every block that needs a structure fix into ONE call (the changes array), the same way adjust_program batches exercise-level changes — never one call per block. Send only the fields that are actually changing on each block; every field you omit keeps its current value. block_id values come from get_program_structure only, called fresh — never guessed or reused across turns. Only works on an AI Coach-owned program.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program — never ask the athlete for this." },
      changes: {
        type: "array",
        description: "One entry per block that needs a structure fix. Batch all of them here in one call — never call this tool once per block.",
        items: {
          type: "object",
          properties: {
            block_id: { type: "string", description: "From get_program_structure — never guessed or reused across turns." },
            metadata: {
              type: "object",
              description: "Only the fields you're changing on this block — anything omitted keeps its current value.",
              properties: {
                timing_system: { type: "string", enum: ["straight_set", "amrap", "fortime", "tabata"] },
                structure: { type: "string", enum: ["single", "superset", "circuit", "ladder"] },
                rounds: { type: "string", description: 'Required if the resulting structure is circuit, superset, or ladder — e.g. "3". When set, every exercise in the block needs sets: "1" — use replace_block_exercises first if the existing exercises need that fixed.' },
                rest_after_round: { type: "integer", description: "Seconds of rest after each full round, when rounds is set." },
                time_cap_min: { type: "integer", description: "Required if the resulting timing_system is fortime or amrap." },
                ladder_start: { type: "integer", description: "Required if the resulting structure is ladder — the starting rep count." },
                ladder_sub: { type: "integer", description: "Required if the resulting structure is ladder — how much the rep count changes each round." },
                ladder_direction: { type: "string", enum: ["up", "down"], description: "Required if the resulting structure is ladder." },
                tabata_work_seconds: { type: "integer", description: "Required if the resulting timing_system is tabata." },
                tabata_rest_seconds: { type: "integer", description: "Required if the resulting timing_system is tabata." },
                tabata_rounds: { type: "integer", description: "Required if the resulting timing_system is tabata." },
              },
            },
          },
          required: ["block_id", "metadata"],
        },
      },
    },
    required: ["warrior_program_id", "changes"],
  },
  handler: async (userClient, input) => {
    const warriorProgramId = input.warrior_program_id as string;
    const changes = (input.changes as Array<{ block_id?: unknown; metadata?: Record<string, unknown> }>) ?? [];

    if (changes.length === 0) {
      throw new Error("update_block_structure: changes is empty — at least one block is required.");
    }
    for (const change of changes) {
      if (!isUuid(change.block_id)) {
        throw new Error(`block_id "${change.block_id}" is not a real ID — it must come from get_program_structure, not be guessed or constructed.`);
      }
    }

    const blockIds = changes.map((c) => c.block_id as string);
    // Same "never trust a remembered id, re-fetch the current state" reasoning
    // as get_program_structure's own header comment — these blocks can have
    // been edited since any earlier turn, and validation below has to check
    // the RESULTING state, not each change in isolation.
    const { data: blockRows, error: fetchError } = await userClient
      .from("program_blocks")
      .select("id, name, notes, block_exercises(sets, reps, rest_seconds, hold_seconds, is_weighted)")
      .in("id", blockIds);
    if (fetchError) throw new Error(`update_block_structure failed to read the current blocks: ${fetchError.message}`);

    const blockById = new Map((blockRows ?? []).map((b: any) => [b.id, b]));
    for (const change of changes) {
      const blockRow = blockById.get(change.block_id);
      if (!blockRow) {
        throw new Error(`update_block_structure: block ${change.block_id} not found, or it isn't yours — call get_program_structure again.`);
      }

      const { metadata: currentMetadata } = parseConceptNotes(blockRow.notes as string | null);
      const mergedMetadata = { ...currentMetadata, ...(change.metadata ?? {}) };

      const syntheticBlock = {
        name: blockRow.name as string,
        metadata: mergedMetadata,
        exercises: (blockRow.block_exercises ?? []) as never[],
      };
      validateBlockStructure([syntheticBlock] as never, { requireDayPhases: false });
    }

    const { data, error } = await userClient.rpc("ai_coach_update_block_structure", {
      p_warrior_program_id: warriorProgramId,
      p_changes: changes,
    });
    if (error) throw new Error(`update_block_structure failed: ${error.message}`);
    return data;
  },
};
