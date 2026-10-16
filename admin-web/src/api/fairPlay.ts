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
  rule: 'absolute' | 'jump' | 'burst' | 'floor_margin' | 'weekly_outlier' | 'manual';
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
  /** Strength only: the tiers hidden; null = every tier. */
  tiers: number[] | null;
  reason: 'fair_play' | 'inactive';
  status: 'active' | 'lifted' | 'permanent';
  counts_as_strike: boolean;
  flag_ids: number[];
  admin_note: string | null;
  created_at: string;
  acknowledged_at: string | null;
  lifted_at: string | null;
  lifted_reason: string | null;
  /** A reset the admin undid (results put back). */
  restored_at: string | null;
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

export async function fetchAthleteFairPlay(userId: string): Promise<{
  flags: FairPlayFlag[]; holds: LeaderboardHold[]; appeals: FairPlayAppeal[]; restorableHoldIds: Set<number>;
}> {
  const [flags, holds, appeals, backups] = await Promise.all([
    supabase.from('fair_play_flags').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('leaderboard_holds').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('fair_play_appeals').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('fair_play_reset_backups').select('hold_id').eq('user_id', userId).is('restored_at', null),
  ]);
  for (const r of [flags, holds, appeals, backups]) if (r.error) throw new Error(r.error.message);
  return {
    flags: (flags.data ?? []) as FairPlayFlag[],
    holds: (holds.data ?? []) as LeaderboardHold[],
    appeals: (appeals.data ?? []) as FairPlayAppeal[],
    // Resets made before backups existed (none on prod) can't be restored.
    restorableHoldIds: new Set(((backups.data ?? []) as { hold_id: number }[]).map((b) => b.hold_id)),
  };
}

/**
 * Lifted hides (by you or an accepted appeal) whose flags are still closed
 * as "actioned", i.e. out of the queue. Each with the flag ids that can go back.
 */
export async function fetchLiftedOutOfQueue(): Promise<(LeaderboardHold & { waiting: number[] })[]> {
  const { data, error } = await supabase
    .from('leaderboard_holds')
    .select(`*, ${NAME}`)
    .eq('reason', 'fair_play')
    .eq('status', 'lifted')
    .in('lifted_reason', ['admin', 'appeal_accepted'])
    .order('lifted_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const holds = (data ?? []) as LeaderboardHold[];
  const flags = await fetchFlagsByIds(Array.from(new Set(holds.flatMap((h) => h.flag_ids))));
  const actioned = new Set(flags.filter((f) => f.status === 'actioned').map((f) => f.id));
  return holds
    .map((h) => ({ ...h, waiting: h.flag_ids.filter((id) => actioned.has(id)) }))
    .filter((h) => h.waiting.length > 0);
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

/** Menu badges: appeals waiting for a decision and flags waiting for review. */
export async function fetchFairPlayCounts(): Promise<{ appeals: number; flags: number }> {
  const [appeals, flags] = await Promise.all([
    supabase.from('fair_play_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('fair_play_flags').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ]);
  if (appeals.error) throw new Error(appeals.error.message);
  if (flags.error) throw new Error(flags.error.message);
  return { appeals: appeals.count ?? 0, flags: flags.count ?? 0 };
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

export const holdAthlete = (p: {
  userId: string; scope: HoldScope; flagIds: number[]; strike: boolean; permanent: boolean; note?: string; tiers?: number[] | null;
}) =>
  rpc<number>('admin_fair_play_hold', {
    p_user: p.userId, p_scope: p.scope, p_flag_ids: p.flagIds, p_counts_as_strike: p.strike, p_permanent: p.permanent, p_note: p.note || null,
    p_tiers: p.tiers?.length ? p.tiers : null,
  });

/** reopen false: the results look real (flags dismissed). true: decide again (flags back in the queue). Clears the strike. */
export const liftHold = (holdId: number, reopen: boolean, note?: string) =>
  rpc<void>('admin_fair_play_lift', { p_hold_id: holdId, p_note: note || null, p_reopen: reopen });

/** Back to the queue: dismissed flags, or flags whose hold was lifted. */
export const reopenFlags = (flagIds: number[]) => rpc<number>('admin_fair_play_reopen_flags', { p_flag_ids: flagIds });

/** One result of an athlete, for review whether flagged or not. */
export interface AthleteResult {
  source_table: string;
  source_id: string;
  area: FairPlayArea;
  movement_id: string | null;
  value: number;
  label: string | null;       // weekly: the challenge title
  at: string | null;
  removed: boolean;           // endurance attempt that no longer counts
  flag_status: FairPlayFlag['status'] | null;
}

export const fetchAthleteResults = (userId: string) => rpc<AthleteResult[]>('admin_fair_play_results', { p_user: userId });

/** Put results in the queue as "picked by an admin" flags; returns how many are newly open. */
export const flagResults = (userId: string, items: Pick<AthleteResult, 'source_table' | 'source_id' | 'movement_id'>[]) =>
  rpc<number>('admin_fair_play_flag_results', { p_user: userId, p_items: items });

/** Undo an accepted reset: the removed results come back; returns how many. */
export const restoreReset = (holdId: number) => rpc<number>('admin_fair_play_restore_reset', { p_hold_id: holdId });

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
  manual: 'Picked by an admin',
};

export const AREA_LABEL: Record<HoldScope, string> = {
  all: 'All leaderboards',
  strength: 'Strength',
  static: 'Static',
  endurance: 'Endurance',
  power: 'Power',
  weekly: 'Weekly',
};

/** "Strength · Tier 3, 5" for a per-tier Strength hold. */
export function holdScopeLabel(h: Pick<LeaderboardHold, 'scope' | 'tiers'>): string {
  return h.tiers?.length ? `${AREA_LABEL[h.scope]} · Tier ${h.tiers.join(', ')}` : AREA_LABEL[h.scope];
}

/** The tier of a Strength trial flag (null for a burst, which has no tier). */
export function flagTier(f: Pick<FairPlayFlag, 'area' | 'movement_id'>): number | null {
  if (f.area !== 'strength' || f.movement_id == null || !/^\d+$/.test(f.movement_id)) return null;
  return Number(f.movement_id);
}

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
