import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../src/contexts/ThemeContext';

interface ThemeToggleProps {
  style?: any;
}

export function ThemeToggle({ style }: ThemeToggleProps) {
  const { mode, theme, toggleTheme } = useTheme();

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: theme.card.background, borderColor: theme.card.border }, style]}
      onPress={toggleTheme}
      activeOpacity={0.7}
    >
      <Text style={[styles.icon, { color: theme.text.primary }]}>
        {mode === 'dark' ? '🔦' : '🕯️'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 45,
    right: 15,
    zIndex: 2000,
  },
  icon: {
    fontSize: 18,
  },
});
