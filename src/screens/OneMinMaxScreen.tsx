import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal, KeyboardAvoidingView, TouchableWithoutFeedback, Keyboard,
  Dimensions, RefreshControl, Animated, Vibration, AppState } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { TutorialModalOverlay } from '../components/tutorial/TutorialOverlay';
import { PBOverwriteConfirmModal } from '../components/PBOverwriteConfirmModal';
import { WORLD_THEMES } from '../../constants/worldThemes';
import { WorldBackground } from '../components/worlds/WorldBackground';
import { WorldHeaderPill } from '../components/worlds/WorldHeaderPill';
import { StatCircle } from '../components/worlds/StatCircle';
import { ScoreRingHero } from '../components/worlds/ScoreRingHero';
import { ExerciseCircle } from '../components/worlds/ExerciseCircle';
import { PillTabRow } from '../components/worlds/PillTabRow';
import { MilestoneCard } from '../components/worlds/MilestoneCard';
import { oneMMProgress, oneMMTarget, rankGapProgress } from '../lib/worldProgress';

const { width } = Dimensions.get('window');

const W = WORLD_THEMES.onemm;

const HERO_CENTER_SIZE = 150;
const HERO_SIDE_SIZE = Math.min(96, Math.floor((width - 40 - 20 - HERO_CENTER_SIZE) / 2));
// 3-column grid (handoff: 6 movements in 3×2), 88px circles, 8px column gap.
const GRID_COLUMN_WIDTH = Math.floor((width - 40 - 16) / 3);
const GRID_CIRCLE_SIZE = Math.min(88, GRID_COLUMN_WIDTH - 4);

const VALID_ONEMM_CATEGORIES = ['entry', 'main', 'advanced'];

export function OneMinMaxScreen({ category }: { category?: string }) {
  const { theme, toggleTheme, mode } = useTheme();
  const { user, profile, refreshProfile } = useAuth();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave, isExecuting: saving } = useSafeAsync();
  const { ref: scoreCircleRef, onLayout: onScoreCircleLayout } = useTutorialTarget('onemm.scoreCircle');
  const { ref: movementGridRef, onLayout: onMovementGridLayout } = useTutorialTarget('onemm.movementGrid');
  // useScreenMeasure=true: this badge sits in the movement grid, outside the
  // screen's ScrollView — see useTutorialTarget's own comment for why that
  // needs the pageX/pageY measurement path on Android.
  const { ref: timerBadgeRef, onLayout: onTimerBadgeLayout, reportInteraction: reportTimerBadge } = useTutorialTarget('onemm.timerBadge', undefined, true);
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
  // on the already-fetched, already-limited data. Derived fresh each render
  // from profile.community_id rather than mirrored into its own useState
  // via a syncing useEffect — that version fetched once at mount with the
  // stale 'public' default (profile hadn't loaded yet) and again once the
  // sync effect corrected it, and whichever in-flight request resolved
  // last won, regardless of which was actually current. A derived value is
  // correct on the very first render that has real profile data, so the
  // fetch effect below only fires once for that transition.
  const [manualOnemmScope, setManualOnemmScope] = useState<'public' | 'community' | null>(null);
  const onemmScope: 'public' | 'community' = manualOnemmScope ?? (profile?.community_id ? 'community' : 'public');
  const setOnemmScope = setManualOnemmScope;

  const filteredModalLeaderboardData = React.useMemo(() => {
    let list = modalLeaderboardData;
    if (genderFilter !== 'ALL') {
      list = modalLeaderboardData.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [modalLeaderboardData, genderFilter]);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<number | null>(null);

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

  const handleSaveResult = async (reps: number, force: boolean = false) => {
    if (!user || !selectedMovement) return;

    // Below the current best — ask before silently discarding it (or, if
    // force is true, this IS the user's confirmed choice to overwrite).
    // Strictly less-than (not <=): submit_onemm_log treats a tied rep count
    // as a genuine PB (p_reps >= v_current_max), so a tie should proceed
    // normally rather than prompting.
    const currentBest = stats?.pbs[selectedMovement] ?? 0;
    if (!force && currentBest > 0 && reps < currentBest) {
      // Same fix as Static/Power: dismiss explicitly rather than relying on
      // this modal's tap-outside-to-dismiss, since the overlay's own buttons
      // sit inside that same tappable area and shouldn't require a second
      // tap elsewhere first just to reveal the keyboard-covered controls.
      Keyboard.dismiss();
      setPendingOverwrite(reps);
      return;
    }

    let shouldCelebrate = false;

    runSafeSave(async () => {
      const { isNewPB } = await OneMMService.saveLog(user.id, selectedMovement, reps, force);

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
        setPendingOverwrite(null);
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
        setPendingOverwrite(null);
        const isExpectedRejection = ['P1001', 'P1002', 'P1003', 'P1004'].includes(error.code);
        if (!isExpectedRejection) {
          console.error('Error saving 1MM result:', error);
        }
        Alert.alert('Error', error.message || 'Failed to save result.');
      }
    });
  };

  const renderHeader = () => (
    <WorldHeaderPill
      world={W}
      title="ENDURANCE WORLD"
      icon="timer-outline"
      onPress={() => setLeaderboardTab('overall')}
      style={styles.headerPill}
    />
  );

  const renderSkeleton = () => {
    return (
      <View style={styles.dashboard}>
        <View style={{ alignItems: 'center', marginBottom: 15, marginTop: 10 }}>
          <Skeleton width={100} height={12} borderRadius={4} />
        </View>

        <View style={[styles.heroRow, { marginBottom: 20 }]}>
          <Skeleton width={HERO_SIDE_SIZE} height={HERO_SIDE_SIZE} borderRadius={HERO_SIDE_SIZE / 2} />
          <Skeleton width={HERO_CENTER_SIZE} height={HERO_CENTER_SIZE} borderRadius={HERO_CENTER_SIZE / 2} />
          <Skeleton width={HERO_SIDE_SIZE} height={HERO_SIDE_SIZE} borderRadius={HERO_SIDE_SIZE / 2} />
        </View>

        <View style={{ marginBottom: 16 }}>
          <Skeleton width={150} height={16} borderRadius={4} />
        </View>

        <View style={{ flexDirection: 'row', marginBottom: 20, gap: 10 }}>
          <Skeleton width={90} height={40} borderRadius={20} />
          <Skeleton width={70} height={40} borderRadius={20} />
          <Skeleton width={70} height={40} borderRadius={20} />
          <Skeleton width={90} height={40} borderRadius={20} />
        </View>

        <View style={styles.peakGrid}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <View key={idx} style={[styles.gridItem, { alignItems: 'center', gap: 8 }]}>
              <Skeleton width={GRID_CIRCLE_SIZE} height={GRID_CIRCLE_SIZE} borderRadius={GRID_CIRCLE_SIZE / 2} />
              <Skeleton width={70} height={12} borderRadius={4} />
            </View>
          ))}
        </View>

        <View style={{
          marginTop: 20,
          padding: 24,
          borderRadius: 24,
          backgroundColor: W.cardFill,
          borderWidth: 1,
          borderColor: W.cardBorder,
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
        <View style={styles.heroRow}>
          <StatCircle
            size={HERO_SIDE_SIZE}
            label="1MM RANK"
            value={`#${userRank || 0}`}
            caption="OF WORLD"
            unranked={!userRank || peakData.total <= 0}
          />

          <ScoreRingHero
            ref={scoreCircleRef}
            onLayout={onScoreCircleLayout}
            world={W}
            size={HERO_CENTER_SIZE}
            progress={rankGapProgress(peakData.total, gapToNext, userRank)}
            label="1MM SCORE"
            value={Number(peakData.total || 0).toFixed(2)}
            caption="TOTAL PTS"
            showCrown={userRank === 1}
            onPress={() => fetchOverallLeaderboard()}
            badgeIcon="chart-bar"
            onBadgePress={() => fetchOverallLeaderboard()}
          />

          <StatCircle
            size={HERO_SIDE_SIZE}
            label="GAP TO"
            value={userRank === 1 ? 'KING' : `+${gapToNext}`}
            caption="RANK UP"
            unranked={userRank === 0}
          />
        </View>

        <Text style={styles.sectionHeader}>YOUR PEAK ENDURANCE</Text>

        <PillTabRow
          world={W}
          style={styles.tabRow}
          activeKey={leaderboardTab}
          onSelect={(key) => {
            const isLocked = (profile?.strength_tier ?? 0) < 5 && (key === 'main' || key === 'advanced');
            if (isLocked) {
              Alert.alert('Locked', 'Reach Tier 5 to unlock Main and Advanced categories.');
              return;
            }
            if (key !== 'overall') {
              setSelectedExerciseCategory(key as any);
            }
            setLeaderboardTab(key as any);
          }}
          items={[
            { key: 'overall', label: 'ENDURANCE', emoji: '👑' },
            { key: 'entry', label: ONEMM_CATEGORIES.entry.name },
            { key: 'main', label: ONEMM_CATEGORIES.main.name, locked: (profile?.strength_tier ?? 0) < 5 },
            { key: 'advanced', label: ONEMM_CATEGORIES.advanced.name, locked: (profile?.strength_tier ?? 0) < 5 },
          ]}
        />

        {/* 3-column grid; the whole circle logs — one number per circle,
            never the old stacked "-" over "#--" placeholders. Long-press
            opens the movement's leaderboard. */}
        <View style={styles.peakGrid} ref={movementGridRef} onLayout={onMovementGridLayout}>
          {ONEMM_MOVEMENTS.filter(m => m.categoryId === selectedExerciseCategory).map((m, index) => {
            const pb = stats.pbs[m.id] || 0;
            const isLocked = m.minTier > (profile?.strength_tier ?? 0);
            const isFirst = index === 0;

            return (
              <ExerciseCircle
                key={m.id}
                ref={isFirst ? timerBadgeRef : undefined}
                onLayout={isFirst ? onTimerBadgeLayout : undefined}
                world={W}
                size={GRID_CIRCLE_SIZE}
                progress={oneMMProgress(m.id, pb)}
                icon={m.patternId}
                name={m.name.toUpperCase()}
                value={pb > 0 ? String(pb) : undefined}
                caption={pb > 0 ? `${pb} LOGGED` : 'TAP TO LOG'}
                hasLogged={pb > 0}
                badge="stopwatch"
                locked={isLocked}
                style={styles.gridItem}
                onPress={() => {
                  if (isLocked) {
                    Alert.alert('Locked', `Reach Tier ${m.minTier} to unlock this movement.`);
                    return;
                  }
                  setSelectedMovement(m.id);
                  setShowLogModal(true);
                  if (isFirst) reportTimerBadge();
                }}
                onLongPress={() => {
                  if (isLocked) return;
                  setSelectedMovement(m.id);
                  fetchMovementLeaderboard(m.id);
                }}
              />
            );
          })}
        </View>
        {leaderboardTab !== 'overall' && (
          <View style={styles.leaderboardSection}>
            <View style={styles.lbSection}>
            <Text style={[styles.lbTitle, { color: W.accent }]}>
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
                    backgroundColor: onemmScope === scope ? W.accent : 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    borderColor: onemmScope === scope ? W.accent : 'rgba(255,255,255,0.1)'
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
            <View key={item.user_id} style={[styles.lbRow, { backgroundColor: item.user_id === user?.id ? `20` : 'transparent' }]}>
              <View style={[styles.lbRank, { backgroundColor: i < 3 ? `30` : 'transparent' }]}>
                <Text style={{ color: i === 0 ? W.accent : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
              </View>
              <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                {item.display_name.toUpperCase()}
              </Text>
              <View style={[styles.lbPointsFrame, { backgroundColor: W.accent }]}>
                <Text style={[styles.lbPointsText, { color: '#000' }]}>{Number(item.value || 0).toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>
        )}

        {/* ENDURANCE MILESTONE TRACKER */}
        {leaderboardTab === 'overall' && (
          <MilestoneCard
            world={W}
            style={{ marginTop: 20 }}
            icon={userRank === 1 ? 'crown' : 'sword-cross'}
            headline={
              userRank === 1
                ? 'ENDURANCE KING ACHIEVED'
                : userRank > 0
                  ? `${gapToNext} Points to steal Rank #${userRank - 1}`
                  : 'Log a result to rank up'
            }
            caption={
              userRank === 1
                ? 'YOU ARE AT THE PEAK'
                : userRank > 0
                  ? 'YOUR NEXT TARGET'
                  : `YOUR NEXT TARGET: ${oneMMTarget('knee_push_ups')} KNEE PUSH-UPS`
            }
            // Honest fill: unranked renders an empty track, 100% only at
            // genuine rank 1 (was hard-coded full for rank 0).
            progress={rankGapProgress(peakData.total, gapToNext, userRank)}
            footerRight={
              userRank > 1
                ? `+${gapToNext} PTS TO DETHRONE`
                : `${Number(peakData.total || 0).toFixed(2)} PTS`
            }
          />
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
      <WorldBackground world={W}>
      <View style={styles.container}>
      {renderHeader()}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={W.accent} />}
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
          overwriteOverlay={
            <PBOverwriteConfirmModal
              visible={pendingOverwrite !== null}
              theme={theme}
              accentColor={W.accent}
              movementName={ONEMM_MOVEMENTS.find(m => m.id === selectedMovement)?.name || ''}
              unitLabel=" REPS"
              currentBest={selectedMovement ? (stats?.pbs[selectedMovement] ?? 0) : 0}
              attemptValue={pendingOverwrite ?? 0}
              saving={saving}
              onKeepBest={() => setPendingOverwrite(null)}
              onSaveAnyway={() => {
                const reps = pendingOverwrite;
                if (reps !== null) handleSaveResult(reps, true);
              }}
            />
          }
        />
      )}

      {/* MOVEMENT LEADERBOARD MODAL */}
      <Modal visible={showMovementLeaderboard} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary, maxHeight: '80%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: W.accent }]}>
                {ONEMM_MOVEMENTS.find(m => m.id === selectedMovement)?.name.toUpperCase()} ELITE
              </Text>
              <TouchableOpacity onPress={() => setShowMovementLeaderboard(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 20 }}>
              {modalLeaderboardData.map((item, i) => (
                <View key={item.user_id} style={styles.lbRow}>
                  <View style={[styles.lbRank, { backgroundColor: i < 3 ? `${W.accent}20` : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? W.accent : theme.text.secondary, fontWeight: '900' }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">{item.display_name.toUpperCase()}</Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: W.accent }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>{item.value} REPS</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: W.accent, marginTop: 20 }]}
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
                <MaterialCommunityIcons name="crown" size={24} color={W.accent} />
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
                      backgroundColor: onemmScope === scope ? W.accent : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: onemmScope === scope ? W.accent : 'rgba(255,255,255,0.1)'
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
                    backgroundColor: genderFilter === filter ? W.accent : 'rgba(255,255,255,0.05)',
                    borderWidth: 1,
                    borderColor: genderFilter === filter ? W.accent : 'rgba(255,255,255,0.1)'
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
                <View key={item.user_id} style={[styles.lbRow, item.user_id === user?.id && { backgroundColor: `${W.accent}15`, borderColor: W.accent, borderWidth: 1 }]}>
                  <View style={[styles.lbRank, { backgroundColor: i < 3 ? `${W.accent}20` : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? W.accent : theme.text.secondary, fontWeight: '900' }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1} ellipsizeMode="tail">
                    <Text style={{ fontSize: 16 }}>{getCountryFlag(item.country)} </Text>
                    {item.display_name.toUpperCase()}
                  </Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: W.accent }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>{item.value || 0} PTS</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
      </View>
      </WorldBackground>

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
        accentColor={W.accent}
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
  // Rendered inside this modal's own content — NOT a second <Modal>, since two
  // simultaneously-open native Modals on iOS can freeze the app (see
  // PBOverwriteConfirmModal's own comment).
  overwriteOverlay?: React.ReactNode;
}

const OneMinMaxTimerModal: React.FC<OneMinMaxTimerModalProps> = ({
  visible,
  onClose,
  movementName,
  user,
  theme,
  onSaveResult,
  overwriteOverlay
}) => {
  const isMounted = useMountedRef();
  const { ref: startSprintRef, onLayout: onStartSprintLayout } = useTutorialTarget('onemm.startSprintButton');
  const { ref: timerCloseRef, onLayout: onTimerCloseLayout, reportInteraction: reportTimerClose } = useTutorialTarget('onemm.timerCloseButton');
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
              <TouchableOpacity
                ref={timerCloseRef}
                onLayout={onTimerCloseLayout}
                onPress={() => {
                  cancelTimer();
                  reportTimerClose();
                }}
              >
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <View style={styles.timerContainer}>
              <Text style={[
                styles.timerText, 
                { color: isPreTimerRunning ? W.accent : (timeLeft <= 10 ? '#FF5252' : theme.text.primary) }
              ]}>
                {isPreTimerRunning ? preCountdown : timeLeft}s
              </Text>
              <Text style={[styles.timerSub, { color: theme.text.tertiary }]}>
                {isPreTimerRunning ? 'GET READY' : '60 SECOND SPRINT'}
              </Text>
            </View>

            {!isPreTimerRunning && !isTimerRunning && !timerFinished && (
              <TouchableOpacity
                ref={startSprintRef}
                onLayout={onStartSprintLayout}
                style={[styles.startBtn, { backgroundColor: W.accent }]}
                onPress={startTimer}
              >
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
                  style={[styles.modalInput, { color: theme.text.primary, borderColor: W.accent }]}
                  keyboardType="numeric"
                  value={repsInput}
                  onChangeText={setRepsInput}
                  autoFocus
                  placeholder="0"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: W.accent }]}
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
              <Text style={[styles.workText, { color: W.accent }]}>GO! GO! GO!</Text>
            )}
          </View>
          {/* Sibling of modalContent, not a child, and rendered AFTER it so
              it paints on top — modalContent holds the real START SPRINT
              button; if this overlay renders behind it, taps reach the real
              button first and actually start the sprint instead of being
              caught by the decoy layer. modalOverlay (this component's
              parent here) is also the actual full-screen, zero-offset root,
              which measureInWindow's screen-absolute coordinates need. */}
          <TutorialModalOverlay targetIds={['onemm.startSprintButton', 'onemm.timerCloseButton']} />
          {overwriteOverlay}
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 40 },
  headerPill: { marginTop: 10 },

  dashboard: { paddingHorizontal: 20, paddingTop: 26, gap: 24 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 10 },

  modalTitleBox: { flexDirection: 'row', alignItems: 'center' },
  modalSub: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginTop: -20 },
  lbSection: { marginTop: 10, alignItems: 'center', gap: 4, marginBottom: 20 },
  lbTitle: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 20, letterSpacing: 3 },
  lbSub: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 9, letterSpacing: 1.5, opacity: 0.6 },
  sectionHeader: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    letterSpacing: 1.5,
    textAlign: 'center',
    color: '#FFFFFF',
    marginTop: 10,
    marginBottom: -4,
  },
  // PillTabRow carries its own 20px side padding — cancel the dashboard's so
  // the fade hint sits flush with the screen edge.
  tabRow: { marginHorizontal: -20 },

  // Handoff: 3-column × 2-row grid, 22px row gap, 8px column gap.
  peakGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 22, columnGap: 8 },
  gridItem: { width: GRID_COLUMN_WIDTH },

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
