import { useRouter, useLocalSearchParams , router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal,
  Dimensions, RefreshControl, Image, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { 
  POWER_MOVEMENTS, 
  POWER_LEVELS, 
  calculateTotalPowerScore, 
  getPowerLevel,
  calculatePowerPoints
} from '../lib/powerLogic';
import { PowerService, PowerUserStats } from '../services/PowerService';
import { useSafeAsync } from '../hooks/useSafeAsync';
import { useMountedRef } from '../hooks/useMountedRef';
import { CelebrationBanner } from '../components/CelebrationBanner';
import { WarriorCard } from '../components/atoms/WarriorCard';
import { getCountryFlag } from '../constants/countries';
import { LeapLogo } from '../components/LeapLogo';
import { Skeleton } from '../components/Skeleton';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { useTutorialTarget } from '../hooks/useTutorialTarget';
import { PBOverwriteConfirmModal } from '../components/PBOverwriteConfirmModal';
import { NotificationService } from '../services/NotificationService';
import { getWorldTheme, getWorldNeutrals } from '../../constants/worldThemes';
import { WorldBackground } from '../components/worlds/WorldBackground';
import { WorldHeaderPill } from '../components/worlds/WorldHeaderPill';
import { StatCircle } from '../components/worlds/StatCircle';
import { ScoreRingHero } from '../components/worlds/ScoreRingHero';
import { ExerciseCircle } from '../components/worlds/ExerciseCircle';
import { PillTabRow } from '../components/worlds/PillTabRow';
import { MilestoneCard } from '../components/worlds/MilestoneCard';
import { powerLevelProgress, powerMovementProgress } from '../lib/worldProgress';

const { width } = Dimensions.get('window');

// 3-circle header sizing: 150px center ring, side circles capped at 96px and
// shrunk on narrow screens so the row never wraps (402px reference width).
const HERO_CENTER_SIZE = 134;
const HERO_SIDE_SIZE = Math.min(84, Math.floor((width - 40 - 20 - HERO_CENTER_SIZE) / 2));
const PEAK_CIRCLE_SIZE = Math.min(80, Math.floor((width - 40 - 30) / 4));

export function PowerWorldScreen() {
  const { theme, toggleTheme, mode } = useTheme();
  const W = getWorldTheme('power', mode);
  const { user, profile, refreshProfile } = useAuth();
  const isMounted = useMountedRef();
  const { runAsync: runSafeSave } = useSafeAsync();
  const { ref: scoreCircleRef, onLayout: onScoreCircleLayout } = useTutorialTarget('power.scoreCircle');
  const { ref: movementRowRef, onLayout: onMovementRowLayout } = useTutorialTarget('power.movementRow');

  const [stats, setStats] = useState<PowerUserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'leaderboard'>('dashboard');
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [leaderboardTab, setLeaderboardTab] = useState<'glory' | 'level_1' | 'level_2' | 'level_3' | 'pull_up' | 'dip' | 'squat' | 'muscle_up'>('glory');
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [modalLeaderboardData, setModalLeaderboardData] = useState<any[]>([]);
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  // Community scope for the Power rankings — mirrors ProfileScreen's PUBLIC /
  // MY COMMUNITY toggle. Defaults to 'public' so the board stays global unless
  // the user (who must be in a community) opts in. Server-side filter, so it
  // drives a refetch rather than a client-side slice.
  const [communityScope, setCommunityScope] = useState<'public' | 'community'>('public');

  const filteredLeaderboardData = React.useMemo(() => {
    let list = leaderboardData;
    if (leaderboardTab === 'glory' && genderFilter !== 'ALL') {
      list = leaderboardData.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    // Re-rank them locally based on the filtered list
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [leaderboardData, genderFilter, leaderboardTab]);
  
  // Log Modal State
  const [showLogModal, setShowLogModal] = useState(false);
  const [showOverallModal, setShowOverallModal] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingOverwrite, setPendingOverwrite] = useState<number | null>(null);

  // Celebration State
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationProps, setCelebrationProps] = useState<any>({});

  const fetchData = useCallback(async () => {
    if (!user) return;
    try {
      const s = await PowerService.getUserStats(user.id);
      if (!isMounted.current) return;
      setStats(s);
    } catch (error) {
      console.error('Fetch error:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to load power stats. Please check your connection.');
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [user, isMounted]);

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardData([]);
    try {
      const scopedCommunityId = communityScope === 'community' ? (profile?.community_id ?? null) : null;
      const data = await PowerService.getLeaderboard(leaderboardTab as any, scopedCommunityId);
      if (!isMounted.current) return;
      setLeaderboardData(data);
    } catch (error) {
      console.error('Leaderboard error:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to load leaderboard data.');
    }
  }, [leaderboardTab, communityScope, profile?.community_id, isMounted]);

  // Derive the user's glory rank from the leaderboard list already fetched above instead
  // of a separate count query. Only falls back to a direct query if they're outside the
  // top 50 the list returns.
  useEffect(() => {
    // Only derive the GLOBAL glory rank from a global board — a community-scoped
    // list would otherwise report the user's within-community rank as global.
    if (leaderboardTab !== 'glory' || communityScope !== 'public' || !user || !stats || leaderboardData.length === 0) return;
    if (stats.ranks.glory) return;

    const userIdx = leaderboardData.findIndex((e: any) => e.user_id === user.id);
    if (userIdx !== -1) {
      setStats(prev => prev ? { ...prev, ranks: { ...prev.ranks, glory: userIdx + 1 } } : prev);
    } else {
      PowerService.getGloryRank(stats.totalPoints).then(rank => {
        if (!isMounted.current) return;
        setStats(prev => prev ? { ...prev, ranks: { ...prev.ranks, glory: rank } } : prev);
      });
    }
  }, [leaderboardData, leaderboardTab, communityScope, user, stats, isMounted]);

  const fetchModalLeaderboard = useCallback(async (moveId: string) => {
    setModalLeaderboardData([]);
    try {
      const data = await PowerService.getLeaderboard(moveId as any);
      if (!isMounted.current) return;
      setModalLeaderboardData(data);
    } catch (error) {
      console.error('Modal Leaderboard error:', error);
      if (!isMounted.current) return;
      Alert.alert('Error', 'Failed to load movement rankings.');
    }
  }, [isMounted]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (stats) {
      setSelectedLevel(stats.level.id);
    }
  }, [stats]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
    fetchLeaderboard();
  };

  const handleSaveWeight = async (force: boolean = false) => {
    if (!user || !selectedMovement || !manualInput || saving) return;
    const kg = parseFloat(manualInput);
    if (isNaN(kg) || kg <= 0 || kg > 500) {
      Alert.alert('Invalid', 'Please enter a valid weight (0.1 - 500 kg).');
      return;
    }

    // Below the current best — ask before silently discarding it (or, if
    // force is true, this IS the user's confirmed choice to overwrite).
    // Strictly less-than (not <=): submit_power_assessment treats a tied
    // weight as "not a new PB" but also not worse — a tie should just no-op
    // silently like before, not surface a misleading "below your best" prompt.
    const currentBest = stats?.pbs[selectedMovement] ?? 0;
    if (!force && currentBest > 0 && kg < currentBest) {
      // The weight TextInput leaves the keyboard open when this fires — the
      // overwrite overlay renders inside this same modal, but the native
      // keyboard sits above everything regardless of RN zIndex, so without
      // an explicit dismiss it can cover the overlay's buttons with no way
      // to close it (no input on the overlay itself to blur).
      Keyboard.dismiss();
      setPendingOverwrite(kg);
      return;
    }

    let shouldShowCelebration = false;

    setSaving(true);
    runSafeSave(async () => {
      const { isNewPB, isPromotion, overtakenNotificationId, wraOvertakenNotificationId } = await PowerService.savePB(user.id, selectedMovement, kg, force);
      
      if (isNewPB) {
        const movement = POWER_MOVEMENTS.find(m => m.id === selectedMovement);
        const points = calculatePowerPoints(selectedMovement, kg);
        
        if (isMounted.current) {
          setCelebrationProps({
            title: isPromotion ? 'LEVEL PROMOTED!' : `${movement?.name?.toUpperCase()}`,
            subtitle: isPromotion ? `WELCOME TO ${getPowerLevel(stats?.totalPoints || 0).name}` : 'NEW PR',
            stat: `${kg} KG`,
            emoji: isPromotion ? '⚡' : '🔥',
            userName: profile?.display_name || 'WARRIOR',
            rank: isPromotion ? `LEVEL ${getPowerLevel(stats?.totalPoints || 0).id}` : undefined,
            headerText: 'POWER WORLD',
            showLeapLogo: true,
            accentColor: W.accent,
          });
          shouldShowCelebration = true;
        }

        NotificationService.notify(
          user.id,
          'power_pb',
          isPromotion ? 'Power Level Up!' : 'New Power PB!',
          isPromotion
            ? `${movement?.name ?? selectedMovement}: ${kg} KG — you've reached ${getPowerLevel(stats?.totalPoints || 0).name}.`
            : `${movement?.name ?? selectedMovement}: ${kg} KG — a new personal record.`,
          { screen: 'power-world' }
        );
        if (overtakenNotificationId) {
          NotificationService.sendOvertakeNotificationPush(overtakenNotificationId);
        }
        if (wraOvertakenNotificationId) {
          NotificationService.sendOvertakeNotificationPush(wraOvertakenNotificationId);
        }
      }

      await Promise.all([
        fetchData(),
        fetchLeaderboard(),
        refreshProfile ? refreshProfile() : Promise.resolve(),
      ]);
    }, {
      onSuccess: () => {
        setSaving(false);
        setPendingOverwrite(null);
        setShowLogModal(false);
        setManualInput('');

        // Defer the celebration modal to prevent iOS multiple overlapping modals bug
        // which causes the screen to freeze and become unresponsive
        if (shouldShowCelebration && isMounted.current) {
          setTimeout(() => {
            if (isMounted.current) {
              setShowCelebration(true);
            }
          }, 400);
        }
      },
      onError: (error: any) => {
        setSaving(false);
        setPendingOverwrite(null);
        console.error('Save error:', error);
        Alert.alert('Error', 'Failed to save PR.');
      }
    });
  };

  const renderHeader = () => (
    <WorldHeaderPill world={W} title="POWER WORLD" icon="lightning-bolt" style={styles.headerPill} />
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

        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Skeleton width={150} height={16} borderRadius={4} />
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 16, marginBottom: 20, gap: 10 }}>
          <Skeleton width={90} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
          <Skeleton width={70} height={32} borderRadius={16} />
        </View>

        <View style={styles.peakGrid}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <View key={idx} style={{ alignItems: 'center', marginVertical: 10, gap: 8 }}>
              <Skeleton width={PEAK_CIRCLE_SIZE} height={PEAK_CIRCLE_SIZE} borderRadius={PEAK_CIRCLE_SIZE / 2} />
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
    const lbTitle = leaderboardTab === 'glory' ? 'POWER GLOBAL ELITE' : `${POWER_LEVELS[parseInt(leaderboardTab.split('_')[1])].name.toUpperCase()} MASTERY`;

    const levelProgress = powerLevelProgress(stats.totalPoints);

    return (
      <View style={styles.dashboard}>
        {/* HERO SECTION - 3-CIRCLE ROW */}
        <View style={styles.heroRow}>
          <StatCircle
            size={HERO_SIDE_SIZE}
            label="GLOBAL RANK"
            value={`#${stats.ranks.glory || 0}`}
            caption="OF WORLD"
            unranked={!stats.ranks.glory || stats.totalPoints <= 0}
          />

          <ScoreRingHero
            ref={scoreCircleRef}
            onLayout={onScoreCircleLayout}
            world={W}
            size={HERO_CENTER_SIZE}
            progress={levelProgress.progress}
            label="POWER SCORE"
            value={typeof stats.totalPoints === 'number' ? stats.totalPoints.toFixed(2) : String(stats.totalPoints)}
            caption="TOTAL"
            showCrown={stats.ranks.glory === 1}
            onPress={() => setShowOverallModal(true)}
            badgeIcon="chart-bar"
            onBadgePress={() => setShowOverallModal(true)}
          />

          <StatCircle
            size={HERO_SIDE_SIZE}
            label="LEVEL GAP"
            value={levelProgress.nextLevel ? levelProgress.gap.toFixed(2) : 'MAX'}
            caption={levelProgress.nextLevel ? `PTS TO ${levelProgress.nextLevel.name}` : 'MAX LEVEL'}
          />
        </View>

        <Text style={[styles.sectionHeader, { color: getWorldNeutrals(mode).textPrimary }]}>YOUR PEAK PERFORMANCE</Text>

        <PillTabRow
          world={W}
          style={styles.levelTabs}
          activeKey={leaderboardTab === 'glory' || leaderboardTab.startsWith('level') ? leaderboardTab : 'glory'}
          onSelect={(key) => setLeaderboardTab(key as any)}
          items={[
            { key: 'glory', label: 'OVERALL POWER', emoji: '👑' },
            { key: 'level_1', label: POWER_LEVELS[1].name },
            { key: 'level_2', label: POWER_LEVELS[2].name },
            { key: 'level_3', label: POWER_LEVELS[3].name },
          ]}
        />

        {/* PEAK GRID - 4 IN ONE ROW, whole circle tappable */}
        <View style={styles.peakGrid} ref={movementRowRef} onLayout={onMovementRowLayout}>
          {POWER_MOVEMENTS.map(m => {
            const pb = stats.pbs[m.id] || 0;
            const points = calculatePowerPoints(m.id, pb);
            return (
              <ExerciseCircle
                key={m.id}
                world={W}
                size={PEAK_CIRCLE_SIZE}
                progress={powerMovementProgress(points, stats.totalPoints)}
                icon={m.id}
                name={m.name.split(' ').pop()?.toUpperCase() ?? m.id.toUpperCase()}
                value={pb > 0 ? String(pb) : undefined}
                caption={pb > 0 ? `${pb} KG` : 'TAP TO LOG'}
                hasLogged={pb > 0}
                badge="plus"
                onPress={() => {
                  setSelectedMovement(m.id);
                  fetchModalLeaderboard(m.id);
                  setShowLogModal(true);
                }}
              />
            );
          })}
        </View>

        {/* DYNAMIC LEADERBOARD (LEVELS ONLY) */}
        {leaderboardTab !== 'glory' && (
          <View style={styles.lbSection}>
            <Text style={[styles.lbTitle, { color: W.accent }]}>{lbTitle}</Text>
            <Text style={[styles.lbSub, { color: theme.text.tertiary }]}>
              THE HIGHEST TIER WARRIOR
            </Text>

            <View style={styles.lbList}>
              {filteredLeaderboardData.slice(0, 10).map((item, i) => (
                <View key={i} style={[styles.lbRow, { backgroundColor: theme.card.background }]}>
                  <View style={[styles.lbRankCircle, { borderColor: i === 0 ? W.accent : theme.card.border }]}>
                    <Text style={{ color: i === 0 ? W.accent : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1}>
                    {item.display_name.toUpperCase()}
                  </Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: W.accent }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>
                      {Number(item.value || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* MILESTONE TRACKER (Only on Glory Tab) */}
        {leaderboardTab === 'glory' && (
          <MilestoneCard
            world={W}
            style={{ marginTop: 8 }}
            icon={levelProgress.nextLevel ? 'shield-star' : 'crown'}
            headline={
              levelProgress.nextLevel
                ? `${levelProgress.gap.toFixed(2)} Points to ${levelProgress.nextLevel.name}`
                : 'MAXIMUM MASTERY ACHIEVED'
            }
            caption={levelProgress.nextLevel ? 'YOUR NEXT MAJOR MILESTONE' : 'YOU ARE AT THE PEAK'}
            progress={levelProgress.progress}
            footerRight={
              levelProgress.nextLevel
                ? `${Number(stats.totalPoints).toFixed(2)} / ${levelProgress.nextLevel.minPoints} PTS`
                : `${Number(stats.totalPoints).toFixed(2)} PTS`
            }
          />
        )}

        {/* Ambient Quote */}
        {leaderboardTab === 'glory' && (
          <View style={{ alignItems: 'center', marginTop: 16, marginBottom: 24 }}>
            <Text style={{
              color: theme.text.tertiary,
              fontSize: 11,
              fontFamily: 'BarlowCondensed-SemiBold',
              letterSpacing: 3,
              textTransform: 'uppercase'
            }}>
              TAKE THE LEAP. CLAIM YOUR POWER.
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

      <BottomTabBar activeTab="power" strengthTier={profile?.strength_tier || 0} />

      {/* LOG MODAL */}
      <Modal visible={showLogModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text.primary }]}>UPDATE PEAK WEIGHT</Text>
              <TouchableOpacity onPress={() => setShowLogModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalMovementName, { color: theme.accent }]}>
              {POWER_MOVEMENTS.find(m => m.id === selectedMovement)?.name.toUpperCase()}
            </Text>

            <TextInput 
              style={[styles.modalInput, { color: theme.text.primary, borderColor: theme.accent }]}
              placeholder="0.0"
              placeholderTextColor={theme.text.tertiary}
              keyboardType="numeric"
              autoFocus
              value={manualInput}
              onChangeText={setManualInput}
            />

            <TouchableOpacity
              style={[styles.modalSaveBtn, { backgroundColor: W.accent }]}
              onPress={() => handleSaveWeight()}
              disabled={saving}
            >
              {saving ? <LeapLogo size={40} animated /> : <Text style={styles.modalSaveText}>SAVE NEW PR</Text>}
            </TouchableOpacity>

            <View style={styles.modalLBContainer}>
               <Text style={[styles.modalLBTitle, { color: theme.text.tertiary }]}>MOVEMENT RANKINGS</Text>
               {modalLeaderboardData.slice(0, 5).map((item, i) => (
                 <View key={i} style={styles.modalLBRow}>
                   <Text style={[styles.modalLBRank, { color: theme.accent }]}>#{i + 1}</Text>
                   <Text style={[styles.modalLBName, { color: theme.text.primary }]} numberOfLines={1}>{item.display_name.toUpperCase()}</Text>
                   <Text style={[styles.modalLBValue, { color: theme.text.secondary }]}>{Number(item.value || 0).toFixed(2)}kg</Text>
                 </View>
               ))}
            </View>

            <PBOverwriteConfirmModal
              visible={pendingOverwrite !== null}
              theme={theme}
              accentColor={W.accent}
              movementName={POWER_MOVEMENTS.find(m => m.id === selectedMovement)?.name || ''}
              unitLabel=" KG"
              currentBest={selectedMovement ? (stats?.pbs[selectedMovement] ?? 0) : 0}
              attemptValue={pendingOverwrite ?? 0}
              saving={saving}
              onKeepBest={() => setPendingOverwrite(null)}
              onSaveAnyway={() => handleSaveWeight(true)}
            />
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
                  POWER MASTERY
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowOverallModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={theme.text.tertiary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubOverall, { color: theme.text.tertiary }]}>
              {communityScope === 'community' ? 'MY COMMUNITY RANKINGS' : 'GLOBAL POWER RANKINGS'}
            </Text>

            {/* Community scope — shown only to members of a community; mirrors
                ProfileScreen's PUBLIC / MY COMMUNITY toggle. */}
            {leaderboardTab === 'glory' && !!profile?.community_id && (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 0, marginTop: 16, gap: 12 }}>
                {(['public', 'community'] as const).map((scope) => (
                  <TouchableOpacity
                    key={scope}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 16,
                      borderRadius: 20,
                      backgroundColor: communityScope === scope ? W.accent : 'rgba(255,255,255,0.05)',
                      borderWidth: 1,
                      borderColor: communityScope === scope ? W.accent : 'rgba(255,255,255,0.1)'
                    }}
                    onPress={() => setCommunityScope(scope)}
                  >
                    <Text style={{
                      fontSize: 12,
                      fontWeight: '900',
                      color: communityScope === scope ? '#FFF' : theme.text.secondary
                    }}>
                      {scope === 'public' ? 'PUBLIC' : 'MY COMMUNITY'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {leaderboardTab === 'glory' && (
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
            )}

            <ScrollView style={{ marginTop: 20 }}>
              {filteredLeaderboardData.map((item, i) => (
                <View key={i} style={[styles.lbRow, item.user_id === user?.id && { backgroundColor: `${W.accent}20`, borderColor: W.accent, borderWidth: 1 }]}>
                  <View style={[styles.lbRankCircle, { backgroundColor: i < 3 ? `${W.accent}30` : 'transparent' }]}>
                    <Text style={{ color: i === 0 ? W.accent : theme.text.secondary, fontWeight: '900', fontSize: 12 }}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.lbName, { color: theme.text.primary }]} numberOfLines={1}>
                    {leaderboardTab === 'glory' && <Text style={{ fontSize: 16 }}>{getCountryFlag(item.country)} </Text>}
                    {item.display_name.toUpperCase()}
                  </Text>
                  <View style={[styles.lbPointsFrame, { backgroundColor: W.accent }]}>
                    <Text style={[styles.lbPointsText, { color: '#000' }]}>{Number(item.value || 0).toFixed(2)} PTS</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CelebrationBanner
        visible={showCelebration}
        {...celebrationProps}
        onDismiss={() => setShowCelebration(false)}
      />
      </View>
      </WorldBackground>
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 22 },
  headerPill: { marginTop: 0 },

  dashboard: { paddingHorizontal: 20, paddingTop: 26, gap: 26 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 10 },

  sectionHeader: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 20,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: -6,
  },
  // PillTabRow carries its own 20px side padding — cancel the dashboard's so
  // the fade hint sits flush with the screen edge.
  levelTabs: { marginHorizontal: -20 },
  peakGrid: { flexDirection: 'row', justifyContent: 'space-between' },

  modalTitleBox: { flexDirection: 'row', alignItems: 'center' },
  modalSubOverall: { fontSize: 10, fontWeight: '900', letterSpacing: 3, textAlign: 'center', marginTop: -20 },

  lbSection: { gap: 12 },
  lbTitle: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18, letterSpacing: 2, textAlign: 'center' },
  lbSub: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 10, letterSpacing: 1, textAlign: 'center', marginTop: -8 },
  lbList: { gap: 10 },
  lbRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 15, gap: 11 },
  lbRankCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lbName: { flex: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  lbPointsFrame: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 8, minWidth: 56, alignItems: 'center' },
  lbPointsText: { fontSize: 13, fontWeight: '900' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 },
  modalContent: { padding: 32, borderRadius: 32, gap: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  modalMovementName: { fontSize: 28, fontWeight: '900', textAlign: 'center' },
  modalInput: { borderWidth: 2, borderRadius: 20, padding: 20, fontSize: 42, textAlign: 'center', fontWeight: '900' },
  modalSaveBtn: { padding: 20, borderRadius: 16, alignItems: 'center' },
  modalSaveText: { color: '#000', fontWeight: '900', letterSpacing: 2 },
  modalLBContainer: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', paddingTop: 20, gap: 12 },
  modalLBTitle: { fontSize: 10, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  modalLBRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalLBRank: { fontSize: 14, fontWeight: '900', width: 30 },
  modalLBName: { flex: 1, fontSize: 12, fontWeight: '800' },
  modalLBValue: { fontSize: 12, fontWeight: '900' },
});
