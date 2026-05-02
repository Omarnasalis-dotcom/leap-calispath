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
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
  };
  accent: string;
  statusBar: 'light-content' | 'dark-content';
}

export const SpartanTheme = {
  dark: {
    background: {
      primary: '#0A0A0F',
      secondary: '#12121A',
    },
    card: {
      background: 'rgba(255, 255, 255, 0.04)',
      border: 'rgba(100, 180, 255, 0.2)',
    },
    text: {
      primary: '#FFFFFF',
      secondary: 'rgba(255, 255, 255, 0.65)',
      tertiary: 'rgba(255, 255, 255, 0.35)',
    },
    accent: '#CD7F32',
    statusBar: 'light-content' as const,
  },
  light: {
    background: {
      primary: '#FFFFFF',
      secondary: '#F8F9FA',
    },
    card: {
      background: '#FFFFFF',
      border: 'rgba(205, 127, 50, 0.2)',
    },
    text: {
      primary: '#1A1A1A',
      secondary: '#4A5568',
      tertiary: '#718096',
    },
    accent: '#CD7F32',
    statusBar: 'dark-content' as const,
  },
} as const;

export const useSpartanTheme = (mode?: ThemeMode): ThemeColors => {
  const colorScheme = mode || Appearance.getColorScheme() || 'dark';
  return SpartanTheme[colorScheme];
};

export default SpartanTheme;
