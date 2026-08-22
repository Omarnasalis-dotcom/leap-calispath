import { ToolDefinition } from "./types.ts";
import { getUserContext } from "./getUserContext.ts";
import { searchExercises } from "./searchExercises.ts";
import { getWorkoutLogs } from "./getWorkoutLogs.ts";
import { createProgram } from "./createProgram.ts";
import { appendWeek } from "./appendWeek.ts";
import { adjustProgram } from "./adjustProgram.ts";
import { recommendTest } from "./recommendTest.ts";

// Adding tool #8 later: write the file (schema + handler), import it here,
// add it to this array. Nothing else in the edge function changes — the
// Anthropic `tools` param and the dispatch-by-name map are both derived
// from this single list.
export const TOOLS: ToolDefinition[] = [
  getUserContext,
  searchExercises,
  getWorkoutLogs,
  createProgram,
  appendWeek,
  adjustProgram,
  recommendTest,
];

export const TOOLS_BY_NAME: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map((tool) => [tool.name, tool])
);

export const ANTHROPIC_TOOLS = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.input_schema,
}));
