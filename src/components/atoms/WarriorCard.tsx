import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface WarriorCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'accent' | 'flat' | 'glow';
  padding?: number;
}

export function WarriorCard({ 
  children, 
  style, 
  variant = 'default',
  padding = 16 
}: WarriorCardProps) {
  const { theme } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'accent':
        return { 
          borderColor: theme.accent,
          backgroundColor: 'rgba(205,127,50,0.05)'
        };
      case 'glow':
        return {
          borderColor: theme.accent,
          backgroundColor: theme.card.background,
          shadowColor: theme.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 10,
          elevation: 8,
        };
      case 'flat':
        return {
          borderWidth: 0,
          backgroundColor: theme.background.secondary
        };
      default:
        return {
          borderColor: theme.card.border,
          backgroundColor: theme.card.background
        };
    }
  };

  return (
    <View style={[
      styles.card,
      getVariantStyles(),
      { padding },
      style
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
});
