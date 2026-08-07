import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TIER_NAMES } from '../../types';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { LeaderboardEntry } from '../../lib/leaderboard';
import { TierLeaderboardList } from './TierLeaderboardList';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { getWorldTheme, getWorldNeutrals } from '../../../constants/worldThemes';

interface TierRankData {
  rank: number | null;
  total: number;
  gap: string | null;
}

interface StrengthWorldViewProps {
  scrollRef?: React.RefObject<ScrollView | null>;
  profile: any;
  category: 'strength' | 'power';
  selectedTier: number;
  activeCurrentTier: number;
  isLocked: boolean;
  isLowerTier: boolean;
  tierName: string;
  tierRankData: TierRankData;
  isMuted: boolean;
  mode: 'light' | 'dark';
  theme: any;
  onStartTrial?: (tier?: number) => void;
  onOpenPowerAssessment?: () => void;
  onSignOut: () => void;
  onSetMuted: (muted: boolean) => void;
  onShowTierModal: (tier: number) => void;
  toggleTheme?: () => void;
  showSettingsFooter?: boolean;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardLoading: boolean;
  hasCommunity?: boolean;
  leaderboardScope?: 'public' | 'community';
  onLeaderboardScopeChange?: (scope: 'public' | 'community') => void;
}

export function StrengthWorldView({
  scrollRef,
  profile,
  category,
  selectedTier,
  activeCurrentTier,
  isLocked,
  isLowerTier,
  tierName,
  tierRankData,
  isMuted,
  mode,
  theme,
  onStartTrial,
  onOpenPowerAssessment,
  onSignOut,
  onSetMuted,
  onShowTierModal,
  toggleTheme,
  showSettingsFooter = true,
  leaderboardEntries,
  leaderboardLoading,
  hasCommunity,
  leaderboardScope,
  onLeaderboardScopeChange,
}: StrengthWorldViewProps) {
  const isDark = mode === 'dark';
  const W = getWorldTheme('strength', mode);
  const neutrals = getWorldNeutrals(mode);
  // useScreenMeasure=true: see useTutorialTarget's own comment.
  const { ref: trialButtonRef, onLayout: onTrialButtonLayout } = useTutorialTarget('strength.trialButton', scrollRef, true);
  return (
    <>


      {/* Next Challenge card (design handoff): caption + a headline stating
          the actual target + a 52px solid-accent CTA with dark text. */}
      {category === 'strength' && !isLocked && (
        <View style={[styles.challengeCard, { backgroundColor: W.cardFill, borderColor: W.cardBorder }]}>
          <Text style={[styles.challengeCaption, { color: neutrals.textCaption }]}>
            {isLowerTier ? 'PRACTICE MODE' : 'NEXT CHALLENGE'}
          </Text>
          <Text style={[styles.challengeHeadline, { color: neutrals.textPrimary }]}>
            {isLowerTier
              ? `Sharpen your ${TIER_NAMES[selectedTier]} time`
              : (profile?.strength_tier ?? 0) < 9
                ? `Complete the ${TIER_NAMES[profile?.strength_tier ?? 0]} trial to reach ${TIER_NAMES[(profile?.strength_tier ?? 0) + 1]}`
                : 'Defend your place in Eternity'}
          </Text>
          <TouchableOpacity
            ref={trialButtonRef}
            onLayout={onTrialButtonLayout}
            style={[
              styles.challengeCta,
              isLowerTier
                ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: W.accent }
                : { backgroundColor: W.accent },
            ]}
            onPress={() => onStartTrial && onStartTrial(isLowerTier ? selectedTier : undefined)}
          >
            <Text style={[styles.challengeCtaText, { color: isLowerTier ? W.accent : W.ctaText }]}>
              {isLowerTier
                ? `PRACTICE ${TIER_NAMES[selectedTier]?.toUpperCase()}`
                : `START ${TIER_NAMES[profile?.strength_tier ?? 0]?.toUpperCase()} TRIAL`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TierLeaderboardList
        scrollRef={scrollRef}
        entries={leaderboardEntries}
        category={category}
        currentUserId={profile?.id}
        loading={leaderboardLoading}
        theme={theme}
        hasCommunity={hasCommunity}
        leaderboardScope={leaderboardScope}
        onLeaderboardScopeChange={onLeaderboardScopeChange}
      />

      {/* Action Buttons */}
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
        {isLocked && (
          <View style={[styles.lockedIndicator, { backgroundColor: theme.card.background, borderColor: theme.card.border, marginHorizontal: 16, marginTop: 8 }]}>
            <Text style={[styles.lockedIndicatorText, { color: theme.text.tertiary }]}>
              🔒 Complete {category.toUpperCase()} Tier {activeCurrentTier} to unlock this tier
            </Text>
          </View>
        )}
      </View>

      {/* Sound Toggle and Sign Out */}
      {showSettingsFooter && (
        <View style={{ paddingHorizontal: 16, gap: 12, marginBottom: 30 }}>
          <TouchableOpacity
            style={styles.signOutButtonSmall}
            onPress={() => {
              const next = !isMuted;
              onSetMuted(next);
              SoundService.setMuted(next);
            }}
          >
            <MaterialCommunityIcons name={isMuted ? "volume-off" : "volume-high"} size={16} color={theme.text.tertiary} />
            <Text style={[styles.signOutTextSmall, { color: theme.text.tertiary }]}>
              ARENA SOUNDS: {isMuted ? 'MUTED' : 'ENABLED'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.signOutButtonSmall} onPress={onSignOut}>
            <MaterialCommunityIcons name="logout" size={16} color={theme.text.tertiary} />
            <Text style={[styles.signOutTextSmall, { color: theme.text.tertiary }]}>
              LEAVE THE ARENA
            </Text>
          </TouchableOpacity>

          {/* Theme Toggle Row */}
          <TouchableOpacity
            style={[styles.signOutButtonSmall, { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center' }]}
            onPress={toggleTheme}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="theme-light-dark" size={16} color={theme.text.tertiary} />
              <Text style={[styles.signOutTextSmall, { color: theme.text.tertiary }]}>
                DARK MODE
              </Text>
            </View>
            <MaterialCommunityIcons
              name={isDark ? "toggle-switch" : "toggle-switch-off"}
              size={24}
              color={isDark ? theme.accent : theme.text.tertiary}
              style={{ marginTop: -2 }}
            />
          </TouchableOpacity>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  nextStepBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  nextStepPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  nextStepContent: {
    flex: 1,
  },
  nextStepLabel: {
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 4,
  },
  nextStepTitle: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    marginBottom: 2,
  },
  nextStepSubtitle: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-Regular',
  },
  nextStepArrow: {
    fontSize: 20,
    fontWeight: '900',
  },
  cardLeaderboardTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  cardLeaderboardText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  primaryActionButton: {
    width: '100%',
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  challengeCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 20,
    gap: 6,
  },
  challengeCaption: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
    letterSpacing: 2,
  },
  challengeHeadline: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 19,
  },
  challengeCta: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  challengeCtaText: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
    letterSpacing: 1.5,
  },
  primaryActionButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#000',
    letterSpacing: 2,
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  lockedIndicator: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  lockedIndicatorText: {
    fontSize: 11,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-Regular',
  },
  signOutButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  signOutTextSmall: {
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
