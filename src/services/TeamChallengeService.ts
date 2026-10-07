import { supabase } from '../lib/supabase';
import { t } from '../i18n';
import { describeSubmitError, withNetworkRetry } from '../lib/submitErrors';
import {
  MyTeamRow,
  normalizeInviteCode,
  serverClockOffset,
  TeamBoardRow,
  TeamChallenge,
  TeamErrorCode,
  teamErrorCode,
  TeamState,
} from '../lib/teamChallenge';

/**
 * A failed team call. `code` is the server's error code (TEAM_FULL, …) or
 * null for network/auth failures; `message` is ready to show in EN or AR.
 */
export class TeamChallengeError extends Error {
  code: TeamErrorCode | null;
  cause: unknown;

  constructor(cause: any) {
    const code = teamErrorCode(cause);
    super(code ? t(`team.errors.${code}`) : describeSubmitError(cause, t('submit.networkFailed')));
    this.name = 'TeamChallengeError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Server state plus the offset to add to Date.now() to get server time, and
 * the round trip it was measured over (shorter = more accurate).
 */
export interface TimedResult<T> {
  data: T;
  clockOffsetMs: number;
  roundTripMs: number;
}

// Every call goes through withNetworkRetry (spotty gym signal). A retry after
// a request that did reach the server comes back as ALREADY_SUBMITTED /
// ATTEMPT_RUNNING / NAME_TAKEN; screens refetch getTeamState after any
// error, which shows what actually happened.
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await withNetworkRetry(async () => {
      const { data, error } = await supabase.rpc(fn, args);
      if (error) throw error;
      return data as T;
    });
  } catch (error) {
    throw new TeamChallengeError(error);
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
  if (!rows || rows.length === 0) throw new TeamChallengeError({ message: 'NOT_FOUND' });
  return rows[0];
};

export class TeamChallengeService {
  /** Challenges open right now, newest first (normally just this week's). */
  static async getOpenChallenges(): Promise<TeamChallenge[]> {
    const now = new Date().toISOString();
    try {
      return await withNetworkRetry(async () => {
        const { data, error } = await supabase
          .from('team_challenges')
          .select('id, title, description, format, scoring_type, movements, rounds, time_limit_sec, team_size, starts_at, ends_at, is_active')
          .eq('is_active', true)
          .lte('starts_at', now)
          .gt('ends_at', now)
          .order('starts_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as TeamChallenge[];
      });
    } catch (error) {
      throw new TeamChallengeError(error);
    }
  }

  static async createTeam(challengeId: string, name: string): Promise<{ teamId: string; inviteCode: string }> {
    const rows = await rpc<{ team_id: string; invite_code: string }[]>('create_team', {
      p_challenge_id: challengeId,
      p_name: name.trim(),
    });
    const row = firstRow(rows);
    return { teamId: row.team_id, inviteCode: row.invite_code };
  }

  /** Returns the joined team's id. */
  static async joinTeam(code: string): Promise<string> {
    return rpc<string>('join_team', { p_code: normalizeInviteCode(code) });
  }

  /** Leave the team yourself, or (leader) remove `userId`. */
  static async leaveTeam(teamId: string, userId?: string): Promise<void> {
    await rpc<void>('leave_team', { p_team_id: teamId, p_user_id: userId ?? null });
  }

  static async getTeamState(teamId: string): Promise<TimedResult<TeamState>> {
    return timedRpc<TeamState>('get_team_state', { p_team_id: teamId }, s => s.server_now);
  }

  /** Leader only. The attempt starts 3 s later (3-2-1 on every phone). */
  static async startAttempt(teamId: string): Promise<
    TimedResult<{ attemptId: string; startedAt: string; capAt: string }>
  > {
    const timed = await timedRpc<
      { attempt_id: string; started_at: string; cap_at: string; server_now: string }[]
    >('start_team_attempt', { p_team_id: teamId }, rows => firstRow(rows).server_now);
    const row = firstRow(timed.data);
    return {
      data: { attemptId: row.attempt_id, startedAt: row.started_at, capAt: row.cap_at },
      clockOffsetMs: timed.clockOffsetMs,
      roundTripMs: timed.roundTripMs,
    };
  }

  /**
   * For Time finish, timed by the server. `userId` omitted = the whole team
   * (Sync/Switch leader); otherwise that member (Collect: yourself, or the
   * leader for someone else).
   */
  static async finish(attemptId: string, userId?: string): Promise<{ timeSec: number; attemptSubmitted: boolean }> {
    const row = firstRow(
      await rpc<{ time_sec: number; attempt_submitted: boolean }[]>('finish_team_attempt', {
        p_attempt_id: attemptId,
        p_user_id: userId ?? null,
      }),
    );
    return { timeSec: Number(row.time_sec), attemptSubmitted: row.attempt_submitted };
  }

  /**
   * Rounds + reps per movement in the unfinished round: AMRAP results, or
   * how far a capped For Time got. `userId` null = the whole team (leader).
   */
  static async submitProgress(
    attemptId: string,
    userId: string | null,
    rounds: number,
    partial: number[],
  ): Promise<{ score: number; attemptSubmitted: boolean }> {
    const row = firstRow(
      await rpc<{ score: number; attempt_submitted: boolean }[]>('submit_team_progress', {
        p_attempt_id: attemptId,
        p_user_id: userId,
        p_rounds: Math.max(0, Math.floor(rounds)),
        p_partial: partial.map(r => Math.max(0, Math.floor(r))),
      }),
    );
    return { score: Number(row.score), attemptSubmitted: row.attempt_submitted };
  }

  /** Leader only. */
  static async abandonAttempt(attemptId: string): Promise<void> {
    await rpc<void>('abandon_team_attempt', { p_attempt_id: attemptId });
  }

  static async getBoard(challengeId: string): Promise<TeamBoardRow[]> {
    const rows = await rpc<TeamBoardRow[]>('get_team_challenge_board', { p_challenge_id: challengeId });
    return (rows ?? []).map(r => ({ ...r, rank: Number(r.rank), best_score: Number(r.best_score) }));
  }

  static async getMyTeams(): Promise<MyTeamRow[]> {
    const rows = await rpc<MyTeamRow[]>('get_my_teams');
    return (rows ?? []).map(r => ({
      ...r,
      rank: r.rank == null ? null : Number(r.rank),
      best_score: r.best_score == null ? null : Number(r.best_score),
    }));
  }
}
