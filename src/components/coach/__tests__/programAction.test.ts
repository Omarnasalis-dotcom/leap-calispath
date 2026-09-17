// Jest coverage for programAction.ts — pure logic behind CoachScreen.tsx's
// "Change this day" decision, split out specifically so it's testable
// without CoachScreen.tsx's full import chain (AsyncStorage, expo-router,
// expo-blur, AuthContext, ThemeContext, the Supabase client), none of which
// resolve under a plain Jest run outside a rendered app.
import { getChangeDayMessage, ProgramAction } from "../programAction";

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

  it("returns null for every non-day card type — those keep the original silent IGNORE, no canned message", () => {
    expect(getChangeDayMessage(makeAction({ type: "end" }))).toBeNull();
    expect(getChangeDayMessage(makeAction({ type: "delete_week" }))).toBeNull();
    expect(getChangeDayMessage(makeAction({ type: "create_from_workouts" }))).toBeNull();
  });

  it("returns null when there's no pending action at all", () => {
    expect(getChangeDayMessage(null)).toBeNull();
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
