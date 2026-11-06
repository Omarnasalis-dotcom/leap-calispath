// A Leap team review writes a block's settings straight into its notes
// (20261106220000), past the checks a build goes through. These are the exact
// strings that migration produces, so a change to the AI Coach's validation
// that a reviewed block wouldn't pass fails here.
import { parseConceptNotes, validateBlockStructure } from "../blockHelpers";

const exercises = [{ name: "Burpee", sets: "1", reps: "8" }];

const reviewed: Array<[string, string]> = [
  ["circuit", '[CONCEPT:{"rounds": "3", "structure": "circuit", "focus_tag": "CORE", "is_weighted": false, "timing_system": "straight_set", "rest_after_round": 75}] keep me'],
  ["superset", '[CONCEPT:{"rounds": "2", "structure": "superset", "focus_tag": "PULL", "is_weighted": false, "timing_system": "straight_set", "rest_after_round": 120}]'],
  ["amrap", '[CONCEPT:{"structure": "circuit", "focus_tag": "FULL_BODY", "is_weighted": false, "time_cap_min": 8, "timing_system": "amrap", "rounds": "1"}]'],
  ["for time", '[CONCEPT:{"structure": "single", "focus_tag": "FULL_BODY", "is_weighted": false, "time_cap_min": 15, "timing_system": "fortime"}]'],
  ["tabata", '[CONCEPT:{"structure": "circuit", "focus_tag": "CORE", "is_weighted": false, "rounds": "1", "timing_system": "tabata", "tabata_rounds": 6, "tabata_rest_seconds": 15, "tabata_work_seconds": 30}]'],
  ["ladder", '[CONCEPT:{"rounds": "5", "structure": "ladder", "focus_tag": "PUSH", "is_weighted": false, "ladder_sub": 3, "ladder_start": 12, "timing_system": "straight_set", "ladder_direction": "up", "rest_after_round": 30}]'],
];

describe("blocks a Leap team review has adjusted", () => {
  it.each(reviewed)("%s passes the AI Coach's validation", (_name, notes) => {
    const { metadata } = parseConceptNotes(notes);
    const sets = metadata.structure === "single" ? "3" : "1";
    const blocks = [{ day_name: "PULL DAY 1", block_name: "Main", metadata, exercises: exercises.map((e) => ({ ...e, sets })) }];
    expect(() => validateBlockStructure(blocks as never, { requireDayPhases: false })).not.toThrow();
  });

  it("keeps the note written after the settings", () => {
    expect(parseConceptNotes(reviewed[0][1]).coach_notes).toBe("keep me");
  });
});
