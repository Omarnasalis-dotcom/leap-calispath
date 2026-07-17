/**
 * Per-world design tokens for the redesigned world screens
 * (assets/design_handoff_world_screens/README.md — "Shared Design Tokens").
 *
 * DESIGN.md's One World, One Color rule: a screen belongs to exactly one
 * discipline accent, and anything cross-world (BottomTabBar) reads its accent
 * from here so a color change stays a one-line swap.
 */

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
  strength: makeWorldTheme('#FF4B3E', '#050302', '#1a0605'),
  static: makeWorldTheme('#8B5CF6', '#050308', '#1a0f2e'),
  onemm: makeWorldTheme('#FF6B35', '#050301', '#1a0603'),
};

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

export { rgba as worldRgba };
