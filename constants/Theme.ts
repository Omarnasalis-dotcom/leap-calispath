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

export const StealthTheme = {
  dark: {
    background: {
      primary: '#050505', // Matte Black
      secondary: '#0A0A0A', // Dark Charcoal
    },
    card: {
      background: '#111111',
      border: 'rgba(255, 255, 255, 0.05)', // Subtle embossed edge
    },
    text: {
      primary: 'rgba(255, 255, 255, 0.85)', // Low contrast white
      secondary: 'rgba(255, 255, 255, 0.45)',
      tertiary: 'rgba(255, 255, 255, 0.2)',
    },
    accent: '#FF5252', // Minimal power glow
    statusBar: 'light-content' as const,
  },
  light: {
    background: {
      primary: '#FAFAFA',
      secondary: '#F0F0F0',
    },
    card: {
      background: '#FFFFFF',
      border: 'rgba(0, 0, 0, 0.05)',
    },
    text: {
      primary: 'rgba(0, 0, 0, 0.85)',
      secondary: 'rgba(0, 0, 0, 0.45)',
      tertiary: 'rgba(0, 0, 0, 0.2)',
    },
    accent: '#FF5252',
    statusBar: 'dark-content' as const,
  },
} as const;

export const useStealthTheme = (mode?: ThemeMode): ThemeColors => {
  const colorScheme = mode || Appearance.getColorScheme() || 'dark';
  return StealthTheme[colorScheme];
};

export default StealthTheme;
