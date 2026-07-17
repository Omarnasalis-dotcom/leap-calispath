import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';

export interface CircuitExercise {
  id: string | number;
  name: string;
  targetReps: number;
  youtube_url?: string;
}

interface CircuitRoundCardProps {
  roundNumber: number;
  totalRounds: number;
  exercises: CircuitExercise[];
  restSeconds: number;
  theme: any;
  bronzeGold: string;
  isLocked: boolean;
  completed: boolean;
  onRoundComplete: (entries: { exerciseId: string | number; reps: number }[]) => void;
  activeVideoExerciseId?: string | number | null;
  onToggleVideo?: (exerciseId: string | number, url: string) => void;
}

export const CircuitRoundCard: React.FC<CircuitRoundCardProps> = ({
  roundNumber,
  totalRounds,
  exercises,
  restSeconds,
  theme,
  bronzeGold,
  isLocked,
  completed,
  onRoundComplete,
  activeVideoExerciseId,
  onToggleVideo,
}) => {
  const [repsByExercise, setRepsByExercise] = useState<Record<string | number, number>>(
    () => Object.fromEntries(exercises.map(ex => [ex.id, ex.targetReps]))
  );
  const [restActive, setRestActive] = useState(false);
  const [restTimeLeft, setRestTimeLeft] = useState(0);
  const intervalRef = useRef<any>(null);
  const lastTickRef = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (restActive && restTimeLeft > 0) {
      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        lastTickRef.current = Date.now();
        setRestTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRestActive(false);
            SoundServiceInstance.playDigitalBuzzer(2);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [restActive]);

  // Correct for time lost while backgrounded — JS timers pause while the app
  // isn't foregrounded, so the interval above alone would silently undercount
  // (same fix already proven in src/hooks/useWarriorTimer.ts for Tabata).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (restActive && lastTickRef.current) {
          const now = Date.now();
          const deltaSecs = Math.floor((now - lastTickRef.current) / 1000);
          if (deltaSecs > 0) {
            setRestTimeLeft(prev => {
              const next = prev - deltaSecs;
              if (next <= 0) {
                clearInterval(intervalRef.current);
                setRestActive(false);
                SoundServiceInstance.playDigitalBuzzer(2);
                return 0;
              }
              return next;
            });
          }
          lastTickRef.current = now;
        }
      } else if (nextAppState.match(/inactive|background/)) {
        lastTickRef.current = Date.now();
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, [restActive]);

  const formatRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const adjustReps = (exerciseId: string | number, delta: number) => {
    setRepsByExercise(prev => ({ ...prev, [exerciseId]: Math.max(0, (prev[exerciseId] ?? 0) + delta) }));
  };

  const handleCompleteRound = () => {
    if (completed || isLocked) return;
    const entries = exercises.map(ex => ({ exerciseId: ex.id, reps: repsByExercise[ex.id] ?? 0 }));
    onRoundComplete(entries);
    SoundServiceInstance.playBoxingBell();
    if (restSeconds > 0 && roundNumber < totalRounds) {
      setRestTimeLeft(restSeconds);
      setRestActive(true);
    }
  };

  return (
    <View style={[styles.card, { borderColor: completed ? '#4CAF50' : theme.card.border, opacity: isLocked ? 0.5 : 1 }]}>
      <View style={styles.header}>
        <Text style={[styles.roundLabel, { color: completed ? '#4CAF50' : theme.text.primary }]}>
          ROUND {roundNumber} OF {totalRounds}
        </Text>
        {isLocked && <Text style={{ fontSize: 12 }}>🔒</Text>}
      </View>

      {exercises.map(ex => (
        <View key={ex.id} style={[styles.exerciseRow, { borderColor: theme.card.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
            <Text style={[styles.exName, { color: theme.text.primary, marginRight: ex.youtube_url ? 0 : 8 }]} numberOfLines={1}>{ex.name.toUpperCase()}</Text>
            {ex.youtube_url && onToggleVideo ? (
              <TouchableOpacity
                onPress={() => onToggleVideo(ex.id, ex.youtube_url!)}
                style={[styles.demoBtn, { backgroundColor: activeVideoExerciseId === ex.id ? 'rgba(255,82,82,0.12)' : 'transparent', borderColor: theme.card.border }]}
              >
                <Text style={{ color: '#FF5252', fontSize: 9 }}>{activeVideoExerciseId === ex.id ? '✕' : '▶'}</Text>
                <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.primary }}>
                  {activeVideoExerciseId === ex.id ? 'CLOSE' : 'WATCH'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.stepperGroup}>
            <TouchableOpacity
              style={[styles.stepperBtn, { borderColor: theme.card.border }]}
              disabled={completed || isLocked}
              onPress={() => adjustReps(ex.id, -1)}
            >
              <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>−</Text>
            </TouchableOpacity>
            <Text style={[styles.repsValue, { color: theme.text.primary }]}>{repsByExercise[ex.id] ?? 0}</Text>
            <TouchableOpacity
              style={[styles.stepperBtn, { borderColor: theme.card.border }]}
              disabled={completed || isLocked}
              onPress={() => adjustReps(ex.id, 1)}
            >
              <Text style={[styles.stepperBtnText, { color: theme.text.primary }]}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {restActive ? (
        <View style={[styles.actionBtn, { marginTop: 4, borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.03)' }]}>
          <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16 }}>
            RESTING {formatRest(restTimeLeft)}
          </Text>
        </View>
      ) : completed ? (
        <View style={[styles.actionBtn, { marginTop: 4, borderColor: '#4CAF50', backgroundColor: 'rgba(76,175,80,0.1)' }]}>
          <Text style={{ color: '#4CAF50', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
            ROUND DONE ✓
          </Text>
        </View>
      ) : (
        <TouchableOpacity disabled={isLocked} onPress={handleCompleteRound}>
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.actionBtnGradientBorder, { opacity: isLocked ? 0.5 : 1 }]}
          >
            <View style={[styles.actionBtn, { borderWidth: 0, backgroundColor: theme.card.background }]}>
              <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
                COMPLETE ROUND + REST
              </Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roundLabel: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 13,
    letterSpacing: 1,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  exName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 13,
    flexShrink: 1,
    marginRight: 8,
  },
  demoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 11,
    paddingVertical: 3,
    paddingHorizontal: 8,
    gap: 4,
    marginRight: 8,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepperBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnText: {
    fontSize: 16,
    fontFamily: 'BarlowCondensed-Bold',
  },
  repsValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    minWidth: 24,
    textAlign: 'center',
  },
  actionBtnGradientBorder: {
    padding: 1.2,
    borderRadius: 7,
    marginTop: 4,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
