import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { STATIC_MOVEMENTS } from '../lib/staticLogic';
import { ONEMM_MOVEMENTS } from '../lib/oneMMLogic';
import { POWER_MOVEMENTS } from '../lib/powerLogic';
import { TIER_NAMES } from '../types';
import i18n, { isArabic, t, tierLevelLabel } from '../i18n';

// Fair Play, the athlete's side (docs/features/FAIR_PLAY_MODERATION_PLAN.md):
// leaderboard holds an admin placed on you, their flagged results, your
// strikes, and the three ways forward (accept the reset, appeal, or tap to
// show yourself again after an inactivity hide). Server: my_fair_play_status
// and the fair_play_* RPCs.

export type HoldScope = 'all' | 'strength' | 'static' | 'endurance' | 'power' | 'weekly';

export interface FairPlayFlagSummary {
  area: 'strength' | 'static' | 'endurance' | 'power' | 'weekly';
  movement_id: string | null;
  value: number | null;
  rule: string;
  created_at: string;
}

export interface FairPlayHold {
  id: number;
  scope: HoldScope;
  /** Strength only: the tiers hidden; null/absent = every tier. */
  tiers?: number[] | null;
  reason: 'fair_play' | 'inactive';
  status: 'active' | 'permanent';
  counts_as_strike: boolean;
  admin_note: string | null;
  created_at: string;
  acknowledged_at: string | null;
  flags: FairPlayFlagSummary[];
  appeal: { status: 'pending' | 'accepted' | 'rejected'; message: string; admin_reply: string | null; decided_at: string | null } | null;
}

export interface FairPlayStatus {
  strikes: number;
  holds: FairPlayHold[];
}

export async function getMyFairPlayStatus(): Promise<FairPlayStatus> {
  const { data, error } = await supabase.rpc('my_fair_play_status');
  if (error) throw error;
  const s = data as FairPlayStatus;
  return { strikes: Number(s?.strikes ?? 0), holds: Array.isArray(s?.holds) ? s.holds : [] };
}

async function call(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

export const acknowledgeHold = (holdId: number) => call('fair_play_acknowledge', { p_hold_id: holdId });
export const appealHold = (holdId: number, message: string) => call('fair_play_appeal', { p_hold_id: holdId, p_message: message });
export const acceptReset = (holdId: number) => call('fair_play_accept_reset', { p_hold_id: holdId });
export const revealAfterInactivity = (holdId: number) => call('fair_play_reveal', { p_hold_id: holdId });

/**
 * A note from the team (hold note or appeal reply). A preset is stored as
 * tpl:<id> and shown in the athlete's own language (fairPlay.templates.<id>;
 * the ids come from admin-web/src/shared/fairPlayNotes.ts). Anything else is
 * a custom note, shown exactly as typed. Null for no note, or a preset this
 * version doesn't know yet (better nothing than "tpl:…").
 */
export const NOTE_TEMPLATE_PREFIX = 'tpl:';
export function resolveTeamNote(note: string | null | undefined): { text: string; preset: boolean } | null {
  const raw = note?.trim();
  if (!raw) return null;
  if (!raw.startsWith(NOTE_TEMPLATE_PREFIX)) return { text: raw, preset: false };
  const key = `fairPlay.templates.${raw.slice(NOTE_TEMPLATE_PREFIX.length)}` as 'fairPlay.templates.needVideo';
  if (!i18n.exists(key as string)) return null;
  return { text: t(key), preset: true };
}

/** Where the hold hides you: "STRENGTH", or "STRENGTH · TIER 3" for a per-tier hold. */
export function holdScopeLabel(h: Pick<FairPlayHold, 'scope' | 'tiers'>): string {
  const area = t(`fairPlay.scope.${h.scope}` as 'fairPlay.scope.all');
  if (!h.tiers?.length) return area;
  return `${area} · ${h.tiers.map(tierLevelLabel).join(isArabic ? '، ' : ', ').toUpperCase()}`;
}

/** "Full Front Lever · 70 s" — names stay in English, like the rest of the climb. */
export function describeFlag(f: FairPlayFlagSummary): string {
  const v = f.value == null ? null : Number(f.value);
  switch (f.area) {
    case 'static': {
      const name = STATIC_MOVEMENTS.find(m => m.id === f.movement_id)?.name ?? f.movement_id ?? 'Static hold';
      return v == null ? name : `${name} · ${v} s`;
    }
    case 'endurance': {
      const name = ONEMM_MOVEMENTS.find(m => m.id === f.movement_id)?.name ?? f.movement_id ?? 'Endurance set';
      return v == null ? name : `${name} · ${v} reps`;
    }
    case 'power': {
      const id = (f.movement_id ?? '').replace(/1rm$/, '').replace(/_$/, '').replace('pullup', 'pull_up').replace('muscleup', 'muscle_up');
      const name = POWER_MOVEMENTS.find(m => m.id === id)?.name ?? 'Weighted lift';
      return v == null ? name : `${name} · ${v} kg`;
    }
    case 'strength': {
      const tier = Number(f.movement_id);
      const name = Number.isFinite(tier) ? `${TIER_NAMES[tier] ?? `Tier ${tier}`} Trial` : 'Strength trial';
      return v == null ? name : `${name} · ${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
    }
    default:
      return v == null ? 'Weekly Challenge entry' : `Weekly Challenge · ${v}`;
  }
}

// ── A tiny store so the notice (tabs layout) and Settings share one status ──
let status: FairPlayStatus | null = null;
let sheetOpen = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export async function refreshFairPlay(): Promise<FairPlayStatus | null> {
  try {
    status = await getMyFairPlayStatus();
  } catch (err) {
    console.warn('Fair Play status failed:', err);
  }
  emit();
  return status;
}

export function openFairPlaySheet() { sheetOpen = true; emit(); }
export function closeFairPlaySheet() { sheetOpen = false; emit(); }
export function clearFairPlay() { status = null; sheetOpen = false; emit(); }

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useFairPlay(): { status: FairPlayStatus | null; sheetOpen: boolean } {
  const s = useSyncExternalStore(subscribe, () => status, () => status);
  const open = useSyncExternalStore(subscribe, () => sheetOpen, () => sheetOpen);
  return { status: s, sheetOpen: open };
}
