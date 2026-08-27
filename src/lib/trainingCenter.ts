// Pure data-derivation helpers for the Training Center hub
// (src/screens/TrainingCenterScreen.tsx). Kept separate from the screen so
// the week/day math, adherence %, and sessions-left logic can be unit
// tested without mounting any UI.

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
  weekBlocks: HubBlock[];
  frequencyThisWeek: number;
  completedThisWeek: number;
  missedThisWeek: number;
  /** 0-100, completed / frequency. 0 when there's nothing scheduled this week. */
  percentCompleteThisWeek: number;
  /** Scheduled this week minus completed minus missed — never negative. */
  sessionsLeftThisWeek: number;
  /** First not-yet-logged block this week, in order_index order, or null if none. */
  nextUpBlock: HubBlock | null;
}

export function computeWeekStats(
  allFilteredBlocks: HubBlock[],
  currentRawWeek: number,
  logsThisWeek: HubWorkoutLog[]
): HubWeekStats {
  const weekBlocks = allFilteredBlocks
    .filter((b) => (b.week_number ?? 1) === currentRawWeek)
    .sort((a, b) => a.order_index - b.order_index);

  const loggedBlockIds = new Map<string, boolean>(); // block_id -> isMissed
  for (const log of logsThisWeek) {
    if (log.block_id) loggedBlockIds.set(log.block_id, isMissedLog(log.notes));
  }

  let completedThisWeek = 0;
  let missedThisWeek = 0;
  let nextUpBlock: HubBlock | null = null;
  for (const block of weekBlocks) {
    const logged = loggedBlockIds.get(block.id);
    if (logged === undefined) {
      if (!nextUpBlock) nextUpBlock = block;
    } else if (logged) {
      missedThisWeek += 1;
    } else {
      completedThisWeek += 1;
    }
  }

  const frequencyThisWeek = weekBlocks.length;
  const percentCompleteThisWeek =
    frequencyThisWeek === 0 ? 0 : Math.round((completedThisWeek / frequencyThisWeek) * 100);
  const sessionsLeftThisWeek = Math.max(frequencyThisWeek - completedThisWeek - missedThisWeek, 0);

  return {
    weekBlocks,
    frequencyThisWeek,
    completedThisWeek,
    missedThisWeek,
    percentCompleteThisWeek,
    sessionsLeftThisWeek,
    nextUpBlock,
  };
}

export interface HubAllTimeStats {
  sessionsDone: number;
  /** null when there's no logged history at all yet (drives hiding the stat strip). */
  adherencePct: number | null;
  hasHistory: boolean;
}

export function computeAllTimeStats(allLogs: HubWorkoutLog[]): HubAllTimeStats {
  let completed = 0;
  let missed = 0;
  for (const log of allLogs) {
    if (isMissedLog(log.notes)) missed += 1;
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
