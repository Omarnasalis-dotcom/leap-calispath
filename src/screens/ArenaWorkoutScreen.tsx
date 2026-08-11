import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, Dimensions, AppState } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArenaPhase, ArenaStep, ArenaService } from '../services/ArenaService';
import { useAuth } from '../contexts/AuthContext';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { Vibration } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { WorldBackground } from '../components/worlds/WorldBackground';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { getWorldTheme, getWorldNeutrals } from '../../constants/worldThemes';
import { NotificationService } from '../services/NotificationService';

const { width } = Dimensions.get('window');

interface ArenaWorkoutScreenProps {
  phase?: ArenaPhase;
  onClose?: () => void;
  onComplete: (time: number) => void;
}

export function ArenaWorkoutScreen({ phase, onClose, onComplete }: ArenaWorkoutScreenProps) {
  const { theme, mode } = useTheme();
  const W = getWorldTheme('strength', mode);
  const WORLD_NEUTRALS = getWorldNeutrals(mode);
  const { user, profile } = useAuth();
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preCountdown, setPreCountdown] = useState(0);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProps, setCelebrationProps] = useState<any>({});

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  // Wall-clock anchor for the trial timer. Set once when the trial goes active
  // and kept across background/foreground cycles, so elapsed time is derived
  // from real time rather than from how many interval ticks the OS let run.
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPreparing && preCountdown > 0) {
      SoundService.playTick();
      interval = setInterval(() => {
        setPreCountdown(prev => prev - 1);
      }, 1000);
    } else if (isPreparing && preCountdown === 0) {
      setIsPreparing(false);
      setIsActive(true);
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
    }
    return () => clearInterval(interval);
  }, [isPreparing, preCountdown]);

  // Anchored to wall-clock time rather than counting interval ticks. JS timers
  // are suspended while the app is backgrounded, so `s => s + 1` silently lost
  // the whole suspended duration — and this elapsed time IS the score that goes
  // to the worldwide Champions Arena leaderboard, where a short time is
  // indistinguishable from a genuinely fast one. Same approach as
  // TrialScreen's prep timer and the inline coaching timers.
  useEffect(() => {
    if (isActive) {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now() - seconds * 1000;
      }
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startTimeRef.current!) / 1000));
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // Recompute the moment the app returns to the foreground, so the displayed
  // time is correct immediately rather than after the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active' && isActive && startTimeRef.current !== null) {
        setSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    });
    return () => sub.remove();
  }, [isActive]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleNextStep = () => {
    const currentStep = phase!.steps[currentStepIdx];
    setCompletedSteps([...completedSteps, currentStep.id]);
    
    if (currentStepIdx < phase!.steps.length - 1) {
      setCurrentStepIdx(currentStepIdx + 1);
    } else {
      // Final step completed
      handleFinish();
    }
  };

  const handleFinish = async () => {
    setIsActive(false);

    // Both failure paths below used to fall through to the celebration screen,
    // so a result that was never recorded still showed "ARENA COMPLETE" and
    // navigated away — and the catch was console.error-only, which production
    // strips. The warrior believed their trial was saved when it wasn't.
    // Alert.alert does not block, so the exit is deferred to the button press —
    // otherwise navigation fires while the alert is still animating in.
    const failAndExit = (title: string, message: string) =>
      Alert.alert(title, message, [{ text: 'OK', onPress: () => onComplete(seconds) }]);

    if (!user) {
      failAndExit('NOT SAVED', 'You appear to be signed out. This trial was not recorded.');
      return;
    }

    if (!ArenaService.isTimeValid(phase!.id, seconds)) {
      failAndExit(
        'TIME NOT ACCEPTED',
        `${formatTime(seconds)} is outside the accepted range for ${phase!.name}, so this attempt was not recorded.`
      );
      return;
    }

    try {
      const { isNewBest } = await ArenaService.saveAttempt(phase!.id, seconds);
      if (isNewBest) {
        NotificationService.notify(
          user.id,
          'arena_pb',
          'New Arena PB!',
          `${phase!.name}: ${formatTime(seconds)} — a new personal best.`,
          { screen: 'champions-arena' }
        );
      }
    } catch (e) {
      console.error('Error saving attempt:', e);
      Sentry.captureException(e, { tags: { feature: 'champions-arena', action: 'saveAttempt' } });
      failAndExit(
        'NOT SAVED',
        `Your time of ${formatTime(seconds)} could not be saved — check your connection. It has not been recorded.`
      );
      return;
    }

    // Reached only when the attempt actually persisted.
    const isPB = seconds < phase!.pro_benchmark_time;
    setCelebrationProps({
      title: isPB ? 'WORLD CLASS' : 'ARENA COMPLETE',
      subtitle: phase!.name,
      stat: formatTime(seconds),
      rank: isPB ? `BEAT THE PRO TIME BY ${formatTime(phase!.pro_benchmark_time - seconds)}` : undefined,
      emoji: isPB ? '🏆' : '⚔️',
      userName: profile?.display_name || 'WARRIOR',
      headerText: 'CHAMPIONS ARENA',
      accentColor: W.accent,
      celebratory: isPB,
    });
    setShowCelebration(true);
  };

  const handleCelebrationDismiss = () => {
    setShowCelebration(false);
    onComplete(seconds);
  };

  const handleAbandon = () => {
    const msg = 'Are you sure you want to quit this Arena Trial? Progress will not be saved.';
    Alert.alert(
      'ABANDON TRIAL',
      msg,
      [
        { text: 'KEEP FIGHTING', style: 'cancel' },
        { text: 'ABANDON', style: 'destructive', onPress: onClose }
      ]
    );
  };

  const currentStep = phase!.steps[currentStepIdx];
  const nextStep = phase!.steps[currentStepIdx + 1];
  
  // Calculate Pace
  const proTimePerStep = phase!.pro_benchmark_time / phase!.steps.length;
  const expectedProTime = proTimePerStep * (currentStepIdx + 1);
  const timeDiff = seconds - expectedProTime;
  const isAhead = timeDiff < 0;

  const handleStartWithLeadIn = () => {
    setPreCountdown(5);
    setIsPreparing(true);
  };

  const cancelPreparation = () => {
    setIsPreparing(false);
    setPreCountdown(0);
  };

  if (!isActive && !isPreparing && seconds === 0) {
    return (
      <GlobalErrorBoundary>
        <WorldBackground world={W}>
        <View style={[styles.container, { justifyContent: 'center' }]}>
        <View style={styles.prepareBox}>
          <Text style={[styles.prepareLabel, { color: W.accent }]}>PREPARE FOR BATTLE</Text>
          <Text style={[styles.prepareTitle, { color: theme.text.primary }]}>{phase!.name}</Text>

          <View style={styles.gearCheck}>
            <Text style={[styles.gearTitle, { color: theme.text.secondary }]}>REQUIRED GEAR</Text>
            {Array.from(new Set(phase!.steps.filter(s => s.added_weight_kg > 0).map(s => s.added_weight_kg))).map((weight, i) => (
              <View key={i} style={styles.gearRow}>
                <MaterialCommunityIcons name="weight-kilogram" size={16} color={theme.accent} />
                <Text style={[styles.gearText, { color: theme.text.primary }]}>+{weight}KG WEIGHT</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[styles.startButton, { backgroundColor: W.accent }]} onPress={handleStartWithLeadIn}>
            <Text style={styles.startButtonText}>LEAP NOW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={[styles.cancelButtonText, { color: theme.text.tertiary }]}>ABANDON ARENA</Text>
          </TouchableOpacity>
        </View>
      </View>
      </WorldBackground>
      </GlobalErrorBoundary>
    );
  }

  if (isPreparing) {
    return (
      <GlobalErrorBoundary>
        <WorldBackground world={W}>
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.prepareLabel, { color: W.accent, fontSize: 24 }]}>{preCountdown}s</Text>
        <Text style={[styles.prepareTitle, { color: theme.text.primary, marginTop: 20 }]}>GET READY</Text>
        <TouchableOpacity style={[styles.cancelButton, { marginTop: 40 }]} onPress={cancelPreparation}>
          <Text style={[styles.cancelButtonText, { color: theme.text.tertiary, fontSize: 16 }]}>CANCEL PREPARATION</Text>
        </TouchableOpacity>
      </View>
      </WorldBackground>
      </GlobalErrorBoundary>
    );

  }

  return (
    <GlobalErrorBoundary>
      <WorldBackground world={W}>
      <View style={styles.container}>
      {/* HUD Header - COMPETITIVE VIEW */}
      <View style={[styles.hudHeader, { borderBottomColor: theme.card.border }]}>
        <View style={styles.hudTimerSection}>
          <Text style={[styles.hudLabel, { color: theme.text.tertiary }]}>MY ARENA TIME</Text>
          <Text style={[styles.hudTime, { color: theme.text.primary }]}>{formatTime(seconds)}</Text>
        </View>

        <View style={styles.hudPaceSection}>
          <View style={styles.targetRow}>
            <Text style={[styles.hudLabel, { color: theme.text.tertiary }]}>TARGET: </Text>
            <Text style={[styles.targetValue, { color: theme.text.primary }]}>{formatTime(phase!.pro_benchmark_time)}</Text>
          </View>
          <Text style={[styles.paceValue, { color: isAhead ? WORLD_NEUTRALS.complete : W.accent }]}>
            {isAhead ? 'AHEAD' : 'BEHIND'} {formatTime(Math.abs(Math.round(timeDiff)))}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress Bar */}
        <View style={[styles.progressBar, { backgroundColor: theme.card.border }]}>
          <View style={[styles.progressFill, { backgroundColor: W.accent, width: `${((currentStepIdx) / phase!.steps.length) * 100}%` }]} />
        </View>

        {/* Current Step Card */}
        <View style={[styles.currentStepCard, { backgroundColor: theme.card.background, borderColor: W.accent }]}>
          <Text style={[styles.stepCounter, { color: W.accent }]}>STEP {currentStepIdx + 1} OF {phase!.steps.length}</Text>
          <Text style={[styles.currentStepName, { color: theme.text.primary }]}>{currentStep.movement_name.toUpperCase()}</Text>
          <View style={styles.currentStepStats}>
            <Text style={[styles.currentStepReps, { color: theme.text.primary }]}>{currentStep.reps}x</Text>
            {currentStep.added_weight_kg > 0 && (
              <View style={[styles.weightBadgeBig, { backgroundColor: W.accent }]}>
                <Text style={styles.weightBadgeText}>+{currentStep.added_weight_kg}KG</Text>
              </View>
            )}
          </View>
          {currentStep.is_unbroken && (
            <View style={[styles.unbrokenTag, { backgroundColor: W.cardFill }]}>
              <MaterialCommunityIcons name="link-variant" size={14} color={W.accent} />
              <Text style={[styles.unbrokenText, { color: W.accent }]}>UNBROKEN PERFORMANCE REQUIRED</Text>
            </View>
          )}
        </View>

        {/* Next Step Preview */}
        {nextStep && (
          <View style={[styles.nextStepCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
            <Text style={[styles.nextLabel, { color: theme.text.tertiary }]}>UP NEXT</Text>
            <Text style={[styles.nextName, { color: theme.text.primary }]}>{nextStep.movement_name.toUpperCase()}</Text>
            <Text style={[styles.nextReps, { color: theme.text.secondary }]}>{nextStep.reps}x {nextStep.added_weight_kg > 0 ? `(+${nextStep.added_weight_kg}kg)` : ''}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.completeStepButton, { backgroundColor: W.accent }]} onPress={handleNextStep}>
          <Text style={styles.completeStepText}>
            {currentStepIdx === phase!.steps.length - 1 ? 'FINISH ARENA' : 'STEP COMPLETED'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.abandonBottomButton} onPress={handleAbandon}>
          <Text style={[styles.abandonBottomText, { color: theme.text.tertiary }]}>ABANDON TRIAL</Text>
        </TouchableOpacity>
      </ScrollView>

      <CelebrationBanner
        visible={showCelebration}
        {...celebrationProps}
        onDismiss={handleCelebrationDismiss}
      />
    </View>
    </WorldBackground>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hudHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 100, // INCREASED to clear floating buttons
    paddingBottom: 24,
    borderBottomWidth: 1,
  },
  abandonX: {
    position: 'absolute',
    top: 60,
    left: 24,
    zIndex: 10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudTimerSection: {
    flex: 1,
  },
  hudLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
  },
  hudTime: {
    fontSize: 48,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginTop: -4,
  },
  hudPaceSection: {
    alignItems: 'flex-end',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  targetValue: {
    fontSize: 16,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  paceValue: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  scrollContent: {
    padding: 24,
  },
  progressBar: {
    height: 4,
    width: '100%',
    borderRadius: 2,
    marginBottom: 32,
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
  weightBadgeBig: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  weightBadgeText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
  },
  unbrokenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  unbrokenText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  nextStepCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    opacity: 0.8,
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
  completeStepButton: {
    paddingVertical: 22,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 40,
  },
  completeStepText: {
    color: '#000',
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
  prepareBox: {
    padding: 32,
    alignItems: 'center',
  },
  prepareLabel: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  prepareTitle: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 32,
  },
  gearCheck: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
    borderRadius: 16,
    marginBottom: 40,
  },
  gearTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  gearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 6,
  },
  gearText: {
    fontSize: 13,
    fontWeight: '700',
  },
  startButton: {
    width: width - 80,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  startButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 4,
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelButtonText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
});
