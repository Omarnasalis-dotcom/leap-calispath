import { useRouter, useLocalSearchParams, router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { getGloryLeaderboard, LeaderboardEntry } from '../lib/leaderboard';
import { getCountryFlag } from '../constants/countries';
import { LeapLogo } from '../components/LeapLogo';


interface GloryLeaderboardScreenProps {
  onClose?: () => void;
}

export function GloryLeaderboardScreen({ onClose }: GloryLeaderboardScreenProps) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');

  const filteredEntries = React.useMemo(() => {
    let list = entries;
    if (genderFilter !== 'ALL') {
      list = entries.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, index) => ({ ...e, rank: index + 1 }));
  }, [entries, genderFilter]);

  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      try {
        const data = await getGloryLeaderboard(user.id);
        setEntries(data.entries);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const renderMedal = (rank: number) => {
    if (rank === 1) return <Text style={styles.medal}>🥇</Text>;
    if (rank === 2) return <Text style={styles.medal}>🥈</Text>;
    if (rank === 3) return <Text style={styles.medal}>🥉</Text>;
    return <Text style={styles.rankNumber}>{rank}</Text>;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <View style={[styles.header, { justifyContent: 'flex-start' }]}>
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 20, alignItems: 'center' }}>
          <View style={styles.tierNameHeaderFrame}>
            <Text style={[styles.tierNameHeaderText, { color: '#CD7F32' }]}>HALL OF GLORY</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onClose} style={[styles.closeButton, { zIndex: 10 }]}>
          <MaterialCommunityIcons name="close" size={28} color={theme.text.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loading}><LeapLogo size={40} animated /></View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {/* Gender Filters */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 16, gap: 12 }}>
            {['ALL', 'MALE', 'FEMALE'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  backgroundColor: genderFilter === filter ? '#CD7F32' : 'rgba(255,255,255,0.05)',
                  borderWidth: 1,
                  borderColor: genderFilter === filter ? '#CD7F32' : 'rgba(255,255,255,0.1)'
                }}
                onPress={() => setGenderFilter(filter as any)}
              >
                <Text style={{
                  fontSize: 12,
                  fontWeight: '900',
                  color: genderFilter === filter ? '#FFF' : 'rgba(255,255,255,0.6)'
                }}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {filteredEntries.map((entry) => {
            const isCurrentUser = entry.is_current_user;
            return (
              <View
                key={entry.user_id}
                style={[
                  styles.entryRow,
                  isCurrentUser && styles.entryRowCurrentUser,
                  entry.rank <= 3 && styles.entryRowTopThree
                ]}
              >
                <View style={styles.rankContainer}>
                  {renderMedal(entry.rank)}
                </View>

                <Text
                  style={[
                    styles.entryName,
                    isCurrentUser && styles.entryNameCurrentUser
                  ]}
                  numberOfLines={1}
                >
                  <Text style={{ fontSize: 16 }}>{getCountryFlag(entry.country)} </Text>
                  {entry.display_name.toUpperCase()}
                  {isCurrentUser && <Text style={styles.youText}> (YOU)</Text>}
                </Text>

                <View style={styles.timeContainer}>
                  <Text style={[styles.entryTime, { color: '#FFA500' }]}>
                    {entry.best_time_seconds}
                  </Text>
                  <Text style={styles.unitText}>GP</Text>
                </View>
              </View>
            );
          })}
          <View style={styles.footerSpacer} />
        </ScrollView>
      )}

      <View style={styles.floatingFooter}>
        <Text style={styles.footerHint}>DUEL TO RISE IN THE HALL OF GLORY</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(205,127,50,0.2)',
  },
  closeButton: { padding: 4 },
  tierNameHeaderFrame: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 2,
    borderRadius: 16,
    borderColor: '#CD7F32',
  },
  tierNameHeaderText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  headerSpacer: { height: 16 },
  footerSpacer: { height: 100 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.1)',
    marginBottom: 8,
  },
  entryRowCurrentUser: {
    backgroundColor: 'rgba(205,127,50,0.15)',
    borderColor: '#CD7F32',
  },
  entryRowTopThree: {
    borderColor: 'rgba(205,127,50,0.4)',
  },
  rankContainer: {
    width: 40,
    alignItems: 'center',
  },
  medal: {
    fontSize: 24,
  },
  rankNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFA500',
  },
  entryName: {
    flex: 1,
    fontSize: 16,
    color: '#FFA500',
    marginLeft: 12,
    fontWeight: '600',
  },
  entryNameCurrentUser: {
    color: '#32CD32',
    fontWeight: '700',
  },
  youText: {
    fontSize: 10,
    opacity: 0.6,
  },
  timeContainer: {
    alignItems: 'flex-end',
  },
  entryTime: {
    fontSize: 20,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255,165,0,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  unitText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#666',
    marginTop: -2,
  },
  floatingFooter: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(205,127,50,0.3)',
  },
  footerHint: {
    fontSize: 10,
    fontWeight: '900',
    color: '#CD7F32',
    letterSpacing: 2,
  },
});
