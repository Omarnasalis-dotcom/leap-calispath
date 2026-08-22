import { ToolDefinition } from "./types.ts";

// Not a write — a structured signal so the client can render a CTA (e.g. a
// "Try Static World" button) instead of the recommendation only existing as
// prose in the chat reply. index.ts collects every recommend_test call
// across the tool-use loop into the final response's `recommendations`
// field, separate from the text reply.
export const recommendTest: ToolDefinition = {
  name: "recommend_test",
  description:
    "Signal that the athlete is ready to attempt a specific trial/test — the strength trial for their next tier, or Power/Static/1MM World if unlocked. This never changes their tier itself (only the real in-app trial does that) — it just surfaces a CTA. Use after Trial Prep readiness criteria are met, or when get_user_context shows it's been a while since their last attempt at something they're ready for.",
  input_schema: {
    type: "object",
    properties: {
      world: { type: "string", enum: ["strength_trial", "power", "static", "one_min_max"] },
      reason: { type: "string", description: "One-line reason to show the athlete alongside the CTA" },
    },
    required: ["world", "reason"],
  },
  handler: async (_userClient, input) => {
    return { acknowledged: true, world: input.world, reason: input.reason };
  },
};
