import { supabase } from '@/lib/supabase';
import type { ChallengeMovement } from '@/api/challenges';

// Live Tournament challenges (docs/features/LIVE_TOURNAMENT_PLAN.md). Every
// read and write goes through admin RPCs: the tables have no client write
// policies, and rooms are only readable by their players. Each write is
// recorded in admin_audit_log server-side.

export interface LiveHalf {
  duration_sec: number;
  /** `reps` is the max a player can log for that exercise. */
  movements: ChallengeMovement[];
}

export interface AdminLiveChallenge {
  id: string;
  title: string;
  description: string;
  halves: LiveHalf[];
  rest_sec: number;
  team_size: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at: string;
  room_count: number;
  finished_room_count: number;
  live_room_count: number;
  player_count: number;
}

export type LiveRoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface AdminLiveRoom {
  room_id: string;
  status: LiveRoomStatus;
  side_count: number;
  current_half: number;
  host_name: string | null;
  players: Array<{ user_id: string | null; display_name: string | null; side: number | null }>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_activity_at: string;
}

export interface LiveChallengeInput {
  id: string | null;
  title: string;
  description: string;
  halves: LiveHalf[];
  rest_sec: number;
  team_size: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

/** Server error codes the admin can hit, in plain words. */
const ADMIN_ERRORS: Record<string, string> = {
  FORBIDDEN: 'Only admins can do that.',
  NOT_FOUND: 'That challenge no longer exists.',
  INVALID_HALVES:
    'Add 2 or 3 halves. Each needs 1–30 minutes and 1–8 exercises, each with a name, a max of 1–500 reps and 0–1000 points per rep.',
  INVALID_TEAM_SIZE: 'Players per side must be 1–6.',
  INVALID_REST: 'Rest must be 0–600 seconds.',
  INVALID_DATES: 'End date must be after the start date.',
  CHALLENGE_LOCKED:
    'Rooms have already played this challenge, so its halves and players per side can no longer change. Title, description, rest, dates and visibility still can.',
  CHALLENGE_HAS_ROOMS:
    "Rooms have already played this challenge, so deleting it would erase players' history. Hide it instead.",
  ROOM_NOT_ACTIVE: 'That room has already ended.',
};

function toError(error: { message: string }): Error {
  return new Error(ADMIN_ERRORS[error.message] ?? error.message);
}

const num = (v: unknown) => Number(v ?? 0);

export async function fetchLiveChallenges(): Promise<AdminLiveChallenge[]> {
  const { data, error } = await supabase.rpc('admin_get_live_challenges');
  if (error) throw toError(error);
  return ((data ?? []) as AdminLiveChallenge[]).map((c) => ({
    ...c,
    room_count: num(c.room_count),
    finished_room_count: num(c.finished_room_count),
    live_room_count: num(c.live_room_count),
    player_count: num(c.player_count),
  }));
}

export async function fetchLiveRooms(challengeId: string): Promise<AdminLiveRoom[]> {
  const { data, error } = await supabase.rpc('admin_get_live_rooms', { p_challenge_id: challengeId });
  if (error) throw toError(error);
  return (data ?? []) as AdminLiveRoom[];
}

/** Creates (id null) or updates a challenge; returns its id. */
export async function saveLiveChallenge(input: LiveChallengeInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_upsert_live_challenge', {
    p_id: input.id,
    p_title: input.title,
    p_description: input.description,
    p_halves: input.halves,
    p_rest_sec: input.rest_sec,
    p_team_size: input.team_size,
    p_starts_at: input.starts_at,
    p_ends_at: input.ends_at,
    p_is_active: input.is_active,
  });
  if (error) throw toError(error);
  return data as string;
}

/** Only works while no room has been created from the challenge. */
export async function deleteLiveChallenge(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_live_challenge', { p_id: id });
  if (error) throw toError(error);
}

/** Ends a stuck room for everyone in it. An abandoned room keeps no result. */
export async function abandonLiveRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_abandon_live_room', { p_room_id: roomId });
  if (error) throw toError(error);
}
