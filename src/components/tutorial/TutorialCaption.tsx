import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';

const ACCENT = '#FF5252';

interface TutorialCaptionProps {
  stepIndex: number;
  tag: string;
  caption: string;
}

// Renders just the text content — the opaque card behind it (and behind
// TutorialDots/the nav row) lives one level up, wrapping all three as a
// single panel. See TutorialOverlay's bottomChromeCard for why: this step's
// target can sit high up on a content-dense scrollable page (e.g. Profile),
// where "placed below the target" still lands on real page content further
// down, not empty margin — a per-piece card left the dots/button with no
// backing at all, so that content showed through around them.
export function TutorialCaption({ stepIndex, tag, caption }: TutorialCaptionProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    fade.setValue(0);
    translateY.setValue(10);
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, [stepIndex, fade, translateY]);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY }] }}>
      <Text style={styles.tag}>{tag}</Text>
      <Text style={styles.caption}>{caption}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tag: {
    color: ACCENT,
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  caption: {
    color: '#F5F5F5',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 22,
  },
});
