import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { getTrialForTier, formatTime, Trial } from '../lib/trials';
import { TIER_NAMES } from '../types';
import { Button } from '../components/Button';

type TrialMode = 'progression' | 'practice' | 'eternal';

interface TrialScreenProps {
  mode?: TrialMode;
  practiceTier?: number | null;
  onComplete: () => void;
  onAbandon: () => void;
}

export function TrialScreen({
  mode = 'progression',
  practiceTier = null,
  onComplete,
  onAbandon,
}: TrialScreenProps) {
  const { user, profile, refreshProfile } = useAuth();
  const { theme } = useTheme();
  const [trial, setTrial] = useState<Trial | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [timeSeconds, setTimeSeconds] = useState(0);
  const [completedMovements, setCompletedMovements] = useState<boolean[]>([]);
  const [hasStarted, setHasStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVictory, setShowVictory] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const lightningAnim = useRef(new Animated.Value(0)).current;

  // Determine which tier to use
  const nextTier = profile ? profile.strength_tier + 1 : 0;
  const targetTier = mode === 'practice' && practiceTier !== null
    ? practiceTier
    : mode === 'eternal'
    ? 8 // Demigod Eternal
    : nextTier;

  useEffect(() => {
    if (profile) {
      const t = getTrialForTier(targetTier);
      if (t) {
        setTrial(t);
        setCompletedMovements(new Array(t.movements.length).fill(false));
      }
    }
  }, [profile, targetTier]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        setTimeSeconds((s) => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

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

  function toggleMovement(index: number) {
    if (!hasStarted) {
      setHasStarted(true);
      if (!isRunning) {
        setIsRunning(true);
      }
    }

    setCompletedMovements((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  async function doAbandon() {
    if (user && trial) {
      await supabase.from('trial_history').insert({
        user_id: user.id,
        tier_attempted: trial.tier,
        completed: false,
        time_seconds: timeSeconds,
      });
    }
    onAbandon();
  }

  function handleAbandon() {
    if (Platform.OS === 'web') {
      // Web fallback - use confirm
      if (window.confirm('Abandon Trial? This attempt will be logged as incomplete. Your rank will not change.')) {
        doAbandon();
      }
    } else {
      Alert.alert(
        'Abandon Trial?',
        'This attempt will be logged as incomplete. Your rank will not change.',
        [
          { text: 'Continue Trial', style: 'cancel' },
          {
            text: 'Abandon',
            style: 'destructive',
            onPress: doAbandon,
          },
        ]
      );
    }
  }

  async function handleClaimRank() {
    if (!user || !trial || !profile) return;

    setLoading(true);
    setIsRunning(false);

    try {
      // Save trial history
      await supabase.from('trial_history').insert({
        user_id: user.id,
        tier_attempted: trial.tier,
        completed: true,
        time_seconds: timeSeconds,
      });

      // Update profile based on mode
      const newBestTimes = {
        ...profile.best_times,
        [trial.tier]: Math.min(
          timeSeconds,
          profile.best_times[trial.tier] || Infinity
        ),
      };

      if (mode === 'progression') {
        // Progression: claim new rank
        const { error } = await supabase
          .from('profiles')
          .update({
            strength_tier: trial.tier,
            best_times: newBestTimes,
            trials_attempted: profile.trials_attempted + 1,
            trials_passed: profile.trials_passed + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) throw error;
        await refreshProfile();
        setShowVictory(true);
      } else {
        // Practice/Eternal: just update best time and attempt count
        const { error } = await supabase
          .from('profiles')
          .update({
            best_times: newBestTimes,
            trials_attempted: profile.trials_attempted + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (error) throw error;
        await refreshProfile();
        // For practice/eternal, just complete without victory screen
        onComplete();
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save time');
    } finally {
      setLoading(false);
    }
  }

  const allCompleted = completedMovements.every(Boolean);
  const canClaim = allCompleted && hasStarted;

  if (!trial) {
    return (
      <View style={styles.container}>
        <Text style={[styles.loadingText, { color: theme.text.secondary }]}>Loading trial...</Text>
      </View>
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={[styles.trialName, { color: theme.text.primary }]}>{trial.name.toUpperCase()}</Text>
        {mode === 'practice' && (
          <Text style={[styles.modeBadge, { 
            backgroundColor: 'rgba(205,127,50,0.2)',
            color: theme.accent 
          }]}>PRACTICE MODE</Text>
        )}
        {mode === 'eternal' && (
          <Text style={[styles.eternalBadge, { 
            backgroundColor: '#8B0000',
            color: '#FFFFFF'
          }]}>ETERNAL</Text>
        )}
        <Text style={[styles.tierLabel, { color: theme.text.secondary }]}>Tier {targetTier}</Text>
      </View>

      <View style={styles.timerFrameContainer}>
        <Animated.View style={[
          styles.lightningFrame,
          {
            transform: [{ scale: pulseAnim }],
            opacity: isRunning ? 1 : 0,
          }
        ]} />
        <Animated.View style={[styles.timerContainer, { transform: [{ scale: pulseAnim }] }]}>
          <Text style={[styles.timer, { color: theme.text.primary }]}>{formatTime(timeSeconds)}</Text>
          <Text style={[styles.timerLabel, { color: theme.text.secondary }]}>
            {isRunning ? 'RUNNING' : hasStarted ? 'PAUSED' : 'READY'}
          </Text>
        </Animated.View>
      </View>

      {/* START button between timer and workout table */}
      <View style={styles.startButtonContainer}>
        <Button
          title={isRunning ? 'PAUSE' : hasStarted ? 'RESUME' : 'START'}
          onPress={() => setIsRunning(!isRunning)}
          variant={isRunning ? 'secondary' : 'primary'}
        />
      </View>

      <View style={[styles.card, { 
        backgroundColor: theme.card.background, 
        borderColor: theme.card.border 
      }]}>
        <Text style={[styles.sectionTitle, { color: theme.accent }]}>MOVEMENTS</Text>
        {trial.movements.map((movement, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.movementRow,
              completedMovements[index] && styles.movementRowCompleted,
            ]}
            onPress={() => toggleMovement(index)}
          >
            <View style={[styles.checkbox, { 
              borderColor: theme.card.border,
              backgroundColor: completedMovements[index] ? theme.accent : 'transparent'
            }]}>
              {completedMovements[index] && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </View>
            <View style={styles.movementInfo}>
              <Text style={[styles.movementName, { color: theme.text.primary }]}>{movement.name}</Text>
              <Text style={[styles.movementReps, { color: theme.text.secondary }]}>{movement.reps} reps</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* Claim/Save and Abandon buttons - CLAIM locked until all checkboxes marked, ABANDON always clickable */}
      <View style={styles.claimActions}>
        <Button
          title={mode === 'progression' ? 'CLAIM RANK' : 'SAVE TIME'}
          onPress={handleClaimRank}
          loading={loading}
          variant="primary"
          disabled={!canClaim}
        />
        <Button
          title="ABANDON"
          onPress={handleAbandon}
          variant="secondary"
        />
      </View>

      <Text style={styles.hint}>
        {canClaim
          ? 'All movements complete! Claim your rank.'
          : 'Check each box as you complete the movement.'}
      </Text>
    </ScrollView>
  );
}

function VictoryScreen({
  tier,
  timeSeconds,
  onContinue,
}: {
  tier: number;
  timeSeconds: number;
  onContinue: () => void;
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
    alignItems: 'center',
    marginBottom: 24,
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
    position: 'relative',
    alignItems: 'center',
    marginBottom: 32,
  },
  timerContainer: {
    alignItems: 'center',
  },
  lightningFrame: {
    position: 'absolute',
    width: 200,
    height: 80,
    borderWidth: 3,
    borderColor: '#87CEEB',
    borderRadius: 12,
    shadowColor: '#87CEEB',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  timer: {
    fontSize: 64,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timerLabel: {
    fontSize: 12,
    letterSpacing: 4,
    marginTop: 8,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.3)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 16,
  },
  movementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.2)',
    marginBottom: 8,
  },
  movementRowCompleted: {
    backgroundColor: 'rgba(205,127,50,0.1)',
    borderColor: '#CD7F32',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(205,127,50,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkmark: {
    color: '#CD7F32',
    fontSize: 16,
    fontWeight: '900',
  },
  movementInfo: {
    flex: 1,
  },
  movementName: {
    fontSize: 16,
    fontWeight: '600',
  },
  movementReps: {
    fontSize: 14,
    marginTop: 2,
  },
  startButtonContainer: {
    marginVertical: 24,
    paddingHorizontal: 20,
  },
  claimActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  abandonOnly: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  hint: {
    marginTop: 24,
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
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
});
