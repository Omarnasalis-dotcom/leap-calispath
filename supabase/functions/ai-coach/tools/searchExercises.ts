import { ToolDefinition } from "./types.ts";

// exercise_library is GRANT SELECT-open to authenticated (only
// INSERT/UPDATE/DELETE are coach/admin-gated — confirmed against the RLS
// migrations), so this is a plain live query, not an RPC. Always call this
// before writing an exercise into a program — never invent a name or trust
// one from memory, since the library is the actual source of truth and can
// change any time a coach/admin adds to it.
export const searchExercises: ToolDefinition = {
  name: "search_exercises",
  description:
    "Look up exercises in the live exercise library by name or category, to get their exercise_id before including them in a program. Always call this rather than inventing or remembering an exercise name — the library is the live source of truth.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Exercise name or partial name to search for" },
      category: { type: "string", description: "Optional category filter" },
    },
    required: ["query"],
  },
  handler: async (userClient, input) => {
    let query = userClient
      .from("exercise_library")
      .select("id, name, category, difficulty")
      .ilike("name", `%${input.query}%`)
      .limit(20);

    if (input.category) {
      query = query.eq("category", input.category as string);
    }

    const { data, error } = await query;
    if (error) throw new Error(`search_exercises failed: ${error.message}`);
    return { matches: data ?? [] };
  },
};
