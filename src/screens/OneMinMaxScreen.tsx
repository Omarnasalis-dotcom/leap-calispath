import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, ActivityIndicator, Modal,
  Dimensions, RefreshControl, Animated, Vibration
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import {
  ONEMM_MOVEMENTS,
  ONEMM_CATEGORIES,
  calculateOneMMPoints
} from '../lib/oneMMLogic';
import { OneMMService, OneMMUserStats, OneMMRanking } from '../services/OneMMService';

import { SoundServiceInstance as SoundService } from '../lib/SoundService';

const { width } = Dimensions.get('window');

export function OneMinMaxScreen({ onBack }: { onBack: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { user, profile } = useAuth();

  const [stats, setStats] = useState<OneMMUserStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'overall' | 'entry' | 'main' | 'advanced'>('overall');
  const [selectedExerciseCategory, setSelectedExerciseCategory] = useState<'entry' | 'main' | 'advanced'>('entry');
  const [leaderboardData, setLeaderboardData] = useState<OneMMRanking[]>([]);
  const [modalLeaderboardData, setModalLeaderboardData] = useState<OneMMRanking[]>([]);
  const [showMovementLeaderboard, setShowMovementLeaderboard] = useState(false);
  const [showOverallModal, setShowOverallModal] = useState(false);

  // Timer & Modal State
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [preCountdown, setPreCountdown] = useState(0);
  const [isPreTimerRunning, setIsPreTimerRunning] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [repsInput, setRepsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const s = await OneMMService.getUserStats(user.id);
      setStats(s);
    } catch (error) {
      console.error('Fetch 1MM error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      let data;
      if (leaderboardTab === 'overall') {
        data = await OneMMService.getLeaderboard('overall');
      } else {
        data = await OneMMService.getCategoryLeaderboard(leaderboardTab);
      }
      setLeaderboardData(data);
    } catch (error) {
      console.error('1MM Leaderboard error:', error);
    }
  }, [leaderboardTab]);

  const fetchMovementLeaderboard = async (moveId: string) => {
    try {
      const data = await OneMMService.getLeaderboard(moveId);
      setModalLeaderboardData(data);
      setShowMovementLeaderboard(true);
    } catch (error) {
      console.error('Movement LB error:', error);
    }
  };

  const fetchOverallLeaderboard = async () => {
    console.log('Fetching overall leaderboard...');
    setShowOverallModal(true); // Open modal immediately for better UX
    try {
      const data = await OneMMService.getLeaderboard('overall');
      setModalLeaderboardData(data);
    } catch (error) {
      console.error('Overall LB error:', error);
      Alert.alert('Error', 'Could not load leaderboard.');
      setShowOverallModal(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
    fetchLeaderboard();
  };

  // Timer Logic
  useEffect(() => {
    if (isPreTimerRunning && preCountdown > 0) {
      SoundService.playTick();
      timerRef.current = setInterval(() => {
        setPreCountdown(prev => prev - 1);
      }, 1000);
    } else if (isPreTimerRunning && preCountdown === 0) {
      setIsPreTimerRunning(false);
      setIsTimerRunning(true);
      SoundService.playBoxingBell();
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      if (isTimerRunning) {
        setIsTimerRunning(false);
        setTimerFinished(true);
        Vibration.vibrate([0, 500, 200, 500]);
        SoundService.playDigitalBuzzer(2);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPreTimerRunning, preCountdown, isTimerRunning, timeLeft]);

  const startTimer = () => {
    setPreCountdown(5);
    setIsPreTimerRunning(true);
    setIsTimerRunning(false);
    setTimerFinished(false);
    setTimeLeft(60);
  };

  const cancelTimer = () => {
    setIsPreTimerRunning(false);
    setIsTimerRunning(false);
    setPreCountdown(0);
    setTimeLeft(60);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleSaveResult = async () => {
    if (!user || !selectedMovement || !repsInput) return;
    setSaving(true);
    try {
      const reps = parseInt(repsInput);
      await OneMMService.saveLog(user.id, selectedMovement, reps);
      Alert.alert('Success', '1MM Result Logged!');
      setShowLogModal(false);
      fetchData();
      fetchLeaderboard();
    } catch (error) {
      Alert.alert('Error', 'Failed to save result.');
    } finally {
      setSaving(false);
    }
  };

  const resetTimer = () => {
    setTimerFinished(false);
    setIsTimerRunning(false);
    setIsPreTimerRunning(false);
    setTimeLeft(60);
    setRepsInput('');
  };

  const MasteryRings = ({ size = 180, centerText, topText, bottomText, subText, showCrown = false, active = false, rankMode = false }: any) => {
    return (
      <View style={[styles.ringsContainer, { width: size, height: size }]}>
        <View
          style={[
            styles.masteryRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: active ? 2 : 1,
              borderColor: '#FF7043',
              backgroundColor: active ? '#FF704315' : 'transparent',
              opacity: active ? 1 : 0.4
            }
          ]}
        />
        <View style={styles.ringsCenter}>
          {!rankMode && topText && (
            <Text style={[styles.heroTopText, { color: '#FF7043', fontSize: size * 0.06 }]}>
              {topText?.toUpperCase()}
            </Text>
          )}

          <View style={{ alignItems: 'center', gap: 2 }}>
            {showCrown && (
              <MaterialCommunityIcons name="crown" size={size * 0.12} color="#FF7043" style={{ marginBottom: -2 }} />
            )}

            <Text style={[styles.ringsValue, { color: theme.text.primary, fontSize: size * 0.25 }]}>{centerText}</Text>

            {rankMode && subText && (
              <Text style={{ color: '#FF7043', fontSize: size * 0.12, fontWeight: '900', marginTop: -2 }}>
                {subText}
              </Text>
            )}
          </View>

          {!rankMode && bottomText && (
            <Text style={[styles.heroBottomText, { color: '#FF7043', fontSize: size * 0.06 }]}>
              {bottomText?.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <MaterialCommunityIcons name="chevron-left" size={32} color={theme.text.primary} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => setLeaderboardTab('overall')}
        style={[
          styles.headerTitleContainer,
          {
            borderColor: '#FF7043',
            borderWidth: 1,
            backgroundColor: '#FF704320'
          }
        ]}
      >
        <Text style={[
          styles.headerTitle,
          { color: theme.text.primary }
        ]}>ENDURANCE WORLD</Text>
      </TouchableOpacity>

      <View style={{ width: 40 }} />
    </View>
  );

  const renderDashboard = () => {
    if (!stats) return null;

    const getPeakPerformance = () => {
      const peaks: Record<string, number> = {};
      ONEMM_MOVEMENTS.forEach(m => {
        const reps = stats.pbs[m.id] || 0;
        const points = reps * m.multiplier;
        if (points > (peaks[m.patternId] || 0)) {
          peaks[m.patternId] = points;
        }
      });
      const total = Object.values(peaks).reduce((sum, p) => sum + p, 0);
      return { total };
    };

    const peakData = getPeakPerformance();
    const userRank = stats.ranks['glory'] || 0;

    // Gap Calculation (Handle Ties)
    let gapToNext = 0;
    if (userRank > 1) {
      const personAbove = leaderboardData.find(e => e.rank === userRank - 1);
      if (personAbove && !isNaN(personAbove.value)) {
        gapToNext = Math.ceil((personAbove.value || 0) - (peakData.total || 0));
      }

      if (gapToNext <= 0) {
        const strictlyBetter = leaderboardData.find(e => e.value > peakData.total);
        if (strictlyBetter) {
          gapToNext = Math.ceil(strictlyBetter.value - peakData.total);
        }
      }
    }

    return (
      <View style={styles.dashboard}>
        <View style={{ alignItems: 'center', marginBottom: -10 }}>
          <Text style={{ fontSize: 9, fontWeight: '900', color: '#FF7043', letterSpacing: 3 }}>OVERALL 1MM</Text>
        </View>

        <View style={styles.heroRow}>
          <MasteryRings
            size={80}
            topText="1MM RANK"
            centerText={`#${userRank || '--'}`}
            bottomText="OF WORLD"
            showCrown={userRank === 1}
          />
          <TouchableOpacity
            onPress={() => {
              console.log('1MM Score button pressed');
              fetchOverallLeaderboard();
            }}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <MasteryRings
                size={100}
                topText="1MM SCORE"
                centerText={Math.round(peakData.total || 0)}
                bottomText="TOTAL PTS"
                active
                showCrown
              />
              <View style={[styles.heroAddIcon, { backgroundColor: '#FF7043' }]}>
                <MaterialCommunityIcons name="chart-bar" size={14} color="#000" />
              </View>
            </View>
          </TouchableOpacity>
          <MasteryRings
            size={80}
            topText="GAP TO"
            centerText={userRank === 1 ? 'KING' : `+${gapToNext}`}
            bottomText="RANK UP"
          />
        </View>

        <Text style={[styles.sectionHeader, { color: '#FF7043' }]}>YOUR PEAK ENDURANCE</Text>

        {/* Category Filter for Exercises */}
        <View style={styles.exerciseFilter}>
          {['overall', 'entry', 'main', 'advanced'].map(cat => {
            const isActive = leaderboardTab === cat;
            const isLocked = (profile?.strength_tier ?? 0) < 5 && (cat === 'main' || cat === 'advanced');

            return (
              <TouchableOpacity
                key={cat}
                onPress={() => {
                  if (isLocked) {
                    Alert.alert('Locked', 'Reach Tier 5 to unlock Main and Advanced categories.');
                    return;
                  }
                  if (cat !== 'overall') {
                    setSelectedExerciseCategory(cat as any);
                  }
                  setLeaderboardTab(cat as any);
                }}
                style={[
                  styles.exerciseFilterTab,
                  { flex: cat === 'overall' ? 1.8 : 1, marginHorizontal: 2 },
                  isActive && { backgroundColor: '#FF7043', borderColor: '#FF7043' },
                  isLocked && { opacity: 0.3 }
                ]}
              >
                <Text style={[styles.exerciseFilterText, { color: isActive ? '#000' : theme.text.tertiary, fontSize: cat === 'overall' ? 8 : 10 }]}>
                  {cat === 'overall' ? 'ENDURANCE OVERALL' : cat.toUpperCase()}
                </Text>
                {cat === 'overall' && (
                  <MaterialCommunityIcons 
                    name="crown" 
                    size={10} 
                    color={isActive ? '#000' : theme.text.tertiary} 
                    style={{ marginLeft: 2 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.peakGrid}>
          {ONEMM_MOVEMENTS.filter(m => m.categoryId === selectedExerciseCategory).map(m => {
            const pb = stats.pbs[m.id] || 0;
            const rank = stats.ranks[m.id] || '--';
            const isLocked = m.minTier > (profile?.strength_tier ?? 0);

            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.peakItem, isLocked && { opacity: 0.4 }]}
                onPress={() => {
                  if (isLocked) {
                    Alert.alert('Locked', `Reach Tier ${m.minTier} to unlock this movement.`);
                    return;
                  }
                  setSelectedMovement(m.id);
                  fetchMovementLeaderboard(m.id);
                  setShowLogModal(false);
                }}
              >
                <View style={styles.peakCircleWrapper}>
                  <MasteryRings
                    size={width * 0.15}
                    centerText={pb || '-'}
                    subText={`#${rank}`}
                    rankMode
                  />
                  <TouchableOpacity
                    style={[styles.peakAddIcon, { backgroundColor: '#FF7043' }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      if (isLocked) return;
                      setSelectedMovement(m.id);
                      setShowLogModal(true);
                      setTimeLeft(60);
                      setTimerFinished(false);
                      setIsTimerRunning(false);
                      setRepsInput('');
                    }}
                  >
                    <MaterialCommunityIcons name="timer-outline" size={10} color="#000" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.peakNameText, { color: theme.text.primary }]} numberOfLines={2}>
                  {m.name.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.leaderboardSection}>
          <View style={styles.lbSection}>
            <Text style={[styles.lbTitle, { color: '#FF7043' }]}>
              {leaderboardTab === 'overall' ? 'ENDURANCE GLOBAL ELITE' : `${leaderboardTab.toUpperCase()} ELITE`}
            </Text>
            <Text style={[styles.lbSub, { color: theme.text.tertiary }]}>THE HIGHEST TIER WARRIOR</Text>
          </View>
          {leaderboardData.map((item, i) => (
            <View key={item.user_id} style={[styles.lbRow, { backgroundColor: item.user_id === user?.id ? '#FF704320' : 'transparent' }]}>
              <View style={[styles.lbRank, { backgroundColor: i < 3 ? '#FF704330' : 'transparent' }]}>
                <Text style={{ color: i === 0 ? '#FF7043' : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
              </View>
              <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                {item.display_name.toUpperCase()}
              </Text>
              <View style={[styles.lbPointsFrame, { backgroundColor: '#FF7043' }]}>
                <Text style={[styles.lbPointsText, { color: '#000' }]}>{Math.round(item.value || 0)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient
      colors={[theme.background.primary, theme.background.secondary || '#000']}
      style={[styles.container]}
    >
      {renderHeader()}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {renderDashboard()}
      </ScrollView>

      {/* 1MM TIMER MODAL */}
      <Modal visible={showLogModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>
                {ONEMM_MOVEMENTS.find(m => m.id === selectedMovement)?.name.toUpperCase()}
              </Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.timerContainer}>
              <Text style={[
                styles.timerText, 
                { color: isPreTimerRunning ? theme.accent : (timeLeft <= 10 ? '#FF5252' : theme.text.primary) }
              ]}>
                {isPreTimerRunning ? preCountdown : timeLeft}s
              </Text>
              <Text style={[styles.timerSub, { color: theme.text.tertiary }]}>
                {isPreTimerRunning ? 'GET READY' : '60 SECOND SPRINT'}
              </Text>
            </View>

            {!isPreTimerRunning && !isTimerRunning && !timerFinished && (
              <TouchableOpacity style={[styles.startBtn, { backgroundColor: theme.accent }]} onPress={startTimer}>
                <Text style={styles.startBtnText}>START SPRINT</Text>
              </TouchableOpacity>
            )}

            {(isPreTimerRunning || isTimerRunning) && (
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: theme.text.tertiary }]} onPress={cancelTimer}>
                <Text style={[styles.cancelBtnText, { color: theme.text.tertiary }]}>CANCEL SPRINT</Text>
              </TouchableOpacity>
            )}

            {timerFinished && (
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: theme.text.secondary }]}>ENTER TOTAL REPS</Text>
                <TextInput
                  style={[styles.modalInput, { color: theme.text.primary, borderColor: theme.accent }]}
                  keyboardType="numeric"
                  value={repsInput}
                  onChangeText={setRepsInput}
                  autoFocus
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: theme.accent }]}
                  onPress={handleSaveResult}
                  disabled={saving}
                >
                  {saving ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>LOG PERFORMANCE</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: theme.text.tertiary, marginTop: 10 }]}
                  onPress={resetTimer}
                >
                  <Text style={[styles.cancelBtnText, { color: theme.text.tertiary }]}>RETRY SPRINT</Text>
                </TouchableOpacity>
              </View>
            )}

            {isTimerRunning && (
              <Text style={[styles.workText, { color: theme.accent }]}>GO! GO! GO!</Text>
            )}
          </View>
        </View>
      </Modal>

      {/* MOVEMENT LEADERBOARD MODAL */}
      <Modal visible={showMovementLeaderboard} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.accent }]}>
                {ONEMM_MOVEMENTS.find(m => m.id === selectedMovement)?.name.toUpperCase()} ELITE
              </Text>
              <TouchableOpacity onPress={() => setShowMovementLeaderboard(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 20 }}>
              {modalLeaderboardData.map((item, i) => (
                <View key={item.user_id} style={styles.lbRow}>
                  <View style={[styles.lbRank, { backgroundColor: i < 3 ? `${theme.accent}20` : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? theme.accent : theme.text.secondary, fontWeight: '900' }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">{item.display_name.toUpperCase()}</Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: theme.accent }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>{item.value} REPS</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: theme.accent, marginTop: 20 }]}
                onPress={() => {
                  setShowMovementLeaderboard(false);
                  setShowLogModal(true);
                }}
              >
                <Text style={styles.startBtnText}>CHALLENGE PB</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* OVERALL LEADERBOARD MODAL */}
      <Modal visible={showOverallModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleBox}>
                <MaterialCommunityIcons name="crown" size={24} color={theme.accent} />
                <Text style={[styles.modalTitle, { color: theme.text.primary, marginLeft: 8 }]}>
                  OVERALL MASTERY
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowOverallModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: theme.text.tertiary }]}>GLOBAL VOLUME RANKINGS</Text>

            <ScrollView style={{ marginTop: 20 }}>
              {modalLeaderboardData.map((item, i) => (
                <View key={item.user_id} style={[styles.lbRow, item.user_id === user?.id && { backgroundColor: `${theme.accent}15`, borderColor: theme.accent, borderWidth: 1 }]}>
                  <View style={[styles.lbRank, { backgroundColor: i < 3 ? `${theme.accent}20` : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? theme.accent : theme.text.secondary, fontWeight: '900' }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">{item.display_name.toUpperCase()}</Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: theme.accent }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>{item.value || 0} PTS</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backBtn: { padding: 4 },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10
  },
  headerTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 2, fontFamily: 'PlusJakartaSans-ExtraBold' },

  dashboard: { paddingHorizontal: 16, paddingTop: 20, gap: 24 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  ringsContainer: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
  masteryRing: { position: 'absolute' },
  ringsCenter: { alignItems: 'center', justifyContent: 'center', zIndex: 10, paddingBottom: 4 },
  ringsValue: { fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold', letterSpacing: -0.5 },
  heroTopText: { fontSize: 7, fontWeight: '900', letterSpacing: 0.5, marginBottom: 2 },
  heroBottomText: { fontSize: 7, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },

  modalTitleBox: { flexDirection: 'row', alignItems: 'center' },
  modalSub: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginTop: -20 },
lbSection: { marginTop: 10, alignItems: 'center', gap: 4, marginBottom: 20 },
  lbTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 3, fontFamily: 'PlusJakartaSans-ExtraBold' },
  lbSub: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, opacity: 0.6 },
  sectionHeader: { fontSize: 13, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginTop: 20, marginBottom: 10 },
  exerciseFilter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 20,
    width: '100%',
  },
  exerciseFilterTab: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FF704340',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseFilterText: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },

  peakGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 10, gap: 20 },
  peakItem: { alignItems: 'center', gap: 8, width: width * 0.22, marginBottom: 10 },
  peakCircleWrapper: { position: 'relative' },
  peakNameText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' },
  peakAddIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
    elevation: 4,
  },
  heroAddIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 8,
    zIndex: 20,
  },

  leaderboardSection: { marginTop: 20 },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginBottom: 8, gap: 12 },
  lbRank: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  lbName: { flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  lbPointsFrame: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 4 },
  lbPointsText: { fontSize: 13, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { width: '100%', maxWidth: 400, borderRadius: 24, padding: 24, borderWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  timerContainer: { alignItems: 'center', marginVertical: 40 },
  timerText: { fontSize: 80, fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold' },
  timerSub: { fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 10 },
  startBtn: { paddingVertical: 20, borderRadius: 12, alignItems: 'center' },
  startBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  inputContainer: { gap: 20 },
  inputLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  modalInput: { borderWidth: 2, borderRadius: 12, padding: 20, fontSize: 32, textAlign: 'center', fontWeight: '900' },
  saveBtn: { paddingVertical: 20, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 2 },
  workText: { fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 20 },
  cancelBtn: {
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 10,
  },
  cancelBtnText: {
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 1,
  }
});
