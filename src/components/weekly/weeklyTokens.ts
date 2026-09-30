import { getWorldKitTokens, WorldKitTokens } from '../../../constants/worldKitTokens';
import { ThemeMode } from '../../../constants/Theme';

/**
 * Weekly Challenge palette (assets/design_handoff_weekly_challenge/README.md
 * "Design tokens"). Built on the Strength coral kit tokens so dark matches the
 * handoff hexes and light reuses the kit's WCAG-checked derivation.
 */
export interface WeeklyTokens extends WorldKitTokens {
  /** #111 back/nav buttons and toggles. */
  control: string;
  /** #1f1f1f card and control borders. */
  cardBorder: string;
  /** #0d0d0d cards and movement rows. */
  card: string;
  /** #141414 AMRAP tiles and podium avatars. */
  tile: string;
  /** #a0a0a0 secondary names. */
  textDim: string;
  /** Live-week hero / current step fill (#130909) and its border. */
  liveBg: string;
  liveBorder: string;
  /** Coral at .07 / .12 / .14 over the page. */
  accentSoft: string;
  accentChip: string;
  accentHalo: string;
  green: string;
  greenBorder: string;
  greenSoft: string;
  /** Hero ghost week number stroke. */
  ghostLive: string;
  ghostEnded: string;
  /** Podium block gradients, top → bottom. */
  podiumFirst: [string, string];
  podiumOther: [string, string];
}

export function getWeeklyTokens(mode: ThemeMode): WeeklyTokens {
  const t = getWorldKitTokens('strength', mode);
  const dark = mode === 'dark';
  return {
    ...t,
    control: dark ? '#111111' : t.sheetBg,
    cardBorder: dark ? '#1f1f1f' : t.border,
    card: dark ? '#0d0d0d' : t.sheetBg,
    tile: dark ? '#141414' : t.button,
    textDim: dark ? '#a0a0a0' : t.textMuted,
    liveBg: t.tint,
    liveBorder: dark ? 'rgba(252,84,84,0.45)' : t.tintBorderStrong,
    accentSoft: 'rgba(252,84,84,0.07)',
    accentChip: 'rgba(252,84,84,0.12)',
    accentHalo: 'rgba(252,84,84,0.14)',
    green: dark ? '#4CC38A' : '#1E8A57',
    greenBorder: dark ? 'rgba(76,195,138,0.45)' : 'rgba(30,138,87,0.45)',
    greenSoft: dark ? 'rgba(76,195,138,0.14)' : 'rgba(30,138,87,0.12)',
    ghostLive: 'rgba(252,84,84,0.2)',
    ghostEnded: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    podiumFirst: dark ? ['#1c1710', '#0c0c0c'] : [t.goldTintBg, t.sheetBg],
    podiumOther: dark ? ['#161616', '#0c0c0c'] : [t.button, t.sheetBg],
  };
}
