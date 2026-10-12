import { ThemeMode } from '../../../constants/Theme';

/** Workout Complete card palette (handoff table, dark + light). */
export interface WCTokens {
  mode: ThemeMode;
  accent: string;
  backdrop: string;
  card: string;
  cardBorder: string;
  /** Top radial glow colour. */
  radial: string;
  /** Multiplier for every accent glow (lower on white). */
  glowK: number;
  t1: string;
  t2: string;
  t3: string;
  t4: string;
  t5: string;
  statsBg: string;
  statsBorder: string;
  track: string;
  pillBorder: string;
  doneBorder: string;
  doneText: string;
  /** DONE sits on the backdrop; light mode's mid-grey needs a solid fill. */
  doneBg: string;
  mote: string;
}

const ACCENT = '#FC5454';

export function getWCTokens(mode: ThemeMode): WCTokens {
  if (mode === 'dark') {
    return {
      mode, accent: ACCENT,
      backdrop: 'rgba(0,0,0,0.78)',
      card: '#0e0808', cardBorder: 'rgba(252,84,84,0.5)', radial: 'rgba(252,84,84,0.15)', glowK: 1,
      t1: '#ffffff', t2: '#d0d0d0', t3: '#a0a0a0', t4: '#8a8a8a', t5: '#6a6a6a',
      statsBg: '#150b0b', statsBorder: '#2a1616', track: '#1f1414', pillBorder: '#3a1a1a',
      doneBorder: '#3a2222', doneText: '#d0d0d0', doneBg: 'transparent',
      mote: 'rgba(255,140,140,0.6)',
    };
  }
  return {
    mode, accent: ACCENT,
    backdrop: 'rgba(30,18,18,0.42)',
    card: '#ffffff', cardBorder: 'rgba(252,84,84,0.45)', radial: 'rgba(252,84,84,0.09)', glowK: 0.55,
    t1: '#141010', t2: '#3a3434', t3: '#5e5858', t4: '#6e6868', t5: '#7a7474',
    statsBg: '#fbf6f5', statsBorder: '#f0e2e0', track: '#f1e8e7', pillBorder: '#efd9d7',
    doneBorder: '#e6d3d1', doneText: '#3a3434', doneBg: '#ffffff',
    mote: 'rgba(252,84,84,0.35)',
  };
}
