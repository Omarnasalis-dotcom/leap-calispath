import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WarriorCard } from '../atoms/WarriorCard';
import { TIER_NAMES, POWER_TIER_NAMES } from '../../types';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';

interface TierRankData {
  rank: number | null;
  total: number;
  gap: string | null;
}

interface StrengthWorldViewProps {
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
  onViewLeaderboards?: (category: 'strength' | 'power', tier: number) => void;
  onSignOut: () => void;
  onSetMuted: (muted: boolean) => void;
  onShowTierModal: (tier: number) => void;
  toggleTheme?: () => void;
}

export function StrengthWorldView({
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
  onViewLeaderboards,
  onSignOut,
  onSetMuted,
  onShowTierModal,
  toggleTheme,
}: StrengthWorldViewProps) {
  const isDark = mode === 'dark';
  return (
    <>
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

      {/* Selected Tier Card */}
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
            {tierRankData.total === 0 && (
              <Text style={{ color: theme.text.tertiary, fontSize: 9, textAlign: 'center', marginTop: 2 }}>
                NO ENTRIES YET
              </Text>
            )}
          </View>

          {/* Center Circle: Main Tier */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onShowTierModal(selectedTier)}
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

        {/* Progress Bar */}
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
              <View style={{
                height: '100%',
                backgroundColor: theme.accent,
                width: `${((profile?.strength_tier ?? 0) / 9) * 100}%`
              }} />
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
        {isLocked && (
          <View style={[styles.lockedIndicator, { backgroundColor: theme.card.background, borderColor: theme.card.border, marginHorizontal: 16, marginTop: 8 }]}>
            <Text style={[styles.lockedIndicatorText, { color: theme.text.tertiary }]}>
              🔒 Complete {category.toUpperCase()} Tier {activeCurrentTier} to unlock this tier
            </Text>
          </View>
        )}
      </View>

      {/* Sound Toggle and Sign Out */}
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
  modernTierCard: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  tierCirclesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tierCircleSmall: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierCircleLarge: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierCircleLabel: {
    fontSize: 8,
    letterSpacing: 1,
    fontFamily: 'PlusJakartaSans-Bold',
    marginBottom: 2,
  },
  tierCircleValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  tierCircleSubValue: {
    fontSize: 8,
    letterSpacing: 0.5,
    fontFamily: 'PlusJakartaSans-Bold',
  },
  tierLargeName: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
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
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
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
