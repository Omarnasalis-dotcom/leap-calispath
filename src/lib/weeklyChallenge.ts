export interface ChallengeMovement {
  name: string;
  reps: number;
  points: number;
}

export interface WeeklyChallenge {
  id: string;
  week_start: string;
  group_id: 1 | 2 | 3;
  title: string;
  description: string;
  scoring_type: 'time' | 'reps';
  movements: ChallengeMovement[];
  time_limit?: number; // in minutes, for reps-based challenges
  is_active: boolean;
}

export interface WeeklyEntry {
  id: string;
  challenge_id: string;
  user_id: string;
  display_name: string;
  score: number;
  rank: number;
  is_current_user: boolean;
}

export const MOVEMENT_POINTS: Record<string, number> = {
  'Knee Push-ups': 1,
  'Bench Dips': 1,
  'Squats': 4,
  'Squat Jumps': 4,
  'Hanging Knee Raises': 4,
  'Box Jumps': 4,
  'Inverted Rows': 4,
  'Burpees': 5,
  'Push-ups': 5,
  'Straight Bar Dip': 5,
  'Banded Pull-ups': 5,
  'Jump Muscle-ups': 5,
  'Toes to Bar': 5,
  'Deadlift': 5,
  'Pike Push-ups': 5,
  'Lunges': 6,
  'Dips': 7,
  'Pull-ups': 10,
  'Pistol Squats': 10,
  'Handstand Push-ups': 10,
  'Muscle-ups': 15,
  '1PU + 1MU + 1SBD (UNBROKEN)': 30,
  '5MU + 5PU (UNBROKEN)': 80,
  '5PU + 5MU (UNBROKEN)': 110,
};

export const GROUP_NAMES = {
  1: { name: 'RECRUITS', tiers: '0-2', color: '#CD7F32' },
  2: { name: 'WARRIORS', tiers: '3-6', color: '#C0C0C0' },
  3: { name: 'LEGENDS', tiers: '7-9', color: '#FFD700' },
};

// Must match the server's CASE in get_weekly_challenge_target_users /
// get_weekly_challenge_users_without_entry and tier_in_group.
export function getUserGroup(strengthTier: number): 1 | 2 | 3 {
  if (strengthTier <= 2) return 1;
  if (strengthTier <= 6) return 2;
  return 3;
}

export function getCurrentWeekStart(): string {
  const now = new Date();
  // Use UTC to match Supabase's UTC-stored week_start dates and ChallengeService.
  const day = now.getUTCDay(); // 0 (Sun) to 6 (Sat)
  const daysBack = (day + 1) % 7;
  const saturday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysBack
  ));
  const year = saturday.getUTCFullYear();
  const month = String(saturday.getUTCMonth() + 1).padStart(2, '0');
  const date = String(saturday.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

// Data-fetching functions removed — all challenge operations go through
// ChallengeService (src/services/ChallengeService.ts) which is the single
// authoritative API. Only pure data constants and helpers remain here.

// ── Weekly Challenge v1 (assets/design_handoff_weekly_challenge) ──────────
// Pure scoring, ranking and week helpers for the redesigned screen. Scores
// are what submit_weekly_score stores: seconds for 'time' (lower is better),
// points for 'reps' / AMRAP (higher is better).

export type ScoringType = WeeklyChallenge['scoring_type'];

export interface BoardEntry {
  user_id: string;
  score: number;
  /** ISO timestamp; breaks ties (earlier ranks first), same as the old list order. */
  submitted_at: string;
}

/** Owner decision: the hero card's level line comes from the group. */
export const GROUP_LEVEL: Record<1 | 2 | 3, 'beginner' | 'intermediate' | 'advanced'> = {
  1: 'beginner',
  2: 'intermediate',
  3: 'advanced',
};

export const isTimeScoring = (type: ScoringType) => type === 'time';

/** True when score `a` beats score `b` (a missing `b` is always beaten). */
export function isBetterScore(type: ScoringType, a: number, b: number | null | undefined): boolean {
  if (b == null) return true;
  return isTimeScoring(type) ? a < b : a > b;
}

/** Points for one full AMRAP round: Σ reps × points per rep. */
export function roundPoints(movements: ChallengeMovement[]): number {
  return movements.reduce((sum, m) => sum + m.reps * m.points, 0);
}

export function totalReps(movements: ChallengeMovement[]): number {
  return movements.reduce((sum, m) => sum + m.reps, 0);
}

/** Reps done in the unfinished round, each clamped to 0…that movement's reps. */
export function clampPartial(movements: ChallengeMovement[], partial: number[]): number[] {
  return movements.map((m, i) => Math.max(0, Math.min(m.reps, Math.floor(partial[i] ?? 0))));
}

export function partialPoints(movements: ChallengeMovement[], partial: number[]): number {
  return clampPartial(movements, partial).reduce((sum, reps, i) => sum + reps * movements[i].points, 0);
}

/** AMRAP score = full rounds × round points + points from the unfinished round. */
export function amrapScore(movements: ChallengeMovement[], fullRounds: number, partial: number[]): number {
  return Math.max(0, Math.floor(fullRounds)) * roundPoints(movements) + partialPoints(movements, partial);
}

/** Best first; ties go to the earlier submission. */
export function sortBoard<T extends BoardEntry>(type: ScoringType, entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.score !== b.score) return isTimeScoring(type) ? a.score - b.score : b.score - a.score;
    return a.submitted_at.localeCompare(b.submitted_at);
  });
}

/**
 * Where `score` would place if `userId` submitted it now: the user's own
 * entry is replaced, and a new submission goes after anyone already on the
 * same score. Returns the 1-based rank and the size of that board.
 */
export function projectedRank(
  type: ScoringType,
  entries: BoardEntry[],
  userId: string,
  score: number,
): { rank: number; count: number; leader: number } {
  const others = entries.filter(e => e.user_id !== userId);
  const ahead = others.filter(e => (isTimeScoring(type) ? e.score <= score : e.score >= score)).length;
  const leader = others.reduce(
    (best, e) => (isBetterScore(type, e.score, best) ? e.score : best),
    score,
  );
  return { rank: ahead + 1, count: others.length + 1, leader };
}

/** Distance to the leader, always ≥ 0 (seconds behind, or points short). */
export function gapToLeader(type: ScoringType, leader: number, score: number): number {
  return Math.max(0, isTimeScoring(type) ? score - leader : leader - score);
}

/** M:SS from whole seconds (fractions are floored). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' → UTC midnight of that day. */
export function parseWeekStart(weekStart: string): Date {
  const [y, m, d] = weekStart.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Last day of the week (the Friday), for the "SEP 26 – OCT 2" range. */
export function weekEndDate(weekStart: string): Date {
  return new Date(parseWeekStart(weekStart).getTime() + 6 * DAY_MS);
}

/** The week closes at the next Saturday 00:00 UTC — when submit_weekly_score stops accepting it. */
export function weekClosesAt(weekStart: string): Date {
  return new Date(parseWeekStart(weekStart).getTime() + 7 * DAY_MS);
}

/** Time left until the week closes, split for "3D 14H" / "14H 20M". */
export function timeUntilClose(weekStart: string, now: Date = new Date()): { days: number; hours: number; minutes: number } {
  const ms = Math.max(0, weekClosesAt(weekStart).getTime() - now.getTime());
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
}

/** ISO-8601 week number of the week's Saturday — the hero card's ghost number. */
export function isoWeekNumber(weekStart: string): number {
  const d = parseWeekStart(weekStart);
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  const thursday = new Date(d.getTime() + (4 - day) * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
}
