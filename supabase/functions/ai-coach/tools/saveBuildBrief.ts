import { ToolDefinition } from "./types.ts";
import { BUILD_BRIEF_SCHEMA, validateBuildBrief } from "./blockHelpers.ts";

// Direct build (2026-09-16): optional. NOT the enforcement gate — under
// system-prompt.ts §2 ("each turn is fresh"), a tool call's result from an
// earlier turn is gone by the time propose_new_program actually runs, so a
// separate "save" step here could never be trusted as the real check
// (a model could skip straight to propose_new_program and this would never
// have run). propose_new_program re-validates the exact same brief shape
// itself, every time, regardless of whether this ran first.
//
// What this IS for: giving the model one explicit "here's what I'm about
// to build" moment, with the same same-turn error-naming-the-field
// behavior as everywhere else in this file, before it spends output
// tokens writing an entire multi-day blocks array. Calling it is optional;
// system-prompt.ts §11 decides when it's worth the extra round trip.
export const saveBuildBrief: ToolDefinition = {
  name: "save_build_brief",
  description:
    "Optional. Confirms the build brief is complete and internally consistent BEFORE you spend a turn writing the full program — same validation propose_new_program itself runs, just earlier and without the cost of an unused blocks array. Not required; propose_new_program checks the same fields itself either way.",
  input_schema: {
    type: "object",
    properties: { brief: BUILD_BRIEF_SCHEMA },
    required: ["brief"],
  },
  handler: async (_userClient, input) => {
    const brief = validateBuildBrief(input.brief);
    return { brief_confirmed: true, brief };
  },
};
