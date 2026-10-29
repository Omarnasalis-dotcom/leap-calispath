import React, { createContext, useContext, useState, useEffect } from 'react';
import { Appearance } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, StealthTheme, ThemeMode } from '../../constants/Theme';

const THEME_STORAGE_KEY = 'leap_theme_mode';

interface ThemeContextType {
  mode: ThemeMode;
  theme: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Light unless the person chose dark (Settings or the sign-in screen).
  const [mode, setMode] = useState<ThemeMode>('light');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'dark' || stored === 'light') {
        setMode(stored);
      }
    }).catch(() => {});
  }, []);

  const theme = StealthTheme[mode];

  // Native UI (alerts, keyboard, the RevenueCat sheet) and the root view
  // behind screens follow the in-app mode, not the phone's. Guarded: a
  // native call failing here must never block startup.
  useEffect(() => {
    try {
      Appearance.setColorScheme?.(mode);
    } catch {}
    SystemUI.setBackgroundColorAsync(StealthTheme[mode].background.primary).catch(() => {});
  }, [mode]);

  const toggleTheme = () => {
    setMode((prevMode: ThemeMode) => {
      const nextMode = prevMode === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => {});
      return nextMode;
    });
  };

  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, newMode).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ mode, theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

/** For UI that can render outside ThemeProvider (error boundaries, tests): light, the default, when there's no provider. */
export function useThemeOrDefault(): { mode: ThemeMode; theme: ThemeColors } {
  const ctx = useContext(ThemeContext);
  return ctx ? { mode: ctx.mode, theme: ctx.theme } : { mode: 'light', theme: StealthTheme.light };
}
