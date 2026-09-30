import { ThemeMode } from '../../../constants/Theme';
import { getWorldKitTokens, worldKitRgba } from '../../../constants/worldKitTokens';
import { PRWorld } from '../../lib/prCelebration';

/**
 * PR celebration palette per world. Dark is the handoff's table exactly;
 * light (owner decision) is derived from the world kit's light tokens.
 */
export interface PRTokens {
  mode: ThemeMode;
  accent: string;
  /** Accent for text on the card (darker in light mode for contrast). */
  accentText: string;
  /** Text on the SHARE button. */
  onAccent: string;
  backdrop: string;
  cardBg: string;
  cardBorder: string;
  /** Radial glow at the top of the card. */
  cardGlow: string;
  statsBg: string;
  statsBorder: string;
  /** Unlit ring track / unlit tick. */
  track: string;
  /** Endurance ticks already covered by the previous best. */
  tickOld: string;
  pillBorder: string;
  saveBorder: string;
  saveText: string;
  avatarBg: string;
  text: string;
  textSecondary: string;
  textDim: string;
  textMuted: string;
  textFaint: string;
  strike: string;
  /** Marker before it is passed. */
  markerIdle: string;
  /** Marker once passed, and crystal sparks. */
  markerPassed: string;
  /** Ambient particles. */
  mote: string;
  floorLine: string;
}

const ACCENT: Record<PRWorld, string> = { static: '#8E6BFF', endurance: '#FF6B2C', power: '#FF4A3D' };

const DARK: Record<PRWorld, Pick<PRTokens, 'cardBg' | 'statsBg' | 'statsBorder' | 'track' | 'tickOld' | 'pillBorder' | 'saveBorder' | 'saveText' | 'onAccent' | 'markerIdle' | 'mote' | 'floorLine'>> = {
  static: {
    cardBg: '#0b0a12', statsBg: '#100e1a', statsBorder: '#1f1c2c', track: '#1c1830', tickOld: '#1c1830',
    pillBorder: '#2a2440', saveBorder: '#3a3160', saveText: '#c9bbff', onAccent: '#ffffff',
    markerIdle: '#5a5270', mote: 'rgba(190,172,255,0.5)', floorLine: '#1f1c2c',
  },
  endurance: {
    cardBg: '#0e0906', statsBg: '#150d09', statsBorder: '#2a1a12', track: '#22160f', tickOld: '#7a3a1c',
    pillBorder: '#3a2216', saveBorder: '#5a3220', saveText: '#ffb088', onAccent: '#000000',
    markerIdle: '#6a4a3a', mote: 'rgba(255,150,90,0.6)', floorLine: '#2a1a12',
  },
  power: {
    cardBg: '#0e0808', statsBg: '#150b0a', statsBorder: '#2a1614', track: '#2a1614', tickOld: '#2a1614',
    pillBorder: '#3a1a18', saveBorder: '#5a2622', saveText: '#ff9d94', onAccent: '#ffffff',
    markerIdle: '#6a3a36', mote: 'rgba(255,120,110,0.5)', floorLine: '#2a1614',
  },
};

const KIT_KEY: Record<PRWorld, 'static' | 'onemm' | 'power'> = { static: 'static', endurance: 'onemm', power: 'power' };

export function getPRTokens(world: PRWorld, mode: ThemeMode): PRTokens {
  const accent = ACCENT[world];
  if (mode === 'dark') {
    return {
      mode, accent, accentText: accent,
      ...DARK[world],
      backdrop: 'rgba(0,0,0,0.78)',
      cardBorder: worldKitRgba(accent, 0.5),
      cardGlow: worldKitRgba(accent, 0.15),
      avatarBg: '#141414',
      text: '#ffffff', textSecondary: '#d0d0d0', textDim: '#a0a0a0', textMuted: '#8a8a8a', textFaint: '#6a6a6a',
      strike: '#4a4a4a', markerPassed: '#ffffff',
    };
  }
  const k = getWorldKitTokens(KIT_KEY[world], 'light');
  return {
    mode, accent, accentText: k.accentText,
    onAccent: DARK[world].onAccent,
    backdrop: 'rgba(12,12,16,0.55)',
    cardBg: '#ffffff',
    cardBorder: worldKitRgba(accent, 0.45),
    cardGlow: worldKitRgba(accent, 0.1),
    statsBg: k.tint,
    statsBorder: k.tintBorder,
    track: k.track,
    tickOld: worldKitRgba(accent, 0.45),
    pillBorder: k.tintBorder,
    saveBorder: k.tintBorderStrong,
    saveText: k.accentText,
    avatarBg: k.button,
    text: k.text, textSecondary: k.textSecondary, textDim: k.textMuted, textMuted: k.textMuted, textFaint: k.textFaint,
    strike: k.textDisabled,
    markerIdle: k.textDisabled,
    markerPassed: k.accentText,
    mote: worldKitRgba(accent, 0.35),
    floorLine: k.tintBorder,
  };
}
