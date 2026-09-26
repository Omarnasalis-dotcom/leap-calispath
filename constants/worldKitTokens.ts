/**
 * Design tokens for the v4 world screens (Static · Power · Endurance/1MM),
 * assets/design_handoff_worlds/README.md §0.1–0.2.
 *
 * Dark values are the handoff's exact hexes. The handoff is dark-only; the
 * light set is derived here (accent mixed toward white for tints, a darker
 * accent/gold for text so it keeps contrast on a light page).
 */

import { ThemeMode } from './Theme';

export type WorldKitKey = 'static' | 'power' | 'onemm';

export interface WorldKitTokens {
  mode: ThemeMode;
  accent: string;
  accentHover: string;
  /** Accent used for text/icons on the page background. */
  accentText: string;
  /** Text/icons on a solid accent fill. */
  onAccent: string;
  /** Ring/bar track. */
  track: string;
  /** Logged row / tinted card fill. */
  tint: string;
  /** Stronger tint: 1st-place podium block, score-ring inner disc, active carousel card. */
  tintStrong: string;
  /** Tinted border (sheets, loader card, number field). */
  tintBorder: string;
  /** Border of a logged row. */
  tintBorderStrong: string;
  /** Number-field box fill. */
  inputBg: string;
  /** Adjust / plate buttons fill. */
  buttonTint: string;
  /** Goal card fill. */
  goalBg: string;

  // Neutrals
  bg: string;
  sheetBg: string;
  boardBg: string;
  navBg: string;
  segTrack: string;
  segBorder: string;
  pillTrack: string;
  pillBorder: string;
  button: string;
  emptyRowBg: string;
  emptyRowBorder: string;
  listBg: string;
  border: string;
  borderStrong: string;
  divider: string;
  grabber: string;
  scrim: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  textDisabled: string;
  /** Empty-state big value ("—" on an unlogged row). */
  textEmpty: string;

  // Rank colours (gold is also the King state)
  gold: string;
  silver: string;
  bronze: string;
  goldTintBg: string;
  goldBorder: string;
}

export const worldKitRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const mix = (hex: string, target: [number, number, number], amount: number) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const out = c.map((v, i) => Math.round(v + (target[i] - v) * amount));
  return '#' + out.map(v => v.toString(16).padStart(2, '0')).join('');
};
/** Accent at `alpha` strength over white, as an opaque hex. */
const onWhite = (hex: string, alpha: number) => mix(hex, [255, 255, 255], 1 - alpha);
const darken = (hex: string, amount: number) => mix(hex, [0, 0, 0], amount);

interface WorldTint {
  accent: string;
  accentHover: string;
  dark: Pick<WorldKitTokens, 'track' | 'tint' | 'tintStrong' | 'tintBorder' | 'tintBorderStrong' | 'inputBg' | 'buttonTint' | 'goalBg'>;
  /** How much to darken the accent for text on a light page. */
  lightTextDarken: number;
}

const TINTS: Record<WorldKitKey, WorldTint> = {
  static: {
    accent: '#8E6BFF',
    accentHover: '#a08aff',
    dark: {
      track: '#1c1830', tint: '#121019', tintStrong: '#0e0b18', tintBorder: '#221c38',
      tintBorderStrong: '#1e1a2c', inputBg: '#0a0812', buttonTint: '#16121f', goalBg: '#0c0a14',
    },
    lightTextDarken: 0.28,
  },
  power: {
    accent: '#FF4A3D',
    accentHover: '#ff6a5f',
    dark: {
      track: '#2a1212', tint: '#140b0b', tintStrong: '#1a0e0d', tintBorder: '#2e1616',
      tintBorderStrong: '#3a1a18', inputBg: '#0c0606', buttonTint: '#1a1010', goalBg: '#110a0a',
    },
    lightTextDarken: 0.22,
  },
  onemm: {
    accent: '#FF6B2C',
    accentHover: '#ff8a57',
    dark: {
      track: '#2a1a0c', tint: '#140c07', tintStrong: '#1a110a', tintBorder: '#33200f',
      tintBorderStrong: '#3a2412', inputBg: '#0c0805', buttonTint: '#1a1109', goalBg: '#110b07',
    },
    lightTextDarken: 0.3,
  },
};

const DARK_NEUTRALS = {
  bg: '#000000',
  sheetBg: '#0c0c0c',
  boardBg: '#0a0a0a',
  navBg: '#0a0a0a',
  segTrack: '#0e0e0e',
  segBorder: '#1c1c1c',
  pillTrack: '#111111',
  pillBorder: '#1f1f1f',
  button: '#1a1a1a',
  emptyRowBg: '#0d0d0d',
  emptyRowBorder: '#1c1c1c',
  listBg: '#0e0e0e',
  border: '#1a1a1a',
  borderStrong: '#2a2a2a',
  divider: '#161616',
  grabber: '#2a2a2a',
  scrim: 'rgba(0,0,0,0.72)',
  text: '#ffffff',
  textSecondary: '#d0d0d0',
  textMuted: '#8a8a8a',
  textFaint: '#6a6a6a',
  textDisabled: '#4a4a4a',
  textEmpty: '#3a3a3a',
  gold: '#E8B64C',
  silver: '#C9CED6',
  bronze: '#C98B5A',
  goldTintBg: '#14110a',
  goldBorder: 'rgba(232,182,76,0.35)',
};

// Light text greys and accentText darkening are tuned so every text token
// clears WCAG AA 4.5:1 on the page, white cards and tinted rows.
const LIGHT_NEUTRALS = {
  bg: '#F6F6F7',
  sheetBg: '#FFFFFF',
  boardBg: '#FAFAFB',
  navBg: '#FFFFFF',
  segTrack: '#EDEDF0',
  segBorder: '#E0E0E4',
  pillTrack: '#EFEFF2',
  pillBorder: '#E0E0E4',
  button: '#EDEDF0',
  emptyRowBg: '#FFFFFF',
  emptyRowBorder: '#E4E4E8',
  listBg: '#FFFFFF',
  border: '#E6E6EA',
  borderStrong: '#D2D2D8',
  divider: '#EEEEF1',
  grabber: '#D2D2D8',
  scrim: 'rgba(0,0,0,0.45)',
  text: '#0B0B0D',
  textSecondary: '#2E2E33',
  textMuted: '#56565E',
  textFaint: '#6E6E77',
  textDisabled: '#B0B0B8',
  textEmpty: '#C4C4CA',
  gold: '#B7862A',
  silver: '#8A919C',
  bronze: '#A56A3B',
  goldTintBg: '#FFF6E0',
  goldBorder: 'rgba(183,134,42,0.45)',
};

export function getWorldKitTokens(world: WorldKitKey, mode: ThemeMode): WorldKitTokens {
  const t = TINTS[world];
  if (mode === 'dark') {
    return { mode, accent: t.accent, accentHover: t.accentHover, accentText: t.accent, onAccent: '#ffffff', ...t.dark, ...DARK_NEUTRALS };
  }
  const a = t.accent;
  return {
    mode,
    accent: a,
    accentHover: t.accentHover,
    accentText: darken(a, t.lightTextDarken),
    onAccent: '#ffffff',
    track: onWhite(a, 0.16),
    tint: onWhite(a, 0.06),
    tintStrong: onWhite(a, 0.1),
    tintBorder: onWhite(a, 0.22),
    tintBorderStrong: onWhite(a, 0.3),
    inputBg: '#FFFFFF',
    buttonTint: onWhite(a, 0.09),
    goalBg: onWhite(a, 0.05),
    ...LIGHT_NEUTRALS,
  };
}

/** Oswald weights, registered in hooks/useFonts.ts. World screens only. */
export const WORLD_FONTS = {
  light: 'Oswald-Light',
  regular: 'Oswald-Regular',
  medium: 'Oswald-Medium',
  semibold: 'Oswald-SemiBold',
  bold: 'Oswald-Bold',
} as const;

/** Handoff motion curve: cubic-bezier(.4,0,.2,1). */
export const WORLD_EASE = [0.4, 0, 0.2, 1] as const;
