import { ToolDefinition } from "./types.ts";

// Design handoff "quick-reply chip rail" — contextual to the last coach
// message, returned with it, not the same fixed 6 questions every turn
// (the old SUGGESTED_QUESTIONS in CoachScreen.tsx). Same array-of-short-
// strings pattern as attach_steps: cheap, low-risk, one clean tool call.
export const suggestReplies: ToolDefinition = {
  name: "suggest_replies",
  description:
    "Attach up to 3 short quick-reply suggestions the athlete might want to tap next, based on what you just said — e.g. after presenting a matched day: [\"SWAP AN EXERCISE\", \"NEXT DAY\", \"THAT WORKS\"]. Keep each under ~4 words. Only call this when there is a genuinely useful next step to suggest — omit it entirely rather than forcing generic filler like \"tell me more.\"",
  input_schema: {
    type: "object",
    properties: {
      replies: {
        type: "array",
        items: { type: "string" },
        description: "Up to 3 short suggested replies, most useful first.",
      },
    },
    required: ["replies"],
  },
  handler: async (_userClient, input) => {
    const replies = Array.isArray(input.replies)
      ? (input.replies as unknown[]).filter((r): r is string => typeof r === "string" && r.trim() !== "").slice(0, 3)
      : [];
    return { replies };
  },
};
