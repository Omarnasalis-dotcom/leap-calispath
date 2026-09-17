// Jest coverage for programAction.ts — pure logic behind CoachScreen.tsx's
// "Change this day" decision, split out specifically so it's testable
// without CoachScreen.tsx's full import chain (AsyncStorage, expo-router,
// expo-blur, AuthContext, ThemeContext, the Supabase client), none of which
// resolve under a plain Jest run outside a rendered app.
import { getChangeDayMessage, isLastConfirmedDay, ProgramAction } from "../programAction";

function makeAction(overrides: Partial<ProgramAction>): ProgramAction {
  return {
    type: "create",
    reason: "test",
    payload: null,
    warriorProgramId: null,
    currentProgramIsAiOwned: true,
    weekNumber: null,
    ...overrides,
  };
}

describe("getChangeDayMessage (added 2026-09-17, day-by-day build)", () => {
  it("returns the coach-voiced canned message for a 'create' (day 1) card", () => {
    const action = makeAction({ type: "create", dayNumber: 1 });
    expect(getChangeDayMessage(action)).toBe("Tell me what to change for Day 1");
  });

  it("returns the canned message for an 'add_day' card, using its own dayNumber", () => {
    const action = makeAction({ type: "add_day", dayNumber: 3 });
    expect(getChangeDayMessage(action)).toBe("Tell me what to change for Day 3");
  });

  it("defaults to Day 1 when dayNumber is missing", () => {
    const action = makeAction({ type: "create", dayNumber: undefined });
    expect(getChangeDayMessage(action)).toBe("Tell me what to change for Day 1");
  });

  it("Fix B: prefers displayDayNumber over the trusted dayNumber for the label (a redo showing its true position)", () => {
    const action = makeAction({ type: "add_day", dayNumber: 4, displayDayNumber: 2 });
    expect(getChangeDayMessage(action)).toBe("Tell me what to change for Day 2");
  });

  it("falls back to dayNumber when displayDayNumber wasn't supplied (the model omitted day_number)", () => {
    const action = makeAction({ type: "add_day", dayNumber: 3, displayDayNumber: undefined });
    expect(getChangeDayMessage(action)).toBe("Tell me what to change for Day 3");
  });

  it("returns null for every non-day card type — those keep the original silent IGNORE, no canned message", () => {
    expect(getChangeDayMessage(makeAction({ type: "end" }))).toBeNull();
    expect(getChangeDayMessage(makeAction({ type: "delete_week" }))).toBeNull();
    expect(getChangeDayMessage(makeAction({ type: "create_from_workouts" }))).toBeNull();
  });

  it("returns null when there's no pending action at all", () => {
    expect(getChangeDayMessage(null)).toBeNull();
  });
});

describe("isLastConfirmedDay (added 2026-09-18, Fix A): gates the Program Ready celebration", () => {
  it("false for day 1 of a multi-day build — the celebration must not fire yet", () => {
    expect(isLastConfirmedDay(makeAction({ type: "create", dayNumber: 1, totalDays: 4 }))).toBe(false);
  });

  it("true for a 1-day build's only day (dayNumber === totalDays)", () => {
    expect(isLastConfirmedDay(makeAction({ type: "create", dayNumber: 1, totalDays: 1 }))).toBe(true);
  });

  it("false for an early add_day in a multi-day build", () => {
    expect(isLastConfirmedDay(makeAction({ type: "add_day", dayNumber: 2, totalDays: 4 }))).toBe(false);
  });

  it("true for the last add_day of a multi-day build", () => {
    expect(isLastConfirmedDay(makeAction({ type: "add_day", dayNumber: 4, totalDays: 4 }))).toBe(true);
  });

  it("uses the TRUSTED dayNumber for this decision, never displayDayNumber — a model-supplied label can't fake completion", () => {
    // displayDayNumber claims "day 4 of 4" but the real, server-computed
    // dayNumber says this is actually day 2 — completion must follow the
    // trusted value, not what the card happens to show.
    const action = makeAction({ type: "add_day", dayNumber: 2, displayDayNumber: 4, totalDays: 4 });
    expect(isLastConfirmedDay(action)).toBe(false);
  });

  it("false when totalDays is unknown — never celebrate on uncertain data", () => {
    expect(isLastConfirmedDay(makeAction({ type: "add_day", dayNumber: 1, totalDays: null }))).toBe(false);
  });

  it("always true for create_from_workouts — a real single-shot whole-program creation, no day-by-day concept", () => {
    expect(isLastConfirmedDay(makeAction({ type: "create_from_workouts" }))).toBe(true);
  });

  it("always false for end/delete_week", () => {
    expect(isLastConfirmedDay(makeAction({ type: "end" }))).toBe(false);
    expect(isLastConfirmedDay(makeAction({ type: "delete_week" }))).toBe(false);
  });
});

describe("\"Change this day\" makes no server call (added 2026-09-17)", () => {
  it("getChangeDayMessage's own source contains no network call — it is a pure string function", () => {
    // Read the function's own source rather than mocking supabase/fetch:
    // proves the guarantee structurally (no await, no .rpc(, no fetch()
    // anywhere in its body) instead of just trusting that a mock wasn't
    // hit, which a refactor could silently defeat by moving the call
    // outside what's mocked.
    const src = getChangeDayMessage.toString();
    expect(src).not.toMatch(/\.rpc\(|fetch\(|await\s/);
  });
});
