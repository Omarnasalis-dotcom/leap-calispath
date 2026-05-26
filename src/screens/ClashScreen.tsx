import { useRouter, useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ClashService, ClashSession } from '../services/ClashService';
import { Profile } from '../types';
import { WarriorCard } from '../components/atoms/WarriorCard';
import { getGloryLeaderboard } from '../lib/leaderboard';
import { supabase } from '../lib/supabase';
import { ClashLogic } from '../lib/clashLogic';
import { LeapLogo } from '../components/LeapLogo';


interface ClashScreenProps {
  onClose?: () => void;
  onStartBattle: (clashId: string) => void;
  onOpenRankings?: () => void;
}

const showAlert = (title: string, message?: string) => {
  if (typeof window !== 'undefined' && window.alert) {
    window.alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
};

export function ClashScreen({ onClose, onStartBattle, onOpenRankings }: ClashScreenProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [availableWarriors, setAvailableWarriors] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeClashes, setActiveClashes] = useState<ClashSession[]>([]);
  const [topWarriors, setTopWarriors] = useState<any[]>([]);

  // 0. Load Podium (Top 3)
  useEffect(() => {
    getGloryLeaderboard(user?.id || '').then(data => {
      setTopWarriors(data.entries.slice(0, 3));
    });
  }, [user]);

  // 1. Manage Lobby Presence (Heartbeat)
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let channel: any = null;

    const initLobby = async () => {
      // a. Set searching status in DB (Fallback/Persistence)
      ClashService.toggleSearchingStatus(user.id, true);

      // Force wait for any old channel to be completely removed from Supabase memory
      const existing = supabase.getChannels().find((c: any) => c.topic === 'realtime:clash_lobby');
      if (existing) {
        await supabase.removeChannel(existing);
      }

      if (!isMounted) return;

      // b. Initialize Presence Channel
      channel = supabase.channel('clash_lobby', {
        config: {
          presence: {
            key: user.id,
          },
        },
      });

      const handleSync = () => {
        loadAvailable();
      };

      channel
        .on('presence', { event: 'sync' }, handleSync)
        .on('presence', { event: 'join' }, () => {
          loadAvailable();
        })
        .on('presence', { event: 'leave' }, () => {
          loadAvailable();
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED' && isMounted) {
            await channel.track({
              online_at: new Date().toISOString(),
              user_id: user.id,
            });
          }
        });
    };

    const loadAvailable = async () => {
      try {
        const warriors = await ClashService.getAvailableWarriors(user.id);
        if (isMounted) setAvailableWarriors(warriors);
      } catch (e) {
        console.error(e);
        showAlert('Connection Error', 'Failed to load available warriors. Pull down to refresh.');
      }
    };


    initLobby();
    ClashService.updateLastActive(user.id);
    const heartbeat = setInterval(() => {
      if (isMounted) ClashService.updateLastActive(user.id);
    }, 60000);
    return () => {
      isMounted = false;
      clearInterval(heartbeat);
      ClashService.toggleSearchingStatus(user.id, false);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user]);

  // 2. Load Active Clashes
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let subscription: any = null;

    const loadClashes = async () => {
      const { data } = await supabase
        .from('clash_sessions')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .not('status', 'in', '("finished","cancelled","declined")')
        .order('created_at', { ascending: false });
      if (data && isMounted) setActiveClashes(data as ClashSession[]);
    };

    const initUpdates = async () => {
      const existing = supabase.getChannels().find((c: any) => c.topic === 'realtime:clash_updates');
      if (existing) {
        await supabase.removeChannel(existing);
      }

      if (!isMounted) return;

      loadClashes();

      subscription = supabase
        .channel('clash_updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clash_sessions' }, loadClashes)
        .subscribe();
    };

    initUpdates();

    return () => {
      isMounted = false;
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [user]);

  // 3. Auto-Battle Trigger
  useEffect(() => {
    const activeBattle = activeClashes.find(c => c.status === 'accepted' || c.status === 'active');
    if (activeBattle) onStartBattle(activeBattle.id);
  }, [activeClashes]);

  async function handleAskToJoin(targetWarrior: Profile) {
    try {
      setLoading(true);
      await ClashService.sendChallenge(targetWarrior.display_name || '');
      showAlert('Challenge Sent!', `Requesting to join ${targetWarrior.display_name}'s session.`);
    } catch (error: any) {
      showAlert('Combat Error', error.message);
    } finally { setLoading(false); }
  }

  async function handleRespond(clashId: string, status: 'accepted' | 'declined') {
    try {
      setLoading(true);
      if (status === 'accepted') {
        // Pre-generate protocol & start time at acceptance to eliminate loading delay
        const clash = activeClashes.find(c => c.id === clashId);
        const bracket = clash?.bracket || 'developing';
        const generatedProtocol = ClashLogic.generateProtocol(bracket);
        const masterStartTime = new Date(Date.now() + 6000).toISOString();

        await supabase.from('clash_sessions').update({
          status: 'accepted',
          workout_protocol: generatedProtocol,
          start_time: masterStartTime
        }).eq('id', clashId);
      } else {
        await ClashService.respondToChallenge(clashId, status);
      }
    } catch (error: any) {
      showAlert('Combat Error', error.message);
    } finally { setLoading(false); }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={28} color={theme.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text.primary }]}>BATTLE LOBBY</Text>
        <TouchableOpacity onPress={onOpenRankings} style={styles.backButton}>
          <MaterialCommunityIcons name="trophy-outline" size={26} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* TOP 3 DASHBOARD - Mirroring Leaderboard Dashboard Style */}
        {topWarriors.length > 0 && (
          <View style={styles.podiumContainer}>
            {/* 2nd Place */}
            {topWarriors[1] && (
              <View style={[styles.podiumSpot, { width: 100 }]}>
                <View style={[styles.podiumCircle, { borderColor: theme.accent }]}>
                  <Text style={[styles.podiumRankLabel, { color: theme.text.tertiary }]}>RANK 2</Text>
                  <Text style={[styles.podiumInitial, { color: theme.text.primary }]}>{topWarriors[1].display_name[0].toUpperCase()}</Text>
                  <Text style={[styles.podiumScore, { color: theme.text.tertiary }]}>{topWarriors[1].best_time_seconds} GP</Text>
                </View>
                <Text numberOfLines={1} style={[styles.podiumName, { color: theme.text.primary }]}>{topWarriors[1].display_name.toUpperCase()}</Text>
              </View>
            )}

            {/* 1st Place - Large Center Circle */}
            {topWarriors[0] && (
              <View style={[styles.podiumSpot, { width: 130 }]}>
                <View style={[styles.podiumCircle, styles.podiumCircle1st, { borderColor: theme.accent }]}>
                  <Text style={[styles.podiumRankLabel, { color: theme.text.tertiary, fontSize: 10 }]}>RANK 1</Text>
                  <Text style={[styles.podiumInitial, styles.podiumInitial1st, { color: theme.text.primary }]}>{topWarriors[0].display_name[0].toUpperCase()}</Text>
                  <Text style={[styles.podiumScore, { color: theme.accent, fontSize: 11 }]}>{topWarriors[0].best_time_seconds} GP</Text>
                </View>
                <Text numberOfLines={1} style={[styles.podiumName, { color: theme.text.primary, fontSize: 12 }]}>{topWarriors[0].display_name.toUpperCase()}</Text>
              </View>
            )}

            {/* 3rd Place */}
            {topWarriors[2] && (
              <View style={[styles.podiumSpot, { width: 100 }]}>
                <View style={[styles.podiumCircle, { borderColor: theme.accent }]}>
                  <Text style={[styles.podiumRankLabel, { color: theme.text.tertiary }]}>RANK 3</Text>
                  <Text style={[styles.podiumInitial, { color: theme.text.primary }]}>{topWarriors[2].display_name[0].toUpperCase()}</Text>
                  <Text style={[styles.podiumScore, { color: theme.text.tertiary }]}>{topWarriors[2].best_time_seconds} GP</Text>
                </View>
                <Text numberOfLines={1} style={[styles.podiumName, { color: theme.text.primary }]}>{topWarriors[2].display_name.toUpperCase()}</Text>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.gloryPortal, { backgroundColor: theme.card.background, borderColor: theme.accent }]}
          onPress={onOpenRankings}
        >
          <MaterialCommunityIcons name="shield-check-outline" size={24} color={theme.accent} />
          <View style={styles.gloryPortalInfo}>
            <Text style={[styles.gloryPortalTitle, { color: theme.text.primary }]}>HALL OF GLORY</Text>
            <Text style={[styles.gloryPortalSub, { color: theme.text.tertiary }]}>FULL GLOBAL STANDINGS</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.text.tertiary} />
        </TouchableOpacity>

        {activeClashes.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.accent }]}>PENDING BATTLES</Text>
            {activeClashes.map(clash => {
              const isSender = clash.sender_id === user?.id;
              return (
                <WarriorCard key={clash.id} style={styles.clashCard}>
                  <View style={styles.clashInfo}>
                    <Text style={[styles.clashName, { color: theme.text.primary }]}>
                      {isSender ? 'WAITING FOR WARRIOR...' : 'WARRIOR ASKING TO JOIN'}
                    </Text>
                    <Text style={[styles.clashStatus, { color: theme.text.tertiary }]}>{clash.status.toUpperCase()}</Text>
                  </View>
                  {!isSender && clash.status === 'pending' && (
                    <View style={styles.clashActions}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#4CAF50' }]} onPress={() => handleRespond(clash.id, 'accepted')}>
                        <MaterialCommunityIcons name="check" size={18} color="#FFF" />
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#D32F2F' }]} onPress={() => handleRespond(clash.id, 'declined')}>
                        <MaterialCommunityIcons name="close" size={18} color="#FFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                  {isSender && <LeapLogo size={40} animated />}
                </WarriorCard>
              );
            })}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitle, { color: theme.text.tertiary }]}>WARRIORS IN LOBBY</Text>
            <Text style={[styles.countBadge, { color: theme.text.tertiary }]}>{availableWarriors.length} ONLINE</Text>
          </View>
          {availableWarriors.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="account-search-outline" size={48} color={theme.text.tertiary} style={{ opacity: 0.2 }} />
              <Text style={[styles.emptyText, { color: theme.text.tertiary }]}>ARENA IS EMPTY</Text>
              <Text style={styles.emptySub}>WAITING FOR OTHER WARRIORS...</Text>
            </View>
          ) : (
            availableWarriors.map(warrior => (
              <WarriorCard key={warrior.id} style={styles.warriorCard}>
                <View style={styles.warriorInfo}>
                  <Text style={[styles.warriorName, { color: theme.text.primary }]}>{warrior.display_name?.toUpperCase()}</Text>
                  <Text style={[styles.warriorTier, { color: theme.accent }]}>TIER {warrior.strength_tier} • {warrior.glory_score} GP</Text>
                </View>
                <TouchableOpacity style={[styles.joinBtn, { backgroundColor: theme.accent }]} onPress={() => handleAskToJoin(warrior)}>
                  <Text style={styles.joinBtnText}>ASK TO JOIN</Text>
                </TouchableOpacity>
              </WarriorCard>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  backButton: { padding: 4 },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  scrollContent: { paddingBottom: 40 },
  podiumContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 30,
    marginHorizontal: 10,
  },
  podiumSpot: { alignItems: 'center' },
  podiumCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(205, 127, 50, 0.08)',
  },
  podiumCircle1st: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
  },
  podiumRankLabel: { fontSize: 8, fontWeight: '900', color: '#666', letterSpacing: 1 },
  podiumInitial: { fontSize: 28, fontWeight: '900', marginTop: 4 },
  podiumInitial1st: { fontSize: 42 },
  podiumName: { fontSize: 10, fontWeight: '900', marginTop: 8, letterSpacing: 0.5, textAlign: 'center', width: '100%' },
  podiumScore: { fontSize: 9, fontWeight: '800', opacity: 0.6 },
  gloryPortal: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginBottom: 30, padding: 16, borderRadius: 16, borderWidth: 1.5, gap: 12 },
  gloryPortalInfo: { flex: 1, gap: 2 },
  gloryPortalTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  gloryPortalSub: { fontSize: 9, fontWeight: '700', opacity: 0.5 },
  section: { paddingHorizontal: 20, marginBottom: 30 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  countBadge: { fontSize: 9, fontWeight: '800', opacity: 0.6 },
  clashCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, marginBottom: 10 },
  clashInfo: { gap: 2 },
  clashName: { fontSize: 13, fontWeight: '900' },
  clashStatus: { fontSize: 9, fontWeight: '700' },
  clashActions: { flexDirection: 'row', gap: 8 },
  actionBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  warriorCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, marginBottom: 10 },
  warriorInfo: { gap: 4 },
  warriorName: { fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  warriorTier: { fontSize: 10, fontWeight: '800' },
  joinBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  joinBtnText: { color: '#000', fontSize: 11, fontWeight: '900' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  emptySub: { fontSize: 9, fontWeight: '700', opacity: 0.5 },
});
