import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ScrollView
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';

interface OnboardingScreenProps {
  onComplete: () => void;
}

const slides = [
  {
    icon: '🏛️',
    title: 'WELCOME TO LEAP',
    subtitle: 'A competitive calisthenics journey',
    body: 'Earn your rank. Complete trials.\nCompete with warriors worldwide.',
  },
  {
    icon: '⚔️',
    title: 'HOW IT WORKS',
    subtitle: 'Three simple steps',
    steps: [
      { number: '①', title: 'ASSESS', desc: 'Measure your current level' },
      { number: '②', title: 'TRIAL', desc: 'Complete workouts to rank up' },
      { number: '③', title: 'COMPETE', desc: 'Battle on the leaderboard' },
    ],
  },
  {
    icon: '🌍',
    title: 'THREE WORLDS AWAIT',
    subtitle: 'Your journey starts with Strength',
    worlds: [
      { emoji: '⚔️', name: 'STRENGTH', desc: 'Timed workout trials' },
      { emoji: '⚡', name: 'POWER', desc: 'Weighted movement mastery' },
      { emoji: '🧊', name: 'STATIC', desc: 'Hold the impossible' },
    ],
    body: 'Unlock more worlds as you grow stronger.',
  },
];

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { theme } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);

  const isLast = currentSlide === slides.length - 1;
  const slide = slides[currentSlide];

  function handleNext() {
    if (isLast) {
      onComplete();
    } else {
      setCurrentSlide(currentSlide + 1);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
        <Text style={[styles.skipText, { color: theme.text.tertiary }]}>Skip →</Text>
      </TouchableOpacity>

      {/* Slide Content */}
      <View style={styles.content}>
        {/* Icon */}
        <Text style={styles.icon}>{slide.icon}</Text>

        {/* Title */}
        <Text style={[styles.title, { color: theme.accent }]}>{slide.title}</Text>
        <Text style={[styles.subtitle, { color: theme.text.secondary }]}>{slide.subtitle}</Text>

        {/* Slide 1 — Body text */}
        {'body' in slide && !('worlds' in slide) && (
          <View style={[styles.card, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
            <Text style={[styles.body, { color: theme.text.primary }]}>{slide.body}</Text>
          </View>
        )}

        {/* Slide 2 — Steps */}
        {'steps' in slide && (
          <View style={styles.stepsContainer}>
            {slide.steps!.map((step, i) => (
              <View key={i} style={[styles.stepCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.stepNumber, { color: theme.accent }]}>{step.number}</Text>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: theme.text.primary }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: theme.text.secondary }]}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Slide 3 — Worlds */}
        {'worlds' in slide && (
          <View style={styles.worldsContainer}>
            {slide.worlds!.map((world, i) => (
              <View key={i} style={[styles.worldCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={styles.worldEmoji}>{world.emoji}</Text>
                <View>
                  <Text style={[styles.worldName, { color: theme.accent }]}>{world.name}</Text>
                  <Text style={[styles.worldDesc, { color: theme.text.secondary }]}>{world.desc}</Text>
                </View>
              </View>
            ))}
            <Text style={[styles.body, { color: theme.text.tertiary, marginTop: 16 }]}>{slide.body}</Text>
          </View>
        )}
      </View>

      {/* Dots */}
      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { backgroundColor: i === currentSlide ? theme.accent : theme.card.border }
            ]}
          />
        ))}
      </View>

      {/* Next Button */}
      <TouchableOpacity
        style={[styles.nextButton, { backgroundColor: theme.accent }]}
        onPress={handleNext}
      >
        <Text style={styles.nextButtonText}>
          {isLast ? 'BEGIN YOUR JOURNEY →' : 'NEXT →'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  skipButton: { alignSelf: 'flex-end', padding: 8 },
  skipText: { fontSize: 13, letterSpacing: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  icon: { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, textAlign: 'center', marginBottom: 32, letterSpacing: 1 },
  card: { width: '100%', padding: 24, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  body: { fontSize: 16, textAlign: 'center', lineHeight: 26 },
  stepsContainer: { width: '100%', gap: 12 },
  stepCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, gap: 16 },
  stepNumber: { fontSize: 24, fontWeight: '900' },
  stepText: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
  stepDesc: { fontSize: 13 },
  worldsContainer: { width: '100%', gap: 10, alignItems: 'center' },
  worldCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, gap: 16, width: '100%' },
  worldEmoji: { fontSize: 28 },
  worldName: { fontSize: 14, fontWeight: '900', letterSpacing: 2, marginBottom: 2 },
  worldDesc: { fontSize: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  nextButton: { paddingVertical: 18, borderRadius: 8, alignItems: 'center' },
  nextButtonText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: 2, fontSize: 14 },
});
