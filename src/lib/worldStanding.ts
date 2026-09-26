/**
 * Pure derivations for the v4 world dashboards
 * (assets/design_handoff_worlds/README.md §0.4, §0.6, §0.8, §4).
 *
 * Input is the caller's standing from get_world_summary; output is exactly
 * what the Rank / Score / Gap circles, goal card and pinned "you" bar show.
 * Ring fills are always real ratios — 0 renders an empty ring.
 */

import { clamp01 } from './worldProgress';

export interface WorldAbove {
  rank: number;
  score: number;
  name: string;
}

export interface WorldStandingInput {
  /** null when the caller has no score in this world. */
  rank: number | null;
  rankedCount: number;
  score: number;
  topScore: number;
  /** Nearest user strictly above the caller (null for the #1 / empty world). */
  above: WorldAbove | null;
}

export interface WorldStanding {
  isRanked: boolean;
  isKing: boolean;
  /** Rank ring: 1 − (rank−1)/rankedCount — how near the top you are. */
  rankProgress: number;
  /** Score ring for Power/Endurance: score / worldTopScore. */
  topProgress: number;
  /** Points needed to PASS the user above (not tie), 2dp. null when there's no one to pass. */
  gapToPass: number | null;
  /** Gap ring / goal bar: score / aboveScore; full when King. */
  gapProgress: number;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const fmt2 = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);

export function deriveStanding(s: WorldStandingInput): WorldStanding {
  const isRanked = s.rank != null && s.rank > 0 && s.score > 0;
  const isKing = isRanked && s.rank === 1;
  const rankProgress = isRanked
    ? clamp01(1 - ((s.rank as number) - 1) / Math.max(1, s.rankedCount))
    : 0;
  const topProgress = s.topScore > 0 ? clamp01(s.score / s.topScore) : 0;
  const gapToPass = !isKing && s.above ? round2(Math.max(0, s.above.score - s.score) + 0.01) : null;
  const gapProgress = isKing ? 1 : s.above && s.above.score > 0 ? clamp01(s.score / s.above.score) : 0;
  return { isRanked, isKing, rankProgress, topProgress, gapToPass, gapProgress };
}

/** Two uppercase initials for a podium avatar, ignoring a leading "@". */
export function initials(name: string): string {
  const clean = (name || '').replace(/^@/, '').trim();
  if (!clean) return '?';
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  const raw = parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2);
  return raw.toUpperCase();
}

export interface BoardRow {
  user_id: string;
  name: string;
  points: number;
  country?: string | null;
  gender?: string | null;
  /** Level/tier label shown under the name ("IRON", "AMPERE"). */
  level?: string;
}

/**
 * Sub-line for the pinned "you" bar (§0.8), computed against the list that's
 * actually on screen (so it respects the gender/community filter).
 */
export function youBarSubline(
  list: BoardRow[],
  myId: string | undefined,
  myScore: number,
  worldName: string,
): { index: number; text: string } {
  const index = myId ? list.findIndex(r => r.user_id === myId) : -1;
  if (index < 0) {
    return { index, text: myScore > 0 ? 'Not in this filter' : 'Log a set to join the board' };
  }
  if (index === 0) return { index, text: `${worldName} King · hold the top spot` };
  const ahead = list[index - 1];
  return { index, text: `${fmt2(Math.max(0, ahead.points - myScore) + 0.01)} pts to pass ${ahead.name}` };
}
