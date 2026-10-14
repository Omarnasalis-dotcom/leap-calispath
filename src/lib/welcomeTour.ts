/**
 * Welcome tour card (design_handoff_welcome_tour): timeline, the tier-ring
 * rule and the greeting sizing. Times are seconds on one clock.
 */

export const WT_END = 2.7;
/** The tier lands: shock ring + success haptic. */
export const WT_LOCK = 1.05;
/** The route line draws linearly between these, meeting each stop on time. */
export const WT_LINE0 = 1.2;
export const WT_LINE1 = 2.2;
export const WT_NODE_T = [0, 1, 2, 3].map(i => WT_LINE0 + (WT_LINE1 - WT_LINE0) * (i / 3));
/** Skip / DISCOVER THE APP become tappable at these times. */
export const WT_SKIP_AT = 0.45;
export const WT_GO_AT = 1.3;

/** Ring radii in the -100…100 viewBox, inner → outer. */
export const WT_RADII = [40, 54, 68, 82, 96] as const;

/** Lit rings for a tier: Helot/Neos 1 … Demigod/Eternity 5. */
export function litRings(tier: number): number {
  const t = Math.max(0, Math.min(9, Math.floor(tier)));
  return Math.floor(t / 2) + 1;
}

/** First token of the display name, or null. */
export function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/** Greeting size: steps down with the first name's length, then ellipsis. */
export function greetingSize(name: string | null, compact: boolean): number {
  const base = compact ? 24 : 28;
  const n = name?.length ?? 0;
  return n <= 10 ? base : n <= 16 ? base - 4 : base - 8;
}

/** Compact layout under ~760pt of screen height (375×667-class phones). */
export const isCompactHeight = (height: number) => height < 760;
