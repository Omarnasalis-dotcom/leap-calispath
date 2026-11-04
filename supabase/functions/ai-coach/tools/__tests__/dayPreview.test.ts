// The day card's "See exercises" list (2026-11-04, owner). Blocks below are
// the real resolved_blocks shape from a live propose_new_program result.
import { buildDayPreview, exerciseIds } from "../dayPreview";

const BLOCKS = [
  {
    name: "MUSCLE-UP & PULL FOCUS | Skills",
    notes: '[CONCEPT:{"timing_system":"straight_set","structure":"single","focus_tag":"SKILLS","is_weighted":false}] Muscle-up work first.',
    order_index: 1,
    exercises: [{ exercise_id: "mu", sets: 4, reps: 3, rest_seconds: 120, hold_seconds: null, is_weighted: false, order_index: 0 }],
  },
  {
    name: "MUSCLE-UP & PULL FOCUS | Warm-Up",
    notes: '[CONCEPT:{"timing_system":"straight_set","structure":"circuit","focus_tag":"SKILLS","is_weighted":false,"rounds":"1"}]',
    order_index: 0,
    exercises: [
      { exercise_id: "scap", sets: 1, reps: 8, hold_seconds: null, is_weighted: false, order_index: 0 },
      { exercise_id: "iyt", sets: 1, reps: 8, hold_seconds: null, is_weighted: false, order_index: 0 },
    ],
  },
  {
    name: "MUSCLE-UP & PULL FOCUS | Core",
    notes: '[CONCEPT:{"structure":"single"}] Ribs down.',
    order_index: 2,
    exercises: [{ exercise_id: "hollow", sets: 3, reps: null, hold_seconds: 15, is_weighted: false, order_index: 0 }],
  },
  { name: "MUSCLE-UP & PULL FOCUS | Empty", notes: null, order_index: 3, exercises: [] },
];

const NAMES = new Map([
  ["mu", "Muscle Up"],
  ["scap", "Scapula Pulls"],
  ["iyt", "I, Y, T Rasies"],
  ["hollow", "Hollow Hold"],
]);

describe("buildDayPreview", () => {
  it("lists blocks in order with their exercises and raw numbers", () => {
    expect(buildDayPreview(BLOCKS, NAMES)).toEqual([
      {
        title: "Warm-Up",
        structure: "circuit",
        rounds: 1,
        exercises: [
          { name: "Scapula Pulls", sets: 1, reps: 8, hold_seconds: null, is_weighted: false },
          { name: "I, Y, T Rasies", sets: 1, reps: 8, hold_seconds: null, is_weighted: false },
        ],
      },
      { title: "Skills", structure: "single", rounds: null, exercises: [{ name: "Muscle Up", sets: 4, reps: 3, hold_seconds: null, is_weighted: false }] },
      { title: "Core", structure: "single", rounds: null, exercises: [{ name: "Hollow Hold", sets: 3, reps: null, hold_seconds: 15, is_weighted: false }] },
    ]);
  });

  it("marks weighted work and survives an unknown id or missing notes", () => {
    const [block] = buildDayPreview(
      [{ name: "PULL | Strength", order_index: 0, exercises: [{ exercise_id: "x", sets: "4", reps: "5", is_weighted: true }] }],
      new Map(),
    );
    expect(block).toEqual({ title: "Strength", structure: null, rounds: null, exercises: [{ name: "?", sets: 4, reps: 5, hold_seconds: null, is_weighted: true }] });
  });
});

describe("exerciseIds", () => {
  it("collects each id once", () => {
    expect(exerciseIds([...BLOCKS, BLOCKS[0]]).sort()).toEqual(["hollow", "iyt", "mu", "scap"]);
  });
});
