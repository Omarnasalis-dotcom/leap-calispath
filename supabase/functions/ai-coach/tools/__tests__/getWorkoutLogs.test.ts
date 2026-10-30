import { compareToPrescription, judgedByBlockResult, RECENT_WEEKS, shapeWorkoutLogs } from "../getWorkoutLogs";

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

describe("shapeWorkoutLogs (fix #8, 2026-10-30)", () => {
  const concept = (m: object) => `[CONCEPT:${JSON.stringify(m)}]`;
  const log = (week: number, extra: object = {}) => ({
    id: `log-${week}`, block_id: `b${week}`, block_name: "PULL DAY | Strength", week_number: week,
    completed_at: `2026-10-0${week}T10:00:00Z`, status: "completed", rpe: 7, feel: "good",
    notes: `[LOG] Weight Used: 10 KG\nweek ${week} felt fine`, missed_reason: null, missed_detail: null,
    sets: [
      { set_index: 1, exercise_name: "Pull Ups (Normal Grip)", reps_completed: 6, weight_used: 10, hold_seconds: null },
      { set_index: 2, exercise_name: "Pull Ups (Normal Grip)", reps_completed: 5, weight_used: 10, hold_seconds: null },
    ],
    ...extra,
  });
  const weeks = [5, 4, 3, 2, 1];
  const data = { logs: weeks.map((w) => log(w)), weekly_completion: [{ total: 5 }], bodyweight_trend: [] };
  const be = weeks.map((w) => ({ block_id: `b${w}`, sets: 2, reps: 5, hold_seconds: null, exercise_library: { name: "Pull Ups (Normal Grip)" } }));
  const pb = weeks.map((w) => ({ id: `b${w}`, notes: concept({ timing_system: "straight_set", structure: "single" }) }));
  const out = shapeWorkoutLogs(data, be, pb);

  it("puts athlete_notes first, with every week's note", () => {
    expect(Object.keys(out)[0]).toBe("athlete_notes");
    expect(out.athlete_notes.map((n: any) => n.week_number)).toEqual([5, 4, 3, 2, 1]);
  });

  it("keeps the last 3 logged weeks in full, without ids, raw notes or raw set rows", () => {
    expect(RECENT_WEEKS).toBe(3);
    expect(out.recent_weeks).toEqual([3, 4, 5]);
    expect(out.logs.map((l: any) => l.week_number)).toEqual([5, 4, 3]);
    const l = out.logs[0];
    expect(l).not.toHaveProperty("id");
    expect(l).not.toHaveProperty("block_id");
    expect(l).not.toHaveProperty("notes");
    expect(l).not.toHaveProperty("sets");
    expect(l.athlete_note).toBe("week 5 felt fine");
    expect(l.block_result).toEqual(["Weight Used: 10 KG"]);
    expect(l.exercises_vs_prescribed[0]).toMatchObject({ reps_logged: [6, 5], weights_logged: [10, 10], over_prescribed: true });
    expect(out.weekly_completion).toEqual([{ total: 5 }]);
  });

  it("older weeks become one line per exercise", () => {
    expect(out.older_weeks.map((o: any) => o.week_number)).toEqual([2, 1]);
    expect(out.older_weeks[0]).toEqual({
      week_number: 2, block_name: "PULL DAY | Strength", status: "completed", feel: "good", rpe: 7,
      block_result: ["Weight Used: 10 KG"],
      exercises: [{ exercise_name: "Pull Ups (Normal Grip)", sets_logged: 2, best_reps: 6, top_kg: 10, over_prescribed: true }],
    });
  });

  it("compares circuits and supersets against the block's rounds", () => {
    const circuit = shapeWorkoutLogs(
      { logs: [log(1, { sets: [1, 2].map((i) => ({ set_index: i, exercise_name: "Pull Ups (Normal Grip)", reps_completed: 5, weight_used: null, hold_seconds: null })) })] },
      [{ block_id: "b1", sets: 1, reps: 5, hold_seconds: null, exercise_library: { name: "Pull Ups (Normal Grip)" } }],
      [{ id: "b1", notes: concept({ timing_system: "straight_set", structure: "circuit", rounds: "3" }) }],
    );
    expect(circuit.logs[0].exercises_vs_prescribed[0]).toMatchObject({ sets_prescribed: 3, sets_logged: 2, under_prescribed: true, over_prescribed: false });
  });
});
