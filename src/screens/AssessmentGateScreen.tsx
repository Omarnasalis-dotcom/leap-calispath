import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

interface AssessmentGateScreenProps {
  onStartAssessment?: () => void;
}

const { width } = Dimensions.get('window');

const STORY_SLIDES = [
  {
    id: 1,
    icon: '🦁',
    title: 'THE FIRST LEAP',
    subtitle: 'From Helot to ETERNITY',
    content: [],
    storyText: 'Your journey from Helot to ETERNITY starts here. A Spartan isn\'t born; they are built through the Leap Journey.',
    buttonText: 'LEAP STORY →',
    theme: 'helmet',
  },
  {
    id: 2,
    icon: '⚖️',
    title: 'THE 4 PILLARS',
    subtitle: 'Balance is Law',
    content: [
      { title: 'PUSH-UPS', desc: 'Pressing Strength' },
      { title: 'SQUATS', desc: 'Lower Body Power' },
      { title: 'PULL-UPS', desc: 'Pulling Mastery' },
      { title: 'DIPS', desc: 'Tricep Strength' },
    ],
    storyText: 'Master the 4 Pillars. Remember the Weakest Link Rule: your rank is only as high as your lowest-performing movement.',
    buttonText: 'LEAP STORY →',
    theme: 'pillars',
  },
  {
    id: 3,
    icon: '⏱️',
    title: 'EARN YOUR RANK',
    subtitle: 'Beat the Clock',
    content: [],
    storyText: 'Ranks are earned in the arena. Beat the clock in a Trial Workout to claim your new rank and etch it into history.',
    buttonText: 'LEAP STORY →',
    theme: 'stopwatch',
  },
  {
    id: 4,
    icon: '�',
    title: 'UNLOCK THE LEGEND',
    subtitle: 'Reach Strategos',
    content: [],
    storyText: 'Reach Tier 6 (Strategos) to unlock the Power World. Multiply Muscle-ups by 2x and chase Eternity—where your strength becomes legend.',
    buttonText: 'BEGIN ASSESSMENT',
    theme: 'legend',
  },
];

export function AssessmentGateScreen({ onStartAssessment }: AssessmentGateScreenProps) {
  const { theme } = useTheme();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideAnim = new Animated.Value(0);

  const nextSlide = () => {
    if (currentSlide < STORY_SLIDES.length - 1) {
      Animated.timing(slideAnim, {
        toValue: -(currentSlide + 1) * width,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setCurrentSlide(currentSlide + 1);
      });
    } else {
      router.replace('/assessment');
    }
  };

  const currentStory = STORY_SLIDES[currentSlide];
  const isLastSlide = currentSlide === STORY_SLIDES.length - 1;

  return (
    <GlobalErrorBoundary>
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* Progress Dots */}
      <View style={styles.progressContainer}>
        {STORY_SLIDES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              {
                backgroundColor: index === currentSlide ? theme.accent : theme.card.border,
                width: index === currentSlide ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Slide 1: Helmet Emblem */}
          {currentStory.theme === 'helmet' && (
            <View style={styles.helmetContainer}>
              <View style={[styles.helmetGlow, { shadowColor: theme.accent }]} />
              <Text style={styles.helmetIcon}>🏛️</Text>
            </View>
          )}

          {/* Slide 2: Four Pillars 3D Modern */}
          {currentStory.theme === 'pillars' && (
            <View style={styles.pillarsContainer}>
              {currentStory.content.map((item, index) => (
                <View key={index} style={[styles.pillarCard3D, { backgroundColor: theme.card.background, borderColor: theme.accent }]}>
                  <Text style={[styles.pillarTitle3D, { color: theme.text.primary }]}>{item.title}</Text>
                  <View style={[styles.pillarLine, { backgroundColor: theme.accent }]} />
                  <Text style={[styles.pillarDesc3D, { color: theme.text.secondary }]}>{item.desc}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Slide 3: Stopwatch */}
          {currentStory.theme === 'stopwatch' && (
            <View style={styles.stopwatchContainer}>
              <View style={[styles.stopwatchRing, { borderColor: theme.accent }]}>
                <Text style={[styles.stopwatchTime, { color: theme.accent }]}>00:00</Text>
                <View style={[styles.stopwatchDot, { backgroundColor: theme.accent }]} />
              </View>
            </View>
          )}

          {/* Slide 4: Legend Gate */}
          {currentStory.theme === 'legend' && (
            <View style={styles.legendContainer}>
              <View style={[styles.gateShatter, { borderColor: theme.accent }]}>
                <Text style={styles.gateIcon}>⚡</Text>
                <View style={[styles.goldGlow, { backgroundColor: theme.accent }]} />
              </View>
            </View>
          )}

          {/* Title */}
          <Text style={[styles.title, { color: theme.accent }]}>
            {currentStory.title}
          </Text>

          {/* Subtitle */}
          <Text style={[styles.subtitle, { color: theme.text.secondary }]}>
            {currentStory.subtitle}
          </Text>

          {/* Story Text */}
          <View style={[styles.storyTextContainer, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: theme.card.border }]}>
            <Text style={[styles.storyText, { color: theme.text.secondary }]}>
              {currentStory.storyText}
            </Text>
          </View>

          {/* Navigation Button */}
          <TouchableOpacity
            onPress={nextSlide}
            style={[styles.leapButton, { backgroundColor: theme.accent }]}
          >
            <Text style={styles.leapButtonText}>
              {currentStory.buttonText}
            </Text>
          </TouchableOpacity>

          {/* Skip Option (on first slides) */}
          {!isLastSlide && (
            <TouchableOpacity
              onPress={onStartAssessment}
              style={styles.skipButton}
            >
              <Text style={[styles.skipText, { color: theme.text.tertiary }]}>
                Skip story →
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
      </View>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: 20,
    gap: 8,
  },
  progressDot: {
    height: 8,
    borderRadius: 4,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: 24,
    paddingTop: 0,
  },
  // Slide 1: Helmet
  helmetContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  helmetGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 15,
  },
  helmetIcon: {
    fontSize: 80,
  },
  // Slide 2: Pillars
  pillarsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 24,
    gap: 12,
  },
  pillarCard3D: {
    width: '44%',
    borderRadius: 12,
    borderWidth: 2,
    borderLeftWidth: 4,
    paddingVertical: 24,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  pillarTitle3D: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  pillarLine: {
    width: 32,
    height: 2,
    marginBottom: 6,
    borderRadius: 1,
  },
  pillarDesc3D: {
    fontSize: 11,
    textAlign: 'center',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // Slide 3: Stopwatch
  stopwatchContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stopwatchRing: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  stopwatchTime: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  stopwatchDot: {
    position: 'absolute',
    top: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // Slide 4: Legend Gate
  legendContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    position: 'relative',
  },
  gateShatter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gateIcon: {
    fontSize: 48,
    zIndex: 2,
  },
  goldGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.3,
    zIndex: 1,
  },
  // Common
  title: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  subtitle: {
    fontSize: 14,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  storyTextContainer: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 32,
  },
  storyText: {
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  leapButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignSelf: 'center',
    marginBottom: 16,
  },
  leapButtonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  skipButton: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
});
