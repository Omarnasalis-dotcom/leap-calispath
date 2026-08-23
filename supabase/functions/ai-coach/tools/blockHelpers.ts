// Shared block-shape transform for propose_new_program / append_week / add_block_to_week. Claude
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
    // `name` is now the primary reference and exercise_id is optional —
    // see resolveExerciseIds below for why.
    name?: string;
    exercise_id?: string;
    sets?: number | string;
    reps?: number | string;
    rest_seconds?: number | string;
    hold_seconds?: number | string;
    is_weighted?: boolean;
    notes?: string;
    order_index?: number;
  }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Resolve exercise NAMES to real library ids, server-side.
//
// Why names and not ids: routing UUIDs through the model was expensive and
// fragile. `"exercise_id": "5b677e6b-73eb-44e8-98f5-e0dd3a581604"` is ~20
// output tokens against ~3 for `"name": "Dips"`, and a full program carries
// ~80 of them — well over a thousand tokens of pure identifier, generated
// slowly and billed on every turn it is re-sent. Worse, it forced a whole
// search_exercises round trip whose only purpose was fetching ids, and that
// result then rode along in the message array for the rest of the exchange.
// It also created a bug class that actually shipped: the model inventing an
// id-shaped string, or writing a name into the id field.
//
// Resolving here removes all of that. The model writes names it already
// knows; the server decides what is real. A hallucinated exercise cannot
// become a bad id — it simply fails to resolve.
//
// This never creates library rows. The human-coach import path does
// (ProgramImportParser auto-inserts on a name miss), which is correct for a
// coach authoring their own content and wrong for an athlete chat — it
// would let a typo write junk into a library 188 curated exercises depend
// on, one row per affected athlete. Unresolved names throw, with near-miss
// suggestions so the model can fix itself in one retry.
export async function resolveExerciseIds(
  userClient: { from: (t: string) => any },
  blocks: ClaudeBlock[]
): Promise<Map<string, string>> {
  const wanted = new Set<string>();
  for (const block of blocks ?? []) {
    for (const ex of block.exercises ?? []) {
      const name = typeof ex.name === "string" ? ex.name.trim() : "";
      if (name) wanted.add(name);
      else if (!isUuid(ex.exercise_id)) {
        throw new Error(
          `An exercise in block "${block.day_name ?? block.name ?? "?"}" has no usable "name". Every exercise needs its exact library name.`
        );
      }
    }
  }
  const resolved = new Map<string, string>();
  if (wanted.size === 0) return resolved;

  const names = [...wanted];
  const { data: exact, error } = await userClient
    .from("exercise_library")
    .select("id, name")
    .in("name", names);
  if (error) throw new Error(`Exercise lookup failed: ${error.message}`);
  for (const row of exact ?? []) resolved.set(row.name.toLowerCase(), row.id);

  // Case/whitespace-tolerant second pass. The library holds deliberate
  // misspellings ("Pesudo Push Ups", "Elvated Pike Push Ups") that the model
  // is told to copy verbatim; a casing slip should not fail a whole program.
  const misses = names.filter((n) => !resolved.has(n.toLowerCase()));
  if (misses.length > 0) {
    const retried = await Promise.all(
      misses.map(async (n) => {
        const { data } = await userClient
          .from("exercise_library")
          .select("id, name")
          .ilike("name", n)
          .limit(1);
        return { n, row: data?.[0] ?? null };
      })
    );
    for (const { n, row } of retried) if (row) resolved.set(n.toLowerCase(), row.id);
  }

  const unresolved = names.filter((n) => !resolved.has(n.toLowerCase()));
  if (unresolved.length > 0) {
    const suggestions = await Promise.all(
      unresolved.slice(0, 5).map(async (n) => {
        const token = n.split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? n;
        const { data } = await userClient
          .from("exercise_library")
          .select("name")
          .ilike("name", `%${token}%`)
          .limit(3);
        const near = (data ?? []).map((r: { name: string }) => r.name);
        return near.length ? `"${n}" — did you mean: ${near.join(", ")}?` : `"${n}" — no close match`;
      })
    );
    throw new Error(
      `These exercises are not in the library, so the program was not built: ${suggestions.join(" | ")}. ` +
      `Use an exact library name (search_exercises to browse). Never invent one — substitute the nearest real exercise and tell the athlete you substituted.`
    );
  }
  return resolved;
}

// Every numeric field here reaches Postgres through a raw cast in
// _insert_client_program_blocks — `(v_exercise->>'hold_seconds')::int` and
// friends. An empty string is the app's own stored convention for "not
// applicable" (see warrior-program-week-export-import-format.md, and the
// schema descriptions below used to instruct exactly that), but `''::int`
// raises "invalid input syntax for type integer" — which surfaced to the
// athlete as a raw Postgres error AFTER they tapped Start, on a card that
// looked perfect. COALESCE does not rescue it either: the cast is evaluated
// before COALESCE sees it, so block order_index/week_number carry the same
// hazard, not just the exercise fields.
//
// Normalising here (the AI path's own boundary) rather than in the shared
// SQL keeps the human-coach import path, which already handles "" in JS,
// completely untouched. Anything unparseable becomes NULL rather than an
// exception, so a stray "AMRAP" or "10-12" degrades to an empty cell
// instead of destroying the whole write.
function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function transformBlocksForInsert(
  blocks: ClaudeBlock[],
  idMap: Map<string, string>
): Record<string, unknown>[] {
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
      order_index: toIntOrNull(block.order_index) ?? 0,
      week_number: toIntOrNull(block.week_number) ?? 1,
      exercises: (block.exercises ?? []).map((ex) => ({
        // Server-resolved id wins over anything the model supplied. A
        // model-written id is only trusted when no name was given at all.
        exercise_id: idMap.get((ex.name ?? "").trim().toLowerCase()) ?? ex.exercise_id,
        sets: toIntOrNull(ex.sets),
        reps: toIntOrNull(ex.reps),
        rest_seconds: toIntOrNull(ex.rest_seconds),
        hold_seconds: toIntOrNull(ex.hold_seconds),
        is_weighted: ex.is_weighted ?? false,
        notes: ex.notes,
        order_index: toIntOrNull(ex.order_index) ?? 0,
      })),
    };
  });
}

// Shared JSON schema fragment for the "blocks" tool parameter — used by
// propose_new_program, append_week, and add_block_to_week so their
// input_schema stays in sync.
//
// The CONCEPT metadata contract lives here, in the schema, not as a prose
// table in the system prompt. Two failure classes this closes: (1) a field
// existing in BlockConceptParser.ts (src/lib/BlockConceptParser.ts) but
// missing from prompt prose, so the model never sends it — reproduced for
// time_cap_min/ladder_start/ladder_sub/ladder_direction, which the prompt
// text used to omit entirely; (2) prompt prose drifting from the schema
// over separate edits — reproduced for timing_system, where prose once
// listed "ladder" as a valid value alongside straight_set/amrap/fortime/
// tabata, when it's actually a `structure` value per BlockConceptParser.ts,
// not a `timing_system` one. The schema is the only place these values are
// enumerated now, so that specific class of drift can't happen again.
//
// sets/reps/rest_seconds/hold_seconds are strings, matching the real
// warrior-program-week-export-import-format.md convention (human-authored
// templates already store "4"/"15"/"60", not 4/15/60) — both the DB write
// (`(v_exercise->>'sets')::int`) and BlockConceptParser's own metadata
// types (`string | number` unions) tolerate either form, so this won't
// break a write either way; it's for AI-written and human-written blocks
// to store the same shape in the same column, not a correctness fix.
export const BLOCKS_SCHEMA = {
  type: "array" as const,
  items: {
    type: "object" as const,
    properties: {
      day_name: { type: "string", description: 'e.g. "PULL DAY 1"' },
      block_name: { type: "string", description: 'e.g. "Strength"' },
      order_index: { type: "integer", description: "Unique within this week only" },
      week_number: { type: "integer", description: "Only meaningful for propose_new_program — defaults to 1, and should stay 1 unless the athlete explicitly asked for multiple weeks written upfront. append_week always writes the next week automatically; add_block_to_week ignores this and always lands in the week you specified." },
      metadata: {
        type: "object",
        description: "The CONCEPT block tag. timing_system + structure + focus_tag + is_weighted are always required; the rest are conditional — see each field.",
        properties: {
          timing_system: {
            type: "string",
            enum: ["straight_set", "amrap", "fortime", "tabata"],
            description: "Required. NOT ladder — ladder is a structure value, never a timing_system value. A ladder block pairs structure:\"ladder\" with one of these four, usually fortime.",
          },
          structure: {
            type: "string",
            enum: ["single", "superset", "circuit", "ladder"],
            description: "Required.",
          },
          focus_tag: {
            type: "string",
            enum: ["PULL", "PUSH", "LEGS", "CORE", "SKILLS", "FULL_BODY", "REST"],
            description: "Required. SKILLS for dedicated skill days, REST for rest-day blocks (empty exercises array).",
          },
          is_weighted: {
            type: "boolean",
            description: "Required. Whether the block as a whole is weighted-strength-focused — can be true even if some individual exercises in it are bodyweight, but if ANY exercise in the block is weighted, this must be true.",
          },
          rounds: {
            type: "string",
            description: "Required when structure is circuit, superset, or ladder — the round count as a string, e.g. \"3\". When a block has rounds, each exercise's own sets is \"1\": the block's rounds drive the repetition, not the exercise's sets.",
          },
          rest_after_round: {
            type: "integer",
            description: "Seconds of rest after each full round, when rounds is set.",
          },
          time_cap_min: {
            type: "integer",
            description: "Required when timing_system is fortime or amrap. The time cap in minutes.",
          },
          ladder_start: {
            type: "integer",
            description: "Required when structure is ladder — the starting rep count.",
          },
          ladder_sub: {
            type: "integer",
            description: "Required when structure is ladder — how much the rep count changes each round.",
          },
          ladder_direction: {
            type: "string",
            enum: ["up", "down"],
            description: "Required when structure is ladder. down: start highest, drop each round — best for bodyweight moves that fatigue fast. up: start low, build — best for weighted/accessory work.",
          },
          tabata_work_seconds: { type: "integer", description: "Required when timing_system is tabata." },
          tabata_rest_seconds: { type: "integer", description: "Required when timing_system is tabata." },
          tabata_rounds: { type: "integer", description: "Required when timing_system is tabata." },
          is_tier_trial: {
            type: "boolean",
            description: "Optional — set true only on a block that's genuinely trial-prep (the athlete practicing their actual next-tier trial movements/sequence).",
          },
        },
        required: ["timing_system", "structure", "focus_tag", "is_weighted"],
      },
      coach_notes: { type: "string", description: "Freeform cue text for this block — Arabic for AMRAP/For Time/weighted-max-effort blocks per the system prompt's cue table, English elsewhere." },
      exercises: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "REQUIRED. The exact library name, e.g. \"Pull Ups (Normal Grip)\". The server resolves this to the real exercise id — you do not need to look up or send an id. Copy library spellings verbatim, including deliberate misspellings like \"Pesudo Push Ups\". If a name does not exist you will get an error listing near matches; substitute a real exercise and tell the athlete, never invent one." },
            exercise_id: { type: "string", description: "Not needed — omit it. `name` is resolved server-side." },
            sets: { type: "string", description: 'e.g. "3". String, not integer — matches the app\'s stored format.' },
            reps: { type: "string", description: 'e.g. "10". String, not integer.' },
            rest_seconds: { type: "string", description: 'e.g. "60", or "0" inside a circuit/superset. Omit the field entirely if rest does not apply — do not send an empty string.' },
            hold_seconds: { type: "string", description: 'e.g. "30" for a static hold. Omit the field entirely for anything that is not a timed hold — do not send an empty string.' },
            is_weighted: { type: "boolean", description: "The source of truth for whether THIS exercise uses external load — independent of the block-level is_weighted." },
            notes: { type: "string" },
            order_index: { type: "integer" },
          },
          required: ["name"],
        },
      },
    },
    required: ["exercises"],
  },
};
