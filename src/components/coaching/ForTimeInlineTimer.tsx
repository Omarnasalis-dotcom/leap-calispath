import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SoundServiceInstance } from '../../lib/SoundService';

export interface ForTimeExercise {
  id: string | number;
  name: string;
  reps: string | number;
  youtube_url?: string;
}

export interface ForTimeResult {
  elapsedSeconds: number;
  roundsCompleted: number;
  totalRounds: number;
  capped: boolean;
}

interface ForTimeInlineTimerProps {
  theme: any;
  exercises: ForTimeExercise[];
  timeCapSeconds: number;
  totalRounds: number;
  onFinalize: (result: ForTimeResult) => void;
  activeVideoExerciseId?: string | number | null;
  onToggleVideo?: (exerciseId: string | number, url: string) => void;
}

// A finish under this is almost certainly a mis-tap rather than a real
// workout, so it gets a confirmation. Deliberately low — the point is to catch
// "logged without doing it", not to second-guess a genuinely fast athlete.
const IMPLAUSIBLY_FAST_SECONDS = 20;

export const ForTimeInlineTimer: React.FC<ForTimeInlineTimerProps> = ({
  theme,
  exercises,
  timeCapSeconds,
  totalRounds,
  onFinalize,
  activeVideoExerciseId,
  onToggleVideo,
}) => {
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [roundsCompleted, setRoundsCompleted] = useState(0);
  // Time cap ran out before the warrior finished — distinct from a voluntary
  // submit, since a capped result means "how far did you get," not a finish time.
  const [capped, setCapped] = useState(false);
  // Whether the timer has ever been started this attempt. Distinct from
  // `timerRunning`, which goes false again the moment the warrior finishes —
  // this stays true so LOG WORKOUT remains available after a real workout.
  const [hasStarted, setHasStarted] = useState(false);
  const intervalRef = useRef<any>(null);
  const lastTickRef = useRef<number | null>(null);
  const appState = useRef(AppState.currentState);
  // Synchronous double-submit guard — state wouldn't have re-rendered yet on a
  // fast double tap, and this writes to the warrior's permanent log.
  const submittedRef = useRef(false);
  const hasRounds = totalRounds > 1;

  useEffect(() => {
    if (timerRunning) {
      lastTickRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        lastTickRef.current = Date.now();
        setElapsedTime(prev => {
          const next = prev + 1;
          if (timeCapSeconds > 0 && next >= timeCapSeconds) {
            clearInterval(intervalRef.current);
            setTimerRunning(false);
            setCapped(true);
            SoundServiceInstance.playDigitalBuzzer(4);
            return timeCapSeconds;
          }
          return next;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [timerRunning]);

  // Correct for time lost while backgrounded — elapsed time is the logged
  // score for a For Time block, so this matters more here than anywhere else
  // (same fix already proven in src/hooks/useWarriorTimer.ts for Tabata).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        if (timerRunning && lastTickRef.current) {
          const now = Date.now();
          const deltaSecs = Math.floor((now - lastTickRef.current) / 1000);
          if (deltaSecs > 0) {
            setElapsedTime(prev => {
              const next = prev + deltaSecs;
              if (timeCapSeconds > 0 && next >= timeCapSeconds) {
                clearInterval(intervalRef.current);
                setTimerRunning(false);
                setCapped(true);
                SoundServiceInstance.playDigitalBuzzer(4);
                return timeCapSeconds;
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
  }, [timerRunning, timeCapSeconds]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const handleStart = () => {
    setTimerRunning(true);
    setHasStarted(true);
    SoundServiceInstance.playBoxingBell();
  };

  const handleTimerTap = () => {
    Alert.alert(
      'FOR TIME TIMER',
      'Do you want to reset the timer or continue?',
      [
        { text: 'CONTINUE', style: 'cancel' },
        {
          text: 'RESET',
          style: 'destructive',
          onPress: () => {
            clearInterval(intervalRef.current);
            setTimerRunning(false);
            setCapped(false);
            setElapsedTime(0);
            setRoundsCompleted(0);
            // Full reset means this attempt hasn't happened — re-arm the
            // started gate so LOG WORKOUT can't submit a 0:00 finish.
            setHasStarted(false);
            submittedRef.current = false;
          },
        },
      ]
    );
  };

  const handleAddRound = () => {
    setRoundsCompleted(prev => Math.min(totalRounds, prev + 1));
  };

  const handleRemoveRound = () => {
    setRoundsCompleted(prev => Math.max(0, prev - 1));
  };

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    clearInterval(intervalRef.current);
    setTimerRunning(false);
    // Submitting before the cap means the full workout (all rounds) got done —
    // the elapsed time itself is the score. Submitting after a cap means
    // reporting how far the warrior got, so the tracked round count matters instead.
    onFinalize({
      elapsedSeconds: elapsedTime,
      roundsCompleted: capped ? roundsCompleted : totalRounds,
      totalRounds,
      capped,
    });
  };

  const handleFinalize = () => {
    // Guard the "not capped ⇒ every round was completed" inference above. It
    // only holds if the workout actually happened: with a 0:00 elapsed time it
    // would log a flawless all-rounds finish, which is what a mis-tap on this
    // button used to produce — silently, and visible to the warrior's coach as
    // a genuine result. The button is disabled until the timer has run, and an
    // implausibly short time still asks first.
    if (!hasStarted) return;

    if (!capped && elapsedTime < IMPLAUSIBLY_FAST_SECONDS) {
      Alert.alert(
        'LOG THIS TIME?',
        `This will record all ${totalRounds} ${totalRounds === 1 ? 'round' : 'rounds'} completed in ${formatTime(elapsedTime)}. Your coach sees this as your real result.`,
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'LOG IT', style: 'destructive', onPress: submit },
        ]
      );
      return;
    }

    submit();
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

          {hasRounds && (
            <Text style={[styles.roundsCaption, { color: theme.text.tertiary }]}>
              {totalRounds} ROUNDS FOR TIME
            </Text>
          )}

          <View style={styles.controlRow}>
            {timerRunning || capped ? (
              <TouchableOpacity
                style={[styles.timerBox, {
                  borderColor: capped ? '#FF6B6B' : theme.card.border,
                  backgroundColor: capped ? 'rgba(255,107,107,0.1)' : 'rgba(255,255,255,0.03)',
                }]}
                onPress={handleTimerTap}
              >
                <Text style={[styles.timerLabel, { color: capped ? '#FF6B6B' : theme.text.primary }]}>{capped ? 'CAP REACHED' : 'FOR TIME'}</Text>
                <Text style={{ color: capped ? '#FF6B6B' : theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18 }}>
                  {formatTime(elapsedTime)}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={handleStart}>
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.startGradientBorder}
                >
                  <View style={[styles.timerBox, { borderWidth: 0, backgroundColor: theme.card.background }]}>
                    <Text style={[styles.timerLabel, { color: theme.text.primary }]}>START</Text>
                    <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18 }}>
                      0:00
                    </Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {hasRounds ? (
              <>
                <View style={styles.capGroup}>
                  <Text style={[styles.capLabel, { color: theme.text.secondary }]}>ROUND</Text>
                  <Text style={[styles.capValue, { color: theme.text.primary }]}>{roundsCompleted} / {totalRounds}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.roundBtn, {
                    borderColor: roundsCompleted === 0 ? theme.card.border : '#FF6B6B',
                    backgroundColor: roundsCompleted === 0 ? 'transparent' : 'rgba(255,107,107,0.1)',
                  }]}
                  disabled={roundsCompleted === 0}
                  onPress={handleRemoveRound}
                >
                  <Text style={{ color: roundsCompleted === 0 ? theme.text.tertiary : '#FF6B6B', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16 }}>−1</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleAddRound} disabled={roundsCompleted >= totalRounds}>
                  <LinearGradient
                    colors={['#7E57C2', '#FF5252', '#FF7043']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.startGradientBorder, { opacity: roundsCompleted >= totalRounds ? 0.4 : 1 }]}
                  >
                    <View style={[styles.roundBtn, { borderWidth: 0, backgroundColor: theme.card.background }]}>
                      <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16 }}>+1</Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.capGroup}>
                <Text style={[styles.capLabel, { color: theme.text.secondary }]}>TIME CAP</Text>
                <Text style={[styles.capValue, { color: theme.text.primary }]}>{formatTime(timeCapSeconds)}</Text>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>

      <TouchableOpacity onPress={handleFinalize} disabled={!hasStarted} style={!hasStarted && { opacity: 0.4 }}>
        <LinearGradient
          colors={['#7E57C2', '#FF5252', '#FF7043']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.logBtn}
        >
          <Text style={{ color: '#FFFFFF', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 0.5 }}>
            {hasStarted ? 'LOG WORKOUT' : 'START THE TIMER FIRST'}
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
  roundsCaption: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timerBox: {
    width: 90,
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
  startGradientBorder: {
    padding: 1.2,
    borderRadius: 7,
  },
  capGroup: {
    flex: 1,
    alignItems: 'center',
  },
  capLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  capValue: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 22,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtn: {
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
