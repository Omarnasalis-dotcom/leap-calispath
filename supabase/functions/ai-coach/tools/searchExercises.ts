import { ToolDefinition } from "./types.ts";

// exercise_library is GRANT SELECT-open to authenticated (only
// INSERT/UPDATE/DELETE are coach/admin-gated — confirmed against the RLS
// migrations), so this is a plain live query, not an RPC. Always call this
// before writing an exercise into a program — never invent a name or trust
// one from memory, since the library is the actual source of truth and can
// change any time a coach/admin adds to it.
//
// BATCHING (added after a real production failure): a 4-day program needs
// ~30 unique exercises, and this tool used to accept exactly one query per
// call. Combined with MAX_TOOL_TURNS in index.ts, a program build burned
// every available turn on one-at-a-time lookups and never reached
// propose_new_program — the athlete saw a long pause and then nothing at
// all, because the loop fell through to a bare 500 with no reply field.
// `queries` collapses the whole program's lookups into one call. The
// per-query match limit is deliberately tight (6, vs 20 for a single
// lookup) because 30 queries x 20 matches is a lot of tokens to spend on
// disambiguation the model rarely needs.
// Batch results are deliberately lean. Every tool result stays in the
// `messages` array and is re-sent on every later turn of the same exchange,
// so an oversized batch payload is paid for repeatedly, not once — 40
// queries x 6 full rows was several thousand tokens re-billed per turn.
// Batch mode returns id + name only (the id is the whole point; category
// and difficulty are not what disambiguates a lookup by name) and caps
// matches tight. Single lookups stay verbose for genuine exploration.
const MAX_QUERIES = 40;
const BATCH_MATCH_LIMIT = 3;
const BATCH_FIELDS = "id, name";
const SINGLE_MATCH_LIMIT = 20;
const SINGLE_FIELDS = "id, name, category, difficulty";

export const searchExercises: ToolDefinition = {
  name: "search_exercises",
  description:
    "Look up exercises in the live exercise library to get their real exercise_id before putting them in a program. Always call this rather than inventing, remembering, or constructing an ID from a name — the library is the live source of truth. When you are building or extending a program, pass ALL the exercise names you need in `queries` as one single call — do not call this once per exercise, you will run out of turns before you can propose anything.",
  input_schema: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description: "Exercise names to look up, all at once — e.g. the complete list for every block of the program you're about to build. Strongly preferred over `query`.",
      },
      query: { type: "string", description: "A single exercise name. Only for one-off lookups; use `queries` when building a program." },
      category: { type: "string", description: "Optional category filter, applied to every query." },
    },
  },
  handler: async (userClient, input) => {
    const rawQueries = Array.isArray(input.queries)
      ? (input.queries as unknown[]).filter((q): q is string => typeof q === "string" && q.trim() !== "")
      : [];
    const single = typeof input.query === "string" && input.query.trim() !== "" ? input.query : null;

    if (rawQueries.length === 0 && !single) {
      throw new Error("search_exercises needs either `queries` (an array of names — preferred when building a program) or `query` (a single name).");
    }

    const runOne = async (term: string, limit: number, fields: string) => {
      // Each term is its own query rather than one combined .or() filter:
      // real library names contain parentheses and commas ("Pull Ups
      // (Normal Grip)"), which are PostgREST or-filter syntax and would
      // need escaping. Separate queries run concurrently below, so this
      // costs one round trip in wall-clock terms either way.
      let q = userClient
        .from("exercise_library")
        .select(fields)
        .ilike("name", `%${term}%`)
        .limit(limit);
      if (input.category) q = q.eq("category", input.category as string);
      const { data, error } = await q;
      if (error) throw new Error(`search_exercises failed for "${term}": ${error.message}`);
      return data ?? [];
    };

    if (rawQueries.length > 0) {
      const terms = rawQueries.slice(0, MAX_QUERIES);
      const settled = await Promise.all(terms.map((t) => runOne(t, BATCH_MATCH_LIMIT, BATCH_FIELDS)));
      const results = terms.map((term, i) => ({ query: term, matches: settled[i] }));
      const missing = results.filter((r) => r.matches.length === 0).map((r) => r.query);
      return {
        results,
        // Surfaced explicitly so a typo'd or non-existent name is obvious
        // in the tool result rather than being silently absent from a long
        // list — the model should substitute the nearest real exercise and
        // tell the athlete, never invent an id for these.
        not_found: missing,
        truncated: rawQueries.length > MAX_QUERIES ? rawQueries.length - MAX_QUERIES : 0,
      };
    }

    return { matches: await runOne(single as string, SINGLE_MATCH_LIMIT, SINGLE_FIELDS) };
  },
};
