import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { TIER_NAMES, POWER_TIER_NAMES } from '../types';
import { POWER_TIER_DESCRIPTIONS } from '../lib/tierDescriptions';
import { formatTime, RITES_OF_PASSAGE } from '../lib/trials';
import { WarriorButton } from '../components/atoms/WarriorButton';
import { WarriorCard } from '../components/atoms/WarriorCard';
import { LeaderboardService, GlobalWellRoundedEntry } from '../services/LeaderboardService';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { getTierLeaderboard } from '../lib/leaderboard';
import { isPowerWorldUnlocked, calculateTotalPowerScore } from '../lib/powerLogic';
import { isStaticWorldUnlocked, STATIC_MOVEMENTS } from '../lib/staticLogic';
import { StaticService } from '../services/StaticService';
import { TIER_REQUIREMENTS, POWER_TIER_REQUIREMENTS } from '../constants/Progression';


interface ProfileScreenProps {
  onStartTrial?: (tier?: number) => void;
  onOpenAssessment?: () => void;
  onViewLeaderboards?: (category: 'strength' | 'power', tier: number) => void;
  onOpenPowerAssessment?: () => void;
  onOpenStaticWorld?: () => void;
  onOpenWeeklyChallenge?: () => void;
  onOpenChampionsArena?: () => void;
  onOpenClash?: () => void;
  onOpenTournamentArena?: () => void;
  onOpenOneMinMax?: () => void;
  initialCategory?: 'strength' | 'power';
  initialTier?: number;
}

export function ProfileScreen({
  onStartTrial,
  onOpenAssessment,
  onViewLeaderboards,
  onOpenPowerAssessment,
  onOpenStaticWorld,
  onOpenWeeklyChallenge,
  onOpenChampionsArena,
  onOpenClash,
  onOpenTournamentArena,
  onOpenOneMinMax,
  initialCategory = 'strength',
  initialTier = 0,
}: ProfileScreenProps) {
  const { profile, signOut, user, refreshProfile } = useAuth();
  const { theme, mode } = useTheme();
  const [selectedTier, setSelectedTier] = useState(profile?.strength_tier || 0);
  const [leaderboardBestTime, setLeaderboardBestTime] = useState<number | null>(null);
  const [category, setCategory] = useState<'strength' | 'power'>(initialCategory);
  const [isSwitchingWorld, setIsSwitchingWorld] = useState(false);
  const [showLevelReveal, setShowLevelReveal] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalTier, setModalTier] = useState<number | null>(null);

  // Leaderboard Modal State
  const [showWRALeaderboard, setShowWRALeaderboard] = useState(false);
  const [wraLeaderboard, setWRALeaderboard] = useState<GlobalWellRoundedEntry[]>([]);
  const [showGloryLeaderboard, setShowGloryLeaderboard] = useState(false);
  const [gloryLeaderboard, setGloryLeaderboard] = useState<any[]>([]);
  const [loadingLB, setLoadingLB] = useState(false);

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

  if (!profile) return null;

  const staticPts = profile.statics_tier || 0;
  const powerPts = profile.power_points || 0;
  const mmPts = profile.one_mm_points || 0;
  const gloryPts = profile.glory_score || 0;
  const wraScore = staticPts + (powerPts * 2) + (mmPts * 2);
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
      <ScrollView>
        <View style={styles.header}>
          {/* User Avatar with Tier Info */}
          <View style={styles.avatarSection}>
            {/* User Display Name Above Rings */}
            <Text style={[styles.profileNameHeader, { color: theme.accent }]} numberOfLines={1}>
              {profile.display_name?.toUpperCase() || 'WARRIOR'}
            </Text>

            {/* Concentric rings avatar — 8 rings, one per tier, filled outward */}
            <View style={styles.avatarWrapper}>

              {/* ... existing rings ... */}
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

            </View>

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
                subtitle="Static ×1 · Power ×2 · 1MM ×2"
                score={wraScore}
                rank="Leaderboard →"
                max={WRA_MAX}
                color={theme.accent}
                onPress={fetchWRALeaderboard}
                showCrown={wraScore > 0}
                chips={[
                  { label: 'Static', value: staticPts, color: '#9FC5E8' },
                  { label: 'Power ×2', value: powerPts * 2, color: '#FF5722' },
                  { label: '1MM ×2', value: mmPts * 2, color: '#4CAF50' },
                ]}
              />
              <ScoreBar
                title="✨ Glory"
                subtitle="Tournaments · Clashes"
                score={gloryPts}
                rank="Leaderboard →"
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
                  style={[
                    styles.tierItem,
                    { backgroundColor: theme.card.background, borderColor: theme.card.border },
                    isSelected && { borderColor: theme.accent, backgroundColor: theme.background.secondary },
                    isLockedItem && { opacity: 0.5 }
                  ]}
                  onPress={() => setSelectedTier(tierIndex)}
                >
                  <Text style={[
                    styles.tierItemName,
                    { color: theme.text.tertiary },
                    isSelected && { color: theme.accent }
                  ]}>
                    {name.toUpperCase()}
                  </Text>
                  <Text style={[
                    styles.tierItemNumber,
                    { color: theme.text.tertiary },
                    isSelected && { color: theme.accent }
                  ]}>
                    Tier {index}
                  </Text>
                  {isLockedItem && (
                    <View style={styles.lockOverlay}>
                      <Text style={styles.lockIcon}>🔒</Text>
                    </View>
                  )}
                  {isCurrent && (
                    <View style={[styles.currentIndicator, { backgroundColor: theme.accent }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Next Step Banner */}
        {category === 'strength' && (profile?.strength_tier ?? 0) < 8 && (
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
                  Advance to {TIER_NAMES[Math.min((profile?.strength_tier ?? 0) + 1, 8)]}
                </Text>
              </View>
              <Text style={[styles.nextStepArrow, { color: theme.accent }]}>→</Text>
            </TouchableOpacity>
          </WarriorCard>
        )}

        {/* Selected Tier Card */}
        <WarriorCard
          style={styles.rankCard}
          variant={isLocked ? 'default' : 'accent'}
          padding={20}
        >
          <TouchableOpacity
            style={styles.rankCardInner}
            onPress={() => {
              setModalTier(selectedTier);
              setShowTierModal(true);
            }}
          >
            <View style={[styles.sealPlaceholder, {
              borderColor: isLocked ? theme.card.border : theme.accent,
              backgroundColor: theme.background.secondary
            }]}>
              <Text style={[styles.sealText, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
                {isLocked ? '🔒' : tierName[0]}
              </Text>
            </View>
            <Text style={[styles.rankName, { color: isLocked ? theme.text.tertiary : theme.accent }]}>
              {tierName.toUpperCase()}
            </Text>
            <View style={styles.tierRow}>
              <View style={[styles.tierDot, { backgroundColor: isLocked ? theme.card.border : theme.accent }]} />
              <Text style={[styles.tierLabel, { color: theme.text.secondary }]}>
                {isLocked ? `LOCKED - Reach Tier ${selectedTier}` :
                  isLowerTier ? `Tier ${selectedTier} - Unlocked` :
                    `Current Tier - ${category.toUpperCase()} Tier ${selectedTier}`}
              </Text>
            </View>
          </TouchableOpacity>
        </WarriorCard>

        {/* Progress Bar */}
        {category === 'strength' && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { backgroundColor: theme.card.border }]}>
              <View style={[styles.progressFill, {
                backgroundColor: theme.accent,
                width: `${((profile?.strength_tier ?? 0) / 8) * 100}%`
              }]} />
            </View>
            <Text style={[styles.progressText, { color: theme.text.tertiary }]}>
              TIER {profile?.strength_tier ?? 0} OF 8 — {Math.round(((profile?.strength_tier ?? 0) / 8) * 100)}% COMPLETE
            </Text>
          </View>
        )}

        {/* Stats Grid */}
        <View style={styles.statsContainer}>
          {category === 'strength' ? (
            <>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.glory_score}</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>GLORY</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.streak}</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>STREAK</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.trials_passed}</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>TRIALS</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: isLocked ? theme.text.tertiary : theme.text.primary }]}>
                  {isLocked ? '--:--' : (leaderboardBestTime && leaderboardBestTime > 0 ? formatTime(leaderboardBestTime) : '--:--')}
                </Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>BEST TIME</Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_points || 0}</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>POWER POINTS</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_pbs?.pull_up || 0}kg</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>PULL-UP</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_pbs?.dip || 0}kg</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>DIP</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
                <Text style={[styles.statValue, { color: theme.text.primary }]}>{profile.power_pbs?.muscle_up || 0}kg</Text>
                <Text style={[styles.statLabel, { color: theme.text.tertiary }]}>MUSCLE-UP</Text>
              </View>
            </>
          )}
        </View>

        {/* Action Buttons - Available for all tiers */}
        <View style={styles.actionsSection}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: isLocked ? theme.card.border : theme.accent }]} />
            <Text style={[styles.sectionTitle, { color: theme.text.primary }]}>
              {isLocked ? 'LOCKED TIER - VIEW ONLY' : isLowerTier ? 'PAST ACHIEVEMENT' : 'ACTIONS'}
            </Text>
          </View>

          {/* Row 1: Trial buttons - Orange color */}
          <View style={styles.trialRow}>
            {category === 'strength' ? (
              <>
                {onStartTrial && !isLowerTier && !isLocked && (
                  <WarriorButton
                    title="START TRIAL"
                    style={styles.halfButton}
                    onPress={() => onStartTrial()}
                  />
                )}

                {onStartTrial && isLowerTier && (
                  <WarriorButton
                    title="IMPROVE TIME"
                    style={styles.halfButton}
                    onPress={() => onStartTrial(selectedTier)}
                  />
                )}
              </>
            ) : (
              <>
                {onOpenPowerAssessment && !isLowerTier && !isLocked && (
                  <WarriorButton
                    title="START ASSESSMENT"
                    style={styles.halfButton}
                    onPress={onOpenPowerAssessment}
                  />
                )}

                {onOpenPowerAssessment && isLowerTier && (
                  <WarriorButton
                    title="IMPROVE SCORE"
                    style={styles.halfButton}
                    onPress={onOpenPowerAssessment}
                  />
                )}
              </>
            )}

            {/* Locked placeholder for higher tiers */}
            {isLocked && (
              <WarriorButton
                title="LOCKED"
                disabled
                variant="secondary"
                style={styles.halfButton}
              />
            )}
          </View>

          {/* Row 2: Leaderboard - White framed */}
          {onViewLeaderboards && (
            <WarriorButton
              title="VIEW LEADERBOARDS"
              variant="outline"
              style={styles.leaderboardRowButton}
              onPress={() => onViewLeaderboards(category, selectedTier)}
            />
          )}

          {/* Locked indicator for higher tiers */}
          {isLocked && (
            <View style={[styles.lockedIndicator, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
              <Text style={[styles.lockedIndicatorText, { color: theme.text.tertiary }]}>
                🔒 Complete {category.toUpperCase()} Tier {activeCurrentTier} to unlock this tier
              </Text>
            </View>
          )}
        </View>

        {/* Info Card */}
        <WarriorCard style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <View style={[styles.infoDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.infoSectionTitle, { color: theme.text.primary }]}>WARRIOR INFO</Text>
          </View>

          <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>NAME</Text>
          <Text style={[styles.infoValue, { color: theme.text.primary }]}>
            {profile.display_name || profile.email}
          </Text>

          {profile.assessed_at ? (
            <>
              <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>ASSESSED</Text>
              <Text style={[styles.infoValue, { color: theme.text.primary }]}>
                {new Date(profile.assessed_at).toLocaleDateString()}
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.infoLabel, { color: theme.text.tertiary }]}>STATUS</Text>
              <Text style={[styles.infoValue, { color: theme.text.primary }]}>Awaiting Assessment</Text>
            </>
          )}
        </WarriorCard>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <View style={[styles.signOutDot, { backgroundColor: theme.text.tertiary }]} />
          <Text style={[styles.signOutText, { color: theme.text.tertiary }]}>
            LEAVE THE ARENA
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Tier Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTierModal}
        onRequestClose={() => setShowTierModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.background.primary }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={[styles.modalTitleFrame, { borderColor: theme.accent }]}>
                <Text style={[styles.modalTitle, { color: theme.accent }]}>
                  {modalTier !== null ? (category === 'power' ? POWER_TIER_NAMES[modalTier] : TIER_NAMES[modalTier]).toUpperCase() : 'TIER'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowTierModal(false)}
              >
                <Text style={[styles.closeButtonText, { color: theme.text.tertiary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalTierLabel, { color: theme.text.secondary }]}>
              Tier {modalTier}
            </Text>

            {/* Difficulty Section */}
            <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
              <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>DIFFICULTY</Text>
              <View style={styles.modalDifficultyRow}>
                <View style={[styles.modalDifficultyBar, { backgroundColor: theme.background.secondary }]}>
                  <View
                    style={[
                      styles.modalDifficultyFill,
                      {
                        backgroundColor: theme.accent,
                        width: modalTier !== null ? `${(((category === 'power' ? POWER_TIER_REQUIREMENTS : TIER_REQUIREMENTS)[modalTier]?.difficulty || 1) / 9) * 100}%` : '11%'
                      }
                    ]}
                  />
                </View>
                <Text style={[styles.modalDifficultyValue, { color: theme.accent }]}>
                  {modalTier !== null ? (category === 'power' ? POWER_TIER_REQUIREMENTS : TIER_REQUIREMENTS)[modalTier]?.difficulty : 1}/9
                </Text>
              </View>
            </View>

            {/* Requirements Section */}
            <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
              <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>REQUIREMENTS</Text>
              <Text style={[styles.modalDesc, { color: theme.text.secondary }]}>
                {modalTier !== null ? (category === 'power' ? POWER_TIER_REQUIREMENTS : TIER_REQUIREMENTS)[modalTier]?.desc : 'Complete the trial to advance'}
              </Text>
            </View>

            {/* Trial Movements Preview */}
            {category === 'strength' && modalTier !== null && RITES_OF_PASSAGE[modalTier] && (
              <View style={[styles.modalSection, { borderColor: theme.card.border }]}>
                <Text style={[styles.modalSectionTitle, { color: theme.text.tertiary }]}>TRIAL MOVEMENTS</Text>
                <View style={styles.movementsList}>
                  {RITES_OF_PASSAGE[modalTier].movements.slice(0, 4).map((movement, idx) => (
                    <View key={idx} style={styles.movementItem}>
                      <View style={[styles.movementDot, { backgroundColor: theme.accent }]} />
                      <Text style={[styles.movementText, { color: theme.text.secondary }]}>
                        {movement.name}: {movement.reps}x
                      </Text>
                    </View>
                  ))}
                  {RITES_OF_PASSAGE[modalTier].movements.length > 4 && (
                    <Text style={[styles.moreText, { color: theme.text.tertiary }]}>
                      +{RITES_OF_PASSAGE[modalTier].movements.length - 4} more...
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* LEAP NOW Button - Only show if tier is not locked */}
            {modalTier !== null && modalTier <= activeCurrentTier && (
              <WarriorButton
                title="LEAP NOW"
                onPress={() => {
                  setShowTierModal(false);
                  if (category === 'power') {
                    if (onOpenPowerAssessment) onOpenPowerAssessment();
                  } else {
                    if (onStartTrial) onStartTrial(modalTier);
                  }
                }}
              />
            )}
          </View>
        </View>
      </Modal>

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
      {/* Global Well-Rounded Leaderboard Modal */}
      <Modal
        visible={showWRALeaderboard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowWRALeaderboard(false)}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.lbModalHeader}>
              <TouchableOpacity onPress={() => setShowWRALeaderboard(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={28} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.modalHeaderTitle}>
                <Text style={[styles.lbTitle, { color: theme.accent, textAlign: 'center' }]}>GLOBAL WELL-ROUNDED ELITE</Text>
                <Text style={[styles.lbSub, { textAlign: 'center', marginTop: 4 }]}>THE ULTIMATE VERSATILE WARRIOR</Text>
              </View>
            </View>

            {loadingLB ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                {wraLeaderboard.map((entry) => (
                  <View
                    key={entry.user_id}
                    style={[
                      styles.lbRow,
                      entry.is_current_user && { backgroundColor: `${theme.accent}20`, borderColor: theme.accent }
                    ]}
                  >
                    <View style={styles.lbRankBox}>
                      <Text style={[styles.lbRankText, { color: entry.rank <= 3 ? theme.accent : '#666' }]}>
                        #{entry.rank}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lbName, { color: '#FFF' }]}>
                        {entry.display_name?.toUpperCase()}
                      </Text>
                      <View style={styles.lbBreakdown}>
                        <View style={styles.lbBreakdownItem}>
                          <View style={[styles.lbDot, { backgroundColor: '#9FC5E8' }]} />
                          <Text style={styles.lbBreakdownText}>{entry.static_pts}S</Text>
                        </View>
                        <View style={styles.lbBreakdownItem}>
                          <View style={[styles.lbDot, { backgroundColor: '#FF5722' }]} />
                          <Text style={styles.lbBreakdownText}>{entry.power_pts}P</Text>
                        </View>
                        <View style={styles.lbBreakdownItem}>
                          <View style={[styles.lbDot, { backgroundColor: '#4CAF50' }]} />
                          <Text style={styles.lbBreakdownText}>{entry.endurance_pts}E</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.lbScoreBox}>
                      <Text style={[styles.lbScoreText, { color: theme.accent }]}>{entry.total_score}</Text>
                      <Text style={styles.lbScoreLabel}>PTS</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>

      {/* Global Glory Leaderboard Modal */}
      <Modal
        visible={showGloryLeaderboard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGloryLeaderboard(false)}
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.9)' }]}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.lbModalHeader}>
              <TouchableOpacity onPress={() => setShowGloryLeaderboard(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={28} color="#FFF" />
              </TouchableOpacity>
              <View style={styles.modalHeaderTitle}>
                <Text style={[styles.lbTitle, { color: '#FF5252', textAlign: 'center' }]}>GLOBAL GLORY RANKINGS</Text>
                <Text style={[styles.lbSub, { textAlign: 'center', marginTop: 4 }]}>THE LEGENDS OF THE ARENA</Text>
              </View>
            </View>

            {loadingLB ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#FF5252" />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                {gloryLeaderboard.map((entry) => (
                  <View 
                    key={entry.user_id} 
                    style={[
                      styles.lbRow, 
                      entry.is_current_user && { backgroundColor: 'rgba(255, 82, 82, 0.2)', borderColor: '#FF5252' }
                    ]}
                  >
                    <View style={styles.lbRankBox}>
                      <Text style={[styles.lbRankText, { color: entry.rank <= 3 ? '#FF5252' : '#666' }]}>
                        #{entry.rank}
                      </Text>
                    </View>
                    
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.lbName, { color: '#FFF' }]}>
                        {entry.display_name?.toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.lbScoreBox}>
                      <Text style={[styles.lbScoreText, { color: '#FF5252' }]}>{entry.total_score}</Text>
                      <Text style={styles.lbScoreLabel}>GLORY</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </SafeAreaView>
        </View>
      </Modal>
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
    marginBottom: 16,
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
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
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
    gap: 8,
  },
  tierItem: {
    width: 80,
    height: 70,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  tierItemName: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  tierItemNumber: {
    fontSize: 10,
    fontFamily: 'PlusJakartaSans-Bold',
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
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
});
