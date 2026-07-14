import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

const ACCENT = '#FF5252';

interface TutorialCaptionProps {
  stepIndex: number;
  tag: string;
  caption: string;
}

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
    <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY }] }]}>
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(20,10,10,0.9)', 'rgba(10,6,6,0.9)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <Text style={styles.tag}>{tag}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.28)',
    overflow: 'hidden',
  },
  content: {
    paddingVertical: 18,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
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
