/**
 * Per-world design tokens for the redesigned world screens
 * (assets/design_handoff_world_screens/README.md — "Shared Design Tokens").
 *
 * DESIGN.md's One World, One Color rule: a screen belongs to exactly one
 * discipline accent, and anything cross-world (BottomTabBar) reads its accent
 * from here so a color change stays a one-line swap.
 */

import { ThemeMode } from './Theme';

export type WorldKey = 'power' | 'strength' | 'static' | 'onemm';

export interface WorldTheme {
  accent: string;
  /** Near-black page background, tinted toward the accent hue. */
  pageBg: string;
  /** Faint radial glow color at the top of the page (handoff: accent @ 10%). */
  glowRgba: string;
  /** Card fill — accent at 6% opacity. */
  cardFill: string;
  /** Card border — accent at 32% opacity. */
  cardBorder: string;
  /** Track fill for rings/bars — accent at 15% opacity. */
  trackRgba: string;
  /** Dark near-black text tuned to the accent hue, for text on solid accent fills. */
  ctaText: string;
}

const rgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const makeWorldTheme = (accent: string, pageBg: string, ctaText: string): WorldTheme => ({
  accent,
  pageBg,
  glowRgba: rgba(accent, 0.1),
  cardFill: rgba(accent, 0.06),
  cardBorder: rgba(accent, 0.32),
  trackRgba: rgba(accent, 0.15),
  ctaText,
});

export const WORLD_THEMES: Record<WorldKey, WorldTheme> = {
  power: makeWorldTheme('#FF4B3E', '#050302', '#1a0605'),
  strength: makeWorldTheme('#FF5252', '#050302', '#1a0605'),
  static: makeWorldTheme('#8B5CF6', '#050308', '#1a0f2e'),
  onemm: makeWorldTheme('#FF6B35', '#050301', '#1a0603'),
};

/** Light-mode page background per world — near-white, faintly tinted toward the accent hue. */
const WORLD_PAGE_BG_LIGHT: Record<WorldKey, string> = {
  power: '#FFF8F7',
  strength: '#FFF8F7',
  static: '#FAF8FF',
  onemm: '#FFF9F6',
};

/**
 * Resolves a world's theme for the given app-wide light/dark mode. Accent,
 * card, and track tokens are accent-relative and read fine in both modes, so
 * only `pageBg` varies — `getWorldTheme(key, 'dark')` returns the same values
 * as `WORLD_THEMES[key]` always has.
 */
export function getWorldTheme(key: WorldKey, mode: ThemeMode): WorldTheme {
  const base = WORLD_THEMES[key];
  return mode === 'dark' ? base : { ...base, pageBg: WORLD_PAGE_BG_LIGHT[key] };
}

/** Neutral tokens shared by every world screen (handoff token table). */
export const WORLD_NEUTRALS = {
  border: 'rgba(255,255,255,0.14)',
  borderStrong: 'rgba(255,255,255,0.16)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.5)',
  textCaption: 'rgba(255,255,255,0.45)',
  textMuted: 'rgba(255,255,255,0.35)',
  /** Tier-complete green (Strength tier chips). */
  complete: '#4ADE80',
};

/** Light-mode counterpart to WORLD_NEUTRALS — dark text/borders on a light page. */
const WORLD_NEUTRALS_LIGHT = {
  border: 'rgba(0,0,0,0.12)',
  borderStrong: 'rgba(0,0,0,0.16)',
  textPrimary: '#141414',
  textSecondary: 'rgba(0,0,0,0.55)',
  textCaption: 'rgba(0,0,0,0.5)',
  textMuted: 'rgba(0,0,0,0.4)',
  /** Deeper green than the dark-mode value for contrast against a light page. */
  complete: '#16A34A',
};

export function getWorldNeutrals(mode: ThemeMode): typeof WORLD_NEUTRALS {
  return mode === 'dark' ? WORLD_NEUTRALS : WORLD_NEUTRALS_LIGHT;
}

export { rgba as worldRgba };
