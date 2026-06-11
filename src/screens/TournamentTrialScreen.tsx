import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Vibration } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TournamentService } from '../services/TournamentService';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LeapLogo } from '../components/LeapLogo';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';


interface Props {
  sessionId?: string;
  roundConfig: {
    day: number;
    mode: 'amrap' | 'for_time';
    duration_min: number;
    exercises: { name: string; target_reps: number; target_rounds: number }[];
    strategy: 'best' | 'sum';
    max_seconds?: number;
  };
  onComplete?: (score: number) => void;
  onClose?: () => void;


}

export function TournamentTrialScreen({ sessionId: propSessionId, roundConfig: propRoundConfig, onComplete, onClose }: Props) {
  const { theme } = useTheme();
  const { profile } = useAuth();
  
  const { sessionId: paramSessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = propSessionId || paramSessionId;
  const roundConfig = propRoundConfig;

  const [isActive, setIsActive] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preCountdown, setPreCountdown] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [sessionType, setSessionType] = useState<'knockout' | 'rank_based' | null>(null);
  const maxSeconds = (roundConfig as any).max_seconds || 240;
  const [timeLeft, setTimeLeft] = useState(0); // Initialized in useEffect
  const [exerciseReps, setExerciseReps] = useState<number[]>((roundConfig.exercises || []).map(() => 0));
  const [checkedExercises, setCheckedExercises] = useState<boolean[]>((roundConfig.exercises || []).map(() => false));
  const [rounds, setRounds] = useState(0);
  const [exerciseExtraReps, setExerciseExtraReps] = useState<number[]>((roundConfig.exercises || []).map(() => 0));
  const { runAsync: runSafeSubmit, isExecuting: loading } = useSafeAsync();
  const [finalScore, setFinalScore] = useState<number | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    async function fetchSession() {
      const { data } = await supabase.from('tournament_sessions').select('*, config:tournament_configs(*)').eq('id', sessionId).single();
      if (data) {
        const type = data.config?.type;
        setSessionType(type);
        if (roundConfig.mode === 'amrap') {
          setTimeLeft(roundConfig.duration_min * 60);
        } else {
          setTimeLeft(0);
        }
      }
    }
    fetchSession();
  }, [sessionId]);

  // Lead-in Timer Logic
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

  const handleStartWithLeadIn = () => {
    setPreCountdown(5);
    setIsPreparing(true);
  };

  const cancelPreparation = () => {
    setIsPreparing(false);
    setPreCountdown(0);
  };

  useEffect(() => {
    if (isActive && !isFinished) {
      if (!startTimeRef.current) startTimeRef.current = Date.now();
      
      const initialSeconds = roundConfig.mode === 'amrap' ? roundConfig.duration_min * 60 : 0;

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current!) / 1000);
        
        if (roundConfig.mode === 'amrap') {
          const remaining = Math.max(0, initialSeconds - elapsed);
          setTimeLeft(remaining);
          if (remaining <= 0) {
            if (sessionType === 'rank_based') handleSubmit();
            else handleFinish();
          }
        } else {
          setTimeLeft(elapsed);
          if (sessionType === 'rank_based' && elapsed >= maxSeconds) {
            handleSubmit();
          }
        }
      }, 500); // Higher frequency for better background catching
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, isFinished, sessionType]);

  const handleFinish = () => {
    setIsActive(false);
    setIsFinished(true);
    if (roundConfig.mode === 'amrap') {
      SoundService.playDigitalBuzzer(2);
    }
    Vibration.vibrate([0, 500, 200, 500]);
  };

  const handleRep = (index: number, delta: number) => {
    if (!isActive || isFinished) return;
    const newReps = [...exerciseReps];
    newReps[index] = Math.max(0, newReps[index] + delta);
    
    // Auto-advance round logic for 'for_time' (Knockout)
    if (roundConfig.mode === 'for_time' && sessionType === 'knockout') {
       const target = roundConfig.exercises[index].target_reps;
       if (newReps[index] >= target) {
          Vibration.vibrate(50);
       }
       
       const allDone = newReps.every((r, i) => r >= roundConfig.exercises[i].target_reps);
       if (allDone) {
          handleFinish();
       }
    }
    
    setExerciseReps(newReps);
    Vibration.vibrate(10);
  };

  const handleCircuitRound = (delta: number) => {
    if (!isActive || isFinished) return;
    setRounds(prev => Math.max(0, prev + delta));
    Vibration.vibrate(10);
  };

  const handleRankExtraRep = (index: number, delta: number) => {
    if (!isActive || isFinished) return;
    const newExtras = [...exerciseExtraReps];
    const target = roundConfig.exercises[index].target_reps;
    newExtras[index] = Math.max(0, Math.min(target, newExtras[index] + delta));
    setExerciseExtraReps(newExtras);
    Vibration.vibrate(10);
  };

  const handleToggleExercise = (index: number) => {
    if (!isActive || isFinished || checkedExercises[index]) return;
    const newChecked = [...checkedExercises];
    newChecked[index] = true;
    setCheckedExercises(newChecked);
    Vibration.vibrate(50);

    if (newChecked.every(c => c)) {
      handleFinish();
    }
  };

  const handleSubmit = () => {
    runSafeSubmit(async () => {
      const [{ data: participant }, { data: session }] = await Promise.all([
        supabase.from('tournament_participants').select('tier_at_start').eq('tournament_id', sessionId).eq('user_id', profile?.id).single(),
        supabase.from('tournament_sessions').select('*, config:tournament_configs(*)').eq('id', sessionId).single()
      ]);
      
      if (!participant || !session) throw new Error('Participant or session record not found');

      let scoreInput;
      if (sessionType === 'rank_based' && roundConfig.mode === 'for_time') {
        const exercisesCompleted = checkedExercises.filter(Boolean).length;
        scoreInput = Math.max(0, maxSeconds - timeLeft) + (exercisesCompleted * 5);
      } else if (roundConfig.mode === 'amrap') {
        const totalCircuitReps = roundConfig.exercises.reduce((acc, ex) => acc + ex.target_reps, 0);
        const totalExtraReps = exerciseExtraReps.reduce((acc, r) => acc + r, 0);
        scoreInput = Math.round(rounds * totalCircuitReps) + totalExtraReps;
      } else if (roundConfig.mode === 'for_time') {
        scoreInput = timeLeft;
      } else {
        scoreInput = exerciseReps.reduce((a, b) => a + b, 0);
      }

      let res;
      if (sessionType === 'knockout') {
        res = await TournamentService.submitDailyScore(
          sessionId,
          profile!.id,
          roundConfig.day,
          scoreInput,
          participant.tier_at_start,
          roundConfig.strategy
        );
      } else {
        res = await TournamentService.submitRankBasedScore(
          sessionId,
          profile!.id,
          scoreInput,
          0 // No handicap for rank-based
        );
      }

      if (res.success) {
        await AsyncStorage.removeItem('active_tournament_session');
        setFinalScore(res.finalScore ?? 0);
        if (onComplete) onComplete(res.finalScore ?? 0);
      } else {
        throw new Error(String(res.error || 'Submission failed'));
      }
    });
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (finalScore !== null) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary, justifyContent: 'center', alignItems: 'center' }]}>
        <MaterialCommunityIcons name="trophy" size={80} color={theme.accent} />
        <Text style={[styles.resultTitle, { color: theme.text.primary }]}>TRIAL COMPLETE</Text>
        <Text style={[styles.resultScore, { color: theme.accent }]}>{finalScore} PTS</Text>
        <Text style={[styles.resultSub, { color: theme.text.tertiary }]}>Handicap Adjusted Score</Text>
        <TouchableOpacity 
          style={[styles.mainBtn, { backgroundColor: theme.accent, marginTop: 40, width: '80%' }]}
          onPress={() => router.back()}
        >
          <Text style={styles.mainBtnText}>RETURN TO LOBBY</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GlobalErrorBoundary>
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => {
              if (isActive) {
                Alert.alert('Battle in Progress', 'The arena is locked. You must finish the battle or wait for the timer to expire.');
              } else {
                router.back();
              }
            }}
          >
            <MaterialCommunityIcons name="close" size={32} color={theme.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text.primary }]}>TOURNAMENT TRIAL</Text>
          <View style={{ width: 32 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.timerCircle}>
            <Text style={[
              styles.timerText, 
              { color: timeLeft < 30 && (roundConfig.mode === 'amrap' || sessionType === 'rank_based') ? '#EF4444' : theme.text.primary }
            ]}>
              {formatTimer(timeLeft)}
            </Text>
            <Text style={[styles.timerLabel, { color: theme.text.tertiary }]}>
              {roundConfig.mode === 'amrap' ? 'TIME REMAINING' : 'ELAPSED TIME'}
            </Text>
            {roundConfig.mode === 'for_time' && (roundConfig as any).max_seconds !== undefined && (
              <Text style={{ fontSize: 10, color: theme.accent, fontWeight: '700', marginTop: 4 }}>
                CAP: {formatTimer(maxSeconds)}
              </Text>
            )}
          </View>

          {roundConfig.mode === 'amrap' && (
            <View style={[styles.timerCircle, { marginTop: 0, marginBottom: 20 }]}>
              <View style={styles.repControl}>
                <TouchableOpacity onPress={() => handleCircuitRound(-1)} style={styles.repBtn}>
                  <MaterialCommunityIcons name="minus" size={24} color={theme.text.secondary} />
                </TouchableOpacity>
                <View style={{ alignItems: 'center', minWidth: 100 }}>
                  <Text style={[styles.timerText, { fontSize: 48, color: theme.text.primary }]}>{rounds}</Text>
                  <Text style={[styles.timerLabel, { color: theme.text.tertiary }]}>CIRCUIT ROUNDS</Text>
                </View>
                <TouchableOpacity onPress={() => handleCircuitRound(1)} style={styles.repBtn}>
                  <MaterialCommunityIcons name="plus" size={24} color={theme.accent} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <ScrollView style={{ width: '100%' }}>
            {roundConfig.exercises.map((ex, i) => (
              <View key={i} style={[styles.exerciseCard, { backgroundColor: theme.card.background }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exName, { color: theme.text.primary }]}>{ex.name.toUpperCase()}</Text>
                  <Text style={[styles.exTarget, { color: theme.text.tertiary }]}>TARGET: {ex.target_reps} REPS</Text>
                </View>
                
                {roundConfig.mode === 'for_time' ? (
                  <TouchableOpacity 
                    onPress={() => handleToggleExercise(i)}
                    style={{ padding: 12 }}
                  >
                    <MaterialCommunityIcons 
                      name={checkedExercises[i] ? "checkbox-marked" : "checkbox-blank-outline"} 
                      size={28} 
                      color={checkedExercises[i] ? theme.accent : theme.text.tertiary} 
                    />
                  </TouchableOpacity>
                ) : roundConfig.mode === 'amrap' ? (
                  <View style={styles.repControl}>
                    <TouchableOpacity onPress={() => handleRankExtraRep(i, -1)} style={[styles.repBtn, { width: 32, height: 32 }]}>
                      <MaterialCommunityIcons name="minus" size={16} color={theme.text.secondary} />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.repValue, { color: theme.accent, fontSize: 18, minWidth: 24 }]}>{exerciseExtraReps[i]}</Text>
                      <Text style={{ fontSize: 7, color: theme.text.tertiary, fontWeight: '900' }}>EXTRA</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleRankExtraRep(i, 1)} style={[styles.repBtn, { width: 32, height: 32 }]}>
                      <MaterialCommunityIcons name="plus" size={16} color={theme.accent} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.repControl}>
                    <TouchableOpacity onPress={() => handleRep(i, -1)} style={styles.repBtn}>
                      <MaterialCommunityIcons name="minus" size={24} color={theme.text.secondary} />
                    </TouchableOpacity>
                    <Text style={[styles.repValue, { color: theme.accent }]}>{exerciseReps[i]}</Text>
                    <TouchableOpacity onPress={() => handleRep(i, 1)} style={styles.repBtn}>
                      <MaterialCommunityIcons name="plus" size={24} color={theme.accent} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            {isPreparing ? (
              <View style={{ alignItems: 'center', width: '100%' }}>
                <Text style={{ color: theme.accent, fontSize: 48, fontWeight: '900' }}>{preCountdown}</Text>
                <Text style={{ color: theme.text.tertiary, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 20 }}>GET READY</Text>
                <TouchableOpacity 
                  style={[styles.finishBtn, { borderColor: theme.text.tertiary }]} 
                  onPress={cancelPreparation}
                >
                  <Text style={{ color: theme.text.tertiary, fontWeight: '900' }}>CANCEL PREPARATION</Text>
                </TouchableOpacity>
              </View>
            ) : !isActive && !isFinished ? (
              <TouchableOpacity style={[styles.mainBtn, { backgroundColor: theme.accent }]} onPress={handleStartWithLeadIn}>
                <Text style={styles.mainBtnText}>START BATTLE</Text>
              </TouchableOpacity>
            ) : isFinished ? (
              <TouchableOpacity 
                style={[styles.mainBtn, { backgroundColor: theme.accent }]} 
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? <LeapLogo size={40} animated /> : <Text style={styles.mainBtnText}>SUBMIT RESULTS</Text>}
              </TouchableOpacity>
            ) : (
              <View style={{ height: 50 }} /> // Spacer instead of finish early button
            )}
          </View>
        </View>
      </View>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  content: { flex: 1, paddingHorizontal: 24, alignItems: 'center' },
  timerCircle: { alignItems: 'center', marginVertical: 40 },
  timerText: { fontSize: 64, fontWeight: '900' },
  timerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  exerciseCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderRadius: 20, marginBottom: 12 },
  exName: { fontSize: 16, fontWeight: '900' },
  exTarget: { fontSize: 10, fontWeight: '700', marginTop: 4 },
  repControl: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  repBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  repValue: { fontSize: 24, fontWeight: '900', minWidth: 40, textAlign: 'center' },
  footer: { width: '100%', paddingVertical: 40 },
  mainBtn: { width: '100%', padding: 20, borderRadius: 16, alignItems: 'center' },
  mainBtnText: { fontSize: 18, fontWeight: '900', color: '#000' },
  finishBtn: { width: '100%', padding: 16, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  resultTitle: { fontSize: 24, fontWeight: '900', marginTop: 24 },
  resultScore: { fontSize: 48, fontWeight: '900', marginVertical: 12 },
  resultSub: { fontSize: 14, fontWeight: '700' },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
