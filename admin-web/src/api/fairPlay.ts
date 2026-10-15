import { supabase } from '@/lib/supabase';

// Fair Play (docs/features/FAIR_PLAY_MODERATION_PLAN.md). Flags, holds and
// appeals are admin-readable tables; every action goes through a SECURITY
// DEFINER RPC that checks is_admin and writes admin_audit_log. Limits and
// settings are edited directly (admin-only UPDATE policies).

export type FairPlayArea = 'strength' | 'static' | 'endurance' | 'power' | 'weekly';
export type HoldScope = 'all' | FairPlayArea;

export interface FairPlayFlag {
  id: number;
  user_id: string;
  area: FairPlayArea;
  source_table: string;
  source_id: string;
  movement_id: string | null;
  value: number | null;
  rule: 'absolute' | 'jump' | 'burst' | 'floor_margin' | 'weekly_outlier';
  severity: 'flag' | 'strong';
  detail: Record<string, unknown>;
  status: 'open' | 'dismissed' | 'actioned' | 'reset';
  created_at: string;
  profiles?: { display_name: string | null } | null;
}

export interface LeaderboardHold {
  id: number;
  user_id: string;
  scope: HoldScope;
  reason: 'fair_play' | 'inactive';
  status: 'active' | 'lifted' | 'permanent';
  counts_as_strike: boolean;
  flag_ids: number[];
  admin_note: string | null;
  created_at: string;
  acknowledged_at: string | null;
  lifted_at: string | null;
  lifted_reason: string | null;
  profiles?: { display_name: string | null } | null;
}

export interface FairPlayAppeal {
  id: number;
  hold_id: number;
  user_id: string;
  message: string;
  status: 'pending' | 'accepted' | 'rejected';
  admin_reply: string | null;
  created_at: string;
  decided_at: string | null;
  profiles?: { display_name: string | null } | null;
  leaderboard_holds?: LeaderboardHold | null;
}

export interface FairPlayLimit {
  area: 'static' | 'endurance' | 'power';
  movement_id: string;
  kind: 'abs' | 'ceiling_fraction' | 'bw_ratio';
  flag_value: number;
  strong_value: number;
  flag_kg: number | null;
  strong_kg: number | null;
}

export interface InactiveAthlete {
  user_id: string;
  display_name: string | null;
  last_active: string;
  days_inactive: number;
}

const NAME = 'profiles!user_id(display_name)';

export async function fetchOpenFlags(): Promise<FairPlayFlag[]> {
  const { data, error } = await supabase
    .from('fair_play_flags')
    .select(`*, ${NAME}`)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as FairPlayFlag[];
}

export async function fetchActiveHolds(): Promise<LeaderboardHold[]> {
  const { data, error } = await supabase
    .from('leaderboard_holds')
    .select(`*, ${NAME}`)
    .in('status', ['active', 'permanent'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardHold[];
}

export async function fetchAthleteFairPlay(userId: string): Promise<{ flags: FairPlayFlag[]; holds: LeaderboardHold[]; appeals: FairPlayAppeal[] }> {
  const [flags, holds, appeals] = await Promise.all([
    supabase.from('fair_play_flags').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('leaderboard_holds').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('fair_play_appeals').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  for (const r of [flags, holds, appeals]) if (r.error) throw new Error(r.error.message);
  return {
    flags: (flags.data ?? []) as FairPlayFlag[],
    holds: (holds.data ?? []) as LeaderboardHold[],
    appeals: (appeals.data ?? []) as FairPlayAppeal[],
  };
}

export async function fetchPendingAppeals(): Promise<FairPlayAppeal[]> {
  const { data, error } = await supabase
    .from('fair_play_appeals')
    .select(`*, ${NAME}, leaderboard_holds(*)`)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FairPlayAppeal[];
}

export async function fetchFlagsByIds(ids: number[]): Promise<FairPlayFlag[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from('fair_play_flags').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as FairPlayFlag[];
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const dismissFlags = (flagIds: number[], note?: string) =>
  rpc<number>('admin_fair_play_dismiss', { p_flag_ids: flagIds, p_note: note || null });

export const holdAthlete = (p: { userId: string; scope: HoldScope; flagIds: number[]; strike: boolean; permanent: boolean; note?: string }) =>
  rpc<number>('admin_fair_play_hold', {
    p_user: p.userId, p_scope: p.scope, p_flag_ids: p.flagIds, p_counts_as_strike: p.strike, p_permanent: p.permanent, p_note: p.note || null,
  });

export const liftHold = (holdId: number, note?: string) =>
  rpc<void>('admin_fair_play_lift', { p_hold_id: holdId, p_note: note || null });

export const decideAppeal = (appealId: number, accept: boolean, reply?: string) =>
  rpc<void>('admin_fair_play_decide_appeal', { p_appeal_id: appealId, p_accept: accept, p_reply: reply || null });

export const fetchInactiveAthletes = () => rpc<InactiveAthlete[]>('admin_inactive_athletes', {});

export const hideInactive = (userId: string, note?: string) =>
  rpc<number>('admin_hide_inactive', { p_user: userId, p_note: note || null });

export async function fetchLimits(): Promise<FairPlayLimit[]> {
  const { data, error } = await supabase.from('fair_play_limits').select('*').order('area').order('movement_id');
  if (error) throw new Error(error.message);
  return (data ?? []) as FairPlayLimit[];
}

export async function updateLimit(area: string, movementId: string, patch: Partial<Pick<FairPlayLimit, 'flag_value' | 'strong_value' | 'flag_kg' | 'strong_kg'>>): Promise<void> {
  const { error } = await supabase
    .from('fair_play_limits')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('area', area)
    .eq('movement_id', movementId);
  if (error) throw new Error(error.message);
}

export async function fetchSettings(): Promise<{ key: string; value: number }[]> {
  const { data, error } = await supabase.from('fair_play_settings').select('key, value').order('key');
  if (error) throw new Error(error.message);
  return (data ?? []) as { key: string; value: number }[];
}

export async function updateSetting(key: string, value: number): Promise<void> {
  const { error } = await supabase.from('fair_play_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) throw new Error(error.message);
}

// ── Display helpers ─────────────────────────────────────────────────────────

export const RULE_LABEL: Record<FairPlayFlag['rule'], string> = {
  absolute: 'Above the limit',
  jump: 'Big jump over own best',
  burst: 'Many results in an hour',
  floor_margin: 'Near the trial minimum',
  weekly_outlier: 'Far from the challenge median',
};

export const AREA_LABEL: Record<HoldScope, string> = {
  all: 'All leaderboards',
  strength: 'Strength',
  static: 'Static',
  endurance: 'Endurance',
  power: 'Power',
  weekly: 'Weekly',
};

/** "29 s" / "100 reps" / "80 kg" / "3:10" for a flagged value. */
export function formatFlagValue(f: Pick<FairPlayFlag, 'area' | 'value' | 'rule'>): string {
  if (f.value == null) return f.rule === 'burst' ? '—' : '';
  const v = Number(f.value);
  if (f.area === 'static') return `${v} s`;
  if (f.area === 'endurance') return `${v} reps`;
  if (f.area === 'power') return `${v} kg`;
  if (f.area === 'strength') return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
  return String(v);
}

/** Movement / lift / tier label. */
export function formatMovement(f: Pick<FairPlayFlag, 'area' | 'movement_id'>): string {
  if (!f.movement_id) return '';
  if (f.area === 'strength') return `Tier ${f.movement_id} trial`;
  if (f.area === 'weekly') return 'Weekly entry';
  return f.movement_id.replace(/_1rm$/, '').replace(/_/g, ' ');
}

/** The evidence line: previous best, limit, median… */
export function formatEvidence(f: FairPlayFlag): string {
  const d = f.detail ?? {};
  const parts: string[] = [];
  if (d.prev_value != null) parts.push(`previous best ${d.prev_value}`);
  if (d.ceiling != null) parts.push(`ceiling ${d.ceiling}`);
  if (d.floor != null) parts.push(`tier minimum ${d.floor} s`);
  if (d.median != null) parts.push(`median ${Math.round(Number(d.median))} of ${d.entries} entries`);
  if (d.bodyweight != null) parts.push(`bodyweight ${d.bodyweight} kg`);
  if (d.count != null) parts.push(`${d.count} results in the hour`);
  if (d.scan) parts.push('found by the first scan');
  return parts.join(' · ');
}
