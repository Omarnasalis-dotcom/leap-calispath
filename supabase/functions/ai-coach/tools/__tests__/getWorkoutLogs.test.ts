import { compareToPrescription, judgedByBlockResult } from "../getWorkoutLogs";

const reps = (...r: number[]) => r.map((n) => ({ exercise_name: "Push Up", reps_completed: n, hold_seconds: null }));
const holds = (...h: number[]) => h.map((n) => ({ exercise_name: "L-Sit", reps_completed: null, hold_seconds: n }));

describe("compareToPrescription (2026-10-30)", () => {
  it("flags extra reps as over, not under", () => {
    const row = compareToPrescription(reps(12, 10, 10), { sets: 3, reps: 10, hold_seconds: null }, 7);
    expect(row).toMatchObject({ under_prescribed: false, over_prescribed: true, rpe_mismatch: false });
  });

  it("a mix of over and under stays under", () => {
    const row = compareToPrescription(reps(12, 8, 10), { sets: 3, reps: 10, hold_seconds: null }, 7);
    expect(row).toMatchObject({ under_prescribed: true, over_prescribed: false });
  });

  it("compares holds like reps, both ways", () => {
    expect(compareToPrescription(holds(40, 30), { sets: 2, reps: null, hold_seconds: 30 }, null))
      .toMatchObject({ over_prescribed: true, hold_prescribed: 30, holds_logged: [40, 30] });
    expect(compareToPrescription(holds(20, 30), { sets: 2, reps: null, hold_seconds: 30 }, null))
      .toMatchObject({ under_prescribed: true });
  });

  it("an extra set counts as over", () => {
    expect(compareToPrescription(reps(10, 10, 10, 10), { sets: 3, reps: 10, hold_seconds: null }, null).over_prescribed).toBe(true);
  });

  it("rpe_mismatch: over at RPE 9-10, under at RPE 6 or lower, nothing without RPE", () => {
    const plan = { sets: 2, reps: 10, hold_seconds: null };
    expect(compareToPrescription(reps(14, 12), plan, 10).rpe_mismatch).toBe(true);
    expect(compareToPrescription(reps(14, 12), plan, 8).rpe_mismatch).toBe(false);
    expect(compareToPrescription(reps(6, 6), plan, 5).rpe_mismatch).toBe(true);
    expect(compareToPrescription(reps(6, 6), plan, null).rpe_mismatch).toBe(false);
    expect(compareToPrescription(reps(10, 10), plan, 10).rpe_mismatch).toBe(false);
  });

  it("no hold fields on a reps exercise", () => {
    expect(compareToPrescription(reps(10), { sets: 1, reps: 10, hold_seconds: null }, null)).not.toHaveProperty("holds_logged");
  });
});

describe("judgedByBlockResult", () => {
  const notes = (m: object) => `[CONCEPT:${JSON.stringify(m)}] note`;
  it("ladder, AMRAP, For Time and Tabata are judged by their result", () => {
    expect(judgedByBlockResult(notes({ timing_system: "fortime", structure: "ladder" }))).toBe(true);
    expect(judgedByBlockResult(notes({ timing_system: "amrap", structure: "circuit" }))).toBe(true);
    expect(judgedByBlockResult(notes({ timing_system: "tabata", structure: "single" }))).toBe(true);
    expect(judgedByBlockResult(notes({ timing_system: "straight_set", structure: "ladder" }))).toBe(true);
  });
  it("straight sets, circuits, supersets and blocks without metadata are compared set by set", () => {
    expect(judgedByBlockResult(notes({ timing_system: "straight_set", structure: "circuit" }))).toBe(false);
    expect(judgedByBlockResult(notes({ timing_system: "straight_set", structure: "superset" }))).toBe(false);
    expect(judgedByBlockResult(null)).toBe(false);
  });
});
