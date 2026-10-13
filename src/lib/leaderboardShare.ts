/**
 * Pure maths + data shaping for the shareable leaderboard card
 * (assets/design_handoff_leaderboard_share/README.md). Times are seconds on
 * the card's own clock. Worklets where the Reanimated styles call them.
 */
import { clamp01, easeOutCubic } from './prCelebration';

export type ShareVariant = 'strength' | 'weekly' | 'wellRounded' | 'static' | 'power' | 'endurance';
/** reps = the weekly board's PTS (whole numbers); points = Well-Rounded (2 decimals). */
export type ShareScoreType = 'time' | 'reps' | 'points';

// ── Timeline ──────────────────────────────────────────────────────────────
/** Rise start per place (index 0 = 1st): 3rd → 2nd → 1st. */
export const PLACE_RISE = [1.25, 1.0, 0.75] as const;
export const RISE_DUR = 0.45;
export const placeLand = (i: number) => {
  'worklet';
  return PLACE_RISE[i] + RISE_DUR;
};
export const LB_LOCK = PLACE_RISE[0] + RISE_DUR; // 1.70
export const LB_AFTER = { you: 0.25, motes: 0.3, countdown: 0.4, logo: 0.6, done: 0.8, share: 0.85 } as const;
export const COUNTDOWN_DUR = 1.0;
export const LB_COUNTDOWN_END = LB_LOCK + LB_AFTER.countdown + COUNTDOWN_DUR; // 3.10
export const LB_END = LB_COUNTDOWN_END + 0.3;

/** Score count-up progress for a podium place (0…1). */
export const scoreProgress = (t: number, i: number) => {
  'worklet';
  return easeOutCubic(clamp01((t - (placeLand(i) - 0.05)) / 0.6));
};

/** Rank shown in the YOU row: counts down from the total, easeOutQuart. */
export const rankAt = (t: number, rank: number, total: number, countdown: boolean) => {
  'worklet';
  if (!countdown) return rank;
  const p = clamp01((t - (LB_LOCK + LB_AFTER.countdown)) / COUNTDOWN_DUR);
  const e = 1 - Math.pow(1 - p, 4);
  return Math.round(total - (total - rank) * e);
};

// ── Data shaping ──────────────────────────────────────────────────────────
export interface ShareRow {
  user_id: string;
  username: string;
  score: number;
  /** Well-Rounded only: Static / Power / Endurance points. */
  split?: [number, number, number];
}

export interface SharePlace {
  username: string;
  initials: string;
  score: number;
  isYou: boolean;
  split?: [number, number, number];
}

export interface ShareYou {
  /** null = not on this (filtered) board. */
  rank: number | null;
  username: string;
  score: number | null;
  /** Distance to #1, always ≥ 0. */
  gap: number;
}

export interface ShareBoard {
  top3: SharePlace[];
  you: ShareYou;
  total: number;
  /** Ranked, off the podium and not last: the rank counts down. */
  countdown: boolean;
}

/** First letters of the first two of `. _ -` parts; one part → its first 2 letters. */
export function usernameInitials(username: string): string {
  const parts = String(username || '').split(/[._\-\s]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/**
 * Top 3 + the sharer from a board that's already sorted and filtered the way
 * it's on screen, so "#14 OF 238" matches what the athlete just saw.
 */
export function buildShareBoard(rows: ShareRow[], myId: string | undefined, myName: string): ShareBoard {
  const total = rows.length;
  const top3 = rows.slice(0, 3).map(r => ({
    username: r.username, initials: usernameInitials(r.username), score: r.score, isYou: r.user_id === myId, split: r.split,
  }));
  const idx = myId ? rows.findIndex(r => r.user_id === myId) : -1;
  const me = idx >= 0 ? rows[idx] : null;
  const leader = rows[0]?.score ?? 0;
  const rank = me ? idx + 1 : null;
  return {
    top3,
    you: { rank, username: me?.username ?? myName, score: me ? me.score : null, gap: me ? Math.abs(leader - me.score) : 0 },
    total,
    countdown: rank != null && rank > 3 && rank < total,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function formatShareScore(value: number, type: ShareScoreType): string {
  if (type === 'time') return clock(value);
  if (type === 'points') return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return Math.round(value).toLocaleString('en-US');
}

/**
 * Gap to #1 in the boards' own convention: time is how far behind
 * ("+0:16"), scores are how much short ("−44").
 */
export function formatShareGap(gap: number, type: ShareScoreType): string {
  return type === 'time' ? `+${clock(gap)}` : `−${formatShareScore(gap, type)}`;
}

export function shareTitleSize(title: string): number {
  return title.length <= 18 ? 30 : title.length <= 30 ? 26 : 22;
}

/** Podium score size: 1st 18 (15 past 7 chars), others 15 (13 past 6). */
export function podiumScoreSize(text: string, first: boolean): number {
  return first ? (text.length > 7 ? 15 : 18) : (text.length > 6 ? 13 : 15);
}
