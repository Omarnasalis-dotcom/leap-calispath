/**
 * Design tokens for the Training Center flow
 * (assets/design_handoff_training_center/README.md — "Design Tokens").
 * Phase 1 only uses a subset (hub screen); kept complete here so Phase 2/3
 * (Active Program, Session Detail, Templates/Customize/Quick Workout reskin)
 * reuse the same values instead of re-deriving them.
 */

export const TC_COLORS = {
  coral: '#FC5454',
  screenBg: '#000000',
  cardRaised: '#0B0707',
  cardFlat: '#080505',
  cardLocked: '#060404',
  border: '#1c1414',
  borderStrong: '#241414',
  borderLocked: '#161010',
  heroBorderActive: '#3d1a1a',
  selectedCardBg: '#120707',
  chipActiveBg: 'rgba(252,84,84,.12)',
  iconWell: 'rgba(252,84,84,.1)',
  inputBg: '#0d0909',
  inputBorder: '#211414',
  ringTrack: '#2a1212',
  dividerFaint: '#161010',
  dividerStrong: '#1a1a1a',
  textPrimary: '#FFFFFF',
  textBody: '#D4D4D4',
  textSecondary: '#7a7a7a',
  textMuted: '#6d6d6d',
  textFaint: '#3f3f3f',
  textFaint2: '#5a5a5a',
  textFaint3: '#8a8a8a',
  static: '#8b5cf6',
  oneMinMax: '#f97316',
  power: '#FC5454',
} as const;

/** heroGradient: linear-gradient(160deg, ...) stops for the active hero card. */
export const TC_HERO_GRADIENT = ['#140807', '#0a0505', '#080505'] as const;

/** Profile button border gradient (§1). */
export const TC_BUTTON_GRADIENT = ['#8b5cf6', '#f97316'] as const;

export const TC_TYPE = {
  screenTitle: { fontSize: 19, fontWeight: '700' as const, letterSpacing: 1.9 },
  subScreenTitle: { fontSize: 17, fontWeight: '700' as const, letterSpacing: 1.6 },
  statusSubline: { fontSize: 9.5, fontWeight: '500' as const, letterSpacing: 2.0 },
  sectionEyebrow: { fontSize: 9, fontWeight: '500' as const, letterSpacing: 2.4 },
  cardTitle: { fontSize: 15.5, fontWeight: '600' as const, letterSpacing: 0.7 },
  tileTitle: { fontSize: 13.5, fontWeight: '700' as const, letterSpacing: 1.1 },
  tileSubLabel: { fontSize: 8.5, fontWeight: '500' as const, letterSpacing: 1.4 },
  body: { fontSize: 12, fontWeight: '300' as const, lineHeight: 16.8 },
  bigStat: { fontSize: 21, fontWeight: '700' as const },
  ringValue: { fontSize: 24, fontWeight: '700' as const },
  statLabel: { fontSize: 8.5, fontWeight: '500' as const, letterSpacing: 1.4 },
  chip: { fontSize: 10.5, fontWeight: '600' as const, letterSpacing: 1.4 },
  setPill: { fontSize: 10.5, fontWeight: '500' as const, letterSpacing: 0.8 },
  metaPill: { fontSize: 9, fontWeight: '500' as const, letterSpacing: 1.3 },
  tagPill: { fontSize: 8, fontWeight: '700' as const, letterSpacing: 1.1 },
  primaryCta: { fontSize: 13.5, fontWeight: '700' as const, letterSpacing: 1.9 },
};

export const TC_MOTION = {
  screenPushMs: 340,
  screenPushEasing: 'cubic-bezier(.2,.9,.3,1.05)' as const,
  rowInMs: 400,
  rowInEasing: 'cubic-bezier(.2,.9,.3,1.2)' as const,
  rowInStaggerMs: 65,
  ringDrawMs: 900,
  dotPulseMs: 1600,
  sheenMs: 4200,
  chipSelectMs: 200,
};

export const TC_LAYOUT = {
  screenPadding: 18,
  profileScreenPadding: 20,
  cardRadius: 16,
  tileGap: 11,
  bottomBarOffset: 96,
};
