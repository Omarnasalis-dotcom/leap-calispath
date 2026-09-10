import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const ACCENT = '#FF5252';

interface ProgramReadyRevealProps {
  onExplore: () => void;
  onStartProgram: () => void;
  submitting?: boolean;
}

// Shown once, right after any of the 3 "Build Your Program" methods (AI
// Coach / Customize Program / Ready Template) finishes -- unlike
// RankUpReveal's 5s cinematic timeline, this is an immediately-interactive
// confirmation screen (no forced wait) matching RankUpToast's lighter
// weight: there's a real choice to make here, not just a celebration to sit
// through.
export function ProgramReadyReveal({ onExplore, onStartProgram, submitting }: ProgramReadyRevealProps) {
  const { mode } = useTheme();
  const isDark = mode === 'dark';
  const palette = {
    bg: isDark ? '#000000' : '#FFF8F7',
    ink: isDark ? '#FFFFFF' : '#170707',
    muted: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(23,7,7,0.5)',
  };

  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pop, { toValue: 1, duration: 380, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [pop]);

  const popStyle = {
    opacity: pop,
    transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Animated.View style={[styles.badge, popStyle]}>
        <MaterialCommunityIcons name="check-decagram" size={56} color={ACCENT} />
      </Animated.View>

      <Animated.Text style={[styles.headline, popStyle, { color: palette.ink }]}>YOUR PROGRAM IS READY</Animated.Text>
      <Animated.Text style={[styles.subtext, popStyle, { color: palette.muted }]}>
        Everything's built and waiting for you — pick up where you'd like to go next.
      </Animated.Text>

      <View style={styles.ctaStack}>
        <TouchableOpacity
          style={[styles.cta, styles.ctaPrimary, submitting && styles.ctaDisabled]}
          onPress={onStartProgram}
          disabled={submitting}
        >
          <Text style={styles.ctaPrimaryText}>START PROGRAM</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.cta, styles.ctaSecondary, { borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(23,7,7,0.15)' }, submitting && styles.ctaDisabled]}
          onPress={onExplore}
          disabled={submitting}
        >
          <Text style={[styles.ctaSecondaryText, { color: palette.muted }]}>EXPLORE APP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,82,82,0.12)',
    marginBottom: 24,
  },
  headline: {
    fontSize: 26,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
    maxWidth: 300,
  },
  ctaStack: {
    width: '100%',
    maxWidth: 320,
    marginTop: 40,
    gap: 12,
  },
  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimary: {
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 2,
  },
  ctaSecondary: {
    borderWidth: 1,
  },
  ctaSecondaryText: {
    fontSize: 14,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 2,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
});
