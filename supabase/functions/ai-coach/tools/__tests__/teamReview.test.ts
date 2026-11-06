import { teamReviewFact, ProgramReviewRow } from "../teamReview";

const base: ProgramReviewRow = { week_number: 2, status: "closed", outcome: "changed", reverted_at: null };

describe("teamReviewFact", () => {
  it("adds nothing without a review", () => {
    expect(teamReviewFact([])).toBeNull();
    expect(teamReviewFact(null)).toBeNull();
    expect(teamReviewFact(undefined)).toBeNull();
  });

  it("says a review is running, and to keep coaching", () => {
    const fact = teamReviewFact([{ ...base, status: "open", outcome: null }]);
    expect(fact?.state).toBe("in_review");
    expect(fact?.note).toContain("Keep coaching");
  });

  it("reports no changes", () => {
    expect(teamReviewFact([{ ...base, outcome: "accurate" }])?.state).toBe("no_changes");
  });

  it("lists what changed and that it was on purpose", () => {
    const fact = teamReviewFact([{
      ...base,
      changes: [{
        exercise_before: "Pull Ups", exercise_after: "Ring Rows",
        before: { sets: 5, reps: 8, rest_seconds: 90, hold_seconds: null, notes: null },
        after: { sets: 4, reps: 6, rest_seconds: 90, hold_seconds: null, notes: null },
      }],
    }]);
    expect(fact?.state).toBe("changed");
    expect(fact?.note).toContain("Pull Ups: swapped to Ring Rows, sets 5 -> 4, reps 8 -> 6");
    expect(fact?.note).toContain("get_program_structure");
    expect(fact?.note).not.toContain("rest_seconds");
  });

  it("lists only the block settings that changed", () => {
    const fact = teamReviewFact([{
      ...base,
      changes: [{
        kind: "settings",
        block_name: "Strength",
        before: { rounds: "3", rest_after_round: 60 },
        after: { rounds: "2", rest_after_round: 60 },
      }],
    }]);
    expect(fact?.note).toContain("Strength: rounds 3 -> 2");
    expect(fact?.note).not.toContain("rest_after_round");
  });

  it("lists structural changes in words", () => {
    const fact = teamReviewFact([{
      ...base,
      changes: [
        { kind: "structure", block_name: "DAY 1 | Strength", detail: { op: "remove_exercise", exercise: "Dips" } },
        { kind: "structure", block_name: "DAY 1 | Finisher", detail: { op: "delete_block" } },
        { kind: "structure", block_name: "DAY 1 | Skills", detail: { op: "change_type", timing: "amrap", structure: "circuit" } },
      ],
    }]);
    expect(fact?.note).toContain("DAY 1 | Strength: removed Dips");
    expect(fact?.note).toContain("DAY 1 | Finisher: block deleted");
    expect(fact?.note).toContain("changed to amrap / circuit");
  });

  it("treats 90 and \"90\" as the same value", () => {
    const fact = teamReviewFact([{
      ...base,
      changes: [{ kind: "settings", block_name: "Finisher", before: { time_cap_min: "10", x: 90 }, after: { time_cap_min: 8, x: "90" } }],
    }]);
    expect(fact?.note).toContain("Finisher: time_cap_min 10 -> 8");
    expect(fact?.note).not.toContain("x 90");
  });

  it("tells it the athlete went back, and what stayed", () => {
    const fact = teamReviewFact([{ ...base, reverted_at: "2026-11-07", revert_skipped: 1 }]);
    expect(fact?.state).toBe("reverted");
    expect(fact?.note).toContain("1 change(s) stayed");
  });

  it("uses the newest review only", () => {
    expect(teamReviewFact([{ ...base, status: "open", outcome: null, week_number: 3 }, base])?.week_number).toBe(3);
  });
});
