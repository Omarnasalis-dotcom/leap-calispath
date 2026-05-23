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
import { LeaderboardModals } from '../components/profile/LeaderboardModals';
import { TierDetailsModal } from '../components/profile/TierDetailsModal';
import { LeaderboardService, GlobalWellRoundedEntry } from '../services/LeaderboardService';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { getTierLeaderboard, getPowerTierLeaderboard } from '../lib/leaderboard';
import { isPowerWorldUnlocked, calculateTotalPowerScore } from '../lib/powerLogic';
import { isStaticWorldUnlocked, STATIC_MOVEMENTS } from '../lib/staticLogic';
import { StaticService } from '../services/StaticService';
import { TIER_REQUIREMENTS, POWER_TIER_REQUIREMENTS } from '../constants/Progression';
import { SoundServiceInstance as SoundService } from '../lib/SoundService';

import { useRouter , router } from 'expo-router';

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
  const onStartTrial = (tier?: number) => router.push({ pathname: '/trial', params: { tier } });
  const onViewLeaderboards = (category: 'strength' | 'power', tier: number) => router.push({ pathname: '/leaderboard', params: { category, tier } });
  const onOpenPowerAssessment = () => router.push('/power-world');
  const onOpenWeeklyChallenge = () => router.push('/weekly-challenge');
  const onOpenChampionsArena = () => router.push('/champions-arena');
  const onOpenClash = () => router.push('/clash');
  const onOpenTournamentArena = () => router.push('/tournament-arena');
  const onOpenCoach = () => router.push('/coach');
  const onOpenCoachingCenter = () => router.push('/exercise-library'); // Assuming this maps to coaching hub
  const onOpenWarriorProgram = () => router.push('/warrior-program');
  const onOpenAdmin = () => router.push('/admin-tournament');
  
  const { profile, signOut, user, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
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
    async function syncAllPoints() {
      if (!profile?.id) return;

      try {
        // 1. Sync Static Points if needed
        if (profile.statics_tier === 0 || profile.statics_tier === null) {
          const holds = await StaticService.getUserHolds(profile.id);
          if (holds.length > 0) {
            console.log('[Profile] Syncing Static points...');
            const { STATIC_MOVEMENTS } = await import('../lib/staticLogic');
            const peaks: Record<string, number> = { handstand: 0, front_lever: 0, back_lever: 0, planche: 0 };
            holds.forEach(h => {
              const m = STATIC_MOVEMENTS.find(sm => sm.id === h.movement_id);
              if (m && (h.points || 0) > peaks[m.category]) peaks[m.category] = h.points || 0;
            });
            const total = Object.values(peaks).reduce((sum, p) => sum + p, 0);
            if (total > 0) await supabase.from('profiles').update({ statics_tier: total }).eq('id', profile.id);
          }
        }

        // 2. Sync Power Points if needed
        if (profile.power_points === 0 || profile.power_points === null) {
          const { data: pbs } = await supabase.from('power_assessments').select('*').eq('user_id', profile.id).maybeSingle();
          if (pbs) {
            console.log('[Profile] Syncing Power points...');
            const pbMap = { pull_up: pbs.pullup_1rm || 0, dip: pbs.dip_1rm || 0, squat: pbs.squat_1rm || 0, muscle_up: pbs.muscleup_1rm || 0 };
            const total = calculateTotalPowerScore(pbMap);
            if (total > 0) await supabase.from('profiles').update({ power_points: total, power_tier: pbs.power_tier }).eq('id', profile.id);
          }
        }

        // 3. Sync Endurance (1MM) Points if needed
        if (profile.one_mm_points === 0 || profile.one_mm_points === null) {
          const { data: logs } = await supabase.from('one_min_max_logs').select('*').eq('user_id', profile.id);
          if (logs && logs.length > 0) {
            console.log('[Profile] Syncing Endurance points...');
            const { ONEMM_MOVEMENTS } = await import('../lib/oneMMLogic');
            const patternPeaks: Record<string, number> = {};
            logs.forEach(log => {
              const m = ONEMM_MOVEMENTS.find(mv => mv.id === log.movement_id);
              if (m && (log.points || 0) > (patternPeaks[m.patternId] || 0)) patternPeaks[m.patternId] = log.points;
            });
            const total = Object.values(patternPeaks).reduce((sum, p) => sum + p, 0);
            if (total > 0) await supabase.from('profiles').update({ one_mm_points: total }).eq('id', profile.id);
          }
        }

        // Refresh profile if any sync happened
        if (refreshProfile) refreshProfile();
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
      setTimeout(() => {
        if (tierScrollRef.current) {
          const itemWidth = 100;
          const gap = 12;
          const offset = activeCurrentTier * (itemWidth + gap);
          tierScrollRef.current.scrollTo({ x: offset - 40, animated: true });
        }
      }, 800);
    }
  }, [activeCurrentTier]);

  const [showCoachPrompt, setShowCoachPrompt] = useState(false);

  if (!profile) return null;

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
      console.error(e);
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
      console.error(e);
    } finally {
      setLoadingLB(false);
    }
  };

  const ScoreBar = ({ title, subtitle, score, rank, max, color, chips, onPress, showCrown }: {
    title: string; subtitle: string; score: number; rank: string;
    max: number; color: string;
    chips: { label: string; value: number; color: string }[];
    onPress?: () => void;
    showCrown?: boolean;
  }) => {
    const pct = Math.min(100, (score / max) * 100);
    return (
      <TouchableOpacity
        activeOpacity={onPress ? 0.7 : 1}
        onPress={onPress}
        style={[
          styles.scoreBarCard,
          {
            backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
            borderColor: `${color}40`,
            paddingVertical: 12,
            marginBottom: 8,
          }
        ]}
      >

        <View style={styles.scoreBarHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.scoreBarTitle, { color, fontWeight: '900', fontSize: 12 }]}>{title}</Text>
            <Text style={[styles.scoreBarSubtitle, { color: 'rgba(0,0,0,0.3)', fontSize: 9, marginTop: 2 }]}>{subtitle}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.scoreBarTotal, { color, fontSize: 24 }]}>{score.toLocaleString()}</Text>
          </View>
        </View>

        {/* Track */}
        <View style={[styles.scoreBarTrack, { backgroundColor: `${color}12`, borderColor: `${color}20` }]}>
          <View style={[styles.scoreBarFill, {
            width: `${pct}%`,
            backgroundColor: color,
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.5,
            shadowRadius: 4,
          }]} />
        </View>

        {/* Chips row */}
        <View style={styles.scoreChips}>
          {chips.map((c, idx) => (
            <View key={idx} style={styles.scoreChip}>
              <View style={[styles.scoreChipDot, { backgroundColor: c.color }]} />
              <Text style={[styles.scoreChipVal, { color: mode === 'dark' ? '#FFF' : '#000', fontSize: 10 }]}>{c.value.toLocaleString()}</Text>
              <Text style={[styles.scoreChipLbl, { color: 'rgba(0,0,0,0.25)', fontSize: 9 }]}>{c.label}</Text>
            </View>
          ))}
        </View>

        {onPress && (
          <TouchableOpacity
            style={[styles.lbCircleIndicator, { backgroundColor: theme.card.background, borderColor: `${color}30` }]}
            onPress={onPress}
          >
            <MaterialCommunityIcons name="trophy" size={12} color={color} />
          </TouchableOpacity>
        )}

        {showCrown && (
          <View style={styles.crownDecoration}>
            <MaterialCommunityIcons name="crown" size={12} color={color} />
            <Text style={[styles.rankHashtag, { color }]}>#1</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      {/* Coach + Admin Buttons - Grouped Top Left */}
      <View style={{ position: 'absolute', top: 54, left: 12, zIndex: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setShowCoachPrompt(true)}
        >
          <View style={[styles.coachBadge, { backgroundColor: theme.accent + '15', borderColor: theme.accent + '40', height: 24, paddingHorizontal: 6 }]}>
            <MaterialCommunityIcons name="brain" size={12} color={theme.accent} />
            <Text style={[styles.coachBadgeText, { color: theme.accent, fontSize: 8 }]}>COACH</Text>
          </View>
        </TouchableOpacity>

        {profile?.is_admin && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onOpenAdmin}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: theme.accent + '20',
              borderColor: theme.accent + '40',
              borderWidth: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="shield-crown" size={12} color={theme.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* 2. Access Status - Upper Center */}
      <View style={{ position: 'absolute', top: 60, left: 0, right: 0, zIndex: 100, alignItems: 'center', pointerEvents: 'none' }}>
        <Text style={{ 
          color: theme.text.tertiary, 
          fontSize: 8, 
          fontWeight: '700',
          letterSpacing: 0.5,
          opacity: 0.6
        }}>
          {!profile.access_expires_at 
            ? 'GUEST ACCESS' 
            : new Date(profile.access_expires_at).getFullYear() > 2100 
              ? 'LIFETIME MEMBERSHIP' 
              : (() => {
                  const days = Math.ceil((new Date(profile.access_expires_at).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return `${days > 0 ? days : 0} DAYS REMAINING • ${new Date(profile.access_expires_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`;
                })()
          }
        </Text>
      </View>



      <ScrollView>
        <View style={styles.header}>
          {/* User Avatar with Tier Info */}
          <View style={styles.avatarSection}>
            {/* User Display Name Above Rings with Coach Trigger */}
            <View style={{ width: '100%', alignItems: 'center', position: 'relative', marginBottom: 10 }}>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[styles.profileNameHeader, { color: theme.accent, marginBottom: 0 }]} numberOfLines={1}>
                  {profile.first_name || profile.last_name 
                    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').toUpperCase()
                    : 'WARRIOR'}
                </Text>
              </View>

              <Text style={{ color: theme.text.tertiary, fontSize: 13, marginTop: 4, fontFamily: 'PlusJakartaSans-Bold', letterSpacing: 1 }}>
                @{profile.display_name?.toLowerCase() || 'warrior'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.avatarWrapper}
              activeOpacity={0.7}
              onPress={() => setShowWarriorModal(true)}
            >
              {/* Concentric rings avatar — 8 rings, one per tier, filled outward */}
              {Array.from({ length: 8 }).map((_, i) => {
                const ringIndex = i + 1;
                const filled = ringIndex <= activeCurrentTier;
                const OUTER_SIZE = 160;
                const INNER_SIZE = 60;
                const size = OUTER_SIZE - i * ((OUTER_SIZE - INNER_SIZE) / 7);
                const alpha = filled ? 0.25 + (ringIndex / 8) * 0.75 : 0.08;
                const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
                const glowSize = filled ? 4 + ringIndex * 1.5 : 0;
                const borderW = filled ? 1 + ringIndex * 0.08 : 1.5;

                return (
                  <View
                    key={ringIndex}
                    style={[
                      styles.concentricRing,
                      {
                        width: size,
                        height: size,
                        borderRadius: size / 2,
                        borderWidth: borderW,
                        borderColor: filled ? `${theme.accent}${alphaHex}` : `${theme.accent}14`,
                        shadowColor: filled ? theme.accent : 'transparent',
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: filled ? alpha * 0.5 : 0,
                        shadowRadius: glowSize,
                        elevation: filled ? ringIndex : 0,
                      }
                    ]}
                  />
                );
              })}

              {/* Centre: tier number only */}
              <View style={styles.concentricCenter}>
                <Text style={[styles.arcTierNumber, { color: theme.accent, fontSize: 42 }]}>
                  {activeCurrentTier}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Tier name + progress label below the rings */}
            <Text style={[styles.arcTierName, { color: theme.accent }]}>
              {(category === 'strength' ? TIER_NAMES[activeCurrentTier] : POWER_TIER_NAMES[activeCurrentTier])?.toUpperCase() || 'UNKNOWN'}
            </Text>
            <Text style={[styles.arcTierProgress, { color: theme.text.tertiary }]}>
              {activeCurrentTier === 8 ? 'Maximum rank — Eternity' : `Tier ${activeCurrentTier} of 8`}
            </Text>

            {/* Warrior Stats Bars - Under Tier/Avatar */}
            <View style={[
              styles.rightStatsColumn,
              {
                width: '92%',
                marginTop: 10,
                backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.01)',
                borderColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                alignSelf: 'center'
              }
            ]}>
              <ScoreBar
                title="⚔️ Well-Rounded Athlete"
                subtitle="Static · Power · 1MM"
                score={wraScore}
                rank="Leaderboard →"
                max={WRA_MAX}
                color={theme.accent}
                onPress={fetchWRALeaderboard}
                showCrown={wraScore > 0}
                chips={[
                  { label: 'Static', value: staticPts, color: '#9FC5E8' },
                  { label: 'Power', value: powerPts, color: '#FF5722' },
                  { label: '1MM', value: mmPts, color: '#4CAF50' },
                ]}
              />
              <ScoreBar
                title="🏆 Glory Arena"
                subtitle="Competitive Clash Performance"
                score={gloryPts}
                rank="Arena Ranks →"
                max={GLORY_MAX}
                color="#FF5252"
                onPress={fetchGloryLeaderboard}
                showCrown={gloryPts > 0}
                chips={[
                  { label: 'Glory pts', value: gloryPts, color: '#FF5252' },
                ]}
              />
            </View>
          </View>
        </View>

        {mode !== undefined && (
          <View style={{ width: '92%', alignSelf: 'center', marginTop: 16, marginBottom: 8 }}>
            {((profile as any)?.is_coach || profile?.is_admin) ? (
              onOpenCoachingCenter && (
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ padding: 1.2, borderRadius: 8 }}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: mode === 'dark' ? '#151515' : '#FFFFFF',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 12,
                      borderRadius: 7,
                      gap: 8
                    }}
                    onPress={onOpenCoachingCenter}
                  >
                    <MaterialCommunityIcons name="brain" size={16} color="#FF7043" />
                    <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 13, letterSpacing: 1.5, color: mode === 'dark' ? '#FFFFFF' : '#000000' }}>
                      COACHING CENTER
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              )
            ) : (
              onOpenWarriorProgram && (
                <LinearGradient
                  colors={['#7E57C2', '#FF5252', '#FF7043']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ padding: 1.2, borderRadius: 8 }}
                >
                  <TouchableOpacity
                    style={{
                      backgroundColor: mode === 'dark' ? '#151515' : '#FFFFFF',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 12,
                      borderRadius: 7,
                      gap: 8
                    }}
                    onPress={onOpenWarriorProgram}
                  >
                    <MaterialCommunityIcons name="clipboard-text-outline" size={16} color="#FF7043" />
                    <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 13, letterSpacing: 1.5, color: mode === 'dark' ? '#FFFFFF' : '#000000' }}>
                      MY WORKOUT PROGRAM
                    </Text>
                  </TouchableOpacity>
                </LinearGradient>
              )
            )}
          </View>
        )}

        {/* Mode Grid - 2 Column Layout */}
        {/* World Pills Grid - 2 Rows (4 + 3) */}
        <View style={styles.worldPillsGrid}>
          {[
            { id: 'strength', name: 'STRENGTH', icon: '⚔️', unlockTier: 0, action: () => handleCategorySwitch('strength') },
            { id: 'power', name: 'POWER', icon: '⚡', unlockTier: 6, action: onOpenPowerAssessment },
            { id: 'static', name: 'STATIC', icon: '🧊', unlockTier: 1, action: onOpenStaticWorld },
            { id: '1mm', name: '1MM', icon: '⏱️', unlockTier: 0, action: onOpenOneMinMax },
            { id: 'tournament', name: 'TOURNAMENT', icon: '🏟️', unlockTier: 0, action: onOpenTournamentArena },
            { id: 'clash', name: 'CLASH', icon: '🔥', unlockTier: 2, action: onOpenClash },
            { id: 'weekly', name: 'WEEKLY', icon: '🏆', unlockTier: 0, action: onOpenWeeklyChallenge },
            { id: 'champions', name: 'CHAMPIONS', icon: '🏛️', unlockTier: 8, action: onOpenChampionsArena },
          ].map((world) => {
            const isActive = category === world.id;
            const isUnlocked = (profile?.strength_tier || 0) >= world.unlockTier;
            return (
              <TouchableOpacity
                key={world.id}
                onPress={() => {
                  if (isUnlocked) {
                    world.action?.();
                  } else {
                    Alert.alert('Locked', `Reach Tier ${world.unlockTier} to unlock ${world.name}.`);
                  }
                }}
                style={[
                  styles.worldPillCompact,
                  {
                    backgroundColor: isActive ? theme.accent : (mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                    borderColor: isActive ? theme.accent : `${theme.accent}40`,
                    opacity: isUnlocked ? 1 : 0.4
                  }
                ]}
              >
                <Text style={{ fontSize: 12 }}>{world.icon}</Text>
                <Text style={[styles.worldPillText, { color: isActive ? '#000' : theme.text.primary }]} numberOfLines={1}>
                  {world.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Tier Selector - Category-specific Tiers */}
        <View style={styles.tierSelectorSection}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
              {category === 'power' ? 'POWER TIERS' : 'STRENGTH TIERS'}
            </Text>
          </View>
          <ScrollView
            ref={tierScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tierList}
          >
            {Object.entries(category === 'strength' ? TIER_NAMES : POWER_TIER_NAMES).map(([index, name]) => {
              const tierIndex = parseInt(index);
              const isSelected = selectedTier === tierIndex;
              const isCurrent = activeCurrentTier === tierIndex;
              const isLockedItem = tierIndex > activeCurrentTier;

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => setSelectedTier(tierIndex)}
                  style={[
                    styles.tierItemContainer,
                    isSelected && !isCurrent && { borderColor: theme.accent, borderWidth: 2 }
                  ]}
                >
                  <View style={[
                    styles.tierItemContent,
                    isCurrent ? { backgroundColor: theme.accent } :
                      isLockedItem ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' } :
                        { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.accent }
                  ]}>
                    <Text style={[
                      styles.tierItemName,
                      { color: isCurrent ? '#FFFFFF' : isLockedItem ? theme.text.tertiary : theme.accent, letterSpacing: 1 }
                    ]}>
                      {name.toUpperCase()}
                    </Text>
                    <Text style={[
                      styles.tierItemNumber,
                      { color: isCurrent ? 'rgba(255,255,255,0.7)' : isLockedItem ? theme.text.tertiary + '80' : theme.accent + '90', letterSpacing: 1 }
                    ]}>
                      Tier {index}
                    </Text>
                    {isLockedItem && (
                      <View style={styles.lockOverlay}>
                        <Text style={{ fontSize: 8 }}>🔒</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Next Step Banner */}
        {category === 'strength' && (profile?.strength_tier ?? 0) <= 8 && (
          <WarriorCard
            variant="accent"
            style={styles.nextStepBanner}
            padding={0}
          >
            <TouchableOpacity
              style={styles.nextStepPressable}
              onPress={() => {
                const actualNextTier = profile?.strength_tier ?? 0;
                if (onStartTrial) onStartTrial(actualNextTier);
              }}
            >
              <View style={styles.nextStepContent}>
                <Text style={[styles.nextStepLabel, { color: theme.text.tertiary }]}>⚔️ YOUR NEXT CHALLENGE</Text>
                <Text style={[styles.nextStepTitle, { color: theme.accent }]}>
                  Complete the {TIER_NAMES[profile?.strength_tier ?? 0]} Trial
                </Text>
                <Text style={[styles.nextStepSubtitle, { color: theme.text.secondary }]}>
                  Advance to {TIER_NAMES[Math.min((profile?.strength_tier ?? 0) + 1, 9)]}
                </Text>
              </View>
              <Text style={[styles.nextStepArrow, { color: theme.accent }]}>→</Text>
            </TouchableOpacity>
          </WarriorCard>
        )}

        {/* Selected Tier Card - Redesigned */}
        <WarriorCard
          style={styles.modernTierCard}
          variant={isLocked ? 'default' : 'accent'}
          padding={16}
        >
          <View style={styles.tierCirclesRow}>
            {/* Left Circle: Rank */}
            <View style={[styles.tierCircleSmall, { borderColor: isLocked ? theme.card.border : theme.accent + '30' }]}>
              <Text style={[styles.tierCircleLabel, { color: theme.text.tertiary }]}>RANK</Text>
              <Text style={[styles.tierCircleValue, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
                #{tierRankData.rank || '-'}
              </Text>
              <Text style={[styles.tierCircleSubValue, { color: theme.text.tertiary }]}>
                OF {tierRankData.total}
              </Text>
            </View>

            {/* Center Circle: Main Tier */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setModalTier(selectedTier);
                setShowTierModal(true);
              }}
              style={[styles.tierCircleLarge, { borderColor: isLocked ? theme.card.border : theme.accent }]}
            >
              <Text style={[styles.tierLargeName, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
                {tierName.toUpperCase()}
              </Text>
            </TouchableOpacity>

            {/* Right Circle: Gap */}
            <View style={[styles.tierCircleSmall, { borderColor: isLocked ? theme.card.border : theme.accent + '30' }]}>
              <Text style={[styles.tierCircleLabel, { color: theme.text.tertiary }]}>GAP</Text>
              <Text style={[styles.tierCircleValue, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
                {tierRankData.rank === 1 ? 'KING' : (tierRankData.gap || '-')}
              </Text>
              {tierRankData.rank !== 1 && (
                <Text style={[styles.tierCircleSubValue, { color: theme.text.tertiary }]}>
                  {category === 'strength' ? 'TO #1' : 'PTS'}
                </Text>
              )}
            </View>
          </View>

          {/* Internal Progress Bar */}
          {category === 'strength' && (
            <View style={{ paddingHorizontal: 24, marginTop: 12, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 11, color: theme.text.secondary }}>
                  Tier {profile?.strength_tier ?? 0} of 9
                </Text>
                <Text style={{ fontSize: 11, color: theme.text.secondary }}>
                  {Math.round(((profile?.strength_tier ?? 0) / 9) * 100)}% Complete
                </Text>
              </View>
              <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(205,127,50,0.2)', overflow: 'hidden' }}>
                <View
                  style={{
                    height: '100%',
                    backgroundColor: theme.accent,
                    width: `${((profile?.strength_tier ?? 0) / 9) * 100}%`
                  }}
                />
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.cardLeaderboardTrigger}
            onPress={() => onViewLeaderboards?.(category, selectedTier)}
          >
            <MaterialCommunityIcons name="trophy-outline" size={14} color={theme.accent} />
            <Text style={[styles.cardLeaderboardText, { color: theme.accent }]}>LEADERBOARD</Text>
          </TouchableOpacity>
        </WarriorCard>

        {/* Primary Action Button - Moved here */}
        <View style={{ marginBottom: 16 }}>
          {category === 'strength' ? (
            <>
              {category === 'strength' && (
                <Text style={{ fontSize: 12, textAlign: 'center', color: theme.text.secondary, marginBottom: 6 }}>
                  {selectedTier === activeCurrentTier ? (
                    "Complete the trial to rank up in the leaderboard"
                  ) : isLowerTier ? (
                    "Practice this tier to improve your time"
                  ) : (
                    <>
                      Complete <Text style={{ color: theme.accent, fontWeight: 'bold' }}>{TIER_NAMES[selectedTier - 1]?.toUpperCase()}</Text> trial to unlock <Text style={{ color: theme.accent, fontWeight: 'bold' }}>{TIER_NAMES[selectedTier]?.toUpperCase()}</Text>
                    </>
                  )}
                </Text>
              )}

              {onStartTrial && !isLowerTier && !isLocked && (
                <TouchableOpacity
                  style={[styles.primaryActionButton, { backgroundColor: theme.accent }]}
                  onPress={() => onStartTrial()}
                >
                  <Text style={styles.primaryActionButtonText}>
                    {`START ${TIER_NAMES[profile?.strength_tier ?? 0].toUpperCase()}`}
                  </Text>
                </TouchableOpacity>
              )}

              {onStartTrial && isLowerTier && (
                <TouchableOpacity
                  style={[styles.primaryActionButton, { backgroundColor: theme.accent }]}
                  onPress={() => onStartTrial(selectedTier)}
                >
                  <Text style={styles.primaryActionButtonText}>PRACTICE</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              {onOpenPowerAssessment && !isLowerTier && !isLocked && (
                <TouchableOpacity
                  style={[styles.primaryActionButton, { backgroundColor: theme.accent }]}
                  onPress={onOpenPowerAssessment}
                >
                  <Text style={styles.primaryActionButtonText}>START ASSESSMENT</Text>
                </TouchableOpacity>
              )}

              {onOpenPowerAssessment && isLowerTier && (
                <TouchableOpacity
                  style={[styles.primaryActionButton, { backgroundColor: theme.accent }]}
                  onPress={onOpenPowerAssessment}
                >
                  <Text style={styles.primaryActionButtonText}>IMPROVE SCORE</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {isLocked && (
            <View style={[styles.primaryActionButton, { backgroundColor: theme.card.background, borderWidth: 1, borderColor: theme.card.border }]}>
              <Text style={[styles.primaryActionButtonText, { color: theme.text.tertiary }]}>LOCKED</Text>
            </View>
          )}

          {/* Locked indicator for higher tiers */}
          {isLocked && (
            <View style={[styles.lockedIndicator, { backgroundColor: theme.card.background, borderColor: theme.card.border, marginHorizontal: 16, marginTop: 8 }]}>
              <Text style={[styles.lockedIndicatorText, { color: theme.text.tertiary }]}>
                🔒 Complete {category.toUpperCase()} Tier {activeCurrentTier} to unlock this tier
              </Text>
            </View>
          )}
        </View>


        {/* Sound Toggle and Sign Out simplified */}
        <View style={{ paddingHorizontal: 16, gap: 12, marginBottom: 30 }}>
          <TouchableOpacity
            style={styles.signOutButtonSmall}
            onPress={() => {
              const next = !isMuted;
              setIsMuted(next);
              SoundService.setMuted(next);
            }}
          >
            <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={16} color={theme.text.tertiary} />
            <Text style={[styles.signOutTextSmall, { color: theme.text.tertiary }]}>
              ARENA SOUNDS: {isMuted ? 'MUTED' : 'ENABLED'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutButtonSmall} onPress={handleSignOut}>
            <MaterialCommunityIcons name="logout" size={16} color={theme.text.tertiary} />
            <Text style={[styles.signOutTextSmall, { color: theme.text.tertiary }]}>
              LEAVE THE ARENA
            </Text>
          </TouchableOpacity>
        </View>
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
