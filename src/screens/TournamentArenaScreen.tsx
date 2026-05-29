import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { debounce } from 'lodash';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Image, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { TournamentService } from '../services/TournamentService';
import { useSafeMutation } from '../hooks/useSafeMutation';
import { LeapLogo } from '../components/LeapLogo';


export function TournamentArenaScreen({ navigation }: { navigation: any }) {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'arena' | 'leaderboard'>('arena');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const { safeMutate, isMutating: safeJoining } = useSafeMutation();

  const fetchData = useCallback(
    debounce(async () => {
      try {
        const sessions = await TournamentService.getActiveSessions();
        setActiveSessions(sessions || []);

        if (sessions && sessions.length > 0) {
          const { data: pData } = await supabase
            .from('tournament_participants')
            .select('*, profile:profiles(display_name)')
            .in('tournament_id', sessions.map(s => s.id));
          setParticipants(pData || []);
        }

        // Fetch leaderboard
        const { data: lbData } = await supabase
          .from('profiles')
          .select('id, display_name, tournament_gp')
          .gt('tournament_gp', 0)
          .order('tournament_gp', { ascending: false })
          .limit(20);
        setLeaderboard(lbData || []);
      } catch (error) {
        console.error('Error fetching arena data:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    }, 2000),
    []
  );

  useEffect(() => {
    fetchData();

    // Real-time subscriptions
    const sessionSub = supabase
      .channel('arena_sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_sessions' }, () => fetchData())
      .subscribe();

    const participantSub = supabase
      .channel('arena_participants')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_participants' }, () => fetchData())
      .subscribe();

    return () => {
      supabase.removeChannel(sessionSub);
      supabase.removeChannel(participantSub);
    };
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const showAlert = (title: string, message: string) => {
    if (Platform.OS === 'web') {
      alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
    }
  };

  const handleJoin = async (session: any) => {
    if (!session || !profile) return;
    await safeMutate(async () => {
      const res = await TournamentService.joinTournament(session.id, profile.id);
      if (res.success) {
        return { data: res, error: null };
      } else {
        return { error: new Error((res.error as any)?.message || 'This tournament is not fit for your current tier.') };
      }
    }, {
      onSuccess: () => fetchData(),
      errorMessage: 'Failed to join tournament'
    });
  };

  const handleEnterLobby = (session: any) => {
    if (!session || !profile) return;
    
    const allowed = session.config?.allowed_tiers;
    const userTier = Number(profile.strength_tier || 0);

    console.log('LOBBY ENTRY VALIDATION:', {
      userTier,
      allowed,
      isEligible: allowed ? allowed.map(Number).includes(userTier) : 'no restriction'
    });

    if (allowed) {
      if (!allowed.map(Number).includes(userTier)) {
        showAlert('Ineligible Warrior', `This tournament is not fit for your current tier (T${userTier}). Please check the entry requirements.`);
        return;
      }
    }
    router.push({ pathname: '/tournament-lobby', params: { sessionId: session.id } });
  };

  const renderActiveCard = (session: any) => {
    const isJoined = participants.some(p => p.user_id === profile?.id && p.tournament_id === session.id);
    const config = session.config;
    const sessionParticipants = participants.filter(p => p.tournament_id === session.id);

    return (
      <View key={session.id} style={[styles.activeCard, { backgroundColor: theme.card.background }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: theme.text.primary }]}>{config?.title.toUpperCase()}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                <Text style={[styles.badgeText, { color: theme.accent }]}>{config?.type.toUpperCase()}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                <Text style={[styles.badgeText, { color: theme.text.tertiary }]}>{session.status.toUpperCase()}</Text>
              </View>
              {config?.allowed_tiers && (
                <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                  <Text style={[styles.badgeText, { color: theme.accent }]}>
                    LEVEL: {config.allowed_tiers.length === 9 ? 'ALL' : config.allowed_tiers.sort().join(',')}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <MaterialCommunityIcons name="trophy" size={24} color={theme.accent} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>PRIZE POOL</Text>
            <Text style={[styles.statValue, { color: theme.text.primary }]}>🏆 {config?.payout_gp} GP</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>WARRIORS</Text>
            <Text style={[styles.statValue, { color: theme.text.primary }]}>{sessionParticipants.length} / {config?.bracket_size || config?.min_participants}</Text>
          </View>
        </View>

        {session.status === 'registration' ? (
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: isJoined ? 'rgba(255,255,255,0.1)' : theme.accent }]}
            onPress={isJoined ? () => handleEnterLobby(session) : () => handleJoin(session)}
            disabled={safeJoining}
          >
            <Text style={[styles.actionBtnText, { color: isJoined ? theme.text.primary : '#000' }]}>
              {isJoined ? 'ENTER LOBBY' : 'JOIN TOURNAMENT'}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: theme.accent }]}
            onPress={() => handleEnterLobby(session)}
          >
            <Text style={styles.actionBtnText}>ENTER ARENA</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderLeaderboard = () => (
    <View style={styles.leaderboardContainer}>
      {leaderboard.map((item, index) => (
        <View key={item.id} style={[styles.lbRow, { borderBottomColor: 'rgba(255,255,255,0.05)' }]}>
          <Text style={[styles.lbRank, { color: index < 3 ? theme.accent : theme.text.tertiary }]}>#{index + 1}</Text>
          <Text style={[styles.lbName, { color: item.id === profile?.id ? theme.accent : theme.text.primary }]}>
            {item.display_name || 'Warrior'}
          </Text>
          <Text style={[styles.lbPoints, { color: theme.text.primary }]}>{item.tournament_gp} GP</Text>
        </View>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary, justifyContent: 'center' }]}>
        <LeapLogo size={40} animated />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={[styles.header, { justifyContent: 'flex-start' }]}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text.primary }]}>TOURNAMENT ARENA</Text>
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity 
          onPress={() => setActiveTab('arena')}
          style={[styles.tab, activeTab === 'arena' && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'arena' ? theme.text.primary : theme.text.tertiary }]}>ARENA</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          onPress={() => setActiveTab('leaderboard')}
          style={[styles.tab, activeTab === 'leaderboard' && { borderBottomColor: theme.accent, borderBottomWidth: 2 }]}
        >
          <Text style={[styles.tabText, { color: activeTab === 'leaderboard' ? theme.text.primary : theme.text.tertiary }]}>LEADERBOARD</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        {activeTab === 'arena' ? (
          activeSessions.length > 0 ? (
            activeSessions.map(s => renderActiveCard(s))
          ) : (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="sword-cross" size={80} color={theme.text.tertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text.primary }]}>THE ARENA IS QUIET</Text>
              <Text style={[styles.emptySub, { color: theme.text.secondary }]}>No active tournaments at the moment. Check back soon for the next gauntlet.</Text>
            </View>
          )
        ) : renderLeaderboard()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 24, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  activeCard: { padding: 24, borderRadius: 24, marginBottom: 20 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  cardTitle: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '900' },
  statsRow: { flexDirection: 'row', marginBottom: 30, gap: 40 },
  statItem: { flex: 1 },
  statLabel: { fontSize: 10, fontWeight: '900', marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '900' },
  actionBtn: { padding: 20, borderRadius: 16, alignItems: 'center' },
  actionBtnText: { fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '900', marginTop: 24, marginBottom: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  leaderboardContainer: { marginTop: 10 },
  lbRow: { flexDirection: 'row', paddingVertical: 16, borderBottomWidth: 1, alignItems: 'center' },
  lbRank: { width: 40, fontSize: 14, fontWeight: '900' },
  lbName: { flex: 1, fontSize: 16, fontWeight: '700' },
  lbPoints: { fontSize: 16, fontWeight: '900' },
});
