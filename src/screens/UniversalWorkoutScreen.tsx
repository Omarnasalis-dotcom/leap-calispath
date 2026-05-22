import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, 
  Vibration, Alert, Animated
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { TournamentLogic } from '../lib/tournamentLogic';
import { supabase } from '../lib/supabase';
import { TournamentService } from '../services/TournamentService';

interface UniversalWorkoutProps {
  sessionId?: string;
  day: number;
  dayConfig: any;
  participant: any;
  onClose?: () => void;
  onComplete: (rawScore: number, finalScore: number) => void;
}

export function UniversalWorkoutScreen({ sessionId, day, dayConfig, participant, onClose, onComplete }: UniversalWorkoutProps) {
  const { theme } = useTheme();
  const [reps, setReps] = useState(0);
  const [timeLeft, setTimeLeft] = useState(dayConfig.mode === 'amrap' ? (dayConfig.duration_min || 3) * 60 : 0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  
  const timerRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive && !isFinished) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (dayConfig.mode === 'amrap') {
            if (prev <= 1) {
              handleFinish();
              return 0;
            }
            return prev - 1;
          } else {
            return prev + 1;
          }
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive, isFinished]);

  const handleFinish = () => {
    setIsActive(false);
    setIsFinished(true);
    Vibration.vibrate([0, 500, 200, 500]);
  };

  const totalCircuitReps = dayConfig.exercises.reduce((acc: number, ex: any) => acc + ex.target_reps, 0);
  const [rounds, setRounds] = useState(0);
  const [extraReps, setExtraReps] = useState(0);

  const incrementRound = () => {
    if (!isActive || isFinished) return;
    setRounds(prev => {
      const next = prev + 1;
      if (dayConfig.mode === 'for_time' && next >= dayConfig.target_rounds) {
        handleFinish();
      }
      return next;
    });
    Vibration.vibrate(50);
  };

  const incrementExtraRep = () => {
    if (!isActive || isFinished || dayConfig.mode !== 'amrap') return;
    setExtraReps(prev => {
      const next = prev + 1;
      if (next >= totalCircuitReps) {
        setRounds(r => r + 1);
        return 0;
      }
      return next;
    });
    Vibration.vibrate(10);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const rawScore = (rounds * totalCircuitReps) + extraReps;
      // If 'for_time', the rawScore is actually the time in seconds
      const finalRaw = dayConfig.mode === 'for_time' ? timeLeft : rawScore;
      
      await TournamentService.submitDailyScore(
        sessionId!,
        participant.user_id,
        day,
        finalRaw,
        participant.tier_at_start,
        dayConfig.strategy || 'best'
      );

      onComplete(finalRaw, finalRaw);
    } catch (e: any) {
      setSubmitting(false);
      setSubmitError(e.message);
      Alert.alert('Submission Failed', e.message);
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} disabled={isActive}>
          <MaterialCommunityIcons name="close" size={28} color={isActive ? theme.text.tertiary : theme.text.primary} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: theme.text.primary }]}>DAY {day} CHALLENGE</Text>
          <Text style={[styles.headerSub, { color: theme.accent }]}>{dayConfig?.exercises?.[0]?.name?.toUpperCase() || 'CIRCUIT'}</Text>
        </View>
        <MaterialCommunityIcons name="sword" size={24} color={theme.accent} />
      </View>

      <View style={styles.content}>
        {/* TIMER */}
        <View style={styles.timerCircle}>
          <Text style={[styles.timerText, { color: timeLeft < 30 && dayConfig.mode === 'amrap' ? '#FF4444' : theme.text.primary }]}>
            {formatTimer(timeLeft)}
          </Text>
          <Text style={[styles.timerLabel, { color: theme.text.tertiary }]}>
            {dayConfig.mode === 'amrap' ? 'TIME REMAINING' : 'ELAPSED TIME'}
          </Text>
        </View>

        {/* CIRCUIT LIST */}
        <View style={[styles.circuitCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          {dayConfig.exercises.map((ex: any, idx: number) => (
            <View key={idx} style={styles.circuitItem}>
              <Text style={[styles.circuitEx, { color: theme.text.primary }]}>{ex.name.toUpperCase()}</Text>
              <Text style={[styles.circuitReps, { color: theme.accent }]}>{ex.target_reps}</Text>
            </View>
          ))}
        </View>

        {/* ROUND COUNTER */}
        <View style={styles.roundStats}>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: theme.text.primary }]}>{rounds}</Text>
            <Text style={[styles.statLabel, { color: theme.text.secondary }]}>ROUNDS</Text>
          </View>
          {dayConfig.mode === 'amrap' && (
            <View style={styles.statBox}>
              <Text style={[styles.statValue, { color: theme.accent }]}>{extraReps}</Text>
              <Text style={[styles.statLabel, { color: theme.text.secondary }]}>EXTRA REPS</Text>
            </View>
          )}
        </View>

        {/* CONTROLS */}
        {!isActive && !isFinished && (
          <TouchableOpacity style={[styles.mainBtn, { backgroundColor: theme.accent }]} onPress={() => setIsActive(true)}>
            <Text style={styles.mainBtnText}>START CHALLENGE</Text>
          </TouchableOpacity>
        )}

        {isActive && (
          <View style={{ width: '100%', gap: 12 }}>
            <TouchableOpacity 
              style={[styles.roundBtn, { backgroundColor: theme.accent }]} 
              onPress={incrementRound}
            >
              <Text style={styles.roundBtnText}>ROUND COMPLETE</Text>
            </TouchableOpacity>
            
            {dayConfig.mode === 'amrap' && (
              <TouchableOpacity 
                style={[styles.extraBtn, { borderColor: theme.accent }]} 
                onPress={incrementExtraRep}
              >
                <Text style={{ color: theme.accent, fontWeight: '900' }}>+1 EXTRA REP</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.finishLink} onPress={handleFinish}>
              <Text style={{ color: '#FF4444', fontSize: 12, fontWeight: '900' }}>FINISH NOW</Text>
            </TouchableOpacity>
          </View>
        )}

        {isFinished && (
          <View style={{ width: '100%', gap: 12 }}>
            <TouchableOpacity style={[styles.mainBtn, { backgroundColor: submitting ? 'rgba(255,255,255,0.1)' : theme.accent }]} onPress={handleSubmit} disabled={submitting}>
              <Text style={[styles.mainBtnText, { color: submitting ? theme.text.tertiary : '#000' }]}>{submitting ? 'SAVING...' : 'CLAIM REPS'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.retryBtn} onPress={onClose}>
              <Text style={{ color: theme.text.tertiary, fontWeight: '900' }}>DISCARD ATTEMPT</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* FOOTER INFO */}
      <View style={[styles.footer, { backgroundColor: theme.card.background }]}>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: theme.text.tertiary }]}>STRATEGY</Text>
          <Text style={[styles.footerValue, { color: theme.text.primary }]}>{dayConfig.strategy.toUpperCase()}</Text>
        </View>
        <View style={styles.footerItem}>
          <Text style={[styles.footerLabel, { color: theme.text.tertiary }]}>HANDICAP</Text>
          <Text style={[styles.footerValue, { color: theme.accent }]}>{TournamentLogic.calculateFinalScore(1, participant.tier_at_start)}X</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 20 },
  headerTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  headerSub: { fontSize: 10, fontWeight: '900', marginTop: 4 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  timerCircle: { alignItems: 'center', marginBottom: 40 },
  timerText: { fontSize: 64, fontWeight: '900', letterSpacing: 2 },
  timerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 2, marginTop: -5 },
  scoreContainer: { alignItems: 'center', marginBottom: 60, width: '100%' },
  repCount: { fontSize: 120, fontWeight: '900' },
  repLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 4, marginTop: -10 },
  pointBadge: { marginTop: 20, paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  pointText: { fontSize: 14, fontWeight: '900' },
  mainBtn: { width: '100%', paddingVertical: 20, borderRadius: 12, alignItems: 'center' },
  mainBtnText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  roundBtn: { width: '100%', paddingVertical: 24, borderRadius: 12, alignItems: 'center' },
  roundBtnText: { color: '#000', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  extraBtn: { width: '100%', paddingVertical: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  finishLink: { alignItems: 'center', marginTop: 10 },
  retryBtn: { alignItems: 'center', padding: 12 },
  circuitCard: { width: '100%', padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 30 },
  circuitItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  circuitEx: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  circuitReps: { fontSize: 16, fontWeight: '900' },
  roundStats: { flexDirection: 'row', gap: 40, marginBottom: 40 },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 40, fontWeight: '900' },
  statLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: -5 },
  footer: { flexDirection: 'row', padding: 30, paddingBottom: 50, justifyContent: 'space-between' },
  footerItem: { alignItems: 'center' },
  footerLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  footerValue: { fontSize: 14, fontWeight: '900' },
});
