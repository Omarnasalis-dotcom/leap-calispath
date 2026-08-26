import { ToolDefinition } from "./types.ts";

// Design handoff rich block "b) numbered steps". The design explicitly
// wants the renderer switching on a typed block, not parsing prose for a
// "1. ... 2. ..." pattern — so this is a real tool call, not a markdown
// convention. Content here is legitimately the model's own reasoning (a
// checkpoint plan, a sequence of instructions) — there's no database value
// to resolve, unlike attach_stat_bars — but routing it through one clean
// array-of-strings call is far more reliable than inline typed JSON mixed
// into a text reply, the same reasoning `queries: string[]` already proved
// out for search_exercises.
export const attachSteps: ToolDefinition = {
  name: "attach_steps",
  description:
    "Attach a short numbered list under your reply — a checkpoint plan, a sequence of instructions, anything you would otherwise write as \"1. ... 2. ...\" in prose. Keep each item to one short line. Do not also restate the list in your text reply — the block is the list.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "string" },
        description: "The steps, in order. Keep each short — one line each.",
      },
    },
    required: ["items"],
  },
  handler: async (_userClient, input) => {
    const items = Array.isArray(input.items)
      ? (input.items as unknown[]).filter((i): i is string => typeof i === "string" && i.trim() !== "")
      : [];
    if (items.length === 0) throw new Error("attach_steps needs at least one non-empty item.");
    return { type: "steps", items };
  },
};
