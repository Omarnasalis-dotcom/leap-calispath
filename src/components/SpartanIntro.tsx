import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface SpartanIntroProps {
  onComplete: () => void;
}

export function SpartanIntro({ onComplete }: SpartanIntroProps) {
  const { theme } = useTheme();
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setTimeout(onComplete, 2000);
    });
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={[styles.title, { color: theme.text.primary }]}>
          CALISPATH
        </Text>
        <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
          The Spartan Calisthenics Odyssey
        </Text>
        <View style={[styles.divider, { backgroundColor: theme.accent }]} />
        <Text style={[styles.quote, { color: theme.text.tertiary }]}>
          "Pain is temporary. Glory is eternal."
        </Text>
        <Text style={[styles.motto, { color: theme.accent }]}>
          Forge Your Body • Claim Your Rank • Become Legend
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  divider: {
    height: 2,
    width: 100,
    marginBottom: 24,
  },
  quote: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  motto: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 2,
  },
});
