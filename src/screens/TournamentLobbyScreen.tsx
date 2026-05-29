import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TournamentService } from '../services/TournamentService';
import { CelebrationBanner } from '../components/CelebrationBanner';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LeapLogo } from '../components/LeapLogo';
import { useSafeMutation } from '../hooks/useSafeMutation';
import { debounce } from 'lodash';


interface Props {


  sessionId?: string;
  onClose?: () => void;
  onEnterWorkout?: (sessionId: string, roundConfig: any) => void;
}

export function TournamentLobbyScreen({ sessionId: propSessionId, onClose, onEnterWorkout }: Props) {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const { sessionId: paramSessionId } = useLocalSearchParams<{ sessionId: string }>();
  const sessionId = propSessionId || paramSessionId;

  const [activeSession, setActiveSession] = useState<any>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [cooldownTime, setCooldownTime] = useState<number>(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [hasShownCelebration, setHasShownCelebration] = useState(false);
  const [celebrationProps, setCelebrationProps] = useState({
    title: '',
    subtitle: '',
    stat: '',
    emoji: '',
    userName: '',
    rank: '',
    leaderboard: [] as { name: string; score: string; rank: number }[],
  });

  const { safeMutate, isMutating } = useSafeMutation();

  const activeSessionRef = useRef<any>(null);
  const isIgniting = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (sessionId) {
      AsyncStorage.setItem('active_tournament_session', sessionId);
    }
    return () => {
      AsyncStorage.removeItem('active_tournament_session');
    };
  }, [sessionId]);

  const fetchData = useCallback(
    debounce(async () => {
    if (!sessionId) return;
    try {
      const { data: session, error: sErr } = await supabase
        .from('tournament_sessions')
        .select('*, config:tournament_configs(*)')
        .eq('id', sessionId)
        .single();

      if (sErr) throw sErr;
      setActiveSession(session);
      activeSessionRef.current = session;

      const { data: pData } = await supabase
        .from('tournament_participants')
        .select('*, profile:profiles(display_name)')
        .eq('tournament_id', sessionId);
      setParticipants(pData || []);
      if (session.config?.type === 'knockout' && session.status === 'active') {
        const { data: mData } = await supabase
          .from('tournament_matches')
          .select('*')
          .eq('tournament_id', sessionId)
          .eq('day', session.current_round);
        setMatches(mData || []);
      }

      const { data: allMatchesData } = await supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', sessionId)
        .order('day', { ascending: true });
      setAllMatches(allMatchesData || []);
      if (session.status === 'active') {
        await TournamentService.checkTournamentExpiry(sessionId);
      }

      // Final Layer: Re-validate tier eligibility
      if (session.config?.allowed_tiers) {
        const allowed = session.config.allowed_tiers;
        const userTier = Number(profile?.strength_tier || 0);
        if (!allowed.map(Number).includes(userTier)) {
          const msg = `This tournament is not fit for your current tier (T${userTier}).`;
          if (Platform.OS === 'web') alert(`Ineligible Warrior\n\n${msg}`);
          else Alert.alert('Ineligible Warrior', msg);
          
          router.back();
          return;
        }
      }
    } catch (error) {
      console.error('Error fetching lobby data:', error);
      Alert.alert('Error', 'Failed to load tournament lobby. Please try again.');
    } finally {
      setLoading(false);
    }
  }, 2000), [sessionId, profile?.strength_tier]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel(`lobby_${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_sessions', filter: `id=eq.${sessionId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_participants', filter: `tournament_id=eq.${sessionId}` }, () => fetchData())
      .subscribe();

    // Auto-elimination check loop
    const autoCheck = setInterval(() => {
      if (activeSessionRef.current?.status === 'active') {
        if (activeSessionRef.current.config?.type === 'knockout') {
          TournamentService.checkAndAutoEliminate(sessionId);
        } else {
          // Check if rank based window expired
          const deadline = new Date(activeSessionRef.current.round_deadline).getTime();
          if (Date.now() > deadline) {
            TournamentService.closeRankBasedTournament(sessionId);
          }
        }
      }
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(autoCheck);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData, sessionId]);

  // Live Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (!activeSessionRef.current) return;
      const session = activeSessionRef.current;

      if (session.status === 'active' && session.round_deadline) {
        const now = new Date().getTime();
        const deadline = new Date(session.round_deadline).getTime();
        const diff = deadline - now;

        if (diff <= 0) {
          setTimeLeft('EXPIRED');
        } else {
          const h = Math.floor(diff / (1000 * 60 * 60));
          const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const s = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeLeft(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
        }
      }

      // Cooldown for rank-based
      const me = participants.find(p => p.user_id === profile?.id);
      if (session.config?.type === 'rank_based' && me?.last_trial_at && session.config?.cooldown_min) {
        const last = new Date(me.last_trial_at).getTime();
        const cooldownMs = session.config.cooldown_min * 60 * 1000;
        const remaining = (last + cooldownMs) - new Date().getTime();
        setCooldownTime(remaining > 0 ? remaining : 0);
      }
    }, 1000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [participants, profile?.id]);

  useEffect(() => {
    if (activeSession?.status === 'completed' && participants.length > 0 && !hasShownCelebration) {
      const me = participants.find(p => p.user_id === profile?.id);
      const payout = activeSession.config?.payout_gp || 0;
      const sorted = [...participants].sort((a, b) => (a.final_rank || 999) - (b.final_rank || 999));
      
      if (me?.final_rank === 1 || me?.final_rank === 2) {
        const isChamp = me.final_rank === 1;
        setCelebrationProps({
          title: isChamp ? 'TOURNAMENT CHAMPION' : 'TOURNAMENT FINALIST',
          subtitle: activeSession.config?.title || 'Tournament',
          stat: `${Math.floor(payout * (isChamp ? 0.75 : 0.25))} GP EARNED`,
          emoji: isChamp ? '🏆' : '🥈',
          userName: profile?.display_name || 'WARRIOR',
          rank: isChamp ? 'RANK #1 🏆' : 'RANK #2 🥈',
          leaderboard: sorted.slice(0, 2).map((p, i) => ({
            name: p.profile?.display_name || 'Warrior',
            score: i === 0 ? `${Math.floor(payout * 0.75)} GP` : `${Math.floor(payout * 0.25)} GP`,
            rank: i + 1
          }))
        });
        setShowCelebration(true);
        setHasShownCelebration(true);
      }
    }
  }, [activeSession?.status, participants, hasShownCelebration]);

  const handleToggleReady = async () => {
    const me = participants.find(p => p.user_id === profile?.id);
    if (!me) return;

    await safeMutate(async () => {
      const newReady = !me.is_ready;
      const { error } = await supabase
        .from('tournament_participants')
        .update({ is_ready: newReady })
        .eq('id', me.id);
        
      if (error) return { error };
      await fetchData();

      if (newReady) {
        const readyCount = participants.filter(p => p.is_ready || p.user_id === profile?.id).length;
        const min = activeSession.config.min_participants;
        if (readyCount >= min && !isIgniting.current) {
          isIgniting.current = true;
          try {
            await TournamentService.advanceToRound(sessionId, 1);
          } finally {
            isIgniting.current = false;
          }
        }
      }
      return { data: null, error: null };
    }, {
      errorMessage: 'Failed to update readiness state.'
    });
  };

  const renderRegistration = () => {
    const me = participants.find(p => p.user_id === profile?.id);
    const readyCount = participants.filter(p => p.is_ready).length;
    const min = activeSession.config.min_participants;

    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Text style={[styles.phaseTitle, { color: theme.text.primary }]}>WARRIOR ROSTER</Text>
        <Text style={[styles.phaseSub, { color: theme.text.tertiary }]}>{readyCount} / {min} READY FOR WAR</Text>

        <View style={styles.roster}>
          {participants.map(p => (
            <View key={p.id} style={[styles.warriorRow, { backgroundColor: theme.card.background }]}>
              <Text style={[styles.warriorName, { color: theme.text.primary }]}>{p.profile?.display_name || 'Warrior'}</Text>
              <MaterialCommunityIcons
                name={p.is_ready ? "check-circle" : "clock-outline"}
                size={20}
                color={p.is_ready ? theme.accent : theme.text.tertiary}
              />
            </View>
          ))}
          {Array.from({ length: Math.max(0, min - participants.length) }).map((_, i) => (
            <View key={i} style={[styles.warriorRow, { backgroundColor: 'rgba(255,255,255,0.02)', borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={[styles.warriorName, { color: theme.text.tertiary, fontStyle: 'italic' }]}>Awaiting Warrior...</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.mainBtn, { backgroundColor: (me?.is_ready || isMutating) ? 'rgba(255,255,255,0.1)' : theme.accent }]}
          onPress={handleToggleReady}
          disabled={isMutating}
        >
          <Text style={[styles.mainBtnText, { color: (me?.is_ready || isMutating) ? theme.text.primary : '#000' }]}>
            {isMutating ? 'PLEASE WAIT...' : (me?.is_ready ? 'UNREADY' : 'PREPARE FOR WAR')}
          </Text>
        </TouchableOpacity>

        {me && !me.is_ready && (
          <TouchableOpacity
            style={[styles.mainBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444', marginTop: 12 }]}
            onPress={async () => {
              await safeMutate(async () => {
                const { error } = await supabase
                  .from('tournament_participants')
                  .delete()
                  .eq('id', me.id);
                if (error) return { error };
                await fetchData();
                return { data: null, error: null };
              }, {
                errorMessage: 'Failed to quit tournament.'
              });
            }}
            disabled={isMutating}
          >
            <Text style={{ color: isMutating ? '#999' : '#EF4444', fontWeight: '900', fontSize: 16 }}>
              {isMutating ? 'QUITTING...' : 'QUIT TOURNAMENT'}
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  const renderBracket = () => {
    const roundsMap = allMatches.reduce((acc: any, m: any) => {
      if (!acc[m.day]) acc[m.day] = [];
      acc[m.day].push(m);
      return acc;
    }, {});

    const days = Object.keys(roundsMap).sort((a, b) => parseInt(a) - parseInt(b));

    return (
      <View style={{ marginTop: 24, width: '100%' }}>
        <Text style={[styles.phaseTitle, { color: theme.text.primary, marginBottom: 16 }]}>TOURNAMENT BRACKET</Text>
        {days.map(dayStr => {
          const day = parseInt(dayStr);
          const roundMatches = roundsMap[dayStr];
          const roundConfig = activeSession.config.workout_config.find((c: any) => c.day === day);

          return (
            <View key={dayStr} style={{ marginBottom: 24 }}>
              <Text style={{ color: theme.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1, marginBottom: 12, opacity: 0.8 }}>
                {roundConfig?.title?.toUpperCase() || `ROUND ${day}`}
              </Text>
              {roundMatches.map((m: any) => {
                const pA = participants.find(p => p.user_id === m.user_a);
                const pB = participants.find(p => p.user_id === m.user_b);
                const scoreA = pA?.scores?.[day]?.final || 0;
                const scoreB = pB?.scores?.[day]?.final || 0;

                const renderWarrior = (p: any, score: number, side: 'left' | 'right') => {
                  const isWinner = m.winner_id === p?.user_id;
                  const isMe = p?.user_id === profile?.id;
                  const formatBracketScore = (s: number, mode: string) => {
                    if (s === 0 && !m.winner_id) return "—";
                    if (mode === 'for_time') {
                      const m2 = Math.floor(s / 60);
                      const sec = s % 60;
                      return `${m2}:${sec < 10 ? '0' : ''}${sec}`;
                    }
                    return `${s} pts`;
                  };
                  const roundConfig = activeSession.config?.workout_config?.find((c: any) => c.day === m.day);
                  const displayScore = formatBracketScore(score, roundConfig?.mode || 'amrap');

                  return (
                    <View style={{ flex: 1, alignItems: side === 'left' ? 'flex-start' : 'flex-end' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text
                          style={{
                            color: isMe ? theme.accent : theme.text.primary,
                            fontSize: 16,
                            fontWeight: '900'
                          }}
                          numberOfLines={1}
                        >
                          {p?.profile?.display_name || 'Warrior'}
                        </Text>
                        {p?.is_eliminated && !isWinner && (
                          <Text style={{ marginLeft: 4, fontSize: 12 }}>❌</Text>
                        )}
                      </View>
                      <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '700', marginTop: 2 }}>
                        {displayScore}
                      </Text>
                      {isWinner && (
                        <Text style={{ marginTop: 4, fontSize: 16 }}>👑</Text>
                      )}
                    </View>
                  );
                };

                return (
                  <View
                    key={m.id}
                    style={{
                      backgroundColor: theme.card.background,
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 12,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.08)'
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      {renderWarrior(pA, scoreA, 'left')}

                      <View style={{ paddingHorizontal: 16 }}>
                        <Text style={{ color: theme.text.tertiary, fontSize: 10, fontWeight: '900', opacity: 0.5 }}>VS</Text>
                      </View>

                      {m.user_b ? renderWarrior(pB, scoreB, 'right') : (
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ color: theme.text.tertiary, fontSize: 11, fontStyle: 'italic' }}>GHOST MATCH</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    );
  };

  const renderActiveKnockout = () => {
    const me = participants.find(p => p.user_id === profile?.id);
    const isEliminated = me?.is_eliminated;

    const currentRoundConfig = activeSession.config.workout_config.find((c: any) => c.day === activeSession.current_round);
    const myScore = me?.scores?.[String(activeSession.current_round)];
    const myMatch = matches.find(m => m.user_a === profile?.id || m.user_b === profile?.id);

    let result = 'PENDING';
    if (myMatch?.winner_id) {
      result = myMatch.winner_id === profile?.id ? 'WINNER' : 'DEFEATED';
    }

    return (
      <View style={styles.phaseContainer}>
        {isEliminated && (
          <View style={[styles.eliminatedBanner, { backgroundColor: '#EF444420', borderColor: '#EF4444', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Text style={{ fontSize: 24 }}>💀</Text>
            <View>
              <Text style={{ color: '#EF4444', fontWeight: '900', fontSize: 14 }}>YOU HAVE FALLEN</Text>
              <Text style={{ color: theme.text.secondary, fontSize: 12 }}>Watch the remaining warriors battle it out.</Text>
            </View>
          </View>
        )}

        <View style={styles.roundHeader}>
          <Text style={[styles.roundTitle, { color: theme.accent }]}>{currentRoundConfig?.title || 'BATTLE'}</Text>
          <View style={styles.timerBox}>
            <MaterialCommunityIcons name="timer-outline" size={16} color={theme.text.tertiary} />
            <Text style={[styles.timerText, { color: theme.text.primary }]}>{timeLeft}</Text>
          </View>
        </View>

        {!isEliminated && (
          <>
            <View style={[styles.scoreCard, { backgroundColor: theme.card.background }]}>
              <Text style={[styles.scoreLabel, { color: theme.text.tertiary }]}>YOUR PERFORMANCE</Text>
              <Text style={[styles.scoreValue, { color: theme.text.primary }]}>
                {myScore ? `${myScore.final} PTS` : 'NO SCORE'}
              </Text>
              {myMatch && (
                <View style={styles.matchStatus}>
                  <Text style={[styles.matchLabel, { color: theme.text.tertiary }]}>MATCH STATUS:</Text>
                  <Text style={[styles.matchValue, { color: result === 'WINNER' ? theme.accent : result === 'DEFEATED' ? '#EF4444' : theme.text.secondary }]}>
                    {result}
                  </Text>
                </View>
              )}
            </View>

            {!myScore && (
              <TouchableOpacity
                style={[styles.mainBtn, { backgroundColor: theme.accent }]}
                onPress={() => onEnterWorkout ? onEnterWorkout(sessionId, currentRoundConfig) : router.push({ pathname: "/tournament-trial", params: { sessionId } })}
              >
                <Text style={styles.mainBtnText}>ENTER BATTLE</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {renderBracket()}
      </View>
    );
  };

  const renderActiveRankBased = () => {
    const me = participants.find(p => p.user_id === profile?.id);
    const sorted = [...participants].sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
    const myRank = sorted.findIndex(p => p.user_id === profile?.id) + 1;
    const trialsUsed = me?.trials_used || 0;
    const maxTrials = activeSession.config.max_trials;

    const formatMs = (ms: number) => {
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      return `${m}m ${s}s`;
    };

    return (
      <ScrollView contentContainerStyle={styles.phaseContainer}>
        <View style={styles.roundHeader}>
          <Text style={[styles.roundTitle, { color: theme.accent }]}>LIVE LEADERBOARD</Text>
          <View style={styles.timerBox}>
            <MaterialCommunityIcons name="timer-outline" size={16} color={theme.text.tertiary} />
            <Text style={[styles.timerText, { color: theme.text.primary }]}>{timeLeft}</Text>
          </View>
        </View>

        <View style={styles.leaderboard}>
          {sorted.slice(0, 10).map((p, index) => (
            <View key={p.id} style={[styles.lbRow, { backgroundColor: p.user_id === profile?.id ? 'rgba(255,255,255,0.05)' : 'transparent' }]}>
              <Text style={[styles.lbRank, { color: index < 3 ? theme.accent : theme.text.tertiary }]}>#{index + 1}</Text>
              <Text style={[styles.lbName, { color: theme.text.primary }]}>{p.profile?.display_name || 'Warrior'}</Text>
              <Text style={[styles.lbScore, { color: theme.text.primary }]}>{p.total_score || 0}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.statsRow, { marginTop: 24 }]}>
          <View style={[styles.statBox, { backgroundColor: theme.card.background }]}>
            <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>MY RANK</Text>
            <Text style={[styles.statValue, { color: theme.text.primary }]}>#{myRank}</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: theme.card.background }]}>
            <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>TRIALS</Text>
            <Text style={[styles.statValue, { color: theme.text.primary }]}>{trialsUsed} / {maxTrials}</Text>
          </View>
        </View>

        {cooldownTime > 0 ? (
          <View style={[styles.cooldownBox, { backgroundColor: 'rgba(255,255,255,0.02)' }]}>
            <MaterialCommunityIcons name="lock-clock" size={24} color={theme.text.tertiary} />
            <Text style={{ color: theme.text.tertiary, marginLeft: 8 }}>Cooldown: {formatMs(cooldownTime)}</Text>
          </View>
        ) : (
          trialsUsed < maxTrials && (
            <TouchableOpacity
              style={[styles.mainBtn, { backgroundColor: theme.accent, marginTop: 20 }]}
              onPress={() => onEnterWorkout ? onEnterWorkout(sessionId, activeSession.config.workout_config[0]) : router.push({ pathname: "/tournament-trial", params: { sessionId } })}
            >
              <Text style={styles.mainBtnText}>ATTEMPT TRIAL</Text>
            </TouchableOpacity>
          )
        )}
      </ScrollView>
    );
  };

  const renderCompleted = () => {
    const sorted = [...participants].sort((a, b) => (a.final_rank || 999) - (b.final_rank || 999));
    const me = participants.find(p => p.user_id === profile?.id);
    const payout = activeSession.config.payout_gp;

    return (
      <View style={styles.phaseContainer}>
        <Text style={[styles.phaseTitle, { color: theme.accent }]}>GAUNTLET CONCLUDED</Text>

        <View style={styles.podium}>
          {sorted.slice(0, 3).map((p, i) => (
            <View key={p.id} style={styles.podiumRow}>
              <MaterialCommunityIcons
                name={i === 0 ? "medal" : i === 1 ? "medal-outline" : "medal-outline"}
                size={32}
                color={i === 0 ? "#F59E0B" : i === 1 ? "#94A3B8" : "#B45309"}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.podiumName, { color: p.user_id === profile?.id ? theme.accent : theme.text.primary }]}>{p.profile?.display_name || 'Warrior'}</Text>
                <Text style={{ color: theme.text.tertiary, fontSize: 10 }}>RANK {i + 1} • {i === 0 ? Math.floor(payout * 0.75) : i === 1 ? Math.floor(payout * 0.25) : 0} GP AWARDED</Text>
              </View>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.mainBtn, { backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 40 }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.mainBtnText, { color: theme.text.primary }]}>EXIT ARENA</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary, justifyContent: 'center' }]}>
        <LeapLogo size={40} animated />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={32} color={theme.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text.primary }]}>{activeSession?.config?.title?.toUpperCase()}</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.content}>
        {activeSession.status === 'registration' && renderRegistration()}
        {activeSession.status === 'active' && (activeSession.config?.type === 'knockout' ? renderActiveKnockout() : renderActiveRankBased())}
        {activeSession.status === 'completed' && renderCompleted()}
      </View>

      <CelebrationBanner
        visible={showCelebration}
        {...celebrationProps}
        onDismiss={() => setShowCelebration(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  headerTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  content: { flex: 1, padding: 20 },
  phaseContainer: { flexGrow: 1 },
  phaseTitle: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
  phaseSub: { fontSize: 12, fontWeight: '900', marginBottom: 24 },
  roster: { gap: 12, marginBottom: 40 },
  warriorRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderRadius: 16, alignItems: 'center' },
  warriorName: { fontSize: 16, fontWeight: '700' },
  mainBtn: { padding: 20, borderRadius: 16, alignItems: 'center' },
  mainBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  roundHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  roundTitle: { fontSize: 18, fontWeight: '900' },
  timerBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  timerText: { fontSize: 14, fontWeight: '900', marginLeft: 6 },
  scoreCard: { padding: 24, borderRadius: 24, alignItems: 'center', marginBottom: 30 },
  scoreLabel: { fontSize: 10, fontWeight: '900', marginBottom: 12 },
  scoreValue: { fontSize: 32, fontWeight: '900' },
  matchStatus: { marginTop: 20, alignItems: 'center' },
  matchLabel: { fontSize: 10, fontWeight: '900', marginBottom: 4 },
  matchValue: { fontSize: 18, fontWeight: '900' },
  eliminatedContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  eliminatedTitle: { fontSize: 24, fontWeight: '900', marginTop: 24, marginBottom: 12 },
  eliminatedSub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  eliminatedBanner: {},
  leaderboard: { gap: 4 },
  lbRow: { flexDirection: 'row', padding: 12, borderRadius: 8, alignItems: 'center' },
  lbRank: { width: 30, fontSize: 12, fontWeight: '900' },
  lbName: { flex: 1, fontSize: 14, fontWeight: '700' },
  lbScore: { fontSize: 14, fontWeight: '900' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center' },
  statLabel: { fontSize: 8, fontWeight: '900', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '900' },
  cooldownBox: { flexDirection: 'row', padding: 20, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  podium: { gap: 16, marginTop: 24 },
  podiumRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 16 },
  podiumName: { fontSize: 18, fontWeight: '900' },
});
