import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Modal,
  Alert,
  SafeAreaView,
  Platform,
  TextInput,
  FlatList,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { COUNTRIES, getCountryFlag } from '../constants/countries';
import { TIER_NAMES, POWER_TIER_NAMES } from '../types';
import { POWER_TIER_DESCRIPTIONS } from '../lib/tierDescriptions';
import { formatTime, RITES_OF_PASSAGE } from '../lib/trials';
import { WarriorButton } from '../components/atoms/WarriorButton';
import { WarriorCard } from '../components/atoms/WarriorCard';
import { EditProfileModal } from '../components/profile/EditProfileModal';
import { GlobalErrorBoundary } from '../components/GlobalErrorBoundary';
import { LeaderboardModals } from '../components/profile/LeaderboardModals';
import { TierDetailsModal } from '../components/profile/TierDetailsModal';
import { ProfileHeader } from '../components/profile/ProfileHeader';
import { DeleteAccountModal } from '../components/profile/DeleteAccountModal';
import { WorldSelectorGrid } from '../components/profile/WorldSelectorGrid';
import { TierSelectorRow } from '../components/profile/TierSelectorRow';
import { StrengthWorldView } from '../components/profile/StrengthWorldView';
import { ProfileSkeleton } from '../components/profile/ProfileSkeleton';
import { LeaderboardService, GlobalWellRoundedEntry } from '../services/LeaderboardService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getTierLeaderboard, getPowerTierLeaderboard } from '../lib/leaderboard';
import { isPowerWorldUnlocked, calculateTotalPowerScore } from '../lib/powerLogic';
import { isStaticWorldUnlocked, STATIC_MOVEMENTS } from '../lib/staticLogic';
import { StaticService } from '../services/StaticService';
import { TIER_REQUIREMENTS, POWER_TIER_REQUIREMENTS } from '../constants/Progression';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';

import { useRouter, router } from 'expo-router';
import { OnboardingTutorialScreen } from '../screens/OnboardingTutorialScreen';

// Module-level cache to track users who have already synced their points during the app session
const syncedUserIds = new Set<string>();

interface ProfileScreenProps {
  initialCategory?: 'strength' | 'power';
  initialTier?: number;
}

export function ProfileScreen({
  initialCategory = 'strength',
  initialTier = 0
}: ProfileScreenProps) {
  const router = useRouter();
  // Replaced navigation props with router calls
  const onOpenAssessment = () => router.push('/assessment');
  const onOpenStaticWorld = () => router.push('/static-world');
  const onOpenOneMinMax = () => router.push('/one-min-max');
  const onStartTrial = (tier?: number) => {
    const mode = tier !== undefined && tier < (profile?.strength_tier || 0) ? 'practice' : 'progression';
    router.push({ pathname: '/trial', params: { tier, mode } });
  };
  const onViewLeaderboards = (category: 'strength' | 'power', tier: number) => router.push({ pathname: '/leaderboard', params: { category, tier } });
  const onOpenPowerAssessment = () => router.push('/power-world');
  const onOpenWeeklyChallenge = () => router.push('/weekly-challenge');
  const showV2Popup = () => {
    if (Platform.OS === 'web') window.alert('Locked: This feature is coming in V2.');
    else Alert.alert('Locked', 'This feature is coming in V2.');
  };

  const onOpenChampionsArena = showV2Popup;
  const onOpenClash = showV2Popup;
  const onOpenTournamentArena = showV2Popup;
  const onOpenCoach = showV2Popup;
  const onOpenCoachingCenter = () => router.push('/exercise-library'); // Assuming this maps to coaching hub
  const onOpenWarriorProgram = () => router.push('/warrior-program');
  const onOpenAdmin = () => router.push('/admin-tournament');

  const { profile, signOut, user, refreshProfile } = useAuth();
  const { theme, mode, toggleTheme } = useTheme();
  const hasSyncedOnMount = useRef(false);
  const [selectedTier, setSelectedTier] = useState(profile?.strength_tier || 0);
  const [leaderboardBestTime, setLeaderboardBestTime] = useState<number | null>(null);
  const [category, setCategory] = useState<'strength' | 'power'>(initialCategory);
  const [isSwitchingWorld, setIsSwitchingWorld] = useState(false);
  const [showLevelReveal, setShowLevelReveal] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalTier, setModalTier] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(SoundService.getMuted());

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

  // Leaderboard Filtering
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');

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
      try {
        const fetcher = category === 'strength' ? getTierLeaderboard : getPowerTierLeaderboard;
        const { entries } = await fetcher(selectedTier, profile.id);
        const userIdx = entries.findIndex(e => e.user_id === profile.id);
        if (userIdx !== -1) {
          const rank = userIdx + 1;
          let gapStr = null;
          if (rank > 1) {
            const prev = entries[userIdx - 1];
            const current = entries[userIdx];
            if (category === 'strength') {
              const diff = current.best_time_seconds - prev.best_time_seconds;
              gapStr = `${diff.toFixed(1)}s`;
            } else {
              const diff = prev.best_time_seconds - current.best_time_seconds;
              gapStr = `${diff}pts`;
            }
          }
          setTierRankData({ rank, total: entries.length, gap: gapStr });
        } else {
          setTierRankData({ rank: null, total: entries.length, gap: null });
        }
      } catch (e) {
        console.error('Error loading rank:', e);
        setTierRankData({ rank: null, total: 0, gap: null });
      }
    }
    loadRank();
  }, [selectedTier, category, profile?.id]);

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
    if (hasSyncedOnMount.current || (profile?.id && syncedUserIds.has(profile.id))) return;

    async function syncAllPoints() {
      if (!profile?.id) return;
      hasSyncedOnMount.current = true;
      syncedUserIds.add(profile.id);

      try {
        let syncedAny = false;

        // 1. Sync Static Points if needed
        if (profile.statics_tier === 0 || profile.statics_tier === null) {
          if (__DEV__) console.log('[Profile] Syncing Static points...');
          const { error } = await supabase.rpc('sync_static_points', { p_user_id: profile.id });
          if (error) console.error('[Profile] Failed to sync Static points:', error);
          else syncedAny = true;
        }

        // 2. Sync Power Points if needed
        if (profile.power_points === 0 || profile.power_points === null) {
          if (__DEV__) console.log('[Profile] Syncing Power points...');
          const { error } = await supabase.rpc('sync_power_points', { p_user_id: profile.id });
          if (error) console.error('[Profile] Failed to sync Power points:', error);
          else syncedAny = true;
        }

        // 3. Sync Endurance (1MM) Points if needed
        if (profile.one_mm_points === 0 || profile.one_mm_points === null) {
          if (__DEV__) console.log('[Profile] Syncing Endurance points...');
          const { error } = await supabase.rpc('sync_onemm_points', { p_user_id: profile.id });
          if (error) console.error('[Profile] Failed to sync Endurance points:', error);
          else syncedAny = true;
        }

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
    // Auto-scroll to current tier on load
    if (activeCurrentTier > 0) {
      const timer = setTimeout(() => {
        if (tierScrollRef.current) {
          const itemWidth = 100;
          const gap = 12;
          const offset = activeCurrentTier * (itemWidth + gap);
          tierScrollRef.current.scrollTo({ x: offset - 40, animated: true });
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [activeCurrentTier]);

  const [showCoachPrompt, setShowCoachPrompt] = useState(false);

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

  const fetchWRALeaderboard = async () => {
    setLoadingLB(true);
    setShowWRALeaderboard(true);
    try {
      const data = await LeaderboardService.getGlobalWellRoundedLeaderboard(user?.id);
      setWRALeaderboard(data);
    } catch (e) {
      console.error('Failed to fetch WRA leaderboard:', e);
      Alert.alert('Error', 'Failed to fetch WRA leaderboard.');
    } finally {
      setLoadingLB(false);
    }
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
      <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
        <ScrollView>
          <ProfileHeader
            profile={profile}
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
            onShowWarriorModal={() => setShowWarriorModal(true)}
            onShowCoachPrompt={() => setShowCoachPrompt(true)}
            onOpenAdmin={onOpenAdmin}
            onFetchWRALeaderboard={fetchWRALeaderboard}
            onFetchGloryLeaderboard={fetchGloryLeaderboard}
            onOpenCoachingCenter={onOpenCoachingCenter}
            onOpenWarriorProgram={onOpenWarriorProgram}
          />

          {/* Mode Grid - 2 Column Layout */}
          <WorldSelectorGrid
            category={category}
            strengthTier={profile?.strength_tier || 0}
            mode={mode}
            theme={theme}
            onSwitchStrength={() => handleCategorySwitch('strength')}
            onOpenPowerAssessment={onOpenPowerAssessment}
            onOpenStaticWorld={onOpenStaticWorld}
            onOpenOneMinMax={onOpenOneMinMax}
            onOpenTournamentArena={onOpenTournamentArena}
            onOpenClash={onOpenClash}
            onOpenWeeklyChallenge={onOpenWeeklyChallenge}
            onOpenChampionsArena={onOpenChampionsArena}
          />
          <TierSelectorRow
            category={category}
            selectedTier={selectedTier}
            activeCurrentTier={activeCurrentTier}
            theme={theme}
            tierScrollRef={tierScrollRef}
            onSelectTier={setSelectedTier}
          />

          <StrengthWorldView
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
            onViewLeaderboards={onViewLeaderboards}
            onSignOut={handleSignOut}
            onSetMuted={setIsMuted}
            onShowTierModal={(tier) => { setModalTier(tier); setShowTierModal(true); }}
            toggleTheme={toggleTheme}
          />

          <DeleteAccountModal />

        </ScrollView>

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
                  <Text style={[styles.infoValue, { color: theme.text.primary }]}>{profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown'}</Text>
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

        {/* World Switching Overlay - Modern Design */}
        {isSwitchingWorld && (
          <View style={[styles.switchingOverlay, { backgroundColor: theme.background.primary }]}>
            <View style={styles.worldTransition}>
              {/* From World */}
              <View style={[styles.worldBlock, { opacity: 0.3 }]}>
                <Text style={styles.worldBlockIcon}>
                  {category === 'strength' ? '⚔️' : '⚡'}
                </Text>
                <Text style={[styles.worldBlockName, { color: theme.text.tertiary }]}>
                  {category === 'strength' ? 'STRENGTH' : 'POWER'}
                </Text>
              </View>

              {/* To World */}
              <View style={[styles.worldBlock, styles.worldBlockActive]}>
                <View style={[styles.worldBlockGlow, { shadowColor: theme.accent }]} />
                <Text style={styles.worldBlockIconLarge}>
                  {category === 'strength' ? '⚡' : '⚔️'}
                </Text>
                <Text style={[styles.worldBlockNameLarge, { color: theme.accent }]}>
                  {category === 'strength' ? 'POWER WORLD' : 'STRENGTH WORLD'}
                </Text>
                <Text style={[styles.worldBlockSubtitle, { color: theme.text.secondary }]}>
                  Entering...
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { backgroundColor: theme.card.background }]}>
                  <View style={[styles.progressFill, { backgroundColor: theme.accent, width: showLevelReveal ? '60%' : '90%' }]} />
                </View>
                <Text style={[styles.progressText, { color: theme.text.tertiary }]}>
                  {showLevelReveal ? 'Preparing transition...' : 'Loading world data...'}
                </Text>
              </View>
            </View>
          </View>
        )}
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
        />

        {/* AI COACH PROMPT MODAL */}
        <Modal
          visible={showCoachPrompt}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCoachPrompt(false)}
        >
          <View style={styles.coachPromptOverlay}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={[styles.coachPromptCard, { backgroundColor: theme.card.background, borderColor: theme.accent + '40' }]}>
              <View style={[styles.coachPromptIconCircle, { backgroundColor: theme.accent + '15' }]}>
                <MaterialCommunityIcons name="brain" size={40} color={theme.accent} />
              </View>

              <Text style={[styles.coachPromptTitle, { color: theme.text.primary }]}>LEAP COACH</Text>
              <Text style={[styles.coachPromptText, { color: theme.text.secondary }]}>
                Want to ask coach LEAP for guidance?
              </Text>

              <View style={styles.coachPromptButtons}>
                <TouchableOpacity
                  style={[styles.coachPromptBtn, styles.coachPromptBtnSecondary]}
                  onPress={() => setShowCoachPrompt(false)}
                >
                  <Text style={[styles.coachPromptBtnText, { color: theme.text.tertiary }]}>NOT NOW</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.coachPromptBtn, { backgroundColor: theme.accent }]}
                  onPress={() => {
                    setShowCoachPrompt(false);
                    onOpenCoach?.();
                  }}
                >
                  <Text style={[styles.coachPromptBtnText, { color: '#000' }]}>ASK LEAP</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* EDIT PROFILE MODAL */}
        <EditProfileModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} profile={profile} refreshProfile={refreshProfile} />

      </View>
      <OnboardingTutorialScreen
        visible={showOnboarding}
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
      />
    </GlobalErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 48,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  header: {
    padding: 24,
    paddingTop: 60,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarSection: {
    alignItems: 'center',
    padding: 10,
    marginBottom: 20,
    width: '100%',
  },
  avatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 170,
    height: 170,
  },
  // Each concentric ring — sized and coloured dynamically in JSX
  concentricRing: {
    position: 'absolute',
  },
  // The centre content that sits on top of all rings
  concentricCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  coachBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  coachBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  coachPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  coachPromptCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  coachPromptIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  coachPromptTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  coachPromptText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
    opacity: 0.8,
  },
  coachPromptButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  coachPromptBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachPromptBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  coachPromptBtnText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  // Tier number shown large in the centre
  arcTierNumber: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    lineHeight: 48, // Adjusted to centre large numbers
  },
  profileNameHeader: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 3,
    marginBottom: 20,
    textAlign: 'center',
  },
  // Tier name displayed below the rings
  arcTierName: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 2,
    marginTop: 10,
  },
  arcTierProgress: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  avatarInitial: {
    fontSize: 9,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1,
  },
  tierBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  tierBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
    margin: 1,
  },
  nameFrame: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 12,
    marginBottom: 8,
  },
  avatarNameMain: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  avatarTierMain: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  headerSeal: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerSealText: {
    fontSize: 28,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  headerTierName: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 3,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  headerTierLabel: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  underline: {
    height: 3,
    width: 60,
    borderRadius: 2,
    marginTop: 12,
    marginBottom: 16,
  },
  difficultyHierarchy: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 8,
  },
  difficultyBar: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 8,
    width: '100%',
  },
  difficultySegment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  difficultyLabel: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },

  sealPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sealText: {
    fontSize: 36,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  rankName: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  tierLabel: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  statLabel: {
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  actionsSection: {
    margin: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  primaryActionButton: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 2,
  },
  modernTierCard: {
    margin: 16,
    borderRadius: 24,
    backgroundColor: 'rgba(205,127,50,0.05)',
    borderWidth: 0,
    paddingVertical: 24,
  },
  tierCirclesRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginBottom: 24,
  },
  tierCircleLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  tierCircleSmall: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.01)',
  },
  tierCircleLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 2,
  },
  tierCircleValue: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierCircleSubValue: {
    fontSize: 8,
    marginTop: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  tierLargeIcon: {
    fontSize: 28,
    marginBottom: 2,
  },
  tierLargeName: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  cardLeaderboardTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 16,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(205,127,50,0.2)',
    marginTop: 8,
    gap: 8,
  },
  cardLeaderboardText: {
    fontSize: 11,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
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
  signOutButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  signOutTextSmall: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
  },
  leaderboardButton: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  trialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  halfButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
  },
  lockedButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  leaderboardRowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 2,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
  },
  arrow: {
    fontSize: 18,
    color: '#FFFFFF',
    marginLeft: 12,
    fontWeight: '700',
  },
  infoCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    margin: 16,
    marginTop: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  infoSectionTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
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
  signOutButton: {
    margin: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 8,
  },
  signOutText: {
    fontSize: 14,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  worldPillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12
  },
  worldPillCompact: {
    width: '23%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    justifyContent: 'center'
  },
  worldPillText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-ExtraBold'
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierSelectorSection: {
    marginTop: 10,
    marginBottom: 12,
  },
  tierList: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 10,
  },
  tierItemContainer: {
    minWidth: 90,
    height: 48,
    borderRadius: 12,
    position: 'relative',
  },
  tierItemContent: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  tierItemName: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    textAlign: 'center',
  },
  tierItemNumber: {
    fontSize: 9,
    fontFamily: 'PlusJakartaSans-Bold',
    marginTop: 1,
  },
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 24,
  },
  currentIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  lockedSection: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    margin: 16,
  },
  lockedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  lockedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  lockedTitle: {
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  lockedText: {
    fontSize: 14,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  lockedIndicator: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  lockedIndicatorText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  // World Switching Overlay - Modern Design
  switchingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  worldTransition: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 32,
  },
  worldBlock: {
    alignItems: 'center',
    gap: 8,
  },
  worldBlockActive: {
    transform: [{ scale: 1.1 }],
  },
  worldBlockGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  worldBlockIcon: {
    fontSize: 48,
    opacity: 0.5,
  },
  worldBlockIconLarge: {
    fontSize: 72,
    marginBottom: 8,
  },
  worldBlockName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  worldBlockNameLarge: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginBottom: 4,
  },
  worldBlockSubtitle: {
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  progressContainer: {
    width: '100%',
    maxWidth: 280,
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Regular',
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
  modalTitleFrame: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 3,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalTierLabel: {
    fontSize: 14,
    letterSpacing: 2,
    marginBottom: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  modalSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  modalSectionTitle: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 12,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  modalDifficultyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalDifficultyBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  modalDifficultyFill: {
    height: '100%',
    borderRadius: 3,
  },
  modalDifficultyValue: {
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    width: 30,
    textAlign: 'right',
  },
  modalDesc: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  movementsList: {
    gap: 8,
  },
  movementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  movementDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  movementText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  moreText: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  modalLeapButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalLeapButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 3,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  nextStepBanner: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  nextStepPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  nextStepContent: { flex: 1 },
  nextStepLabel: {
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  nextStepTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  nextStepSubtitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  nextStepArrow: { fontSize: 24, fontWeight: '900' },
  rankCard: {
    marginHorizontal: 24,
    marginBottom: 32,
    borderRadius: 16,
  },
  rankCardInner: {
    alignItems: 'center',
  },
  scoreBarCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 10,
  },
  scoreBarHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  scoreBarTitle: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreBarSubtitle: {
    fontSize: 9,
    fontWeight: '500',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  scoreBarRank: {
    fontSize: 8,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  scoreBarTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 8,
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreBarSheen: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '40%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  warriorStatsCard: {
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 10,
    padding: 20,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  headerSplitContainer: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 20,
    alignItems: 'center',
    gap: 20,
  },
  leftIdentityColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightStatsColumn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
  },
  lbTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 3, fontFamily: 'PlusJakartaSans-ExtraBold' },
  lbSub: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5, opacity: 0.6, color: '#FFF' },

  // Well-Rounded Modal Styles
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  lbModalHeader: { padding: 20, flexDirection: 'row', alignItems: 'center' },
  modalCloseBtn: { width: 44, height: 44, justifyContent: 'center' },
  modalHeaderTitle: { flex: 1, marginRight: 44 },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  lbRankBox: { width: 45, alignItems: 'center' },
  lbRankText: { fontSize: 18, fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold' },
  lbName: { fontSize: 14, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  lbBreakdown: { flexDirection: 'row', gap: 10 },
  lbBreakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lbDot: { width: 6, height: 6, borderRadius: 3 },
  lbBreakdownText: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },
  lbScoreBox: { alignItems: 'flex-end', width: 70 },
  lbScoreText: { fontSize: 18, fontWeight: '900', fontFamily: 'PlusJakartaSans-ExtraBold' },
  lbScoreLabel: { fontSize: 8, fontWeight: '900', color: 'rgba(255,255,255,0.3)', letterSpacing: 1 },
  crownDecoration: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 10,
  },
  rankHashtag: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  lbIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    opacity: 0.8,
  },
  lbIndicatorText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  scoreBarTotal: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreChipDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  scoreChipVal: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  scoreChipLbl: {
    fontSize: 9,
    fontWeight: '600',
    fontFamily: 'PlusJakartaSans-Medium',
  },
  lbCircleIndicator: {
    position: 'absolute',
    top: -10,
    right: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 3,
    elevation: 4,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  readOnlyInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
