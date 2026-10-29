import { Appearance } from 'react-native';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  background: {
    primary: string;
    secondary: string;
  };
  card: {
    background: string;
    border: string;
    /** Outlined controls (secondary buttons, inputs) that must read as tappable. */
    borderStrong: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  accent: string;
  /** Accent for text: #FF5252 is only 3:1 on the light page, under AA. */
  accentText: string;
  /** Error / destructive text. */
  danger: string;
  /** TextInput placeholder. */
  placeholder: string;
  statusBar: 'light-content' | 'dark-content';
}

export const StealthTheme = {
  dark: {
    background: {
      primary: '#050505', // Matte Black
      secondary: '#0A0A0A', // Dark Charcoal
    },
    card: {
      background: '#111111',
      border: 'rgba(255, 255, 255, 0.05)', // Subtle embossed edge
      borderStrong: 'rgba(255, 255, 255, 0.05)',
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.85)', // Low contrast white
      secondary: 'rgba(255, 255, 255, 0.50)',
      tertiary: 'rgba(255, 255, 255, 0.38)',
    },
    accent: '#FF5252', // Minimal power glow
    accentText: '#FF5252',
    danger: '#FF6B6B',
    placeholder: 'rgba(255, 255, 255, 0.2)',
    statusBar: 'light-content' as const,
  },
  light: {
    background: {
      primary: '#FAFAFA',
      secondary: '#F0F0F0',
    },
    card: {
      background: '#FFFFFF',
      // 5% vanished against the #FAFAFA page; 10% keeps cards and rows separate.
      border: 'rgba(0, 0, 0, 0.10)',
      borderStrong: 'rgba(0, 0, 0, 0.18)',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.85)',
      // Both clear AA 4.5:1 on the page and its #F0F0F0 gradient end.
      secondary: 'rgba(0, 0, 0, 0.64)',
      tertiary: 'rgba(0, 0, 0, 0.58)',
    },
    accent: '#FF5252',
    accentText: '#C93030',
    danger: '#C62828',
    placeholder: 'rgba(0, 0, 0, 0.4)',
    statusBar: 'dark-content' as const,
  },
} as const;

export const useStealthTheme = (mode?: ThemeMode): ThemeColors => {
  const colorScheme = mode || Appearance.getColorScheme() || 'light';
  return StealthTheme[colorScheme];
};

export default StealthTheme;
