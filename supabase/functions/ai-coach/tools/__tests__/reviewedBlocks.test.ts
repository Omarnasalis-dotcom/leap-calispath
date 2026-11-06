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

const RETYPED: Array<[string, string, string, string]> = [
  [
    "circuit",
    "straight_set",
    "single",
    "[CONCEPT:{\"focus_tag\": \"CORE\", \"structure\": \"single\", \"is_weighted\": false, \"timing_system\": \"straight_set\"}]"
  ],
  [
    "single",
    "straight_set",
    "single",
    "[CONCEPT:{\"focus_tag\": \"PULL\", \"structure\": \"single\", \"is_weighted\": false, \"timing_system\": \"straight_set\"}]"
  ],
  [
    "amrap",
    "straight_set",
    "single",
    "[CONCEPT:{\"focus_tag\": \"PUSH\", \"structure\": \"single\", \"is_weighted\": false, \"timing_system\": \"straight_set\"}]"
  ],
  [
    "circuit",
    "amrap",
    "single",
    "[CONCEPT:{\"focus_tag\": \"CORE\", \"structure\": \"single\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"amrap\"}]"
  ],
  [
    "single",
    "amrap",
    "single",
    "[CONCEPT:{\"focus_tag\": \"PULL\", \"structure\": \"single\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"amrap\"}]"
  ],
  [
    "amrap",
    "amrap",
    "single",
    "[CONCEPT:{\"focus_tag\": \"PUSH\", \"structure\": \"single\", \"is_weighted\": false, \"time_cap_min\": 12, \"timing_system\": \"amrap\"}]"
  ],
  [
    "circuit",
    "fortime",
    "single",
    "[CONCEPT:{\"focus_tag\": \"CORE\", \"structure\": \"single\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"fortime\"}]"
  ],
  [
    "single",
    "fortime",
    "single",
    "[CONCEPT:{\"focus_tag\": \"PULL\", \"structure\": \"single\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"fortime\"}]"
  ],
  [
    "amrap",
    "fortime",
    "single",
    "[CONCEPT:{\"focus_tag\": \"PUSH\", \"structure\": \"single\", \"is_weighted\": false, \"time_cap_min\": 12, \"timing_system\": \"fortime\"}]"
  ],
  [
    "circuit",
    "tabata",
    "single",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "single",
    "tabata",
    "single",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "amrap",
    "tabata",
    "single",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "circuit",
    "straight_set",
    "superset",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"CORE\", \"structure\": \"superset\", \"is_weighted\": false, \"timing_system\": \"straight_set\", \"rest_after_round\": 45}]"
  ],
  [
    "single",
    "straight_set",
    "superset",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PULL\", \"structure\": \"superset\", \"is_weighted\": false, \"timing_system\": \"straight_set\", \"rest_after_round\": 60}]"
  ],
  [
    "amrap",
    "straight_set",
    "superset",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PUSH\", \"structure\": \"superset\", \"is_weighted\": false, \"timing_system\": \"straight_set\", \"rest_after_round\": 60}]"
  ],
  [
    "circuit",
    "amrap",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"superset\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"amrap\"}]"
  ],
  [
    "single",
    "amrap",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"superset\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"amrap\"}]"
  ],
  [
    "amrap",
    "amrap",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"superset\", \"is_weighted\": false, \"time_cap_min\": 12, \"timing_system\": \"amrap\"}]"
  ],
  [
    "circuit",
    "fortime",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"superset\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"fortime\"}]"
  ],
  [
    "single",
    "fortime",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"superset\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"fortime\"}]"
  ],
  [
    "amrap",
    "fortime",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"superset\", \"is_weighted\": false, \"time_cap_min\": 12, \"timing_system\": \"fortime\"}]"
  ],
  [
    "circuit",
    "tabata",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "single",
    "tabata",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "amrap",
    "tabata",
    "superset",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "circuit",
    "straight_set",
    "circuit",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"timing_system\": \"straight_set\", \"rest_after_round\": 45}]"
  ],
  [
    "single",
    "straight_set",
    "circuit",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"timing_system\": \"straight_set\", \"rest_after_round\": 60}]"
  ],
  [
    "amrap",
    "straight_set",
    "circuit",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"timing_system\": \"straight_set\", \"rest_after_round\": 60}]"
  ],
  [
    "circuit",
    "amrap",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"amrap\"}]"
  ],
  [
    "single",
    "amrap",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"amrap\"}]"
  ],
  [
    "amrap",
    "amrap",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"time_cap_min\": 12, \"timing_system\": \"amrap\"}]"
  ],
  [
    "circuit",
    "fortime",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"fortime\"}]"
  ],
  [
    "single",
    "fortime",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"time_cap_min\": 10, \"timing_system\": \"fortime\"}]"
  ],
  [
    "amrap",
    "fortime",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"time_cap_min\": 12, \"timing_system\": \"fortime\"}]"
  ],
  [
    "circuit",
    "tabata",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "single",
    "tabata",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "amrap",
    "tabata",
    "circuit",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "circuit",
    "straight_set",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"CORE\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"timing_system\": \"straight_set\", \"ladder_direction\": \"down\", \"rest_after_round\": 45}]"
  ],
  [
    "single",
    "straight_set",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PULL\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"timing_system\": \"straight_set\", \"ladder_direction\": \"down\", \"rest_after_round\": 60}]"
  ],
  [
    "amrap",
    "straight_set",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PUSH\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"timing_system\": \"straight_set\", \"ladder_direction\": \"down\", \"rest_after_round\": 60}]"
  ],
  [
    "circuit",
    "amrap",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"CORE\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"time_cap_min\": 10, \"timing_system\": \"amrap\", \"ladder_direction\": \"down\"}]"
  ],
  [
    "single",
    "amrap",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PULL\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"time_cap_min\": 10, \"timing_system\": \"amrap\", \"ladder_direction\": \"down\"}]"
  ],
  [
    "amrap",
    "amrap",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PUSH\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"time_cap_min\": 12, \"timing_system\": \"amrap\", \"ladder_direction\": \"down\"}]"
  ],
  [
    "circuit",
    "fortime",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"CORE\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"time_cap_min\": 10, \"timing_system\": \"fortime\", \"ladder_direction\": \"down\"}]"
  ],
  [
    "single",
    "fortime",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PULL\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"time_cap_min\": 10, \"timing_system\": \"fortime\", \"ladder_direction\": \"down\"}]"
  ],
  [
    "amrap",
    "fortime",
    "ladder",
    "[CONCEPT:{\"rounds\": \"3\", \"focus_tag\": \"PUSH\", \"structure\": \"ladder\", \"ladder_sub\": 2, \"is_weighted\": false, \"ladder_start\": 10, \"time_cap_min\": 12, \"timing_system\": \"fortime\", \"ladder_direction\": \"down\"}]"
  ],
  [
    "circuit",
    "tabata",
    "ladder",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"CORE\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "single",
    "tabata",
    "ladder",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PULL\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ],
  [
    "amrap",
    "tabata",
    "ladder",
    "[CONCEPT:{\"rounds\": \"1\", \"focus_tag\": \"PUSH\", \"structure\": \"circuit\", \"is_weighted\": false, \"tabata_rounds\": 8, \"timing_system\": \"tabata\", \"tabata_rest_seconds\": 10, \"tabata_work_seconds\": 20}]"
  ]
];

describe("blocks a Leap team review has adjusted", () => {
  it.each(reviewed)("%s passes the AI Coach's validation", (_name, notes) => {
    const { metadata } = parseConceptNotes(notes);
    const sets = metadata.structure === "single" ? "3" : "1";
    const blocks = [{ day_name: "PULL DAY 1", block_name: "Main", metadata, exercises: exercises.map((e) => ({ ...e, sets })) }];
    expect(() => validateBlockStructure(blocks as never, { requireDayPhases: false })).not.toThrow();
  });

  // Every timing and structure, from three starting blocks: the real output of
  // _block_retyped (20261106230000), which fixes each exercise's sets the same way.
  it.each(RETYPED)("from %s to %s + %s passes the AI Coach's validation", (_from, _timing, _structure, notes) => {
    const { metadata } = parseConceptNotes(notes);
    const sets = metadata.rounds ? "1" : "3";
    const blocks = [{ day_name: "PULL DAY 1", block_name: "Main", metadata, exercises: exercises.map((e) => ({ ...e, sets })) }];
    expect(() => validateBlockStructure(blocks as never, { requireDayPhases: false })).not.toThrow();
  });

  it("keeps the note written after the settings", () => {
    expect(parseConceptNotes(reviewed[0][1]).coach_notes).toBe("keep me");
  });
});
