// Pure data-derivation helpers for the Training Center hub
// (src/screens/TrainingCenterScreen.tsx). Kept separate from the screen so
// the week/day math, adherence %, and sessions-left logic can be unit
// tested without mounting any UI.

import { groupRawBlocksIntoDays } from './warriorProgramDays';

export interface HubBlock {
  id: string;
  name: string;
  order_index: number;
  week_number: number | null;
}

export interface HubWorkoutLog {
  block_id: string | null;
  notes: string | null;
}

// Same convention as admin_get_client_adherence()
// (supabase/migrations/20260724100000_add_admin_client_adherence_function.sql)
// and get_warrior_progress: a missed day is a workout_logs row whose notes
// start with this literal prefix, not a separate status column.
export function isMissedLog(notes: string | null): boolean {
  return !!notes && notes.startsWith('[STATUS:MISSED]');
}

export interface DisplayWeekInfo {
  /** Blocks with archived weeks removed, otherwise untouched. */
  filteredBlocks: HubBlock[];
  /** Count of distinct (non-archived) weeks. */
  totalWeeks: number;
  /** 1-indexed display week matching the warrior's raw current_week, clamped into range. */
  currentDisplayWeek: number;
  /** Raw week_number -> sequential display week, for anything that needs to show both. */
  rawToDisplayWeek: Map<number, number>;
}

/**
 * Mirrors WarriorProgramScreen.tsx's archived-week filter + sequential
 * display-week renumbering (lines ~441-461) exactly, so the hub's "WEEK n
 * OF total" always agrees with what My Active Program itself shows —
 * raw week_number values are never surfaced directly, and a gap left by an
 * archived week (e.g. week 1 archived, weeks 2-3 remain) always renumbers
 * to a contiguous "Week 1, Week 2".
 */
export function computeDisplayWeeks(
  blocks: HubBlock[],
  archivedRawWeekNumbers: number[],
  currentRawWeek: number
): DisplayWeekInfo {
  const archivedWeeks = new Set(archivedRawWeekNumbers);
  const filteredBlocks = blocks.filter((b) => !archivedWeeks.has(b.week_number ?? 1));

  const remainingRawWeeks = Array.from(new Set(filteredBlocks.map((b) => b.week_number ?? 1))).sort(
    (a, b) => a - b
  );
  const rawToDisplayWeek = new Map<number, number>(remainingRawWeeks.map((raw, idx) => [raw, idx + 1]));

  const totalWeeks = remainingRawWeeks.length;
  const currentDisplayWeek = Math.min(
    Math.max(rawToDisplayWeek.get(currentRawWeek) ?? 1, 1),
    Math.max(totalWeeks, 1)
  );

  return { filteredBlocks, totalWeeks, currentDisplayWeek, rawToDisplayWeek };
}

export interface HubWeekStats {
  /** Real session/day count this week (grouped by the "{Day} | {Block}" name
   *  prefix — see groupRawBlocksIntoDays), not a raw block-row count. A day
   *  with 3 blocks (Warm-Up/Strength/Cool-Down) is 1 session, not 3 — this
   *  is the Phase 1 hub bug this function used to have. */
  frequencyThisWeek: number;
  completedThisWeek: number;
  missedThisWeek: number;
  /** 0-100, completed / frequency. 0 when there's nothing scheduled this week. */
  percentCompleteThisWeek: number;
  /** Scheduled this week minus completed minus missed — never negative. */
  sessionsLeftThisWeek: number;
  /** Name of the first not-yet-fully-logged day this week, or null if none. */
  nextUpDayName: string | null;
}

export function computeWeekStats(
  allFilteredBlocks: HubBlock[],
  currentRawWeek: number,
  logsThisWeek: HubWorkoutLog[]
): HubWeekStats {
  const weekBlocks = allFilteredBlocks.filter((b) => (b.week_number ?? 1) === currentRawWeek);
  const weekDays = groupRawBlocksIntoDays(weekBlocks);

  const loggedBlockIds = new Map<string, boolean>(); // block_id -> isMissed
  for (const log of logsThisWeek) {
    if (log.block_id) loggedBlockIds.set(log.block_id, isMissedLog(log.notes));
  }

  let completedThisWeek = 0;
  let missedThisWeek = 0;
  let nextUpDayName: string | null = null;
  for (const day of weekDays) {
    const statuses = day.blockIds.map((id) => loggedBlockIds.get(id));
    const allLogged = statuses.length > 0 && statuses.every((s) => s !== undefined);
    if (!allLogged) {
      if (!nextUpDayName) nextUpDayName = day.dayName;
      continue;
    }
    if (statuses.some((s) => s === true)) missedThisWeek += 1;
    else completedThisWeek += 1;
  }

  const frequencyThisWeek = weekDays.length;
  const percentCompleteThisWeek =
    frequencyThisWeek === 0 ? 0 : Math.round((completedThisWeek / frequencyThisWeek) * 100);
  const sessionsLeftThisWeek = Math.max(frequencyThisWeek - completedThisWeek - missedThisWeek, 0);

  return {
    frequencyThisWeek,
    completedThisWeek,
    missedThisWeek,
    percentCompleteThisWeek,
    sessionsLeftThisWeek,
    nextUpDayName,
  };
}

export interface HubAllTimeStats {
  sessionsDone: number;
  /** null when there's no logged history at all yet (drives hiding the stat strip). */
  adherencePct: number | null;
  hasHistory: boolean;
}

/**
 * Day-level, not a raw workout_logs row count — a day with 3 blocks
 * produces 3 log rows for one real session, so counting rows directly (the
 * Phase 1 hub's original bug) triples "sessions done." A day only counts
 * once every one of its blocks has a log; a day still mid-way through
 * being logged isn't counted yet either direction (mirrors deriveDayStates'
 * "today" — not resolved, not missed).
 */
export function computeAllTimeStats(allBlocks: HubBlock[], allLogs: HubWorkoutLog[]): HubAllTimeStats {
  const days = groupRawBlocksIntoDays(allBlocks);
  const loggedBlockIds = new Map<string, boolean>(); // block_id -> isMissed
  for (const log of allLogs) {
    if (log.block_id) loggedBlockIds.set(log.block_id, isMissedLog(log.notes));
  }

  let completed = 0;
  let missed = 0;
  for (const day of days) {
    const statuses = day.blockIds.map((id) => loggedBlockIds.get(id));
    const allLogged = statuses.length > 0 && statuses.every((s) => s !== undefined);
    if (!allLogged) continue;
    if (statuses.some((s) => s === true)) missed += 1;
    else completed += 1;
  }

  const total = completed + missed;
  return {
    sessionsDone: completed,
    adherencePct: total === 0 ? null : Math.round((completed / total) * 100),
    hasHistory: total > 0,
  };
}

export function formatSessionsLeftSubline(hasActiveProgram: boolean, sessionsLeftThisWeek: number, currentDisplayWeek: number): string {
  if (!hasActiveProgram) return 'NOTHING SCHEDULED YET';
  const noun = sessionsLeftThisWeek === 1 ? 'SESSION' : 'SESSIONS';
  return `WEEK ${currentDisplayWeek} · ${sessionsLeftThisWeek} ${noun} LEFT`;
}

export function formatWeekMeta(currentDisplayWeek: number, totalWeeks: number, frequencyThisWeek: number): string {
  const freqNoun = `${frequencyThisWeek}×/WEEK`;
  return `WEEK ${currentDisplayWeek} OF ${totalWeeks} · ${freqNoun}`;
}

export function formatTemplatesSub(count: number): string {
  return `${count} READY PLAN${count === 1 ? '' : 'S'}`;
}

export function formatMovementsSub(count: number): string {
  return `${count}+ MOVEMENTS`;
}

export function formatQuickWorkoutSub(minMinutes: number | null, maxMinutes: number | null): string {
  if (minMinutes === null || maxMinutes === null) return 'READY SESSIONS';
  if (minMinutes === maxMinutes) return `${minMinutes} MIN`;
  return `${minMinutes}–${maxMinutes} MIN`;
}

export function formatActiveProgramSub(hasActiveProgram: boolean, currentDisplayWeek: number, totalWeeks: number): string {
  return hasActiveProgram ? `WEEK ${currentDisplayWeek} OF ${totalWeeks}` : 'NO PROGRAM ASSIGNED';
}
