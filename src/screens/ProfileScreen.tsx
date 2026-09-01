import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { TIER_NAMES, POWER_TIER_NAMES } from '../types';
import { EditProfileModal } from '../components/profile/EditProfileModal';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { FloatingGamesButton } from '../components/FloatingGamesButton';
import { LeaderboardModals } from '../components/profile/LeaderboardModals';
import { TierDetailsModal } from '../components/profile/TierDetailsModal';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { CoachFab } from '../components/coach/CoachFab';
import { TierRankCard } from '../components/profile/TierRankCard';
import { WorldHeaderPill } from '../components/worlds/WorldHeaderPill';
import { getWorldTheme, getWorldNeutrals } from '../../constants/worldThemes';
import { WorldBackground } from '../components/worlds/WorldBackground';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { SettingsSheet } from '../components/profile/SettingsSheet';
import { TierSelectorRow } from '../components/profile/TierSelectorRow';
import { StrengthWorldView } from '../components/profile/StrengthWorldView';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { LeaderboardService, GlobalWellRoundedEntry } from '../services/LeaderboardService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getTierLeaderboard, getPowerTierLeaderboard, LeaderboardEntry } from '../lib/leaderboard';
import { isPowerWorldUnlocked } from '../lib/powerLogic';
import { isStaticWorldUnlocked } from '../lib/staticLogic';
import { StaticService } from '../services/StaticService';
import { OneMMService } from '../services/OneMMService';
import { ActivityStatsService, WeeklyActivityStats } from '../services/ActivityStatsService';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';

import { useRouter, useFocusEffect } from 'expo-router';
import { OnboardingTutorialScreen } from '../screens/OnboardingTutorialScreen';
import { useTutorial } from '../contexts/TutorialContext';

interface ProfileScreenProps {
  initialCategory?: 'strength' | 'power';
  initialTier?: number;
  activeTab?: 'profile' | 'strength';
}

// Shared by the initial-load effect and the on-focus refresh effect below —
// they used to duplicate this, and the on-focus one had drifted to always
// pass gap: null, silently blanking the GAP circle every time the Profile
// screen regained focus (e.g. returning from a trial).
function computeTierRankData(
  entries: LeaderboardEntry[],
  userId: string,
  category: 'strength' | 'power'
): { rank: number | null; total: number; gap: string | null } {
  const userIdx = entries.findIndex(e => e.user_id === userId);
  if (userIdx === -1) {
    return { rank: null, total: entries.length, gap: null };
  }
  const rank = userIdx + 1;
  let gap: string | null = null;
  if (rank > 1) {
    const prev = entries[userIdx - 1];
    const current = entries[userIdx];
    if (category === 'strength') {
      const diff = current.best_time_seconds - prev.best_time_seconds;
      gap = `${diff.toFixed(1)}s`;
    } else {
      const diff = prev.best_time_seconds - current.best_time_seconds;
      gap = `${diff}pts`;
    }
  }
  return { rank, total: entries.length, gap };
}

export function ProfileScreen({
  initialCategory = 'strength',
  initialTier = 0,
  activeTab: initialActiveTab,
}: ProfileScreenProps) {
  const syncedUserIds = useRef(new Set<string>());
  const router = useRouter();
  // Replaced navigation props with router calls
  const onOpenAssessment = () => router.push('/assessment');
  const onOpenStaticWorld = () => router.push('/static-world');
  const onOpenOneMinMax = (category?: 'entry' | 'main' | 'advanced') =>
    router.push(category ? { pathname: '/one-min-max', params: { category } } : '/one-min-max');
  const onStartTrial = (tier?: number) => {
    const mode = tier !== undefined && tier < (profile?.strength_tier || 0) ? 'practice' : 'progression';
    router.push({ pathname: '/trial', params: { tier, mode } });
  };
  const onOpenPowerAssessment = () => router.push('/power-world');
  const onOpenWeeklyChallenge = () => router.push('/weekly-challenge');
  const showV2Popup = () => {
    if (Platform.OS === 'web') window.alert('Locked: This feature is coming in V2.');
    else Alert.alert('Locked', 'This feature is coming in V2.');
  };

  const onOpenClash = showV2Popup;
  const onOpenTournamentArena = showV2Popup;
  const onOpenCoach = (firstPrompt?: string) => {
    router.push(firstPrompt ? { pathname: '/coach', params: { firstPrompt } } : '/coach');
  };
  const onOpenCoachingCenter = () => router.push('/coaching-hub');
  const onOpenTrainingCenter = () => router.push('/training-center');
  const onOpenAdmin = () => router.push('/admin-tournament');
  const onOpenPaywall = () => router.push('/paywall');

  const { profile, signOut, user, refreshProfile, paywallEnabled } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();

  // Detect-after-the-fact warning for the one class of subscription issue
  // that can't be prevented at the paywall: neither Apple nor Google expose
  // which payment account will be used before a purchase completes, so a
  // second real subscription from a different Apple ID/Google account can
  // land on this same profile without any way to block it in advance
  // (confirmed against RevenueCat's own guidance — this is the standard
  // industry pattern for it, not something specific to this app).
  // duplicate_subscription_flagged_at is set server-side by
  // apply_revenuecat_entitlement the moment that happens.
  useEffect(() => {
    if (!profile?.duplicate_subscription_flagged_at) return;
    Alert.alert(
      'Possible Duplicate Subscription',
      'It looks like this account now has two active subscriptions from different Apple ID or Google accounts — you may be getting charged twice. Check your subscriptions in your device\'s account settings, and contact Apple or Google support to cancel the one you don\'t need.',
      [{
        text: 'Got it',
        onPress: () => {
          supabase.rpc('acknowledge_duplicate_subscription').then(({ error }) => {
            if (error) console.error('[Profile] acknowledge_duplicate_subscription failed:', error);
            else refreshProfile();
          });
        },
      }]
    );
    // Only re-fire if the flag timestamp itself changes (e.g. a second,
    // separate incident later) — not on every unrelated profile refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.duplicate_subscription_flagged_at]);
  const W = getWorldTheme('strength', mode);
  const hasSyncedOnMount = useRef(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const [selectedTier, setSelectedTier] = useState(profile?.strength_tier || 0);
  const [leaderboardBestTime, setLeaderboardBestTime] = useState<number | null>(null);
  const [category, setCategory] = useState<'strength' | 'power'>(initialCategory);
  const [activeTab, setActiveTab] = useState<'profile' | 'strength'>(
    initialActiveTab === 'strength' ? 'strength' : 'profile'
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalTier, setModalTier] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(SoundService.getMuted());
  const homeTutorial = useTutorial();
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0);

  // The spotlight tour closes the onboarding modal to run (it needs the
  // real screen underneath interactive) and navigates through several other
  // routes along the way, unmounting/remounting this screen — so tracking
  // "just finished" locally here doesn't survive to the end of the tour.
  // pendingObjective lives in TutorialContext instead, set once the tour
  // actually completes, and read here regardless of which mount of this
  // screen happens to be around when that happens.
  useEffect(() => {
    if (homeTutorial.pendingObjective) {
      homeTutorial.clearPendingObjective();
      setOnboardingInitialStep(3);
      setShowOnboarding(true);
    }
  }, [homeTutorial.pendingObjective]);

  // Leaderboard Modal State
  const [showWRALeaderboard, setShowWRALeaderboard] = useState(false);
  const [wraLeaderboard, setWRALeaderboard] = useState<GlobalWellRoundedEntry[]>([]);
  const [showGloryLeaderboard, setShowGloryLeaderboard] = useState(false);
  const [gloryLeaderboard, setGloryLeaderboard] = useState<any[]>([]);
  const [loadingLB, setLoadingLB] = useState(false);
  const [showWarriorModal, setShowWarriorModal] = useState(false);

  // Onboarding modal — show if user was assessed in the last 5 minutes and hasn't seen it yet
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    async function checkTutorialSeen() {
      if (!profile?.id || !profile?.assessed_at) return;
      try {
        const key = `seen_profile_tutorial_${profile.id}`;
        const hasSeen = await AsyncStorage.getItem(key);
        if (hasSeen === 'true') return;

        const assessedAt = new Date(profile.assessed_at).getTime();
        const isNew = (Date.now() - assessedAt) < 5 * 60 * 1000;
        if (isNew) {
          setShowOnboarding(true);
        }
      } catch (e) {
        console.warn('[ProfileScreen] Failed to read tutorial storage:', e);
      }
    }
    checkTutorialSeen();
  }, [profile?.id, profile?.assessed_at]);
  const [tierRankData, setTierRankData] = useState<{ rank: number | null, total: number, gap: string | null }>({ rank: null, total: 0, gap: null });
  const [tierLeaderboardEntries, setTierLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [tierLeaderboardLoading, setTierLeaderboardLoading] = useState(true);
  // Community leaderboard filter — only meaningful once the user has
  // joined a community (profile.community_id). Filtering happens
  // server-side inside getTierLeaderboard/getPowerTierLeaderboard, not by
  // re-filtering already-fetched entries (see community feature plan).
  //
  // Defaults to 'community' whenever the user has one, but stores ONLY the
  // manual override — the effective scope is derived fresh every render
  // from profile.community_id, never a separate piece of state that a
  // useEffect has to "catch up" to a tick later. That two-step version
  // (useState defaulted at mount + a useEffect syncing it once profile
  // loads) caused a real race: the fetch effect below fires once with the
  // stale mount-time default (profile isn't loaded yet, so 'public'), then
  // fires again once the sync effect corrects it to 'community' — and
  // whichever of those two in-flight requests resolves LAST wins,
  // regardless of which was actually current. Deriving the scope
  // synchronously means profile.community_id and the scope it implies are
  // always consistent on the very first render that has real profile data,
  // so the fetch effect only fires once for that transition.
  const [manualLeaderboardScope, setManualLeaderboardScope] = useState<'public' | 'community' | null>(null);
  const leaderboardScope: 'public' | 'community' = manualLeaderboardScope ?? (profile?.community_id ? 'community' : 'public');
  const setLeaderboardScope = setManualLeaderboardScope;

  // Real Profile-tab activity stats (QuickStatsRow) + per-movement PBs (SuggestedTestCard)
  const [weeklyStats, setWeeklyStats] = useState<WeeklyActivityStats>({ streakDays: 0, pointsThisWeek: 0, workoutsCompleted: 0 });
  const [staticPbs, setStaticPbs] = useState<Record<string, number>>({});
  const [oneMMPbs, setOneMMPbs] = useState<Record<string, number>>({});

  // Leaderboard Filtering
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  // WRA leaderboard's community scope — unlike gender, this must trigger a
  // server-side refetch rather than a client-side filter (see community
  // feature plan: the RPC caps at 100 rows before any filter is applied,
  // so a client-side filter would silently drop small communities). Derived
  // the same way as leaderboardScope above — see that comment for why a
  // separate useState-plus-syncing-useEffect caused stale/racy defaults.
  const [manualWraScope, setManualWraScope] = useState<'public' | 'community' | null>(null);
  const wraScope: 'public' | 'community' = manualWraScope ?? (profile?.community_id ? 'community' : 'public');
  const setWraScope = setManualWraScope;

  const filteredWraLeaderboard = React.useMemo(() => {
    let list = wraLeaderboard;
    if (genderFilter !== 'ALL') {
      list = wraLeaderboard.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [wraLeaderboard, genderFilter]);

  const filteredGloryLeaderboard = React.useMemo(() => {
    let list = gloryLeaderboard;
    if (genderFilter !== 'ALL') {
      list = gloryLeaderboard.filter(e => (e.gender || '').toUpperCase() === genderFilter);
    }
    return list.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [gloryLeaderboard, genderFilter]);

  // Edit Profile State
  const [showEditProfile, setShowEditProfile] = useState(false);


  useEffect(() => {
    if (profile) {
      setSelectedTier(category === 'strength' ? (profile.strength_tier || 0) : (profile.power_tier || 0));
    }
  }, [profile?.strength_tier, profile?.power_tier, category]);

  useEffect(() => {
    async function loadRank() {
      if (!profile?.id) return;
      setTierLeaderboardLoading(true);
      try {
        const fetcher = category === 'strength' ? getTierLeaderboard : getPowerTierLeaderboard;
        const scopeCommunityId = leaderboardScope === 'community' ? profile.community_id : null;
        const { entries } = await fetcher(selectedTier, profile.id, scopeCommunityId);
        setTierLeaderboardEntries(entries);
        setTierRankData(computeTierRankData(entries, profile.id, category));
      } catch (e) {
        console.error('Error loading rank:', e);
        setTierRankData({ rank: null, total: 0, gap: null });
        setTierLeaderboardEntries([]);
      } finally {
        setTierLeaderboardLoading(false);
      }
    }
    loadRank();
  }, [selectedTier, category, profile?.id, leaderboardScope]);

  // Refresh rank when screen comes back into focus (e.g. after trial)
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id) return;
      const fetcher = category === 'strength' ? getTierLeaderboard : getPowerTierLeaderboard;
      const scopeCommunityId = leaderboardScope === 'community' ? profile.community_id : null;
      fetcher(selectedTier, profile.id, scopeCommunityId)
        .then(({ entries }) => {
          setTierLeaderboardEntries(entries);
          setTierRankData(computeTierRankData(entries, profile.id, category));
        })
        .catch(() => {});
    }, [selectedTier, category, profile?.id, leaderboardScope])
  );

  // Weekly activity stats + per-movement PBs, refreshed on mount and whenever
  // the Profile tab regains focus (e.g. after logging a new attempt elsewhere).
  useFocusEffect(
    useCallback(() => {
      if (!profile?.id) return;
      ActivityStatsService.getWeeklyStats(profile.id).then(setWeeklyStats).catch(() => {});
      StaticService.getUserStats(profile.id).then(({ pbs }) => setStaticPbs(pbs)).catch(() => {});
      OneMMService.getUserStats(profile.id).then(({ pbs }) => setOneMMPbs(pbs)).catch(() => {});
    }, [profile?.id])
  );

  const isPowerUnlocked = isPowerWorldUnlocked(profile?.strength_tier || 0);
  const isStaticUnlocked = isStaticWorldUnlocked(profile?.strength_tier ?? 0);

  const currentTier = profile?.strength_tier || 0;
  const currentPowerTier = profile?.power_tier || 0;

  // Adjusted derived values based on active category
  const activeCurrentTier = category === 'strength' ? currentTier : currentPowerTier;
  const isLocked = selectedTier > activeCurrentTier;
  const isLowerTier = selectedTier < activeCurrentTier;
  const tierName = category === 'strength'
    ? TIER_NAMES[selectedTier] || 'Unknown'
    : POWER_TIER_NAMES[selectedTier] || 'Unknown';

  const handleCategorySwitch = async (newCategory: 'strength' | 'power') => {
    if (newCategory === category || (newCategory === 'power' && !isPowerUnlocked)) return;

    setCategory(newCategory);
    setSelectedTier(newCategory === 'strength'
      ? (profile?.strength_tier || 0)
      : (profile?.power_tier || 0)
    );
  };

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  useEffect(() => {
    if (hasSyncedOnMount.current || (profile?.id && syncedUserIds.current.has(profile.id))) return;

    async function syncAllPoints() {
      if (!profile?.id) return;
      hasSyncedOnMount.current = true;
      syncedUserIds.current.add(profile.id);

      try {
        let syncedAny = false;

        // Always re-sync all world points on profile mount. Each RPC is a
        // fast aggregate + single UPDATE so the overhead per open is small,
        // and it catches stale-but-nonzero values (not just first-time zeros)
        // that the old conditional check could never detect.
        // 1. Static points
        if (__DEV__) console.log('[Profile] Syncing Static points...');
        const { error: staticErr } = await supabase.rpc('sync_static_points', { p_user_id: profile.id });
        if (staticErr) console.error('[Profile] Failed to sync Static points:', staticErr);
        else syncedAny = true;

        // 2. Power points
        if (__DEV__) console.log('[Profile] Syncing Power points...');
        const { error: powerErr } = await supabase.rpc('sync_power_points', { p_user_id: profile.id });
        if (powerErr) console.error('[Profile] Failed to sync Power points:', powerErr);
        else syncedAny = true;

        // 3. Endurance (1MM) points
        if (__DEV__) console.log('[Profile] Syncing Endurance points...');
        const { error: onemmErr } = await supabase.rpc('sync_onemm_points', { p_user_id: profile.id });
        if (onemmErr) console.error('[Profile] Failed to sync Endurance points:', onemmErr);
        else syncedAny = true;

        // Refresh profile if any sync happened
        if (syncedAny && refreshProfile) {
          await refreshProfile();
        }
      } catch (e) {
        console.error('Failed self-healing sync:', e);
      }
    }
    syncAllPoints();
  }, [profile?.id]);

  const tierScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // TierSelectorRow's own contentOffset already positions it at the
    // current tier on first layout (no more visible "tier 0 then jump"
    // flash). This handles the case where activeCurrentTier changes after
    // that first paint, e.g. a trial completes and the tier advances while
    // the Strength tab is still open.
    if (activeCurrentTier > 0 && tierScrollRef.current) {
      const itemWidth = 90;
      const gap = 12;
      const offset = activeCurrentTier * (itemWidth + gap);
      tierScrollRef.current.scrollTo({ x: offset, animated: true });
    }
  }, [activeCurrentTier]);

  if (!profile) {
    return <ProfileSkeleton />;
  }

  const staticPts = profile.statics_tier || 0;
  const powerPts = profile.power_points || 0;
  const mmPts = profile.one_mm_points || 0;
  const gloryPts = profile.glory_score || 0;
  const wraScore = staticPts + powerPts + mmPts;
  const WRA_MAX = 5000;
  const GLORY_MAX = 1000;

  const fetchWRALeaderboard = async (scopeOverride?: 'public' | 'community') => {
    setLoadingLB(true);
    setShowWRALeaderboard(true);
    try {
      // Guard against callers wiring this up directly as an onPress handler
      // — RN invokes onPress with a GestureResponderEvent, which is truthy
      // and would otherwise silently override the derived wraScope.
      const scope = (scopeOverride === 'public' || scopeOverride === 'community') ? scopeOverride : wraScope;
      const scopeCommunityId = scope === 'community' ? profile?.community_id : null;
      const data = await LeaderboardService.getGlobalWellRoundedLeaderboard(user?.id, scopeCommunityId);
      setWRALeaderboard(data);
    } catch (e) {
      console.error('Failed to fetch WRA leaderboard:', e);
      Alert.alert('Error', 'Failed to fetch WRA leaderboard.');
    } finally {
      setLoadingLB(false);
    }
  };

  const handleWraScopeChange = (scope: 'public' | 'community') => {
    setWraScope(scope);
    fetchWRALeaderboard(scope);
  };

  const fetchGloryLeaderboard = async () => {
    setLoadingLB(true);
    setShowGloryLeaderboard(true);
    try {
      const data = await LeaderboardService.getGlobalGloryLeaderboard(user?.id);
      setGloryLeaderboard(data);
    } catch (e) {
      console.error('Failed to fetch Glory leaderboard:', e);
      Alert.alert('Error', 'Failed to fetch Glory leaderboard.');
    } finally {
      setLoadingLB(false);
    }
  };


  return (
    <GlobalErrorBoundary>
      <WorldBackground world={W}>
      <View style={styles.container}>
        <ScrollView ref={mainScrollRef} contentContainerStyle={{ paddingBottom: 24 }}>
          {activeTab === 'profile' && (
            <>
              <TouchableOpacity
                style={styles.settingsGearButton}
                onPress={() => setShowSettings(true)}
              >
                <MaterialCommunityIcons name="cog-outline" size={18} color={getWorldNeutrals(mode).textSecondary} />
              </TouchableOpacity>

              <ProfileHeader
                scrollRef={mainScrollRef}
                profile={profile}
                paywallEnabled={paywallEnabled}
                category={category}
                activeCurrentTier={activeCurrentTier}
                mode={mode}
                theme={theme}
                wraScore={wraScore}
                staticPts={staticPts}
                powerPts={powerPts}
                mmPts={mmPts}
                gloryPts={gloryPts}
                WRA_MAX={WRA_MAX}
                GLORY_MAX={GLORY_MAX}
                staticPbs={staticPbs}
                powerPbs={profile.power_pbs || {}}
                oneMMPbs={oneMMPbs}
                weeklyStats={weeklyStats}
                onShowWarriorModal={() => setShowWarriorModal(true)}
                onOpenAdmin={onOpenAdmin}
                onOpenPaywall={onOpenPaywall}
                onFetchWRALeaderboard={() => fetchWRALeaderboard()}
                onFetchGloryLeaderboard={fetchGloryLeaderboard}
                onOpenCoachingCenter={onOpenCoachingCenter}
                onOpenTrainingCenter={onOpenTrainingCenter}
                onOpenStaticWorld={onOpenStaticWorld}
                onOpenPowerAssessment={onOpenPowerAssessment}
                onOpenOneMinMax={onOpenOneMinMax}
              />

              <TouchableOpacity
                style={[styles.weeklyChallengeButton, { backgroundColor: W.accent }]}
                onPress={onOpenWeeklyChallenge}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="trophy-outline" size={18} color="#FFFFFF" />
                <Text style={[styles.weeklyChallengeText, { color: '#FFFFFF' }]}>WEEKLY CHALLENGE</Text>
              </TouchableOpacity>
            </>
          )}

          {activeTab === 'strength' && (
            <>
              <View style={{ paddingTop: 22, marginBottom: 12 }}>
                <WorldHeaderPill
                  world={W}
                  title="STRENGTH WORLD"
                  icon="sword-cross"
                />
              </View>

              <TierRankCard
                profile={profile}
                category={category}
                selectedTier={selectedTier}
                tierRankData={tierRankData}
                theme={theme}
                onShowTierModal={(tier) => { setModalTier(tier); setShowTierModal(true); }}
              />

              <TierSelectorRow
                scrollRef={mainScrollRef}
                category={category}
                selectedTier={selectedTier}
                activeCurrentTier={activeCurrentTier}
                theme={theme}
                tierScrollRef={tierScrollRef}
                onSelectTier={setSelectedTier}
              />

              <StrengthWorldView
                scrollRef={mainScrollRef}
                profile={profile}
                category={category}
                selectedTier={selectedTier}
                activeCurrentTier={activeCurrentTier}
                isLocked={isLocked}
                isLowerTier={isLowerTier}
                tierName={tierName}
                tierRankData={tierRankData}
                isMuted={isMuted}
                mode={mode}
                theme={theme}
                onStartTrial={onStartTrial}
                onOpenPowerAssessment={onOpenPowerAssessment}
                leaderboardEntries={tierLeaderboardEntries}
                leaderboardLoading={tierLeaderboardLoading}
                onSignOut={handleSignOut}
                onSetMuted={setIsMuted}
                onShowTierModal={(tier) => { setModalTier(tier); setShowTierModal(true); }}
                toggleTheme={toggleTheme}
                showSettingsFooter={false}
                hasCommunity={!!profile?.community_id}
                leaderboardScope={leaderboardScope}
                onLeaderboardScopeChange={setLeaderboardScope}
              />
            </>
          )}
        </ScrollView>

        <BottomTabBar
          activeTab={activeTab}
          strengthTier={profile?.strength_tier || 0}
          onSelectProfileTab={setActiveTab}
        />

        <FloatingGamesButton />

        <SettingsSheet visible={showSettings} onClose={() => setShowSettings(false)} />

        {/* Warrior Info Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={showWarriorModal}
          onRequestClose={() => setShowWarriorModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: theme.background.primary }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={[styles.modalTitle, { color: theme.accent }]}>WARRIOR PROFILE</Text>
                  <TouchableOpacity onPress={() => { setShowWarriorModal(false); setShowEditProfile(true); }}>
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.accent} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => setShowWarriorModal(false)}>
                  <Text style={[styles.closeButtonText, { color: theme.text.tertiary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.warriorInfoList}>
                <View style={styles.warriorInfoItem}>
                  <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>DISPLAY NAME</Text>
                  <Text style={[styles.infoValue, { color: theme.text.primary }]}>{profile.display_name || 'Warrior'}</Text>
                </View>
                <View style={styles.warriorInfoItem}>
                  <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>EMAIL</Text>
                  <Text style={[styles.infoValue, { color: theme.text.primary }]}>{user?.email}</Text>
                </View>
                <View style={styles.warriorInfoItem}>
                  <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>JOINED ARENA</Text>
                  <Text style={[styles.infoValue, { color: theme.text.primary }]}>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</Text>
                </View>
                <View style={styles.warriorInfoItem}>
                  <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>TIMEZONE</Text>
                  <Text style={[styles.infoValue, { color: theme.text.primary }]}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: theme.accent }]}
                onPress={() => setShowWarriorModal(false)}
              >
                <Text style={styles.modalButtonText}>CLOSE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <TierDetailsModal
          showTierModal={showTierModal}
          setShowTierModal={setShowTierModal}
          modalTier={modalTier}
          category={category}
          activeCurrentTier={activeCurrentTier}
          onOpenPowerAssessment={onOpenPowerAssessment}
          onStartTrial={onStartTrial}
        />

        <LeaderboardModals
          showWRALeaderboard={showWRALeaderboard}
          setShowWRALeaderboard={setShowWRALeaderboard}
          showGloryLeaderboard={showGloryLeaderboard}
          setShowGloryLeaderboard={setShowGloryLeaderboard}
          loadingLB={loadingLB}
          genderFilter={genderFilter}
          setGenderFilter={setGenderFilter}
          filteredWraLeaderboard={filteredWraLeaderboard}
          filteredGloryLeaderboard={filteredGloryLeaderboard}
          hasCommunity={!!profile?.community_id}
          wraScope={wraScope}
          onWraScopeChange={handleWraScopeChange}
        />

        {/* EDIT PROFILE MODAL */}
        <EditProfileModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} profile={profile} refreshProfile={refreshProfile} />

        <CoachFab profile={profile} canAccessCoach={true} onOpenCoach={onOpenCoach} />

      </View>
      </WorldBackground>
      <OnboardingTutorialScreen
        visible={showOnboarding}
        initialStep={onboardingInitialStep}
        strengthTier={profile?.strength_tier ?? 0}
        onBeginTrial={async () => {
          setShowOnboarding(false);
          if (profile?.id) {
            try {
              await AsyncStorage.setItem(`seen_profile_tutorial_${profile.id}`, 'true');
            } catch (e) {
              console.warn('[ProfileScreen] Failed to save tutorial storage:', e);
            }
          }
          const nextTier = Math.min((profile?.strength_tier ?? 0) + 1, 9);
          router.push({ pathname: '/trial', params: { mode: 'progression', tier: String(nextTier) } });
        }}
        onSkip={async () => {
          setShowOnboarding(false);
          if (profile?.id) {
            try {
              await AsyncStorage.setItem(`seen_profile_tutorial_${profile.id}`, 'true');
            } catch (e) {
              console.warn('[ProfileScreen] Failed to save tutorial storage:', e);
            }
          }
        }}
        onTakeTour={async () => {
          setShowOnboarding(false);
          if (profile?.id) {
            try {
              await AsyncStorage.setItem(`seen_profile_tutorial_${profile.id}`, 'true');
            } catch (e) {
              console.warn('[ProfileScreen] Failed to save tutorial storage:', e);
            }
          }
          homeTutorial.start({ showObjectiveAfter: true });
        }}
      />
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // 40px rounded-12 tile, faint white fill (design handoff) — kept outside
  // the centered identity column so the name/tier text stays truly centered.
  settingsGearButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 100,
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weeklyChallengeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 16,
    height: 56,
    borderRadius: 15,
  },
  weeklyChallengeText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 15,
    letterSpacing: 1.5,
  },
  warriorInfoList: {
    marginTop: 20,
    gap: 16,
  },
  warriorInfoItem: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    paddingBottom: 12,
  },
  modalButton: {
    marginTop: 30,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  infoLabel: {
    fontSize: 12,
    marginBottom: 4,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  infoValue: {
    fontSize: 16,
    marginBottom: 16,
    fontFamily: 'PlusJakartaSans-Medium',
  },
  // Tier Details Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
});
