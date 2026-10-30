// The system prompt is one template literal: a raw backtick inside it ends
// the string, and the deployed function then fails to start (caught by
// deno check on 2026-10-16, missed by Jest because nothing imported it).
// Loading it here makes that a test failure, plus a few markers that must
// survive any rewording.
import { SYSTEM_PROMPT } from "../../system-prompt";

describe("system prompt", () => {
  it("loads as one complete string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(50_000);
    expect(SYSTEM_PROMPT.trimEnd().endsWith("The best program is the one the athlete actually completes.")).toBe(true);
  });

  it("names library exercises the server can resolve", () => {
    expect(SYSTEM_PROMPT).toContain("`Muscle Up band-assisted`");
    expect(SYSTEM_PROMPT).not.toContain('There is no "Banded Muscle Up" entry');
  });

  it("makes the coach act on every athlete note", () => {
    expect(SYSTEM_PROMPT).not.toContain("recent_athlete_notes");
    expect(SYSTEM_PROMPT).toContain("**Every athlete note gets a decision; none is skipped.**");
    expect(SYSTEM_PROMPT).toContain("**A note about what they actually did beats the logged numbers for that exercise:**");
    expect(SYSTEM_PROMPT).toContain('Your note: "[their words, short]" → [what changes]');
  });

  it("keeps warm-ups the same week to week unless the athlete flagged them", () => {
    expect(SYSTEM_PROMPT).toContain("Make one easier only when the athlete flagged it (logged it too hard, RPE 9–10 on it, or said so): fewer reps, or 2 rounds → 1.");
  });
  it("has one add-a-day rule, decided by current_week_complete (2026-10-30)", () => {
    expect(SYSTEM_PROMPT).toContain("**Add a day** — one rule, decided by current_week_complete.");
    expect(SYSTEM_PROMPT).toContain("add_block_to_week is only for one more block on a day that already exists, never a whole day.");
    expect(SYSTEM_PROMPT).not.toContain("**Add a day** to a week that already exists");
    expect(SYSTEM_PROMPT).toContain("**A logged block is locked**");
    expect(SYSTEM_PROMPT).toContain("Deleting a week moves the weeks after it down one");
    expect(SYSTEM_PROMPT).not.toContain("There is no tool to delete a single block or exercise.");
  });
  it("weight notes follow the chat's language; no log means rep range + RPE (2026-10-30)", () => {
    expect(SYSTEM_PROMPT).toContain("**These rows follow the chat's language (§3), not the Arabic block-type rule above:**");
    expect(SYSTEM_PROMPT).toContain("No weight logged yet for that exercise means no number: write the rep range and RPE instead");
  });
  it("over/under/RPE flags are facts for judgment; timed blocks judged by result (2026-10-30)", () => {
    expect(SYSTEM_PROMPT).toContain("facts for your judgment, not instructions");
    expect(SYSTEM_PROMPT).toContain("`over_prescribed` → they're ahead of the plan on that exercise; how far to follow is your call");
    expect(SYSTEM_PROMPT).toContain("A ladder, AMRAP, For Time or Tabata log has `judge_by_block_result: true`");
  });
});
