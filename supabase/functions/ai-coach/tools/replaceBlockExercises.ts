import { ToolDefinition } from "./types.ts";
import { resolveExerciseIds, transformExercisesForInsert, validateExerciseList } from "./blockHelpers.ts";

// Rebuild plan Phase 4.4 — wraps ai_coach_replace_block_exercises (3.2).
// Direct write, no confirmation card: same risk class as adjust_program/
// add_block_to_week (editing exercises within an already-confirmed block,
// not creating or destroying a program). This is the Adapt half of
// Match->Clone->Adapt — add/remove/reorder exercises in a block that was
// cloned from the Workout Library, to actually fit the athlete in front of
// you, rather than treating the matched workout as fixed.
const EXERCISE_ITEM_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "REQUIRED. The exact library name — the server resolves this to the real exercise id. Copy library spellings verbatim." },
    exercise_id: { type: "string", description: "Not needed — omit it. `name` is resolved server-side." },
    sets: { type: "string", description: 'e.g. "3". String, not integer.' },
    reps: { type: "string", description: 'e.g. "10". String, not integer.' },
    rest_seconds: { type: "string", description: 'e.g. "60". Omit the field entirely if rest does not apply — do not send an empty string.' },
    hold_seconds: { type: "string", description: 'e.g. "30" for a static hold. Omit the field entirely otherwise — do not send an empty string.' },
    is_weighted: { type: "boolean" },
    notes: { type: "string" },
    order_index: { type: "integer", description: "Position within the block. Defaults to array order if omitted." },
  },
  required: ["name"],
};

export const replaceBlockExercises: ToolDefinition = {
  name: "replace_block_exercises",
  description:
    "Replace the ENTIRE exercise list of one block in the athlete's active AI-owned program — this is how you add, remove, or reorder exercises within a block (adjust_program can only tweak sets/reps/an existing exercise, never add or remove one). Send the block's full new exercise list, not just the change — anything you omit from the list is gone from the block. Only works on an AI Coach-owned program.",
  input_schema: {
    type: "object",
    properties: {
      warrior_program_id: { type: "string", description: "The warrior_program_id from get_user_context's active_program — never ask the athlete for this." },
      block_id: { type: "string", description: "The block to replace exercises in. From get_program_structure — never guessed or reused across turns." },
      exercises: { type: "array", items: EXERCISE_ITEM_SCHEMA, description: "The block's complete new exercise list, in order." },
    },
    required: ["warrior_program_id", "block_id", "exercises"],
  },
  handler: async (userClient, input) => {
    const exercises = (input.exercises as never[]) ?? [];
    validateExerciseList(exercises as never, "this block");
    const idMap = await resolveExerciseIds(userClient, [{ exercises } as never]);
    const transformed = transformExercisesForInsert(exercises as never, idMap);

    const { data, error } = await userClient.rpc("ai_coach_replace_block_exercises", {
      p_warrior_program_id: input.warrior_program_id,
      p_block_id: input.block_id,
      p_exercises: transformed,
    });
    if (error) throw new Error(`replace_block_exercises failed: ${error.message}`);
    return data;
  },
};
