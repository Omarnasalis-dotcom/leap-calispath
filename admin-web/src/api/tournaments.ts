import { supabase } from '@/lib/supabase';
import type {
  InviteCodeRow,
  TournamentConfigRow,
  TournamentSessionRow,
} from '@/shared/types';

// Read-only in v1 — writes stay on the mobile AdminTournamentScreen.

export async function fetchTournamentConfigs(): Promise<TournamentConfigRow[]> {
  const { data, error } = await supabase
    .from('tournament_configs')
    .select('id, title, type, payout_gp, bracket_size, min_participants, allowed_tiers, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentConfigRow[];
}

export async function fetchTournamentSessions(): Promise<TournamentSessionRow[]> {
  const { data, error } = await supabase
    .from('tournament_sessions')
    .select('id, config_id, status, current_round, start_time, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentSessionRow[];
}

export async function fetchInviteCodes(): Promise<InviteCodeRow[]> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as InviteCodeRow[];
}
