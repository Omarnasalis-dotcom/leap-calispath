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
  it("cards are pending until tapped; ask before doing something else; no guessing how the app works (2026-10-30)", () => {
    expect(SYSTEM_PROMPT).toContain("Until they tap it, nothing on the card has changed their program: present it as ready to tap, never as done");
    expect(SYSTEM_PROMPT).toContain("say why, offer yours, and wait — never do something different from what they asked in that same reply");
    expect(SYSTEM_PROMPT).toContain("**Describe the app only from what you know.**");
  });
  it("goals decide the trial; skill guide is judgment, not a gate (2026-10-31)", () => {
    expect(SYSTEM_PROMPT).not.toContain("always frame progress toward the next trial");
    expect(SYSTEM_PROMPT).toContain("the app's word is اختبار, never تجربة");
    expect(SYSTEM_PROMPT).toContain("**What each goal means**");
    expect(SYSTEM_PROMPT).toContain("strength_trial → trial prep is the main track");
    expect(SYSTEM_PROMPT).toContain("compete → a real-life calisthenics competition, separate from the in-app trial");
    expect(SYSTEM_PROMPT).toContain("**Ask once what else they're working toward.**");
    expect(SYSTEM_PROMPT).toContain("for your judgment, not a gate");
    expect(SYSTEM_PROMPT).toContain("back lever, planche, handstand → PUSH");
    for (const dead of ["Tuck Front Lever Negative", "Tuck Back Lever Press", "Advanced Tuck Back Lever Hold", "Single Leg Back Lever Negative", "Advanced Tuck Planche Lean Hold", "Muscle Up (with band)"]) {
      // "Advanced Tuck Front Lever Negative" is real, so only a bare name counts.
      expect(SYSTEM_PROMPT).not.toMatch(new RegExp(`(?<!Advanced )${dead.replace(/[()]/g, "\\$&")}`));
    }
  });
  it("band is the muscle-up bridge; one rung back; blocks not sessions; opener language (2026-10-31)", () => {
    expect(SYSTEM_PROMPT).toContain("Negative Muscle Up is not a step in this line");
    expect(SYSTEM_PROMPT).toContain("Banded High Pull Up → Muscle Up band-assisted → Muscle Up → 1 Pull Up 1 Muscle Up.");
    expect(SYSTEM_PROMPT).toContain("step back one rung");
    expect(SYSTEM_PROMPT).toContain("Blocks done: [x/x]");
    expect(SYSTEM_PROMPT).not.toContain("Sessions: [x/x]");
    expect(SYSTEM_PROMPT).toContain("answer that one in get_user_context's app_language");
    expect(SYSTEM_PROMPT).toContain("Write that framing once, after the tool result");
  });
  it("older weeks come as summary lines (fix #8, 2026-10-30)", () => {
    expect(SYSTEM_PROMPT).toContain("older weeks come as one line per exercise in older_weeks");
  });
});
