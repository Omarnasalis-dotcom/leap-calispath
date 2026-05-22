import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, ScrollView, Image
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { LeapLogo } from '../components/LeapLogo';

interface OnboardingScreenProps {
  onComplete?: () => void;
}

const slides = [
  {
    localImage: require('../../assets/leap_logo_splash.png'),
    title: '',
    subtitle: '',
    isLogoSlide: true,
  },
  {
    localImage: require('../../assets/slide1.png'),
    title: 'WELCOME TO THE ARENA',
    subtitle: 'A competitive calisthenics journey',
    body: 'Earn your rank. Complete trials.\nCompete with warriors worldwide.',
  },
  {
    localImage: require('../../assets/slide2.png'),
    title: 'THREE WORLDS OF MASTERY',
    subtitle: 'Choose your path',
    worlds: [
      { name: 'STRENGTH', desc: 'Master high-rep endurance and time trials' },
      { name: 'POWER', desc: 'Conquer weighted movements and 1-Rep Maxes' },
      { name: 'STATICS', desc: 'Defy gravity with isometric holds and skills' },
    ],
  },
  {
    localImage: require('../../assets/slide3.png'),
    title: 'ASSESS & CLIMB',
    subtitle: 'The Tier System',
    body: 'Take the initial Assessment to discover your baseline. From Helot to Eternity, every rank must be earned through blood, sweat, and iron.',
  },
  {
    localImage: require('../../assets/slide4.png'),
    title: 'THE TRIALS',
    subtitle: 'Prove yourself',
    body: 'Complete grueling physical Trials to unlock the next tier. Your best times are forged into the Global Leaderboards. Will you be the King?',
  },
];

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const { theme } = useTheme();
  const { completeOnboarding } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);

  const isLast = currentSlide === slides.length - 1;
  const slide = slides[currentSlide];

  async function handleNext() {
    if (isLast) {
      if (onComplete) {
        onComplete();
      } else {
        await completeOnboarding();
      }
    } else {
      setCurrentSlide(currentSlide + 1);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: '#000' }]}>
      {/* Full Background Image with Gradient Overlay */}
      <View style={StyleSheet.absoluteFillObject}>
        {slide.isLogoSlide ? (
          <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
            <LeapLogo size={280} animated />
          </View>
        ) : (
          <>
            <Image 
              source={slide.localImage} 
              style={StyleSheet.absoluteFillObject} 
              resizeMode="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)', 'rgba(0,0,0,1)']}
              style={StyleSheet.absoluteFillObject}
            />
          </>
        )}
      </View>

      {/* Skip Button */}
      <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
        <Text style={[styles.skipText, { color: 'rgba(255,255,255,0.6)' }]}>Skip →</Text>
      </TouchableOpacity>

      {/* Slide Content */}
      <View style={styles.content}>
        
        {/* Title */}
        {!!slide.title && <Text style={[styles.title, { color: theme.accent }]}>{slide.title}</Text>}
        {!!slide.subtitle && <Text style={[styles.subtitle, { color: '#FFF' }]}>{slide.subtitle}</Text>}

        {/* Slide Body text */}
        {'body' in slide && (
          <View style={[styles.card, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }]}>
            <Text style={[styles.body, { color: '#FFF' }]}>{slide.body}</Text>
          </View>
        )}

        {/* Slide Worlds */}
        {'worlds' in slide && (
          <View style={styles.worldsContainer}>
            {slide.worlds!.map((world, i) => (
              <View key={i} style={[styles.worldCard, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }]}>
                <View style={styles.worldText}>
                  <Text style={[styles.worldTitle, { color: theme.accent }]}>{world.name}</Text>
                  <Text style={[styles.worldDesc, { color: 'rgba(255,255,255,0.7)' }]}>{world.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.progressDots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentSlide && [styles.dotActive, { backgroundColor: theme.accent }]
              ]}
            />
          ))}
        </View>

        {/* Next Button */}
        <TouchableOpacity
          style={[styles.button, { backgroundColor: theme.accent }]}
          onPress={handleNext}
        >
          <Text style={styles.buttonText}>
            {isLast ? 'BEGIN YOUR JOURNEY' : 'CONTINUE'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    padding: 32,
    justifyContent: 'flex-end',
    paddingBottom: 160,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 32,
    zIndex: 10,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 32,
  },
  card: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  worldsContainer: {
    gap: 12,
  },
  worldCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  worldText: {
    flex: 1,
  },
  worldTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  worldDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    left: 32,
    right: 32,
  },
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    width: 24,
  },
  button: {
    width: '100%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
