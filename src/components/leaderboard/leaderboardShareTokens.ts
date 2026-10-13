import { ThemeMode } from '../../../constants/Theme';
import { ShareVariant } from '../../lib/leaderboardShare';

/** World colours for the Well-Rounded split bar, icon, glow and sparks. */
export const WR_COLORS = ['#8E6BFF', '#FF4A3D', '#FF6B2C'] as const;
export const MEDAL_GOLD = '#E8B64C';

export interface LBTokens {
  mode: ThemeMode;
  variant: ShareVariant;
  accent: string;
  /** "r,g,b" of the accent, for rgba() tints. */
  accentRgb: string;
  backdrop: string;
  card: string;
  cardBorder: string;
  radialAlpha: number;
  glowK: number;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
  floorLine: string;
  youBg: string;
  youBorder: string;
  youDivider: string;
  pillBorder: string;
  chipBorder: string;
  shareBorder: string;
  /** Share square sits on the backdrop; light mode's mid-grey needs a fill. */
  shareBg: string;
  medals: [string, string, string];
  blockTop: number;
  mote: string;
}

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
export const rgba = (hex: string, a: number) => `rgba(${rgb(hex)},${a})`;

/** Accent + dark card per board (worlds match their PR celebration cards). */
const VARIANT_STYLE: Record<ShareVariant, { accent: string; cardDark: string }> = {
  strength: { accent: '#FC5454', cardDark: '#0e0808' },
  weekly: { accent: '#FC5454', cardDark: '#0e0808' },
  wellRounded: { accent: '#8E6BFF', cardDark: '#0b0a12' },
  static: { accent: '#8E6BFF', cardDark: '#0b0a12' },
  endurance: { accent: '#FF6B2C', cardDark: '#0e0906' },
  power: { accent: '#FF4A3D', cardDark: '#0e0808' },
};

export function getLBTokens(variant: ShareVariant, mode: ThemeMode): LBTokens {
  const accent = VARIANT_STYLE[variant].accent;
  const ar = rgb(accent);
  const dark = mode === 'dark';
  const youA = dark ? 0.09 : 0.06;
  const pillA = dark ? 0.28 : 0.22;
  return {
    mode, variant, accent, accentRgb: ar,
    backdrop: dark ? 'rgba(0,0,0,0.78)' : 'rgba(30,18,18,0.42)',
    card: dark ? VARIANT_STYLE[variant].cardDark : '#ffffff',
    cardBorder: `rgba(${ar},${dark ? 0.5 : 0.45})`,
    radialAlpha: dark ? 0.15 : 0.09,
    glowK: dark ? 1 : 0.55,
    t1: dark ? '#ffffff' : '#141010',
    t2: dark ? '#d0d0d0' : '#3a3434',
    t3: dark ? '#a0a0a0' : '#5e5858',
    t4: dark ? '#8a8a8a' : '#6e6868',
    t5: dark ? '#6a6a6a' : '#7a7474',
    floorLine: dark ? '#241a1a' : '#eee4e2',
    youBg: `rgba(${ar},${youA})`,
    youBorder: `rgba(${ar},0.45)`,
    youDivider: `rgba(${ar},0.18)`,
    pillBorder: `rgba(${ar},${pillA})`,
    chipBorder: `rgba(${ar},${pillA + 0.1})`,
    shareBorder: dark ? '#3a2a2a' : '#e6d3d1',
    shareBg: dark ? 'transparent' : '#ffffff',
    medals: [MEDAL_GOLD, dark ? '#C9CED6' : '#8E949C', '#C98B5A'],
    blockTop: dark ? 0.3 : 0.34,
    mote: `rgba(${ar},${dark ? 0.6 : 0.35})`,
  };
}
