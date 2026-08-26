// Design handoff (assets/design_handoff_leap_coach_chat/README.md) — exact
// dark-mode tokens, "Fidelity: High... final." No light-mode spec exists;
// the light branch below preserves the same relative relationships
// (bubble lighter than screen, subtle borders, high-contrast text) rather
// than inventing an unrelated palette. Coral itself deliberately stays on
// `theme.accent` (not hardcoded here) — see CoachScreen.tsx.
export interface CoachPalette {
  screenBg: string;
  bubbleBg: string;
  bubbleBorder: string;
  headerDivider: string;
  richBlockDivider: string;
  cardBg: string;
  cardBorder: string;
  chipBorder: string;
  chipPressedBg: string;
  inputBg: string;
  inputBorder: string;
  bodyText: string;
  secondaryText: string;
  mutedLabel: string;
  dimMeta: string;
  faint: string;
  track: string;
  shimmerDark: string;
  shimmerLight: string;
}

export const COACH_COLORS: { dark: CoachPalette; light: CoachPalette } = {
  dark: {
    screenBg: '#000000',
    bubbleBg: '#0B0707',
    bubbleBorder: '#2a1616',
    headerDivider: '#191010',
    richBlockDivider: '#1d1111',
    cardBg: '#0d0606',
    cardBorder: '#241414',
    chipBorder: '#2a1818',
    chipPressedBg: '#160c0c',
    inputBg: '#0d0909',
    inputBorder: '#211414',
    bodyText: '#E8E8E8',
    secondaryText: '#9a9a9a',
    mutedLabel: '#7a7a7a',
    dimMeta: '#6d6d6d',
    faint: '#3f3f3f',
    track: '#1a1a1a',
    shimmerDark: '#5a5a5a',
    shimmerLight: '#F0F0F0',
  },
  light: {
    screenBg: '#FFFFFF',
    bubbleBg: '#F5F0F0',
    bubbleBorder: '#EAD9D9',
    headerDivider: '#EEE4E4',
    richBlockDivider: '#EDE2E2',
    cardBg: '#FBF6F6',
    cardBorder: '#EAD9D9',
    chipBorder: '#EAD9D9',
    chipPressedBg: '#F5E8E8',
    inputBg: '#FBF6F6',
    inputBorder: '#EAD9D9',
    bodyText: '#2A2A2A',
    secondaryText: '#6B6B6B',
    mutedLabel: '#8A8A8A',
    dimMeta: '#9A9A9A',
    faint: '#B5B5B5',
    track: '#E5E5E5',
    shimmerDark: '#B5B5B5',
    shimmerLight: '#3A3A3A',
  },
};

// Matches the app's existing discipline colors used elsewhere (Static/
// Power/1MM) — attach_stat_bars (ai-coach edge function) returns these
// same hex values per row, this is the client-side mirror for anything
// rendered without waiting on a server value (e.g. a legend).
export const DISCIPLINE_COLORS = {
  static: '#8b5cf6',
  power: '#FC5454',
  one_min_max: '#f97316',
} as const;
