import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, Alert, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ArenaService, ArenaPhase } from '../services/ArenaService';
import { useAuth } from '../contexts/AuthContext';
import { LeapLogo } from '../components/LeapLogo';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';


interface ChampionsArenaScreenProps {
  onClose?: () => void;
  onStartArenaWorkout?: (phase: ArenaPhase) => void;
}

export function ChampionsArenaScreen({ onClose, onStartArenaWorkout }: ChampionsArenaScreenProps) {
  const { theme } = useTheme();
  const { user, profile } = useAuth();
  const [phases, setPhases] = useState<ArenaPhase[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<ArenaPhase | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    loadArenaData();
  }, []);

  useEffect(() => {
    if (selectedPhase && user) {
      fetchRankings();
    }
  }, [selectedPhase, user]);

  async function loadArenaData() {
    try {
      const data = await ArenaService.getStrengthArenaPhases();
      setPhases(data);
      if (data.length > 0) setSelectedPhase(data[0]);
    } catch (error) {
      console.error('Arena load error:', error);
      Alert.alert('Error', 'Failed to load Champions Arena. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function fetchRankings() {
    if (!selectedPhase || !user) return;
    const rankings = await ArenaService.getUnifiedRankings(selectedPhase.id, user.id);
    setLeaderboard(rankings);
  }

  const formatTime = (seconds: any) => {
    const s = Number(seconds);
    if (!s || isNaN(s)) return '?:??';
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background.primary, justifyContent: 'center' }]}>
        <LeapLogo size={40} animated />
      </View>
    );
  }

  return (
    <GlobalErrorBoundary>
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.card.border }]}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={32} color="#D32F2F" />
        </TouchableOpacity>
        <View style={styles.headerTitleFrame}>
          <Text style={[styles.title, { color: theme.text.primary }]}>CHAMPIONS ARENA</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Phase Selector - Horizontal Pills */}
        <View style={styles.phaseSelector}>
          {phases.map(phase => (
            <TouchableOpacity
              key={phase!.id}
              style={[
                styles.phasePill,
                { backgroundColor: theme.card.background, borderColor: theme.card.border },
                selectedPhase?.id === phase!.id && { borderColor: '#D32F2F', backgroundColor: 'rgba(211,47,47,0.1)' }
              ]}
              onPress={() => setSelectedPhase(phase)}
            >
              <Text style={[
                styles.phasePillText,
                { color: theme.text.tertiary },
                selectedPhase?.id === phase!.id && { color: '#D32F2F' }
              ]}>
                {phase!.name.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedPhase && (
          <View style={styles.mainDisplay}>
            {/* Phase Info Card */}
            <View style={[styles.infoCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <View style={styles.cardHeader}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>ELITE CIRCUIT</Text>
                </View>
                <Text style={[styles.phaseTitleLarge, { color: theme.text.primary }]}>{selectedPhase.name}</Text>
              </View>

              <View style={styles.proRecordBox}>
                <Text style={[styles.proRecordLabel, { color: theme.text.tertiary }]}>TIME TO BEAT</Text>
                <Text style={styles.proRecordValue}>{formatTime(selectedPhase.pro_benchmark_time)}</Text>
              </View>

              <View style={styles.divider} />

              {/* Circuit Preview */}
              <View style={styles.circuitPreview}>
                <Text style={[styles.sectionTitle, { color: theme.text.secondary }]}>WORKOUT SEQUENCE</Text>
                {selectedPhase.steps.map((step, idx) => (
                  <View key={step.id} style={styles.stepRow}>
                    <Text style={[styles.stepNumber, { color: '#D32F2F' }]}>{idx + 1}</Text>
                    <Text style={[styles.stepName, { color: theme.text.primary }]}>{step.movement_name.toUpperCase()}</Text>
                    <View style={styles.stepStats}>
                      {step.reps > 1 && <Text style={[styles.stepReps, { color: theme.text.secondary }]}>{step.reps}x</Text>}
                      {step.added_weight_kg > 0 && (
                        <Text style={styles.weightTag}>+{step.added_weight_kg}KG</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>

              {/* Start Trial Button - LOCKED TO TIER 8 */}
              {profile?.strength_tier === 8 ? (
                <TouchableOpacity 
                  style={styles.mainStartButton}
                  onPress={() => onStartArenaWorkout && onStartArenaWorkout(selectedPhase)}
                >
                  <Text style={styles.mainStartButtonText}>START ARENA TRIAL</Text>
                  <MaterialCommunityIcons name="sword-cross" size={20} color="#FFF" />
                </TouchableOpacity>
              ) : (
                <View style={[styles.lockedButton, { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }]}>
                  <MaterialCommunityIcons name="lock" size={18} color={theme.text.tertiary} />
                  <Text style={[styles.lockedButtonText, { color: theme.text.tertiary }]}>
                    REACH ETERNITY TIER TO COMPETE
                  </Text>
                </View>
              )}
            </View>

            {/* Worldwide Leaderboard */}
            <View style={styles.leaderboardSection}>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="podium" size={20} color="#D32F2F" />
                <Text style={[styles.sectionTitleMain, { color: theme.text.primary }]}>WORLDWIDE RANKINGS</Text>
                <Text style={{ fontSize: 10, color: theme.text.tertiary, marginLeft: 'auto' }}>
                  DEBUG: {leaderboard.length} ENTRIES
                </Text>
              </View>

              {leaderboard.map((result, idx) => (
                <View
                  key={`${result.display_name}-${idx}`}
                  style={[
                    styles.proRow, 
                    { 
                      flexDirection: 'row', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: theme.card.background, 
                      borderColor: theme.card.border 
                    },
                    result.is_user_entry && { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.05)' }
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <Text style={[styles.rankText, { width: 35, color: idx === 0 ? '#FFD700' : theme.text.tertiary }]}>
                      #{result.calculated_rank || idx + 1}
                    </Text>
                    <Text style={[
                      styles.athleteName, 
                      { color: theme.text.primary, flex: 1 },
                      result.is_user_entry && { color: '#FFD700', fontWeight: '900' }
                    ]}>
                      {(result.display_name || '').toUpperCase()} {result.is_user_entry ? '(YOU)' : ''}
                    </Text>
                  </View>

                  <Text style={[
                    styles.athleteTime, 
                    { width: 100, color: result.is_user_entry ? '#FFD700' : theme.text.secondary, textAlign: 'right', fontWeight: '900' }
                  ]}>
                    {formatTime(result.completion_time || result.time_in_seconds || result.time_seconds || 0)}
                  </Text>
                </View>
              ))}

              {leaderboard.length === 0 && (
                <Text style={[styles.noRankText, { color: theme.text.tertiary }]}>
                  ESTABLISHING RANKINGS...
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleFrame: {
    borderWidth: 2,
    borderColor: '#D32F2F',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  phaseSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  phasePill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    alignItems: 'center',
  },
  phasePillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  mainDisplay: {
    width: '100%',
  },
  infoCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    marginBottom: 24,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  badge: {
    backgroundColor: '#D32F2F',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 12,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  phaseTitleLarge: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  proRecordBox: {
    alignItems: 'center',
    marginBottom: 20,
  },
  proRecordLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  proRecordValue: {
    fontSize: 42,
    fontWeight: '900',
    color: '#FFF',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 20,
  },
  circuitPreview: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 16,
    opacity: 0.6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '900',
    width: 24,
  },
  stepName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.5,
  },
  stepStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepReps: {
    fontSize: 13,
    fontWeight: '800',
  },
  weightTag: {
    backgroundColor: 'rgba(211,47,47,0.2)',
    color: '#D32F2F',
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mainStartButton: {
    backgroundColor: '#D32F2F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 24,
  },
  mainStartButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  lockedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  lockedButtonText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  leaderboardSection: {
    width: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitleMain: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  rankBox: {
    width: 40,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '900',
  },
  athleteName: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
    letterSpacing: 0.5,
    marginRight: 10,
  },
  athleteTime: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    width: 80,
    textAlign: 'right',
  },
  noRankText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 20,
    letterSpacing: 1,
    opacity: 0.5,
  },
});
