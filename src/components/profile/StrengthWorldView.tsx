import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { TIER_NAMES } from '../../types';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { LeaderboardEntry } from '../../lib/leaderboard';
import { TierLeaderboardList } from './TierLeaderboardList';

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
  onSignOut: () => void;
  onSetMuted: (muted: boolean) => void;
  onShowTierModal: (tier: number) => void;
  toggleTheme?: () => void;
  showSettingsFooter?: boolean;
  leaderboardEntries: LeaderboardEntry[];
  leaderboardLoading: boolean;
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
  onSignOut,
  onSetMuted,
  onShowTierModal,
  toggleTheme,
  showSettingsFooter = true,
  leaderboardEntries,
  leaderboardLoading,
}: StrengthWorldViewProps) {
  const isDark = mode === 'dark';
  return (
    <>


      {/* Primary Action Button */}
      {category === 'strength' && !isLocked && (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ color: '#888', fontSize: 10, fontWeight: '700', letterSpacing: 2, textAlign: 'center', marginBottom: 8 }}>
            {isLowerTier ? 'PRACTICE MODE' : 'NEXT CHALLENGE'}
          </Text>
          <TouchableOpacity
            style={[styles.primaryActionButton, { backgroundColor: isLowerTier ? 'transparent' : theme.accent, borderWidth: isLowerTier ? 1 : 0, borderColor: theme.accent }]}
            onPress={() => onStartTrial && onStartTrial(isLowerTier ? selectedTier : undefined)}
          >
            <Text style={[styles.primaryActionButtonText, { color: isLowerTier ? theme.accent : '#000' }]}>
              {isLowerTier
                ? `PRACTICE ${TIER_NAMES[selectedTier]?.toUpperCase()}`
                : `START ${TIER_NAMES[profile?.strength_tier ?? 0]?.toUpperCase()} TRIAL`}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {category === 'strength' && (
        <TierLeaderboardList
          entries={leaderboardEntries}
          currentUserId={profile?.id}
          loading={leaderboardLoading}
          theme={theme}
        />
      )}

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
