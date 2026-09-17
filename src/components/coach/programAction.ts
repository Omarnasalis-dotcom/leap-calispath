// Pure, dependency-free logic for CoachScreen.tsx's confirmation-card
// state — split out specifically so it's unit-testable without pulling in
// CoachScreen.tsx's full import chain (AsyncStorage, expo-router, expo-blur,
// AuthContext, ThemeContext, the Supabase client), none of which resolve
// under a plain Jest run outside a rendered app. See
// src/components/coach/__tests__/programAction.test.ts.
//
// Mirrors the shape ai-coach's index.ts builds from a propose_new_program/
// propose_add_day/propose_end_program/propose_delete_week/
// propose_program_from_workouts tool call. None of these ever write
// anything server-side — the actual RPC only fires from
// CoachScreen.tsx's handleConfirmProgramAction, gated on an explicit tap,
// never from the AI's own judgment mid-conversation.
//
// Day-by-day build (2026-09-17): 'create' is now always day 1 of a program
// being built one day at a time (propose_new_program no longer builds a
// whole week), and 'add_day' is day 2 onward (propose_add_day) — both carry
// dayNumber/totalDays for the "Add Day N of M" card, and both share the
// same confirm/card-copy treatment. 'add_day' also carries `replacing`, a
// TRUSTED flag from index.ts's own fresh query (never the AI's claim)
// telling CoachScreen.tsx whether the tap should add a new day
// (ai_coach_add_block_to_week) or redo one already added
// (ai_coach_replace_day_in_week) — see that RPC's own migration comment for
// why a redo can't just reuse add_block_to_week (it hard-rejects the name
// collision). 'create_from_workouts' is unrelated to this flow (an
// athlete's explicit "just give me one exact ready-made session" ask) and
// keeps its original Start/Ignore copy.
export interface ProgramAction {
  type: 'create' | 'add_day' | 'end' | 'delete_week' | 'create_from_workouts';
  reason: string;
  replacing?: boolean;
  // Trusted, server-computed running day count — the ONLY field
  // isLastConfirmedDay reads. Never overridden by the model.
  dayNumber?: number | null;
  // Fix B (2026-09-18): what the card actually SHOWS. Same as dayNumber
  // for a new day; on a redo, the model may supply its own day_number (its
  // read of this day's true position in the confirmed structure) via
  // propose_add_day, since dayNumber alone is just a running total and
  // reads wrong for an earlier day being redone (see computeDayPosition's
  // own tests). Label only — completion detection below never uses this.
  displayDayNumber?: number | null;
  totalDays?: number | null;
  payload:
    | { name: string; description: string; dayName: string | null; blocks: unknown[] }
    | { dayName: string; blocks: unknown[] }
    | { name: string; workoutIds: string[]; dayTitles: string[] }
    | null;
  warriorProgramId: string | null;
  currentProgramIsAiOwned: boolean;
  weekNumber: number | null;
}

// Day-by-day build (2026-09-17): the whole decision behind "Change this
// day" — pure, no network, no side effects, so it's independently
// verifiable that tapping it never fires an RPC. Returns the canned
// message to push (coach-voiced: "Tell me what to change for Day N"), or
// null when the pending card isn't a day card at all (end/delete_week/
// create_from_workouts keep their original silent-clear IGNORE).
export function getChangeDayMessage(action: ProgramAction | null): string | null {
  if (!action || (action.type !== 'create' && action.type !== 'add_day')) return null;
  const dayNumber = action.displayDayNumber ?? action.dayNumber ?? 1;
  return `Tell me what to change for Day ${dayNumber}`;
}

// Day-by-day build (2026-09-18, Fix A): the "Program Ready" celebration and
// onboarding redirect used to fire on every 'create' confirm — day 1 of a
// day-by-day build now IS a 'create' confirm, so it fired right as day 2
// should have started, interrupting the build. Detected client-side purely
// from what index.ts's buildProgramAction already puts on the action: a
// day card (create/add_day) is complete only once dayNumber reaches
// totalDays, both server-computed (dayNumber from a fresh program_blocks
// count, totalDays from the confirmed brief's split_days length) — never
// derived from chat text or trusted from the model directly.
// create_from_workouts is a separate, single-shot whole-program creation
// with no day-by-day concept at all (no dayNumber/totalDays ever set on
// it), so it keeps celebrating immediately, same as before this change.
// end/delete_week never did and still don't.
export function isLastConfirmedDay(action: ProgramAction): boolean {
  if (action.type === 'create_from_workouts') return true;
  if (action.type !== 'create' && action.type !== 'add_day') return false;
  return action.dayNumber != null && action.totalDays != null && action.dayNumber === action.totalDays;
}
