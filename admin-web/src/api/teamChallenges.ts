import { supabase } from '@/lib/supabase';
import type { ChallengeMovement } from '@/api/challenges';

// Team challenges (docs/features/TEAM_CHALLENGE_PLAN.md). Unlike weekly
// challenges, every read and write goes through admin RPCs: the tables have
// no client write policies at all, and teams are only readable by their
// members. Each write is recorded in admin_audit_log server-side.

export type TeamFormat = 'sync' | 'switch' | 'collect';
export type TeamScoringType = 'time' | 'reps';

export interface AdminTeamChallenge {
  id: string;
  title: string;
  description: string;
  format: TeamFormat;
  scoring_type: TeamScoringType;
  movements: ChallengeMovement[];
  rounds: number;
  time_limit_sec: number;
  team_size: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  team_count: number;
  ranked_team_count: number;
  submitted_attempts: number;
  player_count: number;
}

export interface AdminTeamRow {
  team_id: string;
  name: string;
  members: Array<{ user_id: string | null; display_name: string | null; is_leader: boolean }>;
  member_count: number;
  locked_at: string | null;
  best_score: number | null;
  attempts_count: number;
  best_submitted_at: string | null;
  created_at: string;
}

export interface TeamChallengeInput {
  id: string | null;
  title: string;
  description: string;
  format: TeamFormat;
  scoring_type: TeamScoringType;
  movements: ChallengeMovement[];
  rounds: number;
  time_limit_sec: number;
  team_size: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

/** Server error codes the admin can hit, in plain words. */
const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN: 'Only admins can do that.',
  NOT_FOUND: 'That challenge or team no longer exists.',
  INVALID_MOVEMENTS:
    'Each challenge needs 1–12 movements, each with a name, 1–500 reps and 0–1000 points per rep.',
  CHALLENGE_LOCKED:
    'Teams have already joined, so the workout, format, type, rounds, time limit, team size and start date can no longer change. Title, description, end date and visibility still can.',
  CHALLENGE_HAS_TEAMS: 'Teams have joined this challenge. Delete it together with its teams, or hide it instead.',
};

function toError(error: { message: string }): Error {
  return new Error(ADMIN_ERRORS[error.message] ?? error.message);
}

const num = (v: unknown) => Number(v ?? 0);

export async function fetchTeamChallenges(): Promise<AdminTeamChallenge[]> {
  const { data, error } = await supabase.rpc('admin_get_team_challenges');
  if (error) throw toError(error);
  return ((data ?? []) as AdminTeamChallenge[]).map((c) => ({
    ...c,
    team_count: num(c.team_count),
    ranked_team_count: num(c.ranked_team_count),
    submitted_attempts: num(c.submitted_attempts),
    player_count: num(c.player_count),
  }));
}

export async function fetchChallengeTeams(challengeId: string): Promise<AdminTeamRow[]> {
  const { data, error } = await supabase.rpc('admin_get_challenge_teams', {
    p_challenge_id: challengeId,
  });
  if (error) throw toError(error);
  return ((data ?? []) as AdminTeamRow[]).map((t) => ({
    ...t,
    member_count: num(t.member_count),
    best_score: t.best_score == null ? null : Number(t.best_score),
  }));
}

/** Creates (id null) or updates a challenge; returns its id. */
export async function saveTeamChallenge(input: TeamChallengeInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_upsert_team_challenge', {
    p_id: input.id,
    p_title: input.title,
    p_description: input.description,
    p_format: input.format,
    p_scoring_type: input.scoring_type,
    p_movements: input.movements,
    p_rounds: input.rounds,
    p_time_limit_sec: input.time_limit_sec,
    p_team_size: input.team_size,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_is_active: input.is_active,
  });
  if (error) throw toError(error);
  return data as string;
}

/** `includeTeams` also deletes every team, attempt and result in the challenge. */
export async function deleteTeamChallenge(id: string, includeTeams = false): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_team_challenge', {
    p_id: id,
    p_include_teams: includeTeams,
  });
  if (error) throw toError(error);
}

/** Moderation: removes a team and all its results. */
export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_team', { p_team_id: teamId });
  if (error) throw toError(error);
}
