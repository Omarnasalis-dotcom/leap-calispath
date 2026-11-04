import { ToolDefinition } from "./types.ts";

// The coach remembers what the athlete tells it (2026-11-04, owner).
// Athletes can't redo the assessment after onboarding and pick equipment
// only once in CoachSetup, so a correction said in chat was lost with the
// chat. This saves it to their profile (ai_coach_save_athlete_update,
// migration 20261104160000): equipment in CoachSetup's own ids, so the
// setup screen and every later chat agree; strict maxes into
// profiles.current_maxes, which get_user_context and the build's safety
// check read before the onboarding assessment.
export const saveAthleteUpdate: ToolDefinition = {
  name: "save_athlete_update",
  description:
    "Save what the athlete just confirmed about themselves so every later chat starts from it: their equipment now and/or their current strict max reps. Call it in the same turn they confirm a change, then say once, in plain words, that you'll remember it. equipment replaces the saved list, so send everything they have now. current_maxes merges: send only the numbers they gave you. Never save a guess or something they didn't confirm.",
  input_schema: {
    type: "object",
    properties: {
      equipment: {
        type: "array",
        items: { type: "string", enum: ["pull_up_bar", "dip_bar", "rings", "resistance_bands", "low_parallettes", "weight_belt", "free_weights"] },
        description: "Everything they have now (an empty array means no equipment). Omit to leave equipment unchanged.",
      },
      current_maxes: {
        type: "object",
        description: "Strict max reps they confirmed. Omit to leave numbers unchanged.",
        properties: {
          pull_ups: { type: "integer" },
          dips: { type: "integer" },
          push_ups: { type: "integer" },
          muscle_ups: { type: "integer" },
        },
      },
    },
  },
  handler: async (userClient, input) => {
    const equipment = Array.isArray(input.equipment) ? input.equipment : null;
    const maxes = input.current_maxes && typeof input.current_maxes === "object" && !Array.isArray(input.current_maxes) ? input.current_maxes : null;
    if (!equipment && !maxes) {
      throw new Error("Nothing to save: send equipment, current_maxes, or both.");
    }
    const { data, error } = await userClient.rpc("ai_coach_save_athlete_update", {
      p_equipment: equipment,
      p_current_maxes: maxes,
    });
    if (error) throw new Error(error.message);
    return { saved: true, ...(data as Record<string, unknown>) };
  },
};
