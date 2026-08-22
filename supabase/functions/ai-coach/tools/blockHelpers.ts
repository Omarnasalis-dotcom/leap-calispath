// Shared block-shape transform for create_program / append_week. Claude
// sends structured blocks (day_name + block_name + a metadata object +
// plain coach_notes) rather than hand-producing the app's stored
// "[CONCEPT:{...}] notes" string — far more reliable than asking a model to
// get bracket/JSON string-escaping exactly right. This ports
// BlockConceptParser.stringify's exact format (src/lib/BlockConceptParser.ts)
// so the app's UI parses it back out identically to a human-built block.
interface ClaudeBlock {
  day_name?: string;
  block_name?: string;
  name?: string;
  order_index?: number;
  week_number?: number;
  metadata?: Record<string, unknown>;
  coach_notes?: string;
  exercises: Array<{
    exercise_id: string;
    sets?: number | string;
    reps?: number | string;
    rest_seconds?: number | string;
    hold_seconds?: number | string;
    is_weighted?: boolean;
    notes?: string;
    order_index?: number;
  }>;
}

export function transformBlocksForInsert(blocks: ClaudeBlock[]): Record<string, unknown>[] {
  return blocks.map((block) => {
    const name = block.name ?? (block.day_name && block.block_name
      ? `${block.day_name} | ${block.block_name}`
      : block.day_name ?? block.block_name ?? "WORKOUT ROUTINE");

    const metadata = block.metadata ?? {};
    const cleanNotes = block.coach_notes ?? "";
    const notes = `[CONCEPT:${JSON.stringify(metadata)}] ${cleanNotes}`.trim();

    return {
      name,
      notes,
      order_index: block.order_index ?? 0,
      week_number: block.week_number ?? 1,
      exercises: (block.exercises ?? []).map((ex) => ({
        exercise_id: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps,
        rest_seconds: ex.rest_seconds,
        hold_seconds: ex.hold_seconds,
        is_weighted: ex.is_weighted ?? false,
        notes: ex.notes,
        order_index: ex.order_index ?? 0,
      })),
    };
  });
}

// Shared JSON schema fragment for the "blocks" tool parameter — used by
// both create_program and append_week so their input_schema stays in sync.
export const BLOCKS_SCHEMA = {
  type: "array" as const,
  items: {
    type: "object" as const,
    properties: {
      day_name: { type: "string", description: 'e.g. "PULL DAY 1"' },
      block_name: { type: "string", description: 'e.g. "Strength"' },
      order_index: { type: "integer", description: "Unique within this week only" },
      week_number: { type: "integer", description: "Only meaningful for create_program's multi-week templates; append_week always writes the next week automatically" },
      metadata: {
        type: "object",
        description: "CONCEPT block metadata: timing_system (straight_set/amrap/fortime/tabata), structure (single/superset/circuit/ladder), rounds, rest_after_round, focus_tag (PULL/PUSH/LEGS/CORE/SKILLS/FULL_BODY/REST), is_weighted, tabata_work_seconds, tabata_rest_seconds, tabata_rounds",
      },
      coach_notes: { type: "string", description: "Freeform cue text for this block" },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            exercise_id: { type: "string", description: "From search_exercises — required, never a name" },
            sets: { type: "integer" },
            reps: { type: "integer" },
            rest_seconds: { type: "integer" },
            hold_seconds: { type: "integer" },
            is_weighted: { type: "boolean" },
            notes: { type: "string" },
            order_index: { type: "integer" },
          },
          required: ["exercise_id"],
        },
      },
    },
    required: ["exercises"],
  },
};
