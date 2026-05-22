import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeColors, StealthTheme, ThemeMode } from '../../constants/Theme';

interface ThemeContextType {
  mode: ThemeMode;
  theme: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark'); // Force dark mode default for stealth theme

  useEffect(() => {
    // Keep dark mode as default
  }, []);

  const theme = StealthTheme[mode];

  const toggleTheme = () => {
    setMode((prevMode: ThemeMode) => prevMode === 'dark' ? 'light' : 'dark');
  };

  const setTheme = (newMode: ThemeMode) => {
    setMode(newMode);
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
