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
  dayNumber?: number | null;
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
  const dayNumber = action.dayNumber ?? 1;
  return `Tell me what to change for Day ${dayNumber}`;
}
