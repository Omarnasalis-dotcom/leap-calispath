import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard,
  Dimensions, RefreshControl, Animated, Vibration, AppState } from 'react-native';
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
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';

import { SoundServiceInstance as SoundService } from '../lib/SoundService';
import { getCountryFlag } from '../constants/countries';
import { LeapLogo } from '../components/LeapLogo';
import { Skeleton } from '../components/Skeleton';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { BottomTabBar } from '../components/profile/BottomTabBar';


const { width } = Dimensions.get('window');

const VALID_ONEMM_CATEGORIES = ['entry', 'main', 'advanced'];

export function OneMinMaxScreen({ category }: { category?: string }) {
  const { theme, toggleTheme, mode } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave } = useSafeAsync();
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ stat: '', movement: '' });

  const [stats, setStats] = useState<OneMMUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<'overall' | 'entry' | 'main' | 'advanced'>('overall');
  // Deep-linked from SuggestedTestCard with the exact category the
  // suggested movement lives in (e.g. "main" for Dips) — without this, a
  // suggestion outside the default "entry" tab would look like it doesn't
  // exist until the user manually switches tabs.
  const [selectedExerciseCategory, setSelectedExerciseCategory] = useState<'entry' | 'main' | 'advanced'>(
    VALID_ONEMM_CATEGORIES.includes(category || '') ? (category as 'entry' | 'main' | 'advanced') : 'entry'
  );
  const [leaderboardData, setLeaderboardData] = useState<OneMMRanking[]>([]);
  const [modalLeaderboardData, setModalLeaderboardData] = useState<OneMMRanking[]>([]);
  const [showMovementLeaderboard, setShowMovementLeaderboard] = useState(false);
  const [showOverallModal, setShowOverallModal] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  // Community scope — must trigger a server-side refetch (RPCs cap at 100
  // rows before any filter), unlike genderFilter which filters client-side
  // on the already-fetched, already-limited data.
  const [onemmScope, setOnemmScope] = useState<'public' | 'community'>(
    profile?.community_id ? 'community' : 'public'
  );
  useEffect(() => {
    setOnemmScope(profile?.community_id ? 'community' : 'public');
  }, [profile?.community_id]);

  const filteredModalLeaderboardData = React.useMemo(() => {
    let list = modalLeaderboardData;
    if (genderFilter !== 'ALL') {
      list = modalLeaderboardData.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [modalLeaderboardData, genderFilter]);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const s = await OneMMService.getUserStats(user.id);
      if (!isMounted.current) return;
      setStats(s);
      setLoading(false);
      setRefreshing(false);

      const rank = await OneMMService.getGloryRank(user.id, s.totalPoints);
      if (!isMounted.current) return;
      setStats(prev => prev ? { ...prev, ranks: { ...prev.ranks, glory: rank } } : prev);
    } catch (error) {
      console.error('Fetch 1MM error:', error);
      if (!isMounted.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isMounted]);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const scopeCommunityId = onemmScope === 'community' ? profile?.community_id : null;
      let data;
      if (leaderboardTab === 'overall') {
        data = await OneMMService.getLeaderboard('overall', undefined, scopeCommunityId);
      } else {
        data = await OneMMService.getCategoryLeaderboard(leaderboardTab, scopeCommunityId);
      }
      if (!isMounted.current) return;
      setLeaderboardData(data);
    } catch (error) {
      console.error('1MM Leaderboard error:', error);
    }
  }, [leaderboardTab, isMounted, onemmScope, profile?.community_id]);

  const fetchMovementLeaderboard = async (moveId: string) => {
    try {
      const data = await OneMMService.getLeaderboard(moveId);
      if (!isMounted.current) return;
      setModalLeaderboardData(data);
      setShowMovementLeaderboard(true);
    } catch (error) {
      if (!isMounted.current) return;
      console.error('Movement LB error:', error);
    }
  };

  const fetchOverallLeaderboard = async (scopeOverride?: 'public' | 'community') => {
    if (__DEV__) console.log('Fetching overall leaderboard...');
    setShowOverallModal(true); // Open modal immediately for better UX
    try {
      const scope = scopeOverride || onemmScope;
      const scopeCommunityId = scope === 'community' ? profile?.community_id : null;
      const data = await OneMMService.getLeaderboard('overall', undefined, scopeCommunityId);
      if (!isMounted.current) return;
      setModalLeaderboardData(data);
    } catch (error) {
      console.error('Overall LB error:', error);
      if (!isMounted.current) return;
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

  const handleSaveResult = async (reps: number) => {
    if (!user || !selectedMovement) return;
    let shouldCelebrate = false;

    runSafeSave(async () => {
      const { isNewPB } = await OneMMService.saveLog(user.id, selectedMovement, reps);

      if (isNewPB) {
        if (isMounted.current) {
          setCelebrationData({
            stat: `${reps} REPS`,
            movement: ONEMM_MOVEMENTS.find(m => m.id === selectedMovement)?.name || 'Movement'
          });
          shouldCelebrate = true;
        }
      }

      if (!isNewPB) {
        Alert.alert('Success', '1MM Result Logged!');
      }
    }, {
      onSuccess: () => {
        setShowLogModal(false);
        fetchData();
        fetchLeaderboard();
        if (refreshProfile) refreshProfile();

        // Defer celebration after log modal fully dismisses (iOS overlapping modal bug)
        if (shouldCelebrate && isMounted.current) {
          setTimeout(() => {
            if (isMounted.current) {
              setShowCelebration(true);
            }
          }, 400);
        }
      },
      onError: (error: any) => {
        const isExpectedRejection = ['P1001', 'P1002', 'P1003', 'P1004'].includes(error.code);
        if (!isExpectedRejection) {
          console.error('Error saving 1MM result:', error);
        }
        Alert.alert('Error', error.message || 'Failed to save result.');
      }
    });
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
      <View style={{ width: 40 }} />

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

  const renderSkeleton = () => {
    return (
      <View style={styles.dashboard}>
        <View style={{ alignItems: 'center', marginBottom: 15, marginTop: 10 }}>
          <Skeleton width={100} height={12} borderRadius={4} />
        </View>

        <View style={[styles.heroRow, { justifyContent: 'space-around', alignItems: 'center', marginBottom: 20 }]}>
          <Skeleton width={80} height={80} borderRadius={40} />
          <Skeleton width={100} height={100} borderRadius={50} />
          <Skeleton width={80} height={80} borderRadius={40} />
        </View>

        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Skeleton width={150} height={16} borderRadius={4} />
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 20, gap: 10 }}>
          <Skeleton width={90} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
          <Skeleton width={90} height={32} borderRadius={16} />
        </View>

        <View style={[styles.peakGrid, { paddingHorizontal: 16 }]}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <View key={idx} style={[styles.peakItem, { alignItems: 'center', marginVertical: 10 }]}>
              <Skeleton width={60} height={60} borderRadius={30} style={{ marginBottom: 8 }} />
              <Skeleton width={75} height={12} borderRadius={4} />
            </View>
          ))}
        </View>

        <View style={{
          marginTop: 20,
          padding: 24,
          borderRadius: 24,
          backgroundColor: 'rgba(255, 112, 67, 0.05)',
          borderWidth: 1,
          borderColor: 'rgba(255, 112, 67, 0.1)',
          marginHorizontal: 16,
          gap: 12
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={28} height={28} borderRadius={14} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="80%" height={16} borderRadius={4} />
              <Skeleton width="50%" height={12} borderRadius={4} />
            </View>
          </View>
          <Skeleton width="100%" height={8} borderRadius={4} />
        </View>
      </View>
    );
  };

  const renderDashboard = () => {
    if (!stats) return null;

    const getPeakPerformance = () => {
      const peaks: Record<string, number> = {};
      ONEMM_MOVEMENTS.forEach(m => {
        const reps = stats.pbs[m.id] || 0;
        const points = calculateOneMMPoints(reps, m.categoryId);
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
              if (__DEV__) console.log('1MM Score button pressed');
              fetchOverallLeaderboard();
            }}
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <MasteryRings
                size={100}
                topText="1MM SCORE"
                centerText={Number(peakData.total || 0).toFixed(2)}
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
        {/* Category Filter for Exercises */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.exerciseFilterScroll}
          contentContainerStyle={styles.exerciseFilterContent}
        >
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
                  isActive && { backgroundColor: '#FF7043', borderColor: '#FF7043' },
                  isLocked && { opacity: 0.3 }
                ]}
              >
                <Text 
                  style={[styles.exerciseFilterText, { color: isActive ? '#000' : theme.text.tertiary }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {cat === 'overall' ? 'ENDURANCE' : cat.toUpperCase()}
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
        </ScrollView>

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
        {leaderboardTab !== 'overall' && (
          <View style={styles.leaderboardSection}>
            <View style={styles.lbSection}>
            <Text style={[styles.lbTitle, { color: '#FF7043' }]}>
              {`${leaderboardTab.toUpperCase()} ELITE`}
            </Text>
            <Text style={[styles.lbSub, { color: theme.text.tertiary }]}>THE HIGHEST TIER WARRIOR</Text>
          </View>
          {!!profile?.community_id && (
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 12, gap: 12 }}>
              {(['public', 'community'] as const).map((scope) => (
                <TouchableOpacity
                  key={scope}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 20,
                    backgroundColor: onemmScope === scope ? theme.accent : 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    borderColor: onemmScope === scope ? theme.accent : 'rgba(255,255,255,0.1)'
                  }}
                  onPress={() => setOnemmScope(scope)}
                >
                  <Text style={{
                    fontSize: 12,
                    fontWeight: '900',
                    color: onemmScope === scope ? '#FFF' : theme.text.secondary
                  }}>
                    {scope === 'public' ? 'PUBLIC' : 'MY COMMUNITY'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {leaderboardData.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={{ color: theme.text.tertiary, fontSize: 12, letterSpacing: 1 }}>
                NO SCORES YET — COMPLETE A ONE-MINUTE MAX TO APPEAR
              </Text>
            </View>
          )}
          {leaderboardData.map((item, i) => (
            <View key={item.user_id} style={[styles.lbRow, { backgroundColor: item.user_id === user?.id ? '#FF704320' : 'transparent' }]}>
              <View style={[styles.lbRank, { backgroundColor: i < 3 ? '#FF704330' : 'transparent' }]}>
                <Text style={{ color: i === 0 ? '#FF7043' : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
              </View>
              <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                {item.display_name.toUpperCase()}
              </Text>
              <View style={[styles.lbPointsFrame, { backgroundColor: '#FF7043' }]}>
                <Text style={[styles.lbPointsText, { color: '#000' }]}>{Number(item.value || 0).toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>
        )}

        {/* ENDURANCE MILESTONE TRACKER */}
        {leaderboardTab === 'overall' && (
          <View style={{
            marginTop: 20,
            padding: 24,
            borderRadius: 24,
            backgroundColor: 'rgba(255, 112, 67, 0.05)',
            borderWidth: 1,
            borderColor: 'rgba(255, 112, 67, 0.2)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <MaterialCommunityIcons name={userRank === 1 ? "crown" : "sword-cross"} size={28} color="#FF7043" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ color: mode === 'dark' ? '#FFF' : '#FF7043', fontSize: 18, fontWeight: '800' }}>
                  {userRank === 1 
                    ? 'ENDURANCE KING ACHIEVED'
                    : userRank > 0 ? `${gapToNext} Points to steal Rank #${userRank - 1}` : 'LOG A RESULT TO RANK UP'}
                </Text>
                <Text style={{ color: theme.text.secondary, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
                  {userRank === 1 ? 'YOU ARE AT THE PEAK' : 'YOUR NEXT TARGET'}
                </Text>
              </View>
            </View>
            <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
              <View style={{ 
                height: '100%', 
                backgroundColor: '#FF7043', 
                width: userRank <= 1 ? '100%' : `${Math.min(100, Math.max(0, (peakData.total / (peakData.total + gapToNext)) * 100))}%`
              }} />
            </View>
            {userRank > 1 && (
              <Text style={{ color: '#FF7043', fontSize: 12, marginTop: 8, textAlign: 'right', fontWeight: '800', letterSpacing: 1 }}>
                +{gapToNext} PTS TO DETHRONE
              </Text>
            )}
          </View>
        )}

        {/* Ambient Quote */}
        {leaderboardTab === 'overall' && (
          <View style={{ alignItems: 'center', marginTop: 20, marginBottom: 40 }}>
            <Text style={{ 
              color: theme.text.tertiary, 
              fontSize: 10, 
              fontFamily: 'PlusJakartaSans-SemiBold',
              letterSpacing: 3,
              textTransform: 'uppercase'
            }}>
              LEAP PAST YOUR LIMITS. ENDURE.
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <GlobalErrorBoundary>
      <LinearGradient
        colors={[theme.background.primary, theme.background.secondary || '#000']}
        style={[styles.container]}
      >
      {renderHeader()}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {loading || !stats ? renderSkeleton() : renderDashboard()}
      </ScrollView>

      <BottomTabBar activeTab="1mm" strengthTier={profile?.strength_tier || 0} />

      {/* 1MM TIMER MODAL */}
      {showLogModal && (
        <OneMinMaxTimerModal
          visible={showLogModal}
          onClose={() => setShowLogModal(false)}
          movementName={ONEMM_MOVEMENTS.find(m => m.id === selectedMovement)?.name || ''}
          user={user}
          theme={theme}
          onSaveResult={handleSaveResult}
        />
      )}

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

            {!!profile?.community_id && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 16, gap: 12 }}>
                {(['public', 'community'] as const).map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: onemmScope === scope ? theme.accent : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: onemmScope === scope ? theme.accent : 'rgba(255,255,255,0.1)'
                    }}
                    onPress={() => { setOnemmScope(scope); fetchOverallLeaderboard(scope); }}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '900',
                      color: onemmScope === scope ? '#FFF' : theme.text.secondary
                    }}>
                      {scope === 'public' ? 'PUBLIC' : 'MY COMMUNITY'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 16, marginTop: 16, gap: 12 }}>
              {['ALL', 'MALE', 'FEMALE'].map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 20,
                    backgroundColor: genderFilter === filter ? theme.accent : 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    borderColor: genderFilter === filter ? theme.accent : 'rgba(255,255,255,0.1)'
                  }}
                  onPress={() => setGenderFilter(filter as any)}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    fontWeight: '900', 
                    color: genderFilter === filter ? '#FFF' : theme.text.secondary 
                  }}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ marginTop: 20 }}>
              {filteredModalLeaderboardData.map((item, i) => (
                <View key={item.user_id} style={[styles.lbRow, item.user_id === user?.id && { backgroundColor: `${theme.accent}15`, borderColor: theme.accent, borderWidth: 1 }]}>
                  <View style={[styles.lbRank, { backgroundColor: i < 3 ? `${theme.accent}20` : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? theme.accent : theme.text.secondary, fontWeight: '900' }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                    <Text style={{ fontSize: 16 }}>{getCountryFlag(item.country)} </Text>
                    {item.display_name.toUpperCase()}
                  </Text>
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

      <CelebrationBanner
        visible={showCelebration}
        title={celebrationData.movement?.toUpperCase()}
        subtitle="NEW PR"
        stat={celebrationData.stat}
        emoji="🔥"
        userName={profile?.display_name || user?.email?.split('@')[0] || 'Warrior'}
        onDismiss={() => setShowCelebration(false)}
        headerText="ENDURANCE WORLD"
        showLeapLogo={true}
        accentColor="#FF7043"
      />
    </GlobalErrorBoundary>
  );
}

interface OneMinMaxTimerModalProps {
  visible: boolean;
  onClose: () => void;
  movementName: string;
  user: any;
  theme: any;
  onSaveResult: (reps: number) => Promise<void>;
}

const OneMinMaxTimerModal: React.FC<OneMinMaxTimerModalProps> = ({
  visible,
  onClose,
  movementName,
  user,
  theme,
  onSaveResult
}) => {
  const isMounted = useMountedRef();
  const [timeLeft, setTimeLeft] = useState(60);
  const [preCountdown, setPreCountdown] = useState(0);
  const [isPreTimerRunning, setIsPreTimerRunning] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerFinished, setTimerFinished] = useState(false);
  const [repsInput, setRepsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const preStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    const checkTimerStatus = () => {
      if (isPreTimerRunning && preStartTimeRef.current !== null) {
        const elapsed = Math.floor((Date.now() - preStartTimeRef.current) / 1000);
        const remaining = 5 - elapsed;
        if (remaining <= 0) {
          const activeElapsed = elapsed - 5;
          setIsPreTimerRunning(false);
          SoundService.playBoxingBell();
          if (activeElapsed >= 60) {
            setTimeLeft(0);
            setIsTimerRunning(false);
            setTimerFinished(true);
            Vibration.vibrate([0, 500, 200, 500]);
            SoundService.playDigitalBuzzer(2);
            if (timerRef.current) clearInterval(timerRef.current);
          } else {
            startTimeRef.current = preStartTimeRef.current + 5000;
            setTimeLeft(60 - activeElapsed);
            setIsTimerRunning(true);
          }
        } else {
          setPreCountdown(prev => {
            if (prev !== remaining) {
              SoundService.playTick();
            }
            return remaining;
          });
        }
      } else if (isTimerRunning && startTimeRef.current !== null) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        const remaining = 60 - elapsed;
        if (remaining <= 0) {
          setTimeLeft(0);
          setIsTimerRunning(false);
          setTimerFinished(true);
          Vibration.vibrate([0, 500, 200, 500]);
          SoundService.playDigitalBuzzer(2);
          if (timerRef.current) clearInterval(timerRef.current);
        } else {
          setTimeLeft(remaining);
        }
      }
    };

    if (isPreTimerRunning || isTimerRunning) {
      checkTimerStatus();
      timerRef.current = setInterval(checkTimerStatus, 250);

      const sub = AppState.addEventListener('change', (nextState) => {
        if (nextState === 'active') {
          checkTimerStatus();
        }
      });

      return () => {
        sub.remove();
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [isPreTimerRunning, isTimerRunning]);

  const startTimer = () => {
    setPreCountdown(5);
    setIsPreTimerRunning(true);
    setIsTimerRunning(false);
    setTimerFinished(false);
    setTimeLeft(60);
    preStartTimeRef.current = Date.now();
    startTimeRef.current = null;
  };

  const cancelTimer = () => {
    if (isPreTimerRunning || isTimerRunning || timerFinished) {
      if (Platform.OS === 'web') {
        if (window.confirm('Are you sure you want to abandon this 1MM sprint? Progress will be lost.')) {
          executeCancel();
        }
      } else {
        Alert.alert(
          'ABANDON SPRINT',
          'Are you sure you want to abandon this 1MM sprint? Progress will be lost.',
          [
            { text: 'KEEP FIGHTING', style: 'cancel', onPress: () => {} },
            { text: 'ABANDON', style: 'destructive', onPress: executeCancel },
          ]
        );
      }
    } else {
      executeCancel();
    }
  };

  const executeCancel = () => {
    setIsPreTimerRunning(false);
    setIsTimerRunning(false);
    setPreCountdown(0);
    setTimeLeft(60);
    preStartTimeRef.current = null;
    startTimeRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    onClose();
  };

  const resetTimer = () => {
    setTimerFinished(false);
    setIsTimerRunning(false);
    setIsPreTimerRunning(false);
    setTimeLeft(60);
    setRepsInput('');
    preStartTimeRef.current = null;
    startTimeRef.current = null;
  };

  const handleSave = async () => {
    if (!repsInput) return;
    const reps = parseInt(repsInput, 10);
    if (isNaN(reps) || reps <= 0 || reps > 150) {
      Alert.alert('Invalid', 'Please enter a valid number of reps (1-150).');
      return;
    }
    setSaving(true);
    try {
      await onSaveResult(reps);
    } finally {
      if (isMounted.current) {
        setSaving(false);
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancelTimer}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, borderColor: theme.card.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>
                {movementName.toUpperCase()}
              </Text>
              <TouchableOpacity onPress={cancelTimer}>
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
                  onPress={handleSave}
                  disabled={saving}
                >
                  {saving ? <LeapLogo size={40} animated /> : <Text style={styles.saveBtnText}>LOG PERFORMANCE</Text>}
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
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

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
  exerciseFilterScroll: {
    marginVertical: 12,
    marginHorizontal: -16,
  },
  exerciseFilterContent: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    gap: 8,
  },
  exerciseFilterTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FF704340',
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  exerciseFilterText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    flexShrink: 0,
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
