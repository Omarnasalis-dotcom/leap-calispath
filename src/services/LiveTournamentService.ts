import { supabase } from '../lib/supabase';
import { t } from '../i18n';
import { describeSubmitError, withNetworkRetry } from '../lib/submitErrors';
import { normalizeInviteCode, serverClockOffset } from '../lib/teamChallenge';
import {
  LiveChallenge,
  LiveErrorCode,
  liveErrorCode,
  LiveHistoryRow,
  LiveRoomState,
} from '../lib/liveTournament';
import type { TimedResult } from './TeamChallengeService';

/**
 * A failed live call. `code` is the server's error code (ROOM_FULL, …) or
 * null for network/auth failures; `message` is ready to show in EN or AR.
 */
export class LiveTournamentError extends Error {
  code: LiveErrorCode | null;
  cause: unknown;

  constructor(cause: any) {
    const code = liveErrorCode(cause);
    super(code ? t(`live.errors.${code}`) : describeSubmitError(cause, t('submit.networkFailed')));
    this.name = 'LiveTournamentError';
    this.code = code;
    this.cause = cause;
  }
}

// Every call goes through withNetworkRetry (spotty gym signal). The writes
// are safe to repeat: joining a room you're in returns it, and a repeated
// log just saves the same numbers again. Screens refetch getRoomState after
// any error, which shows what actually happened.
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await withNetworkRetry(async () => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return data as T;
    });
  } catch (error) {
    throw new LiveTournamentError(error);
  }
}

/** Runs an RPC whose result carries `server_now` and measures the clock offset. */
async function timedRpc<T>(
  fn: string,
  args: Record<string, unknown>,
  serverNowOf: (data: T) => string,
): Promise<TimedResult<T>> {
  const requestStart = Date.now();
  const data = await rpc<T>(fn, args);
  const responseEnd = Date.now();
  return {
    data,
    clockOffsetMs: serverClockOffset(serverNowOf(data), requestStart, responseEnd),
    roundTripMs: responseEnd - requestStart,
  };
}

const firstRow = <T>(rows: T[] | null): T => {
  if (!rows || rows.length === 0) throw new LiveTournamentError({ message: 'NOT_FOUND' });
  return rows[0];
};

export class LiveTournamentService {
  /** Live challenges open right now, newest first (normally this week's 1–2). */
  static async getOpenChallenges(): Promise<LiveChallenge[]> {
    const now = new Date().toISOString();
    try {
      return await withNetworkRetry(async () => {
        const { data, error } = await supabase
          .from('live_challenges')
          .select('id, title, description, halves, rest_sec, team_size, starts_at, ends_at, is_active')
          .eq('is_active', true)
          .lte('starts_at', now)
          .gt('ends_at', now)
          .order('starts_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as LiveChallenge[];
      });
    } catch (error) {
      throw new LiveTournamentError(error);
    }
  }

  /**
   * ALREADY_IN_ROOM means you're in an unfinished room (possibly this very
   * one, if a retry follows a create that did reach the server): screens
   * should open getMyRoom() instead of showing an error.
   */
  static async createRoom(challengeId: string, sideCount: number): Promise<{ roomId: string; code: string }> {
    const row = firstRow(
      await rpc<{ room_id: string; code: string }[]>('create_live_room', {
        p_challenge_id: challengeId,
        p_side_count: sideCount,
      }),
    );
    return { roomId: row.room_id, code: row.code };
  }

  /** Returns the room id (also when you're already in it). */
  static async joinRoom(code: string): Promise<string> {
    return rpc<string>('join_live_room', { p_code: normalizeInviteCode(code) });
  }

  /** `side` null = back to no side. Always clears Ready. */
  static async pickSide(roomId: string, side: number | null): Promise<void> {
    await rpc<void>('pick_live_side', { p_room_id: roomId, p_side: side });
  }

  static async setReady(roomId: string, ready: boolean): Promise<void> {
    await rpc<void>('set_live_ready', { p_room_id: roomId, p_ready: ready });
  }

  /** Leave the room yourself, or (host) remove `userId`. Lobby only. */
  static async leaveRoom(roomId: string, userId?: string): Promise<void> {
    await rpc<void>('leave_live_room', { p_room_id: roomId, p_user_id: userId ?? null });
  }

  /** Host (or anyone after the fallback delay). The half starts 3 s later. */
  static async startHalf(roomId: string): Promise<
    TimedResult<{ half: number; halfStartedAt: string; halfEndsAt: string }>
  > {
    const timed = await timedRpc<
      { half: number; half_started_at: string; half_ends_at: string; server_now: string }[]
    >('start_live_half', { p_room_id: roomId }, rows => firstRow(rows).server_now);
    const row = firstRow(timed.data);
    return {
      data: { half: Number(row.half), halfStartedAt: row.half_started_at, halfEndsAt: row.half_ends_at },
      clockOffsetMs: timed.clockOffsetMs,
      roundTripMs: timed.roundTripMs,
    };
  }

  /**
   * Logs reps per exercise for `half`: yours (`userId` omitted) or, as host,
   * someone else's. Saving again before logging closes replaces the log.
   */
  static async submitReps(
    roomId: string,
    half: number,
    reps: number[],
    userId?: string,
  ): Promise<{ points: number; halfClosed: boolean }> {
    const row = firstRow(
      await rpc<{ points: number; half_closed: boolean }[]>('submit_live_reps', {
        p_room_id: roomId,
        p_half: half,
        p_user_id: userId ?? null,
        p_reps: reps.map(r => Math.max(0, Math.floor(r))),
      }),
    );
    return { points: Number(row.points), halfClosed: row.half_closed };
  }

  /** Host only. An abandoned room keeps no result. */
  static async abandonRoom(roomId: string): Promise<void> {
    await rpc<void>('abandon_live_room', { p_room_id: roomId });
  }

  static async getRoomState(roomId: string): Promise<TimedResult<LiveRoomState>> {
    const timed = await timedRpc<LiveRoomState>('get_live_room_state', { p_room_id: roomId }, s => s.server_now);
    const s = timed.data;
    return {
      ...timed,
      data: {
        ...s,
        results: (s.results ?? []).map(r => ({ ...r, points: Number(r.points) })),
      },
    };
  }

  /** Your unfinished room, if any (to resume after reopening the app). */
  static async getMyRoom(): Promise<string | null> {
    return (await rpc<string | null>('get_my_live_room')) ?? null;
  }

  static async getHistory(): Promise<LiveHistoryRow[]> {
    const rows = await rpc<LiveHistoryRow[]>('get_my_live_history');
    return (rows ?? []).map(r => ({
      ...r,
      my_points: Number(r.my_points),
      side_points: Number(r.side_points),
      side_place: Number(r.side_place),
      player_count: Number(r.player_count),
    }));
  }
}
