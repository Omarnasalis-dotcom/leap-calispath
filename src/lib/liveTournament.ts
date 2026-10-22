// Live Tournament (docs/features/LIVE_TOURNAMENT_PLAN.md): types plus pure
// phase, scoring and standings helpers. The server
// (20261022120000_add_live_tournament.sql) is the source of truth for every
// score and every phase change; these mirror it so screens can show the
// right step on the shared server clock and preview points before logging.
import { ChallengeMovement } from './weeklyChallenge';

export interface LiveHalf {
  duration_sec: number;
  /** `reps` is the max a player can log for that exercise in this half. */
  movements: ChallengeMovement[];
}

export interface LiveChallenge {
  id: string;
  title: string;
  description: string;
  halves: LiveHalf[];
  rest_sec: number;
  /** Max players per side. */
  team_size: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

export type LiveRoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface LiveRoom {
  id: string;
  code: string;
  status: LiveRoomStatus;
  side_count: number;
  host_id: string | null;
  /** 0 in the lobby, then 1..halves.length. */
  current_half: number;
  half_started_at: string | null;
  half_ends_at: string | null;
  log_closes_at: string | null;
  half_closed_at: string | null;
  anyone_can_start_at: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface LivePlayer {
  user_id: string | null; // null = deleted account
  display_name: string | null;
  side: number | null;
  is_ready: boolean;
  is_host: boolean;
  joined_at: string;
  /** Phone checked in within ONLINE_WINDOW_SEC (from get_live_room_state). */
  online?: boolean;
  last_seen_at?: string | null;
}

export interface LiveResult {
  half: number;
  user_id: string | null;
  side: number;
  reps: number[];
  points: number;
  entered_by: string | null;
  entered_at: string;
}

/** get_live_room_state */
export interface LiveRoomState {
  server_now: string;
  room: LiveRoom;
  challenge: Pick<LiveChallenge, 'id' | 'title' | 'description' | 'halves' | 'rest_sec' | 'team_size'>;
  players: LivePlayer[];
  /** Team name per side, keyed "1".."4" (sides without one are missing). */
  side_names: Record<string, string>;
  /** Who has logged the current half (their numbers stay hidden until logging closes). */
  logged: (string | null)[];
  /** Every log the caller may see: closed halves, plus their own for the open one. */
  results: LiveResult[];
}

/** get_my_live_history */
export interface LiveHistoryRow {
  room_id: string;
  challenge_id: string;
  challenge_title: string;
  finished_at: string;
  side_count: number;
  halves_played: number;
  my_side: number;
  my_points: number;
  side_points: number;
  /** 1 = won; tied sides share a place. */
  side_place: number;
  is_best_player: boolean;
  player_count: number;
  my_side_name: string | null;
}

// ── Server constants (keep in sync with the migration) ─────────────────────

/** Countdown before each half: long enough to open a locked phone from the notification. */
export const COUNTDOWN_SEC = 5;
/** A player counts as online when their phone checked in within this. */
export const ONLINE_WINDOW_SEC = 15;
/** In the lobby, a host gone this long hands the host role to the next player who is here. */
export const LOBBY_HOST_HANDOVER_SEC = 120;
/** Logging closes this long after a half's timer ends (or when everyone logged). */
export const LOG_WINDOW_SEC = 120;
/** After logging closes, anyone in the room can start the next half after this. */
export const HOST_FALLBACK_SEC = 180;
/** Network allowance: logging opens this much before the timer ends. */
export const LOG_EARLY_SEC = 2;
export const MIN_SIDES = 2;
export const MAX_SIDES = 4;
export const ROOM_CODE_LENGTH = 6;
export const SIDE_NAME_MAX = 24;

/** Side 1..4 → A..D (the same letter in English and Arabic screens). */
export const sideLetter = (side: number) => String.fromCharCode(64 + side);

/** The side's team name, or null while it has none. */
export function sideNameOf(names: Record<string, string> | null | undefined, side: number): string | null {
  const name = names?.[String(side)]?.trim();
  return name ? name : null;
}

// ── Scoring (mirrors live_reps_points) ─────────────────────────────────────

/** Each value as a whole number within 0..that exercise's max (what the server accepts). */
export function clampReps(movements: ChallengeMovement[], reps: number[]): number[] {
  return movements.map((m, i) => {
    const v = Math.floor(Number(reps[i]) || 0);
    return Math.max(0, Math.min(m.reps, v));
  });
}

/** Points for one player's log: sum of reps × points per rep. */
export function halfPoints(movements: ChallengeMovement[], reps: number[]): number {
  return clampReps(movements, reps).reduce((sum, r, i) => sum + r * movements[i].points, 0);
}

/** Most points one player can score in a half (every exercise at its max). */
export function maxHalfPoints(movements: ChallengeMovement[]): number {
  return movements.reduce((sum, m) => sum + m.reps * m.points, 0);
}

// ── Phase (from server-anchored time) ──────────────────────────────────────

export type LivePhase =
  | 'lobby'
  | 'countdown' // 3-2-1 before the half
  | 'running' // the half's timer is going
  | 'logging' // timer is out; players log their reps
  | 'rest' // logging closed; standings + cool-down until the next half
  | 'finished'
  | 'abandoned';

/**
 * The room's step at `nowMs` (server time, see useServerClock). Logging
 * counts as closed once its deadline passes even if the server hasn't
 * recorded it yet (it does on the next call); after the last half that
 * means 'finished'.
 */
export function livePhase(room: LiveRoom, halfCount: number, nowMs: number): LivePhase {
  if (room.status === 'lobby' || room.status === 'abandoned' || room.status === 'finished') return room.status;
  const start = Date.parse(room.half_started_at ?? '');
  const end = Date.parse(room.half_ends_at ?? '');
  const logCloses = Date.parse(room.log_closes_at ?? '');
  const closed = room.half_closed_at != null || nowMs >= logCloses;
  if (!closed) {
    if (nowMs < start) return 'countdown';
    if (nowMs < end) return 'running';
    return 'logging';
  }
  return room.current_half >= halfCount ? 'finished' : 'rest';
}

/** Whole seconds left in the 3-2-1 (0 once the half started). */
export function countdownLeft(room: Pick<LiveRoom, 'half_started_at'>, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(room.half_started_at ?? '') - nowMs) / 1000));
}

/** Seconds left on the half's timer, clamped to 0..duration. */
export function halfSecondsLeft(room: Pick<LiveRoom, 'half_started_at' | 'half_ends_at'>, nowMs: number): number {
  const start = Date.parse(room.half_started_at ?? '');
  const end = Date.parse(room.half_ends_at ?? '');
  return Math.max(0, Math.min(end - start, end - nowMs)) / 1000;
}

/** Seconds left to log (0 when closed). */
export function logSecondsLeft(room: Pick<LiveRoom, 'log_closes_at' | 'half_closed_at'>, nowMs: number): number {
  if (room.half_closed_at != null) return 0;
  return Math.max(0, (Date.parse(room.log_closes_at ?? '') - nowMs) / 1000);
}

/** When logging closed (recorded, or the deadline once it passed); null while open. */
export function closedAtMs(room: Pick<LiveRoom, 'log_closes_at' | 'half_closed_at'>, nowMs: number): number | null {
  if (room.half_closed_at != null) return Date.parse(room.half_closed_at);
  const deadline = Date.parse(room.log_closes_at ?? '');
  return nowMs >= deadline ? deadline : null;
}

/** Cool-down seconds left between halves. Only a guide: the host can start any time. */
export function restSecondsLeft(
  room: Pick<LiveRoom, 'log_closes_at' | 'half_closed_at'>,
  restSec: number,
  nowMs: number,
): number {
  const closed = closedAtMs(room, nowMs);
  if (closed == null) return restSec;
  return Math.max(0, (closed + restSec * 1000 - nowMs) / 1000);
}

/** True when `userId` may start the next half now (mirrors start_live_half). */
export function canStartNextHalf(
  room: LiveRoom,
  halfCount: number,
  userId: string | null | undefined,
  nowMs: number,
): boolean {
  if (userId == null || livePhase(room, halfCount, nowMs) !== 'rest') return false;
  if (userId === room.host_id) return true;
  const closed = closedAtMs(room, nowMs);
  return closed != null && nowMs >= closed + HOST_FALLBACK_SEC * 1000;
}

/** Players with a side whose phone isn't checking in (shown grey; the host is warned before Start). */
export function offlinePlayers(players: LivePlayer[]): LivePlayer[] {
  return players.filter(p => p.user_id != null && p.side != null && p.online === false);
}

// ── Lobby (mirrors start_live_half's checks) ───────────────────────────────

export type LobbyBlocker = 'need_two_players' | 'no_side' | 'not_ready' | 'uneven' | 'unnamed';

export interface LobbyStatus {
  /** Players on each side, index 0 = side A. */
  sideCounts: number[];
  /** First reason the host can't start, or null when they can. */
  blocker: LobbyBlocker | null;
}

export function lobbyStatus(players: LivePlayer[], sideCount: number, sideNames: Record<string, string> = {}): LobbyStatus {
  const real = players.filter(p => p.user_id != null);
  const sideCounts = Array.from({ length: sideCount }, (_, i) => real.filter(p => p.side === i + 1).length);
  let blocker: LobbyBlocker | null = null;
  if (real.length < 2) blocker = 'need_two_players';
  else if (real.some(p => p.side == null)) blocker = 'no_side';
  else if (real.some(p => !p.is_ready)) blocker = 'not_ready';
  else if (sideCounts.some(n => n === 0 || n !== sideCounts[0])) blocker = 'uneven';
  else if (sideCounts.some((_, i) => sideNameOf(sideNames, i + 1) == null)) blocker = 'unnamed';
  return { sideCounts, blocker };
}

/** True when `side` (1-based) has room for one more (yourself excluded). */
export function sideHasRoom(players: LivePlayer[], side: number, teamSize: number, userId?: string | null): boolean {
  return players.filter(p => p.user_id != null && p.side === side && p.user_id !== userId).length < teamSize;
}

// ── Standings ──────────────────────────────────────────────────────────────

export interface SideStanding {
  side: number;
  /** Points per half, index 0 = half 1 (halves not yet visible are 0). */
  perHalf: number[];
  total: number;
  /** 1 = first; tied sides share a place (SQL rank()). */
  place: number;
}

/** Side totals over the logs given, ranked best first (ties keep side order). */
export function sideStandings(results: LiveResult[], sideCount: number, halfCount: number): SideStanding[] {
  const rows = Array.from({ length: sideCount }, (_, i) => {
    const side = i + 1;
    const perHalf = Array.from({ length: halfCount }, (_, h) =>
      results.filter(r => r.side === side && r.half === h + 1).reduce((s, r) => s + Number(r.points), 0),
    );
    return { side, perHalf, total: perHalf.reduce((a, b) => a + b, 0), place: 0 };
  });
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.side - b.side);
  sorted.forEach((row, i) => {
    row.place = i > 0 && row.total === sorted[i - 1].total ? sorted[i - 1].place : i + 1;
  });
  return sorted;
}

export interface PlayerTotal {
  user_id: string;
  side: number;
  total: number;
  /** Latest first-log time across halves (the best-player tie-break). */
  lastLoggedAt: string;
}

/** Each player's points over the logs given, most first. */
export function playerTotals(results: LiveResult[]): PlayerTotal[] {
  const byUser = new Map<string, PlayerTotal>();
  for (const r of results) {
    if (r.user_id == null) continue;
    const row = byUser.get(r.user_id) ?? { user_id: r.user_id, side: r.side, total: 0, lastLoggedAt: r.entered_at };
    row.total += Number(r.points);
    if (r.entered_at > row.lastLoggedAt) row.lastLoggedAt = r.entered_at;
    byUser.set(r.user_id, row);
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total || a.lastLoggedAt.localeCompare(b.lastLoggedAt));
}

/** Most points in the room; a tie goes to whoever's last log came first (same as the history RPC). */
export function bestPlayer(results: LiveResult[]): PlayerTotal | null {
  return playerTotals(results)[0] ?? null;
}

// ── Rep counter during a half (private to the phone) ───────────────────────

/** Adds `delta` (negative to undo) to exercise `i`, kept within 0..its max. */
export function bumpTally(movements: ChallengeMovement[], tally: number[], i: number, delta: number): number[] {
  return movements.map((m, j) => {
    const v = Math.floor(Number(tally[j]) || 0);
    return Math.max(0, Math.min(m.reps, j === i ? v + delta : v));
  });
}

// ── Final celebration timeline (seconds on one clock) ──────────────────────

export interface CelebrationTimes {
  /** When standings row `index` (0 = winner) appears: last place first. */
  rowAt: (index: number) => number;
  /** Winner banner + confetti. */
  win: number;
  /** Best player card. */
  best: number;
  /** Everything settled: the table and Done show. */
  end: number;
}

export function celebrationTimes(sideCount: number): CelebrationTimes {
  const ROW_START = 0.4;
  const ROW_GAP = 0.65;
  const rowAt = (index: number) => ROW_START + (sideCount - 1 - index) * ROW_GAP;
  const win = ROW_START + (sideCount - 1) * ROW_GAP + 0.75;
  const best = win + 1.4;
  return { rowAt, win, best, end: best + 0.9 };
}

/** Players with a side who haven't logged the current half yet. */
export function playersNotLogged(players: LivePlayer[], logged: (string | null)[]): LivePlayer[] {
  const done = new Set(logged);
  return players.filter(p => p.user_id != null && p.side != null && !done.has(p.user_id));
}

// ── Errors ─────────────────────────────────────────────────────────────────

/** Every code the live RPCs raise (bare RAISE EXCEPTION messages). */
export const LIVE_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'INVALID_HALVES',
  'INVALID_TEAM_SIZE',
  'INVALID_REST',
  'INVALID_DATES',
  'CHALLENGE_LOCKED',
  'CHALLENGE_HAS_ROOMS',
  'CHALLENGE_CLOSED',
  'INVALID_SIDES',
  'ALREADY_IN_ROOM',
  'INVALID_CODE',
  'ROOM_STARTED',
  'ROOM_FULL',
  'ROOM_NOT_ACTIVE',
  'NOT_IN_ROOM',
  'INVALID_SIDE',
  'SIDE_FULL',
  'PICK_SIDE_FIRST',
  'NOT_HOST',
  'PLAYERS_NOT_READY',
  'SIDES_UNEVEN',
  'HALF_NOT_DONE',
  'MATCH_OVER',
  'WRONG_HALF',
  'LOGGING_CLOSED',
  'TIME_NOT_UP',
  'INVALID_REPS',
  'INVALID_NAME',
  'NAME_TAKEN',
  'SIDES_UNNAMED',
] as const;

export type LiveErrorCode = (typeof LIVE_ERROR_CODES)[number];

/** The live error code in a Supabase error, or null for anything else (network, auth…). */
export function liveErrorCode(error: any): LiveErrorCode | null {
  const message = String(error?.message ?? '').trim();
  return (LIVE_ERROR_CODES as readonly string[]).includes(message) ? (message as LiveErrorCode) : null;
}
