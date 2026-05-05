import React from 'react';
import { 
  TouchableOpacity, 
  Text, 
  StyleSheet, 
  ActivityIndicator, 
  ViewStyle, 
  TextStyle,
  TouchableOpacityProps
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface WarriorButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export function WarriorButton({ 
  title, 
  loading, 
  variant = 'primary', 
  size = 'medium',
  style,
  textStyle,
  disabled,
  ...props 
}: WarriorButtonProps) {
  const { theme } = useTheme();

  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return { backgroundColor: theme.background.secondary, borderColor: theme.card.border, borderWidth: 1 };
      case 'outline':
        return { backgroundColor: 'transparent', borderColor: theme.accent, borderWidth: 1 };
      case 'danger':
        return { backgroundColor: '#8B0000' };
      default:
        return { backgroundColor: theme.accent };
    }
  };

  const getTextColor = () => {
    if (variant === 'outline') return theme.accent;
    if (variant === 'secondary') return theme.text.primary;
    return '#000000'; // High contrast for accent background
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return { paddingVertical: 8, paddingHorizontal: 16 };
      case 'large':
        return { paddingVertical: 18, paddingHorizontal: 32 };
      default:
        return { paddingVertical: 14, paddingHorizontal: 24 };
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        getVariantStyles(),
        getSizeStyles(),
        disabled && { opacity: 0.5 },
        style
      ]}
      disabled={disabled || loading}
      activeOpacity={0.7}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text style={[
          styles.text, 
          { color: getTextColor() },
          size === 'small' && { fontSize: 12 },
          size === 'large' && { fontSize: 16 },
          textStyle
        ]}>
          {title.toUpperCase()}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
});
