import { getCalendars } from 'expo-localization';
import { supabase } from './supabase';
import { withNetworkRetry } from './submitErrors';

// Journey points — client side of migration 20261004120000_journey_points.sql.
// The server decides every award; the app only asks it to catch up
// (journey_points_sync) and records the self-reported extras.

export type JourneyTask = 'book' | 'run' | 'meal';

export type PointsSource =
  | 'program_day'
  | 'side_quest'
  | 'trial'
  | 'task_book'
  | 'task_run'
  | 'task_meal'
  | 'perfect_day'
  | 'streak';

export interface PointsEntry {
  date: string;
  source: PointsSource;
  /** program_day: day name · task_book/run: chapters/km · streak: session count. */
  label: string | null;
  points: number;
}

export interface TaskTick {
  task: JourneyTask;
  amount: number | null;
  /** Whether its points are in the ledger (always, since extras count at once). */
  paid: boolean;
}

export interface WeekDay {
  date: string;
  points: number;
  trained: boolean;
}

export interface JourneyPointsSummary {
  today: string;
  total: number;
  streak: number;
  best_streak: number;
  trained_today: boolean;
  values: Record<string, number>;
  tasks_today: TaskTick[];
  /** The last 7 days, oldest first, ending today. */
  week: WeekDay[];
  /** Ledger of the last 7 dates with points, newest first. */
  recent: PointsEntry[];
  /** Awarded by the call that returned this summary (drives the reward FX). */
  new_awards: PointsEntry[];
}

/** The device's IANA time zone; the server falls back to UTC if unknown. */
export function deviceTimeZone(): string {
  try {
    const tz = getCalendars()[0]?.timeZone;
    if (tz) return tz;
  } catch {}
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function call(fn: string, args: Record<string, unknown>): Promise<JourneyPointsSummary> {
  return withNetworkRetry(async () => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw error;
    return data as JourneyPointsSummary;
  });
}

/** Pays anything owed (finished days, quests, extras, bonuses). */
export function syncJourneyPoints(dayHasQuest: boolean): Promise<JourneyPointsSummary> {
  return call('journey_points_sync', { p_tz: deviceTimeZone(), p_day_has_quest: dayHasQuest });
}

export function logJourneyTask(task: JourneyTask, amount: number | null, dayHasQuest: boolean): Promise<JourneyPointsSummary> {
  return call('journey_task_log', { p_tz: deviceTimeZone(), p_task: task, p_amount: amount, p_day_has_quest: dayHasQuest });
}

/** Today only — a past day's extras are locked server-side. */
export function undoJourneyTask(task: JourneyTask): Promise<JourneyPointsSummary> {
  return call('journey_task_undo', { p_tz: deviceTimeZone(), p_task: task });
}

/**
 * Today's medallion segments, done or not: program card, side quest (only
 * when today's card has one), book, run, meal. The quest counts only if
 * that exact slot was paid today -- an older quest paid today (catch-up)
 * doesn't. The Today's Tasks sheet and the "+" use the same answer.
 */
export function todaySegments(summary: JourneyPointsSummary, todayQuestSlotKey: string | null): boolean[] {
  const ticked = (task: JourneyTask) => summary.tasks_today.some((t) => t.task === task);
  return [
    summary.trained_today,
    ...(todayQuestSlotKey ? [questPaidToday(summary, todayQuestSlotKey)] : []),
    ticked('book'),
    ticked('run'),
    ticked('meal'),
  ];
}

/**
 * Whether today's quest counts as done: a side quest from the same program
 * week as today's slot (e.g. any "w2_…" for "w2_s1") was paid today — the
 * same rule the server uses for Perfect day, so the medallion and the bonus
 * always agree. An old week's quest caught up today doesn't count.
 */
export function questPaidToday(summary: JourneyPointsSummary, slotKey: string | null): boolean {
  const week = slotKey?.match(/^w\d+_/)?.[0];
  return !!week && summary.recent.some((e) => e.date === summary.today && e.source === 'side_quest' && (e.label ?? '').startsWith(week));
}

/** Points a program day (by name) earned today, or null if none. */
export function programDayPointsToday(summary: JourneyPointsSummary, dayName: string): number | null {
  const name = dayName.trim().toUpperCase();
  const entry = summary.recent.find(
    (e) => e.date === summary.today && e.source === 'program_day' && (e.label ?? '').trim().toUpperCase() === name
  );
  return entry ? entry.points : null;
}

export const MEDALLION_STAGES = ['cold', 'spark', 'kindle', 'blaze', 'roar', 'inferno'] as const;

/** Stage name key for done/total (handoff: round(pct × 5)). */
export function medallionStage(done: number, total: number): (typeof MEDALLION_STAGES)[number] {
  const pct = total > 0 ? done / total : 0;
  return MEDALLION_STAGES[Math.round(pct * 5)];
}

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** journeyPoints.dayLetter key for a local YYYY-MM-DD date. */
export function dayLetterKey(date: string): (typeof WEEKDAY_KEYS)[number] {
  return WEEKDAY_KEYS[new Date(`${date}T12:00:00`).getDay()];
}
