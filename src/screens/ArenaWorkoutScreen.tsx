import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Platform, Dimensions } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArenaPhase, ArenaStep, ArenaService } from '../services/ArenaService';
import { useAuth } from '../contexts/AuthContext';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { Vibration } from 'react-native';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';

const { width } = Dimensions.get('window');

interface ArenaWorkoutScreenProps {
  phase?: ArenaPhase;
  onClose?: () => void;
  onComplete: (time: number) => void;
}

export function ArenaWorkoutScreen({ phase, onClose, onComplete }: ArenaWorkoutScreenProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preCountdown, setPreCountdown] = useState(0);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

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

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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
    if (user) {
      try {
        await ArenaService.saveAttempt(user.id, phase!.id, seconds);
      } catch (e) {
        console.error('Error saving attempt:', e);
      }
    }

    const isPB = seconds < phase!.pro_benchmark_time;
    const msg = isPB 
      ? `WORLD CLASS! You beat the pro time by ${formatTime(phase!.pro_benchmark_time - seconds)}!` 
      : `Arena Trial Completed in ${formatTime(seconds)}.`;
    
    Alert.alert('CHAMPIONS ARENA', msg);
    
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
        <View style={[styles.container, { backgroundColor: theme.background.primary, justifyContent: 'center' }]}>
        <View style={styles.prepareBox}>
          <Text style={[styles.prepareLabel, { color: '#D32F2F' }]}>PREPARE FOR BATTLE</Text>
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

          <TouchableOpacity style={styles.startButton} onPress={handleStartWithLeadIn}>
            <Text style={styles.startButtonText}>LEAP NOW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={[styles.cancelButtonText, { color: theme.text.tertiary }]}>ABANDON ARENA</Text>
          </TouchableOpacity>
        </View>
      </View>
      </GlobalErrorBoundary>
    );
  }

  if (isPreparing) {
    return (
      <GlobalErrorBoundary>
        <View style={[styles.container, { backgroundColor: theme.background.primary, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={[styles.prepareLabel, { color: '#D32F2F', fontSize: 24 }]}>{preCountdown}s</Text>
        <Text style={[styles.prepareTitle, { color: theme.text.primary, marginTop: 20 }]}>GET READY</Text>
        <TouchableOpacity style={[styles.cancelButton, { marginTop: 40 }]} onPress={cancelPreparation}>
          <Text style={[styles.cancelButtonText, { color: theme.text.tertiary, fontSize: 16 }]}>CANCEL PREPARATION</Text>
        </TouchableOpacity>
      </View>
      </GlobalErrorBoundary>
    );

  }

  return (
    <GlobalErrorBoundary>
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
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
          <Text style={[styles.paceValue, { color: isAhead ? '#4CAF50' : '#D32F2F' }]}>
            {isAhead ? 'AHEAD' : 'BEHIND'} {formatTime(Math.abs(Math.round(timeDiff)))}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Progress Bar */}
        <View style={[styles.progressBar, { backgroundColor: theme.card.border }]}>
          <View style={[styles.progressFill, { backgroundColor: '#D32F2F', width: `${((currentStepIdx) / phase!.steps.length) * 100}%` }]} />
        </View>

        {/* Current Step Card */}
        <View style={[styles.currentStepCard, { backgroundColor: theme.card.background, borderColor: '#D32F2F' }]}>
          <Text style={[styles.stepCounter, { color: '#D32F2F' }]}>STEP {currentStepIdx + 1} OF {phase!.steps.length}</Text>
          <Text style={[styles.currentStepName, { color: theme.text.primary }]}>{currentStep.movement_name.toUpperCase()}</Text>
          <View style={styles.currentStepStats}>
            <Text style={[styles.currentStepReps, { color: theme.text.primary }]}>{currentStep.reps}x</Text>
            {currentStep.added_weight_kg > 0 && (
              <View style={styles.weightBadgeBig}>
                <Text style={styles.weightBadgeText}>+{currentStep.added_weight_kg}KG</Text>
              </View>
            )}
          </View>
          {currentStep.is_unbroken && (
            <View style={styles.unbrokenTag}>
              <MaterialCommunityIcons name="link-variant" size={14} color="#D32F2F" />
              <Text style={styles.unbrokenText}>UNBROKEN PERFORMANCE REQUIRED</Text>
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

        <TouchableOpacity style={styles.completeStepButton} onPress={handleNextStep}>
          <Text style={styles.completeStepText}>
            {currentStepIdx === phase!.steps.length - 1 ? 'FINISH ARENA' : 'STEP COMPLETED'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.abandonBottomButton} onPress={handleAbandon}>
          <Text style={[styles.abandonBottomText, { color: theme.text.tertiary }]}>ABANDON TRIAL</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
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
    backgroundColor: '#D32F2F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  weightBadgeText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
  },
  unbrokenTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
    backgroundColor: 'rgba(211,47,47,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  unbrokenText: {
    color: '#D32F2F',
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
    backgroundColor: '#D32F2F',
    paddingVertical: 22,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 40,
    shadowColor: '#D32F2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
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
    backgroundColor: 'rgba(255,255,255,0.02)',
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
    backgroundColor: '#D32F2F',
    width: width - 80,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  startButtonText: {
    color: '#FFF',
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
