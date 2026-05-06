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
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { TIER_NAMES, POWER_TIER_NAMES } from '../types';
import { POWER_TIER_DESCRIPTIONS } from '../lib/tierDescriptions';
import { formatTime, RITES_OF_PASSAGE } from '../lib/trials';
import { WarriorButton } from '../components/atoms/WarriorButton';
import { WarriorCard } from '../components/atoms/WarriorCard';

import { getTierLeaderboard } from '../lib/leaderboard';
import { isPowerWorldUnlocked } from '../lib/powerLogic';
import { isStaticWorldUnlocked } from '../lib/staticLogic';
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
  initialCategory = 'strength',
  initialTier = 0,
}: ProfileScreenProps) {
  const { profile, signOut, user } = useAuth();
  const { theme } = useTheme();
  const [selectedTier, setSelectedTier] = useState(profile?.strength_tier || 0);
  const [leaderboardBestTime, setLeaderboardBestTime] = useState<number | null>(null);
  const [category, setCategory] = useState<'strength' | 'power'>(initialCategory);
  const [isSwitchingWorld, setIsSwitchingWorld] = useState(false);
  const [showLevelReveal, setShowLevelReveal] = useState(false);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalTier, setModalTier] = useState<number | null>(null);

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

    setIsSwitchingWorld(true);
    setShowLevelReveal(true);

    // Simulate world transition delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    setCategory(newCategory);
    setSelectedTier(newCategory === 'strength'
      ? (profile?.strength_tier || 0)
      : (profile?.power_tier || 0)
    );

    setShowLevelReveal(false);
    setIsSwitchingWorld(false);
  };



  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  if (!profile) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background.primary }]}>
      <ScrollView>
        <View style={styles.header}>
          {/* User Avatar with Tier Info */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrapper}>
              <View style={[styles.avatarContainer, { borderColor: theme.accent }]}>
                <Text style={[styles.avatarInitial, { color: theme.accent }]}>
                  {profile.display_name ? profile.display_name[0].toUpperCase() : profile.email[0].toUpperCase()}
                </Text>
              </View>

              {/* Tier Orbit Ring */}
              <View style={[styles.orbitRing, { borderColor: theme.accent }]} />

              {/* Tier Level Indicator */}
              <View style={[styles.tierLevelBadge, { backgroundColor: theme.accent }]}>
                <Text style={styles.tierLevelText}>{activeCurrentTier}</Text>
              </View>

              {/* Glowing Tier Dots around the border */}
              {Array.from({ length: Math.min(activeCurrentTier + 1, 9) }).map((_, i) => {
                const totalDots = Math.min(activeCurrentTier + 1, 9);
                const angle = (i * (360 / totalDots)) - 90;
                const radius = 38;
                const x = radius * Math.cos(angle * (Math.PI / 180));
                const y = radius * Math.sin(angle * (Math.PI / 180));

                return (
                  <View
                    key={i}
                    style={[
                      styles.avatarTierDot,
                      {
                        backgroundColor: theme.accent,
                        shadowColor: theme.accent,
                        transform: [
                          { translateX: x },
                          { translateY: y },
                        ]
                      }
                    ]}
                  />
                );
              })}
            </View>

            {/* Name Frame */}
            <View style={[styles.nameFrame, { borderColor: theme.accent }]}>
              <Text style={[styles.avatarNameMain, { color: theme.accent }]}>
                {profile.display_name?.toUpperCase() || 'WARRIOR'}
              </Text>
            </View>

            <Text style={[styles.avatarTierMain, { color: theme.text.secondary }]}>
              {TIER_NAMES[activeCurrentTier].toUpperCase()} • TIER {activeCurrentTier}
            </Text>
          </View>
        </View>

        {/* World Selector - Pill Style */}
        <View style={styles.worldSelectorContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.worldSelectorScrollContent}
          >
            <View style={styles.worldSelector}>
              {/* Strength World Pill */}
              <TouchableOpacity
                disabled={isSwitchingWorld}
                style={[
                  styles.worldPill,
                  category === 'strength' && { backgroundColor: theme.accent, borderColor: theme.accent }
                ]}
                onPress={() => handleCategorySwitch('strength')}
              >
                <Text style={[
                  styles.worldIcon,
                  category === 'strength' ? { color: '#000' } : { color: theme.text.secondary }
                ]}>⚔️</Text>
                <Text style={[
                  styles.worldText,
                  category === 'strength' ? { color: '#000', fontWeight: '900' } : { color: theme.text.secondary }
                ]}>STRENGTH</Text>
              </TouchableOpacity>

              {/* Power World Pill */}
              <TouchableOpacity
                disabled={!isPowerUnlocked || isSwitchingWorld}
                style={[
                  styles.worldPill,
                  category === 'power' && { backgroundColor: theme.accent, borderColor: theme.accent },
                  !isPowerUnlocked && { opacity: 0.4 }
                ]}
                onPress={() => handleCategorySwitch('power')}
              >
                <Text style={[
                  styles.worldIcon,
                  category === 'power' ? { color: '#000' } : { color: theme.text.secondary }
                ]}>⚡</Text>
                <Text style={[
                  styles.worldText,
                  category === 'power' ? { color: '#000', fontWeight: '900' } : { color: theme.text.secondary }
                ]}>POWER</Text>
                {!isPowerUnlocked && (
                  <View style={styles.worldLockBadge}>
                    <Text style={styles.worldLockIcon}>🔒</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Static World Pill */}
              <TouchableOpacity
                disabled={!isStaticUnlocked || isSwitchingWorld}
                style={[
                  styles.worldPill,
                  !isStaticUnlocked && { opacity: 0.4 }
                ]}
                onPress={onOpenStaticWorld}
              >
                <Text style={[
                  styles.worldIcon,
                  { color: theme.text.secondary }
                ]}>🧊</Text>
                <Text style={[
                  styles.worldText,
                  { color: theme.text.secondary }
                ]}>STATIC</Text>
                {!isStaticUnlocked && (
                  <View style={styles.worldLockBadge}>
                    <Text style={styles.worldLockIcon}>🔒</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Champions Arena Pill */}
              <TouchableOpacity
                style={[
                  styles.worldPill,
                  profile?.strength_tier < 8 && { opacity: 0.4 }
                ]}
                onPress={onOpenChampionsArena}
              >
                <Text style={[
                  styles.worldIcon,
                  { color: theme.text.secondary }
                ]}>🏛️</Text>
                <Text style={[
                  styles.worldText,
                  { color: theme.text.secondary }
                ]}>CHAMPIONS</Text>
                {profile?.strength_tier < 8 && (
                  <View style={styles.worldLockBadge}>
                    <Text style={styles.worldLockIcon}>🔒</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Online Clash Pill - Fire Style */}
              <TouchableOpacity
                style={[
                  styles.worldPill,
                  profile?.strength_tier < 2 && { opacity: 0.4 }
                ]}
                onPress={() => {
                  console.log('CLASH_BUTTON_PRESSED');
                  if (onOpenClash) onOpenClash();
                }}
              >
                <Text style={[
                  styles.worldIcon,
                  { color: theme.text.secondary }
                ]}>🔥</Text>
                <Text style={[
                  styles.worldText,
                  { color: theme.text.secondary }
                ]}>CLASH</Text>
                {profile?.strength_tier < 2 && (
                  <View style={styles.worldLockBadge}>
                    <Text style={styles.worldLockIcon}>🔒</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Weekly Challenge Pill */}
              <TouchableOpacity
                style={styles.worldPill}
                onPress={onOpenWeeklyChallenge}
              >
                <Text style={[
                  styles.worldIcon,
                  { color: theme.text.secondary }
                ]}>🏆</Text>
                <Text style={[
                  styles.worldText,
                  { color: theme.text.secondary }
                ]}>WEEKLY</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Unlock hint below selector */}
          {!isPowerUnlocked && (
            <Text style={[styles.worldUnlockHint, { color: theme.text.tertiary }]}>
              🔒 Reach Platinum-Heart to unlock Power World
            </Text>
          )}
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
  },
  avatarWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: 80,
    height: 80,
    marginBottom: 8,
  },
  avatarContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  orbitRing: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.3,
  },
  tierLevelBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  tierLevelText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  avatarTierDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
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
  worldSelectorContainer: {
    width: '100%',
    marginBottom: 20,
  },
  worldSelectorScrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    minWidth: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  worldSelector: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 28,
    gap: 4,
  },
  worldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    marginRight: 10,
  },
  worldIcon: {
    fontSize: 16,
  },
  worldText: {
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  worldLockBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#333',
  },
  worldLockIcon: {
    fontSize: 10,
  },
  worldUnlockHint: {
    fontSize: 10,
    marginTop: 8,
    fontFamily: 'PlusJakartaSans-Regular',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierSelectorSection: {
    marginTop: 16,
    marginBottom: 16,
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
});
