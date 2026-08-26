import { ToolDefinition } from "./types.ts";
import { getUserContext } from "./getUserContext.ts";
import { searchExercises } from "./searchExercises.ts";
import { getWorkoutLogs } from "./getWorkoutLogs.ts";
import { proposeNewProgram } from "./proposeNewProgram.ts";
import { proposeEndProgram } from "./proposeEndProgram.ts";
import { proposeDeleteWeek } from "./proposeDeleteWeek.ts";
import { appendWeek } from "./appendWeek.ts";
import { adjustProgram } from "./adjustProgram.ts";
import { addBlockToWeek } from "./addBlockToWeek.ts";
import { recommendTest } from "./recommendTest.ts";
import { searchWorkouts } from "./searchWorkouts.ts";
import { getWorkoutDetail } from "./getWorkoutDetail.ts";
import { proposeProgramFromWorkouts } from "./proposeProgramFromWorkouts.ts";
import { replaceBlockExercises } from "./replaceBlockExercises.ts";
import { getProgramStructure } from "./getProgramStructure.ts";
import { attachStatBars } from "./attachStatBars.ts";
import { attachSteps } from "./attachSteps.ts";
import { suggestReplies } from "./suggestReplies.ts";

// Adding tool #N later: write the file (schema + handler), import it here,
// add it to this array. Nothing else in the edge function changes — the
// Anthropic `tools` param and the dispatch-by-name map are both derived
// from this single list.
//
// No tool here writes a new program or ends one directly — create_program
// was retired in favor of propose_new_program/propose_end_program, both
// non-write "signal" tools (index.ts captures their input into the
// response's programAction field instead of executing anything). The
// actual write only ever happens from an explicit tap in CoachScreen.tsx,
// calling ai_coach_create_program/ai_coach_end_program directly — never
// triggered by the AI's own judgment mid-conversation.
export const TOOLS: ToolDefinition[] = [
  getUserContext,
  searchExercises,
  getWorkoutLogs,
  proposeNewProgram,
  proposeEndProgram,
  proposeDeleteWeek,
  appendWeek,
  adjustProgram,
  addBlockToWeek,
  recommendTest,
  searchWorkouts,
  getWorkoutDetail,
  proposeProgramFromWorkouts,
  replaceBlockExercises,
  getProgramStructure,
  attachStatBars,
  attachSteps,
  suggestReplies,
];

export const TOOLS_BY_NAME: Record<string, ToolDefinition> = Object.fromEntries(
  TOOLS.map((tool) => [tool.name, tool])
);

export const ANTHROPIC_TOOLS = TOOLS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.input_schema,
}));
