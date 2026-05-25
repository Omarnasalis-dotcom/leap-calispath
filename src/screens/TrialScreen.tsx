import { useRouter } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { Vibration } from 'react-native';
import { getTrialForTier, formatTime, Trial } from '../lib/trials';
import { TIER_NAMES } from '../types';

import { TrialService } from '../services/TrialService';
import { useTimer } from '../hooks/useTimer';

const TIER_HARD_FLOORS: Record<number, number> = {
  0: 25,
  1: 90,
  2: 150,
  3: 180,
  4: 200,
  5: 220,
  6: 250,
  7: 360,
  8: 480,
};

type TrialMode = 'progression' | 'practice' | 'eternal';

interface TrialScreenProps {
  mode?: TrialMode;
  practiceTier?: number | null;
  onComplete?: () => void;
  onAbandon?: () => void;
  onBack?: () => void;
}

export function TrialScreen({
  mode = 'progression',
  practiceTier = null,
  onComplete,
  onAbandon,
  onBack,
}: TrialScreenProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const [trial, setTrial] = useState<Trial | null>(null);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const [showDishonor, setShowDishonor] = useState(false);
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);

  const getTierAccentColor = (tier: number) => {
    if (tier <= 2) return '#B0BEC5'; // Foundation - Steel
    if (tier <= 5) return '#FF7043'; // Crucible - Orange
    if (tier <= 8) return '#D32F2F'; // Abyss - Deep Red
    return '#FFD700'; // Eternity - Gold
  };

  const accentColor = trial ? getTierAccentColor(trial.tier) : theme.accent;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lightningAnim = useRef(new Animated.Value(0)).current;
  const dishonorOpacity = useRef(new Animated.Value(0)).current;
  const dishonorScale = useRef(new Animated.Value(0.8)).current;
  const lineWidth = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const buttonOpacity = useRef(new Animated.Value(0)).current;

  const { seconds: timeSeconds, isRunning, start: startTimer, stop: stopTimer } = useTimer();

  useEffect(() => {
    if (showDishonor) {
      Animated.sequence([
        Animated.timing(dishonorOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(dishonorScale, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(lineWidth, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(textOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(buttonOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]).start();
    }
  }, [showDishonor]);

  // Determine which tier to use
  const nextTier = profile ? profile.strength_tier : 0;
  const targetTier = mode === 'practice' && practiceTier !== null
    ? practiceTier
    : mode === 'eternal'
      ? 8 // Demigod Eternal
      : nextTier;

  useEffect(() => {
    if (profile && !hasStarted && !trial) {
      const t = getTrialForTier(targetTier);
      if (t) {
        setTrial(t);
        setCurrentStepIdx(0);
      }
    }
  }, [profile, targetTier, hasStarted, trial]);

  useEffect(() => {
    if (isRunning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRunning]);

  function startTrial() {
    setPrepCountdown(5);
  }

  function cancelPreparation() {
    setPrepCountdown(null);
  }

  useEffect(() => {
    if (prepCountdown === null) return;

    if (prepCountdown > 0) {
      SoundService.playTick();
      const timer = setTimeout(() => setPrepCountdown(prepCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setHasStarted(true);
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
      startTimer();
    }
  }, [prepCountdown]);

  function handleNextStep() {
    if (!hasStarted || !trial) return;
    
    if (currentStepIdx < trial.movements.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
    } else {
      handleClaimRank();
    }
  }

  async function doAbandon() {
    if (user && trial) {
      await TrialService.logAbandon(user.id, trial.tier, timeSeconds);
    }
    onBack ? onBack() : null;
  }

  function handleBack() {
    const title = hasStarted ? 'Abandon Trial?' : 'Exit Trial?';
    const message = hasStarted 
      ? 'Abandon Trial? This attempt will be logged as incomplete. Your rank will not change.'
      : 'Exit Trial?';
    
    if (Platform.OS === 'web') {
      // Standard window.confirm is the most reliable way to block on web
      // We use a tiny delay to ensure the touch event has finished processing
      setTimeout(() => {
        if (window.confirm(`${title}\n\n${message}`)) {
          if (hasStarted) doAbandon();
          else onBack ? onBack() : null;
        }
      }, 50);
    } else {
      Alert.alert(
        title,
        message,
        [
          { text: hasStarted ? 'Continue Trial' : 'Cancel', style: 'cancel' },
          { 
            text: hasStarted ? 'Abandon' : 'Exit', 
            style: 'destructive', 
            onPress: () => {
              if (hasStarted) doAbandon();
              else onBack ? onBack() : null;
            } 
          },
        ],
        { cancelable: true }
      );
    }
  }

  function handleAbandon() {
    handleBack();
  }

  async function handleClaimRank() {
    if (!user || !trial || !profile) return;

    if (!TrialService.isTimeValid(trial.tier, timeSeconds)) {
      setShowDishonor(true);
      return;
    }

    setLoading(true);
    stopTimer();

    try {
      await TrialService.submitResult({
        userId: user.id,
        tier: trial.tier,
        timeSeconds,
        isProgression: mode === 'progression',
      });

      // CRITICAL: Await the profile refresh before showing victory
      await refreshProfile();

      if (mode === 'progression') {
        setShowVictory(true);
      } else {
        onBack ? onBack() : null;
      }
    } catch (error: any) {
      if (error.message?.includes('DISHONOR')) {
        setShowDishonor(true);
      } else {
        Alert.alert('Error', error.message || 'Failed to save time');
      }
    } finally {
      setLoading(false);
    }
  }

  // removed allCompleted and canClaim logic here

  if (!trial) {
    return (
      <View style={styles.container}>
        <Text style={[styles.loadingText, { color: theme.text.secondary }]}>Loading trial...</Text>
      </View>
    );
  }

  if (showDishonor) {
    return (
      <Animated.View style={{
        flex: 1,
        backgroundColor: '#0A0A0F',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        opacity: dishonorOpacity,
      }}>
        {/* Background red glow */}
        <View style={{
          position: 'absolute',
          width: 300,
          height: 300,
          borderRadius: 150,
          backgroundColor: 'rgba(139, 0, 0, 0.08)',
          top: '25%',
        }} />

        <Animated.View style={{
          transform: [{ scale: dishonorScale }],
          alignItems: 'center',
          width: '100%',
        }}>
          {/* Sword Icon with glow */}
          <View style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: 'rgba(139,0,0,0.15)',
            borderWidth: 1,
            borderColor: 'rgba(139,0,0,0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 40,
            shadowColor: '#8B0000',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.8,
            shadowRadius: 20,
          }}>
            <Text style={{ fontSize: 56 }}>⚔️</Text>
          </View>

          {/* Animated top line */}
          <Animated.View style={{
            height: 1,
            backgroundColor: '#8B0000',
            marginBottom: 20,
            width: lineWidth.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '80%'],
            }),
          }} />

          {/* Title */}
          <Text style={{
            fontSize: 40,
            fontWeight: '900',
            color: '#8B0000',
            letterSpacing: 12,
            marginBottom: 8,
            textAlign: 'center',
          }}>
            DISHONOR
          </Text>

          {/* Subtitle */}
          <Text style={{
            fontSize: 11,
            color: 'rgba(139,0,0,0.6)',
            letterSpacing: 4,
            marginBottom: 20,
          }}>
            TRIAL INVALIDATED
          </Text>

          {/* Animated bottom line */}
          <Animated.View style={{
            height: 1,
            backgroundColor: '#8B0000',
            marginBottom: 48,
            width: lineWidth.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '80%'],
            }),
          }} />

          {/* Message */}
          <Animated.Text style={{
            fontSize: 15,
            color: 'rgba(255,255,255,0.65)',
            textAlign: 'center',
            lineHeight: 32,
            marginBottom: 20,
            opacity: textOpacity,
            fontStyle: 'italic',
          }}>
            A true warrior earns their rank.{'\n'}
            Your time defies human limits —{'\n'}
            this trial has been struck from{'\n'}
            the records.
          </Animated.Text>

          {/* Time Breakdown */}
          <Animated.View style={{ opacity: textOpacity, alignItems: 'center', marginBottom: 40 }}>
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, letterSpacing: 1 }}>
              YOUR TIME: <Text style={{ color: '#FF4444', fontWeight: 'bold' }}>{formatTime(timeSeconds)}</Text>
            </Text>
          </Animated.View>

          {/* Button */}
          <Animated.View style={{ width: '100%', opacity: buttonOpacity }}>
            <TouchableOpacity
              style={{
                width: '100%',
                paddingVertical: 18,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: '#8B0000',
                backgroundColor: 'rgba(139,0,0,0.1)',
                alignItems: 'center',
              }}
              onPress={() => { onBack ? onBack() : onAbandon?.(); }}
            >
              <Text style={{
                color: '#CC0000',
                fontWeight: '900',
                letterSpacing: 4,
                fontSize: 13,
              }}>
                RETURN TO TRAINING
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    );
  }

  if (showVictory) {
    return (
      <VictoryScreen
        tier={trial.tier}
        timeSeconds={timeSeconds}
        onContinue={onComplete}
      />
    );
  }

  const currentStep = trial.movements[currentStepIdx];
  const nextStep1 = currentStepIdx + 1 < trial.movements.length ? trial.movements[currentStepIdx + 1] : null;
  const nextStep2 = currentStepIdx + 2 < trial.movements.length ? trial.movements[currentStepIdx + 2] : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.card.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <MaterialCommunityIcons name="chevron-left" size={32} color={accentColor} />
        </TouchableOpacity>
        <View style={[styles.headerTitleFrame, { borderColor: accentColor }]}>
          <Text style={[styles.title, { color: theme.text.primary }]}>{trial.name.toUpperCase()}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Badges */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
          {mode === 'practice' && (
            <View style={[styles.badge, { backgroundColor: 'rgba(205,127,50,0.2)' }]}>
              <Text style={[styles.badgeText, { color: theme.accent }]}>PRACTICE MODE</Text>
            </View>
          )}
          {mode === 'eternal' && (
            <View style={[styles.badge, { backgroundColor: accentColor }]}>
              <Text style={[styles.badgeText, { color: '#FFF' }]}>ETERNAL</Text>
            </View>
          )}
          <View style={[styles.badge, { backgroundColor: theme.card.border }]}>
            <Text style={[styles.badgeText, { color: theme.text.primary }]}>TIER {targetTier}</Text>
          </View>
        </View>

        {/* Timer Frame */}
        <View style={styles.timerFrameContainer}>
          <Animated.View style={[styles.timerContainer, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={[styles.timerLabel, { color: theme.text.tertiary, marginBottom: 4 }]}>
              {hasStarted ? 'TRIAL CLOCK' : 'READY'}
            </Text>
            <Text style={[styles.timer, { color: '#FFFFFF' }]}>{formatTime(timeSeconds)}</Text>
          </Animated.View>
        </View>

        {/* Trial Overview (Before Start) */}
        {!hasStarted && prepCountdown === null && (
          <View style={styles.overviewContainer}>
            <Text style={[styles.overviewTitle, { color: theme.text.tertiary }]}>TRIAL OVERVIEW</Text>
            {trial.movements.map((movement, idx) => (
              <View key={idx} style={[styles.overviewRow, { borderBottomColor: theme.card.border }]}>
                <Text style={[styles.overviewNum, { color: accentColor }]}>{idx + 1}</Text>
                <Text style={[styles.overviewName, { color: theme.text.primary }]}>{movement.name}</Text>
                <Text style={[styles.overviewReps, { color: theme.text.secondary }]}>{movement.reps}x</Text>
              </View>
            ))}
          </View>
        )}

        {/* START TRIAL Button */}
        {!hasStarted && prepCountdown === null && (
          <TouchableOpacity 
            style={[styles.mainStartButton, { backgroundColor: accentColor }]}
            onPress={startTrial}
          >
            <Text style={styles.mainStartButtonText}>BEGIN TRIAL</Text>
            <MaterialCommunityIcons name="sword-cross" size={20} color="#FFF" />
          </TouchableOpacity>
        )}

        {/* Countdown */}
        {!hasStarted && prepCountdown !== null && (
          <View style={styles.countdownContainer}>
            <Text style={[styles.countdownText, { color: accentColor }]}>
              {prepCountdown === 0 ? 'GO!' : prepCountdown}
            </Text>
            <Text style={{ color: theme.text.tertiary, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 10 }}>GET READY</Text>
            <TouchableOpacity 
              style={[styles.cancelBtn, { borderColor: theme.text.tertiary, marginTop: 40, paddingHorizontal: 20 }]} 
              onPress={cancelPreparation}
            >
              <Text style={[styles.cancelBtnText, { color: theme.text.tertiary }]}>CANCEL PREPARATION</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Workout Sequence */}
        {hasStarted && (
          <View style={styles.mainDisplay}>
            {/* Progress Bar */}
            <View style={[styles.progressBar, { backgroundColor: theme.card.border }]}>
              <View style={[styles.progressFill, { backgroundColor: accentColor, width: `${(currentStepIdx / trial.movements.length) * 100}%` }]} />
            </View>

            {/* Current Step Card */}
            <View style={[styles.currentStepCard, { backgroundColor: theme.card.background, borderColor: accentColor }]}>
              <Text style={[styles.stepCounter, { color: accentColor }]}>STEP {currentStepIdx + 1} OF {trial.movements.length}</Text>
              <Text style={[styles.currentStepName, { color: theme.text.primary }]}>{currentStep.name.toUpperCase()}</Text>
              <View style={styles.currentStepStats}>
                <Text style={[styles.currentStepReps, { color: theme.text.primary }]}>{currentStep.reps}x</Text>
              </View>
            </View>

            {/* Upcoming Steps Preview */}
            {(nextStep1 || nextStep2) && (
              <View style={styles.upcomingSection}>
                <Text style={[styles.nextLabel, { color: theme.text.tertiary, marginBottom: 8 }]}>UPCOMING</Text>
                
                {nextStep1 && (
                  <View style={[styles.nextStepCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                    <Text style={[styles.nextName, { color: theme.text.primary }]}>{nextStep1.name.toUpperCase()}</Text>
                    <Text style={[styles.nextReps, { color: theme.text.secondary }]}>{nextStep1.reps}x</Text>
                  </View>
                )}
                
                {nextStep2 && (
                  <View style={[styles.nextStepCard, { backgroundColor: theme.card.background, borderColor: theme.card.border, opacity: 0.5, marginTop: 8 }]}>
                    <Text style={[styles.nextName, { color: theme.text.primary }]}>{nextStep2.name.toUpperCase()}</Text>
                    <Text style={[styles.nextReps, { color: theme.text.secondary }]}>{nextStep2.reps}x</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity 
              style={[styles.completeStepButton, { backgroundColor: accentColor }]} 
              onPress={handleNextStep}
            >
              <Text style={styles.completeStepText}>
                {currentStepIdx === trial.movements.length - 1 ? 'FINISH TRIAL' : 'STEP COMPLETED'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.abandonBottomButton} onPress={handleAbandon}>
              <Text style={[styles.abandonBottomText, { color: theme.text.tertiary }]}>ABANDON TRIAL</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function VictoryScreen({
  tier,
  timeSeconds,
  onContinue,
}: {
  tier: number;
  timeSeconds: number;
  onContinue?: () => void;
}) {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.5));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const tierName = TIER_NAMES[tier];

  return (
    <View style={styles.victoryContainer}>
      <Animated.View
        style={[
          styles.victoryContent,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Text style={styles.victoryLabel}>RANK UP</Text>
        <View style={styles.victorySeal}>
          <Text style={styles.victorySealText}>{tierName[0]}</Text>
        </View>
        <Text style={styles.victoryTier}>{tierName.toUpperCase()}</Text>
        <Text style={styles.victorySubtitle}>Tier {tier}</Text>
        <Text style={styles.victoryTime}>Time: {formatTime(timeSeconds)}</Text>

        {tier >= 6 && (
          <Text style={styles.strategosMessage}>
            Power & Statics worlds unlocked!
          </Text>
        )}

        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
          <Text style={styles.continueButtonText}>CONTINUE</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleFrame: {
    borderWidth: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  trialName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 2,
    textAlign: 'center',
  },
  tierLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  modeBadge: {
    fontSize: 12,
    color: '#CD7F32',
    backgroundColor: 'rgba(205,127,50,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 8,
    letterSpacing: 2,
  },
  eternalBadge: {
    fontSize: 12,
    color: '#FFFFFF',
    backgroundColor: '#8B0000',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 8,
    letterSpacing: 2,
  },
  timerFrameContainer: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 20,
  },
  timerContainer: {
    alignItems: 'center',
  },
  timer: {
    fontSize: 56,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 12,
    letterSpacing: 4,
    fontWeight: '900',
  },
  mainStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    marginHorizontal: 20,
  },
  mainStartButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  countdownContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  countdownText: {
    fontSize: 80,
    fontWeight: '900',
  },
  cancelBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mainDisplay: {
    width: '100%',
  },
  progressBar: {
    height: 4,
    width: '100%',
    borderRadius: 2,
    marginBottom: 24,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  currentStepCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    marginBottom: 20,
  },
  stepCounter: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 12,
  },
  currentStepName: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 16,
  },
  currentStepStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  currentStepReps: {
    fontSize: 48,
    fontWeight: '900',
  },
  nextStepCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  nextLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  nextName: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  nextReps: {
    fontSize: 12,
    fontWeight: '700',
  },
  overviewContainer: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
  },
  overviewTitle: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 16,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  overviewNum: {
    width: 24,
    fontSize: 14,
    fontWeight: '900',
  },
  overviewName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  overviewReps: {
    fontSize: 14,
    fontWeight: '900',
  },
  upcomingSection: {
    marginTop: 8,
  },
  completeStepButton: {
    paddingVertical: 22,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 32,
    elevation: 8,
  },
  completeStepText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
  },
  abandonBottomButton: {
    paddingVertical: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  abandonBottomText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    opacity: 0.6,
  },
  victoryTime: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 24,
  },
  strategosMessage: {
    fontSize: 14,
    color: '#CD7F32',
    fontStyle: 'italic',
    marginTop: 16,
  },
  continueButton: {
    marginTop: 48,
    backgroundColor: '#8B0000',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 8,
    shadowColor: '#8B0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
  },
  victoryContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  victoryContent: {
    alignItems: 'center',
    padding: 24,
  },
  victoryLabel: {
    fontSize: 18,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 4,
    marginBottom: 24,
  },
  victorySeal: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(205,127,50,0.2)',
    borderWidth: 3,
    borderColor: '#CD7F32',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#CD7F32',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  victorySealText: {
    fontSize: 72,
    fontWeight: '900',
    color: '#CD7F32',
  },
  victoryTier: {
    fontSize: 36,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 4,
  },
  victorySubtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
});
