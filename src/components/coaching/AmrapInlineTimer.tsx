import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';

export interface AmrapExercise {
  id: string | number;
  name: string;
  reps: string | number;
  youtube_url?: string;
}

interface AmrapInlineTimerProps {
  theme: any;
  bronzeGold: string;
  exercises: AmrapExercise[];
  timeCapSeconds: number;
  onFinalize: (roundsCompleted: number) => void;
  activeVideoExerciseId?: string | number | null;
  onToggleVideo?: (exerciseId: string | number, url: string) => void;
}

export const AmrapInlineTimer: React.FC<AmrapInlineTimerProps> = ({
  theme,
  bronzeGold,
  exercises,
  timeCapSeconds,
  onFinalize,
  activeVideoExerciseId,
  onToggleVideo,
}) => {
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(timeCapSeconds);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<any>(null);

  useEffect(() => {
    if (timerRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setTimerRunning(false);
            setFinished(true);
            SoundServiceInstance.playDigitalBuzzer(4);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleStart = () => {
    setTimerRunning(true);
    SoundServiceInstance.playBoxingBell();
  };

  const handleTimerTap = () => {
    Alert.alert(
      'AMRAP TIMER',
      'Do you want to reset the timer or continue?',
      [
        { text: 'CONTINUE', style: 'cancel' },
        {
          text: 'RESET',
          style: 'destructive',
          onPress: () => {
            clearInterval(intervalRef.current);
            setTimerRunning(false);
            setFinished(false);
            setTimeLeft(timeCapSeconds);
          },
        },
      ]
    );
  };

  const handleLogRound = () => {
    setRoundsCompleted(prev => prev + 1);
  };

  const handleRemoveRound = () => {
    setRoundsCompleted(prev => Math.max(0, prev - 1));
  };

  const handleFinalize = () => {
    onFinalize(roundsCompleted);
  };

  return (
    <View style={{ gap: 10 }}>
      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardGradientBorder}
      >
        <View style={[styles.card, { backgroundColor: theme.card.background }]}>
          {exercises.map((ex, i) => (
            <View
              key={ex.id}
              style={[
                styles.exerciseRow,
                { borderColor: theme.card.border },
                i === exercises.length - 1 && { borderBottomWidth: 0 },
              ]}
            >
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
              <Text style={[styles.exReps, { color: theme.text.secondary }]}>{ex.reps} REPS</Text>
            </View>
          ))}

          <View style={styles.controlRow}>
            {timerRunning || finished ? (
              <TouchableOpacity
                style={[styles.timerBox, {
                  borderColor: finished ? '#FF6B6B' : theme.card.border,
                  backgroundColor: finished ? 'rgba(255,107,107,0.1)' : 'rgba(255,255,255,0.03)',
                }]}
                onPress={handleTimerTap}
              >
                <Text style={[styles.timerLabel, { color: finished ? '#FF6B6B' : theme.text.primary }]}>{finished ? 'TIME UP' : 'AMRAP'}</Text>
                <Text style={{ color: finished ? '#FF6B6B' : theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18 }}>
                  {formatTime(timeLeft)}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleStart}>
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.plusOneGradientBorder}
                >
                  <View style={[styles.timerBox, { borderWidth: 0, backgroundColor: theme.card.background }]}>
                    <Text style={[styles.timerLabel, { color: theme.text.primary }]}>START</Text>
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18 }}>
                      {formatTime(timeCapSeconds)}
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <View style={styles.roundsGroup}>
              <Text style={[styles.roundLabel, { color: theme.text.secondary }]}>ROUNDS</Text>
              <Text style={[styles.roundValue, { color: theme.text.primary }]}>{roundsCompleted}</Text>
            </View>
            <TouchableOpacity
              style={[styles.plusOneBtn, {
                borderColor: roundsCompleted === 0 ? theme.card.border : '#FF6B6B',
                backgroundColor: roundsCompleted === 0 ? 'transparent' : 'rgba(255,107,107,0.1)',
              }]}
              disabled={roundsCompleted === 0}
              onPress={handleRemoveRound}
            >
              <Text style={[styles.timerLabel, { color: roundsCompleted === 0 ? theme.text.tertiary : '#FF6B6B' }]}>ROUND</Text>
              <Text style={{ color: roundsCompleted === 0 ? theme.text.tertiary : '#FF6B6B', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18 }}>−1</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogRound}>
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.plusOneGradientBorder}
              >
                <View style={[styles.plusOneBtn, { borderWidth: 0, backgroundColor: theme.card.background }]}>
                  <Text style={[styles.timerLabel, { color: theme.text.primary }]}>ROUND</Text>
                  <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18 }}>+1</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <TouchableOpacity onPress={handleFinalize}>
        <LinearGradient
          colors={['#7E57C2', '#FF5252', '#FF7043']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.logBtn}
        >
          <Text style={{ color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
            LOG WORKOUT
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  cardGradientBorder: {
    padding: 1.2,
    borderRadius: 9,
  },
  card: {
    borderRadius: 8,
    padding: 10,
    gap: 10,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  exName: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 16,
    flexShrink: 1,
    marginRight: 8,
  },
  exReps: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
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
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerBox: {
    width: 74,
    height: 48,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  timerLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  roundsGroup: {
    flex: 1,
    alignItems: 'center',
  },
  roundLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  roundValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
  },
  plusOneGradientBorder: {
    padding: 1.2,
    borderRadius: 7,
  },
  plusOneBtn: {
    width: 74,
    height: 48,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  logBtn: {
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
