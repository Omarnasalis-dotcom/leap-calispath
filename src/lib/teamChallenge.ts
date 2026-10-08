// Team Challenge (docs/features/TEAM_CHALLENGE_PLAN.md): types plus pure
// scoring, phase and ranking helpers. The server
// (20261008120000_add_team_challenges.sql) is the source of truth for every
// score; these mirror it so screens can preview results and explain them.
import {
  amrapScore,
  ChallengeMovement,
  clampPartial,
  roundPoints,
  totalReps,
} from './weeklyChallenge';

export type TeamFormat = 'sync' | 'switch' | 'collect';
export type TeamScoringType = 'time' | 'reps';

export interface TeamChallenge {
  id: string;
  title: string;
  description: string;
  format: TeamFormat;
  scoring_type: TeamScoringType;
  movements: ChallengeMovement[];
  /** For Time: passes through the movement list. AMRAP: always 1. */
  rounds: number;
  /** AMRAP duration or For Time cap. */
  time_limit_sec: number;
  team_size: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export interface TeamMember {
  user_id: string | null; // null = deleted account
  display_name: string | null;
  is_leader?: boolean;
  joined_at?: string;
}

export interface TeamAttemptResult {
  user_id: string | null;
  is_team_row: boolean;
  time_sec: number | null;
  rounds: number | null;
  partial: number[] | null;
  capped: boolean;
  score: number;
  entered_by: string | null;
}

export interface TeamAttempt {
  id: string;
  status: 'running' | 'submitted' | 'abandoned';
  started_at: string;
  cap_at: string;
  score: number | null;
  capped: boolean | null;
  submitted_at: string | null;
  results: TeamAttemptResult[];
}

/** get_team_state */
export interface TeamState {
  server_now: string;
  team: {
    id: string;
    name: string;
    invite_code: string;
    leader_id: string | null;
    locked_at: string | null;
    best_score: number | null;
    best_attempt_id: string | null;
    attempts_count: number;
  };
  challenge: TeamChallenge;
  members: TeamMember[];
  attempt: TeamAttempt | null;
}

/** get_team_challenge_board */
export interface TeamBoardRow {
  rank: number;
  team_id: string;
  team_name: string;
  members: TeamMember[];
  best_score: number;
  attempts_count: number;
  best_submitted_at: string;
  is_mine: boolean;
}

/** get_my_teams */
export interface MyTeamRow {
  team_id: string;
  team_name: string;
  challenge_id: string;
  challenge_title: string;
  format: TeamFormat;
  scoring_type: TeamScoringType;
  team_size: number;
  starts_at: string;
  ends_at: string;
  members: TeamMember[];
  is_leader: boolean;
  locked_at: string | null;
  best_score: number | null;
  attempts_count: number;
  rank: number | null;
}

// ── Server constants (keep in sync with the migration) ─────────────────────

export const COUNTDOWN_SEC = 3;
export const SUBMIT_GRACE_SEC = 15 * 60;
export const ATTEMPT_COOLDOWN_SEC = 30;
export const TEAM_NAME_MAX = 24;
export const INVITE_CODE_LENGTH = 6;

// ── Who submits ────────────────────────────────────────────────────────────

/** Sync / Switch: the leader submits for the team. Collect: every member. */
export const leaderSubmits = (format: TeamFormat) => format !== 'collect';

// ── Scoring (mirrors the SQL) ──────────────────────────────────────────────

/** For Time: reps the whole workout needs (rounds × one pass). */
export function requiredReps(challenge: Pick<TeamChallenge, 'movements' | 'rounds'>): number {
  return challenge.rounds * totalReps(challenge.movements);
}

/** Reps done when the cap hit: full rounds + the unfinished one, never above required. */
export function repsDone(
  challenge: Pick<TeamChallenge, 'movements' | 'rounds'>,
  rounds: number,
  partial: number[],
): number {
  const done =
    Math.max(0, Math.floor(rounds)) * totalReps(challenge.movements) +
    clampPartial(challenge.movements, partial).reduce((a, b) => a + b, 0);
  return Math.min(requiredReps(challenge), done);
}

/** Capped For Time score: the cap plus 1 s per missing rep. */
export function cappedTimeScore(
  challenge: Pick<TeamChallenge, 'movements' | 'rounds' | 'time_limit_sec'>,
  rounds: number,
  partial: number[],
): number {
  return challenge.time_limit_sec + (requiredReps(challenge) - repsDone(challenge, rounds, partial));
}

/** Score for a rounds + reps entry: AMRAP points, or capped For Time seconds. */
export function progressScore(challenge: TeamChallenge, rounds: number, partial: number[]): number {
  return challenge.scoring_type === 'time'
    ? cappedTimeScore(challenge, rounds, partial)
    : amrapScore(challenge.movements, rounds, partial);
}

/** Fastest finish the server accepts: 1 s per required rep. */
export function minFinishSec(challenge: Pick<TeamChallenge, 'movements' | 'rounds'>): number {
  return requiredReps(challenge);
}

/** Highest AMRAP score the server accepts per entry: 3 rounds a minute, plus one. */
export function maxAmrapScore(challenge: Pick<TeamChallenge, 'movements' | 'time_limit_sec'>): number {
  return roundPoints(challenge.movements) * ((challenge.time_limit_sec / 60) * 3 + 1);
}

/** Collect: the team score is the sum of every member's score. */
export function collectTotal(results: Pick<TeamAttemptResult, 'score' | 'is_team_row'>[]): number {
  return results.filter(r => !r.is_team_row).reduce((sum, r) => sum + Number(r.score), 0);
}

/** True when `a` beats `b` (a missing `b` is always beaten). */
export function isBetterTeamScore(type: TeamScoringType, a: number, b: number | null | undefined): boolean {
  if (b == null) return true;
  return type === 'time' ? a < b : a > b;
}

/** Best first; ties go to the earlier submission (same as the board RPC). */
export function sortTeamBoard<T extends { best_score: number; best_submitted_at: string }>(
  type: TeamScoringType,
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    if (a.best_score !== b.best_score) {
      return type === 'time' ? a.best_score - b.best_score : b.best_score - a.best_score;
    }
    return a.best_submitted_at.localeCompare(b.best_submitted_at);
  });
}

// ── Attempt phase (from server-anchored time) ──────────────────────────────

export type AttemptPhase =
  | 'countdown' // before started_at: 3-2-1
  | 'running' // the workout clock is going
  | 'scoring' // clock is out; rounds + reps entries are open
  | 'expired' // past the 15-minute grace; the server will abandon it
  | 'submitted'
  | 'abandoned';

/** `nowMs` must be server time (see serverNow / useServerClock). */
export function attemptPhase(attempt: Pick<TeamAttempt, 'status' | 'started_at' | 'cap_at'>, nowMs: number): AttemptPhase {
  if (attempt.status !== 'running') return attempt.status;
  const start = Date.parse(attempt.started_at);
  const cap = Date.parse(attempt.cap_at);
  if (nowMs < start) return 'countdown';
  if (nowMs < cap) return 'running';
  if (nowMs <= cap + SUBMIT_GRACE_SEC * 1000) return 'scoring';
  return 'expired';
}

/** Seconds on the workout clock: elapsed (For Time) or remaining (AMRAP), clamped to the cap. */
export function clockSeconds(
  type: TeamScoringType,
  attempt: Pick<TeamAttempt, 'started_at' | 'cap_at'>,
  nowMs: number,
): number {
  const start = Date.parse(attempt.started_at);
  const cap = Date.parse(attempt.cap_at);
  const elapsed = Math.min(cap - start, Math.max(0, nowMs - start)) / 1000;
  return type === 'time' ? elapsed : (cap - start) / 1000 - elapsed;
}

/** Whole seconds left in the 3-2-1 countdown (0 once started). */
export function countdownLeft(attempt: Pick<TeamAttempt, 'started_at'>, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(attempt.started_at) - nowMs) / 1000));
}

/** Collect: members who still owe a result in this attempt. */
export function membersWithoutResult(members: TeamMember[], attempt: Pick<TeamAttempt, 'results'>): TeamMember[] {
  const done = new Set(attempt.results.filter(r => !r.is_team_row).map(r => r.user_id));
  return members.filter(m => m.user_id != null && !done.has(m.user_id));
}

// ── Server clock ───────────────────────────────────────────────────────────

/**
 * Offset to add to Date.now() to get server time. The server stamped
 * `serverNowIso` somewhere during the request, so the round trip's midpoint
 * is the best local estimate of that instant.
 */
export function serverClockOffset(serverNowIso: string, requestStartMs: number, responseEndMs: number): number {
  const midpoint = requestStartMs + (responseEndMs - requestStartMs) / 2;
  return Date.parse(serverNowIso) - midpoint;
}

export interface ClockSample {
  offsetMs: number;
  roundTripMs: number;
}

/**
 * Keeps the more accurate of two offset samples: the one measured over the
 * shorter round trip. Every poll brings a new sample; taking each one
 * blindly would make the timer jitter by the network delay.
 */
export function betterClockSample(current: ClockSample | null, next: ClockSample): ClockSample {
  return current == null || next.roundTripMs < current.roundTripMs ? next : current;
}

// ── Errors ─────────────────────────────────────────────────────────────────

/** Every code the team RPCs raise (bare RAISE EXCEPTION messages). */
export const TEAM_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_MOVEMENTS',
  'CHALLENGE_LOCKED',
  'CHALLENGE_HAS_TEAMS',
  'INVALID_NAME',
  'CHALLENGE_CLOSED',
  'TOO_MANY_TEAMS',
  'NAME_TAKEN',
  'INVALID_CODE',
  'ALREADY_MEMBER',
  'TEAM_LOCKED',
  'TEAM_FULL',
  'NOT_A_MEMBER',
  'NOT_LEADER',
  'ATTEMPT_RUNNING',
  'TEAM_NOT_FULL',
  'COOLDOWN',
  'ATTEMPT_NOT_RUNNING',
  'ATTEMPT_EXPIRED',
  'WRONG_SCORING',
  'WRONG_FORMAT',
  'NOT_STARTED',
  'CAP_REACHED',
  'TOO_FAST',
  'ALREADY_SUBMITTED',
  'TIME_NOT_UP',
  'INVALID_PROGRESS',
  'SCORE_TOO_HIGH',
] as const;

export type TeamErrorCode = (typeof TEAM_ERROR_CODES)[number];

/** The team error code in a Supabase error, or null for anything else (network, auth…). */
export function teamErrorCode(error: any): TeamErrorCode | null {
  const message = String(error?.message ?? '').trim();
  return (TEAM_ERROR_CODES as readonly string[]).includes(message) ? (message as TeamErrorCode) : null;
}

/** Invite codes are stored upper-case without spaces; accept what people paste. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
