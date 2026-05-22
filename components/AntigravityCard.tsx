import React, { useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { BlurView } from 'expo-blur';
import { useStealthTheme, ThemeColors } from '../constants/Theme';

interface AntigravityCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
  theme?: ThemeColors;
  intensity?: number;
}

export function AntigravityCard({
  children,
  onPress,
  style,
  theme,
  intensity = 40,
}: AntigravityCardProps) {
  const currentTheme = theme || useStealthTheme();
  const translateY = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.timing(translateY, {
      toValue: -10,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(translateY, {
      toValue: 0,
      duration: 700,
      useNativeDriver: true,
    }).start();
  };

  const CardContent = (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ translateY }],
          backgroundColor: currentTheme.card.background,
          borderColor: currentTheme.card.border,
        },
        style,
      ]}
    >
      <BlurView
        intensity={intensity}
        style={StyleSheet.absoluteFillObject}
        tint={currentTheme === useStealthTheme('dark') ? 'dark' : 'light'}
      />
      <View style={styles.content}>
        {children}
      </View>
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        {CardContent}
      </TouchableOpacity>
    );
  }

  return CardContent;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    position: 'relative',
    zIndex: 1,
  },
});

export default AntigravityCard;
