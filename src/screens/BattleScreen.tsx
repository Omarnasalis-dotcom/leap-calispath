import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, Animated, Alert, Vibration, ActivityIndicator, Platform
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ClashService, ClashSession } from '../services/ClashService';
import { ClashLogic, ClashProtocol } from '../lib/clashLogic';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');

interface BattleScreenProps {
  clashId: string;
  onFinish: () => void;
}

export function BattleScreen({ clashId, onFinish }: BattleScreenProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [session, setSession] = useState<ClashSession | null>(null);
  const [protocol, setProtocol] = useState<ClashProtocol | null>(null);
  const [myReps, setMyReps] = useState<Record<string, number>>({});
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [battleStarted, setBattleStarted] = useState(false);
  const [timer, setTimer] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);

  const myProgressAnim = useRef(new Animated.Value(0)).current;
  const oppProgressAnim = useRef(new Animated.Value(0)).current;
  const resultScaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!user || !clashId) return;
    
    const loadSession = async () => {
      const { data } = await supabase.from('clash_sessions').select('*').eq('id', clashId).single();
      if (data) {
        setSession(data as ClashSession);
        setProtocol(data.workout_protocol as ClashProtocol);
      }
    };
    loadSession();

    const channel = supabase.channel(`battle_room_${clashId}`, { config: { broadcast: { self: false } } });
    channel
      .on('broadcast', { event: 'progress' }, (payload) => {
        const progress = payload.payload.progress;
        setOpponentProgress(progress);
        animateProgress(oppProgressAnim, progress);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clash_sessions', filter: `id=eq.${clashId}` }, (payload) => {
        const newSess = payload.new as ClashSession;
        setSession(newSess);
        if (newSess.status === 'finished') {
          if (timerRef.current) clearInterval(timerRef.current);
          setShowResult(true);
          Animated.spring(resultScaleAnim, { toValue: 1, useNativeDriver: true }).start();
        }
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [clashId, user]);

  useEffect(() => {
    if (!session || !user) return;
    if (session.start_time) {
      const startTime = new Date(session.start_time).getTime();
      const interval = setInterval(() => {
        const diff = Math.ceil((startTime - Date.now()) / 1000);
        if (diff > 0) {
          setCountdown(diff);
        } else if (diff === 0) {
          setCountdown(0); // Display '0' or 'GO' briefly
        } else {
          setCountdown(null);
          setBattleStarted(true);
          if (!timerRef.current) startTimer();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    } else if (session.status === 'accepted' && session.sender_id === user.id) {
      const masterStartTime = new Date(Date.now() + 6000).toISOString();
      const generatedProtocol = ClashLogic.generateProtocol(session.bracket);
      supabase.from('clash_sessions').update({ 
        start_time: masterStartTime, status: 'active', workout_protocol: generatedProtocol 
      }).eq('id', clashId).then(() => setProtocol(generatedProtocol));
    }
  }, [session?.start_time, session?.status]);

  function startTimer() {
    timerRef.current = setInterval(() => setTimer(prev => prev + 1), 1000);
  }

  function animateProgress(anim: Animated.Value, toValue: number) {
    Animated.timing(anim, { toValue, duration: 400, useNativeDriver: false }).start();
  }

  function handleLogRep(movementId: string) {
    if (!battleStarted || !protocol || session?.status === 'finished') return;
    const movement = protocol.movements.find(m => m.id === movementId);
    if (!movement) return;

    setMyReps(prev => {
      const current = prev[movementId] || 0;
      if (current >= movement.reps) return prev;
      const nextReps = { ...prev, [movementId]: current + 1 };
      const progress = ClashLogic.calculateProgress(protocol, nextReps);
      animateProgress(myProgressAnim, progress);
      if (channelRef.current) channelRef.current.send({ type: 'broadcast', event: 'progress', payload: { progress } });
      if (progress === 100) handleFinish();
      return nextReps;
    });
    Vibration.vibrate(10);
  }

  async function handleFinish() {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await ClashService.reportFinish(clashId, user!.id, timer);
    } catch (e) { console.error(e); }
  }

  function handleCancel() {
    setShowQuitConfirm(true);
  }

  async function confirmQuit() {
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await supabase.from('clash_sessions').update({ status: 'cancelled' }).eq('id', clashId);
    } catch (e) { console.error(e); }
    onFinish();
  }

  if (!session || !protocol) return <View style={styles.loading}><ActivityIndicator color={theme.accent} /></View>;

  const isWinner = session.winner_id === user?.id;

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.duelSection}>
        <View style={styles.headerSpacer} />
        <View style={styles.duelBarContainer}>
          <Text style={[styles.duelLabel, { color: theme.text.tertiary }]}>YOU</Text>
          <View style={[styles.fullBar, { backgroundColor: theme.card.border }]}>
            <Animated.View style={[styles.progressFill, { backgroundColor: theme.accent, width: myProgressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
        <View style={styles.duelBarContainer}>
          <Text style={[styles.duelLabel, { color: theme.text.tertiary }]}>OPPONENT</Text>
          <View style={[styles.fullBar, { backgroundColor: theme.card.border }]}>
            <Animated.View style={[styles.progressFill, { backgroundColor: '#D32F2F', width: oppProgressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.movementScroll}>
        {protocol.movements.map((m) => {
          const done = (myReps[m.id] || 0) >= m.reps;
          return (
            <TouchableOpacity key={m.id} activeOpacity={0.8} onPress={() => handleLogRep(m.id)}
              style={[styles.movementCard, { backgroundColor: theme.card.background, borderLeftColor: done ? '#4CAF50' : theme.card.border }]}>
              <View>
                <Text style={[styles.movementName, { color: theme.text.primary }]}>{m.name.toUpperCase()}</Text>
                <Text style={[styles.movementReps, { color: theme.text.tertiary }]}>{myReps[m.id] || 0} / {m.reps} REPS</Text>
              </View>
              {done ? <MaterialCommunityIcons name="check-circle" size={32} color="#4CAF50" /> : 
              <View style={[styles.repTrigger, { borderColor: theme.accent }]}>
                <Text style={[styles.repTriggerText, { color: theme.accent }]}>+1</Text>
              </View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {countdown !== null && (
        <View style={[styles.countdownOverlay, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <Text style={[styles.countdownText, { color: theme.accent }]}>
            {countdown === 0 ? 'GO!' : countdown}
          </Text>
          <Text style={[styles.countdownLabel, { color: '#FFF' }]}>
            {countdown === 0 ? 'DUEL START' : 'GET READY...'}
          </Text>
        </View>
      )}

      {showQuitConfirm && (
        <View style={[styles.resultOverlay, { backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 1000 }]}>
          <View style={styles.resultContent}>
            <MaterialCommunityIcons name="alert-circle" size={60} color="#FFA500" />
            <Text style={[styles.resultTitle, { fontSize: 32, marginTop: 10 }]}>QUIT BATTLE?</Text>
            <Text style={styles.resultSub}>THIS COUNTS AS A DEFEAT</Text>
            
            <View style={{ width: '100%', gap: 12, marginTop: 30 }}>
              <TouchableOpacity 
                style={[styles.finishBtn, { backgroundColor: '#D32F2F', marginTop: 0 }]} 
                onPress={confirmQuit}
              >
                <Text style={[styles.finishBtnText, { color: '#FFF' }]}>QUIT AND FORFEIT</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.finishBtn, { backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 0 }]} 
                onPress={() => setShowQuitConfirm(false)}
              >
                <Text style={[styles.finishBtnText, { color: '#FFF' }]}>STAY IN BATTLE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {showResult && (
        <View style={[styles.resultOverlay, { backgroundColor: 'rgba(0,0,0,0.95)', zIndex: 998 }]}>
          <Animated.View style={[styles.resultContent, { transform: [{ scale: resultScaleAnim }] }]}>
            <MaterialCommunityIcons 
              name={isWinner ? 'trophy' : 'skull-crossbones'} 
              size={80} 
              color={isWinner ? theme.accent : '#D32F2F'} 
            />
            <Text style={[styles.resultTitle, { color: isWinner ? theme.accent : '#D32F2F' }]}>
              {isWinner ? 'VICTORY' : 'DEFEAT'}
            </Text>
            <Text style={[styles.resultSub, { color: '#FFF' }]}>
              {isWinner ? '+25 GLORY POINTS' : '-15 GLORY POINTS'}
            </Text>
            <View style={styles.resultStats}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>TIME</Text>
                <Text style={styles.statValue}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</Text>
              </View>
            </View>
            <TouchableOpacity style={[styles.finishBtn, { backgroundColor: theme.accent }]} onPress={onFinish}>
              <Text style={styles.finishBtnText}>RETURN TO LOBBY</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}

      {/* HEADER RENDERED LAST TO BE ON TOP */}
      <View style={styles.battleHeader}>
        <View>
          <Text style={[styles.battleTitle, { color: theme.text.primary }]}>SPRINT CLASH</Text>
          <Text style={[styles.timerText, { color: theme.accent }]}>{Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}</Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={handleCancel}>
          <MaterialCommunityIcons name="close" size={28} color={theme.text.tertiary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  battleHeader: { 
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60, 
    paddingHorizontal: 20, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    zIndex: 999, 
  },
  headerSpacer: { height: 100 },
  battleTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  timerText: { fontSize: 18, fontWeight: '900' },
  closeBtn: { padding: 8, marginRight: -8 },
  duelSection: { padding: 20, gap: 16 },
  duelBarContainer: { gap: 4 },
  duelLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  fullBar: { height: 12, borderRadius: 6, overflow: 'hidden' },
  progressFill: { height: '100%' },
  movementScroll: { paddingHorizontal: 20, paddingBottom: 40 },
  movementCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderRadius: 16, borderLeftWidth: 4, marginBottom: 12, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderTopColor: '#333', borderRightColor: '#333', borderBottomColor: '#333' },
  movementName: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  movementReps: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  repTrigger: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  repTriggerText: { fontSize: 16, fontWeight: '900' },
  countdownOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  countdownText: { fontSize: 120, fontWeight: '900' },
  countdownLabel: { fontSize: 18, fontWeight: '800', letterSpacing: 4, marginTop: -20 },
  resultOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 200, padding: 30 },
  resultContent: { width: '100%', alignItems: 'center', backgroundColor: '#111', padding: 40, borderRadius: 30, borderWidth: 1, borderColor: '#333' },
  resultTitle: { fontSize: 48, fontWeight: '900', letterSpacing: 4, marginTop: 20 },
  resultSub: { fontSize: 16, fontWeight: '800', letterSpacing: 1, marginTop: 10, opacity: 0.8 },
  resultStats: { flexDirection: 'row', marginTop: 30, gap: 20 },
  statBox: { alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '900', color: '#666', letterSpacing: 2 },
  statValue: { fontSize: 24, fontWeight: '900', color: '#FFF', marginTop: 4 },
  finishBtn: { marginTop: 40, width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  finishBtnText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});
