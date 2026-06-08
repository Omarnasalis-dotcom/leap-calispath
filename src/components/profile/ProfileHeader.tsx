import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TIER_NAMES, POWER_TIER_NAMES } from '../../types';
import { ScoreBar } from './ScoreBar';
import { GlobalWellRoundedEntry } from '../../services/LeaderboardService';

interface ProfileHeaderProps {
  profile: any;
  category: 'strength' | 'power';
  activeCurrentTier: number;
  mode: 'light' | 'dark';
  theme: any;
  wraScore: number;
  staticPts: number;
  powerPts: number;
  mmPts: number;
  gloryPts: number;
  WRA_MAX: number;
  GLORY_MAX: number;
  onShowWarriorModal: () => void;
  onShowCoachPrompt: () => void;
  onOpenAdmin: () => void;
  onFetchWRALeaderboard: () => void;
  onFetchGloryLeaderboard: () => void;
  onOpenCoachingCenter?: () => void;
  onOpenWarriorProgram?: () => void;
}

export function ProfileHeader({
  profile,
  category,
  activeCurrentTier,
  mode,
  theme,
  wraScore,
  staticPts,
  powerPts,
  mmPts,
  gloryPts,
  WRA_MAX,
  GLORY_MAX,
  onShowWarriorModal,
  onShowCoachPrompt,
  onOpenAdmin,
  onFetchWRALeaderboard,
  onFetchGloryLeaderboard,
  onOpenCoachingCenter,
  onOpenWarriorProgram,
}: ProfileHeaderProps) {
  return (
    <>
      {/* Coach + Admin Buttons - Grouped Top Left */}
      <View style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>


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

      {/* Access Status - Upper Center */}
      <View style={{ position: 'absolute', top: 16, left: 0, right: 0, zIndex: 100, alignItems: 'center', pointerEvents: 'none' }}>
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

      {/* Avatar + Name + Tier */}
      <View style={styles.header}>
        <View style={styles.avatarSection}>
          {/* Display Name */}
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

          {/* Concentric Rings Avatar */}
          <TouchableOpacity
            style={styles.avatarWrapper}
            activeOpacity={0.7}
            onPress={onShowWarriorModal}
          >
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
            <View style={styles.concentricCenter}>
              <Text style={[styles.arcTierNumber, { color: theme.accent, fontSize: 42 }]}>
                {activeCurrentTier}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Tier name + progress */}
          <Text style={[styles.arcTierName, { color: theme.accent }]}>
            {(category === 'strength' ? TIER_NAMES[activeCurrentTier] : POWER_TIER_NAMES[activeCurrentTier])?.toUpperCase() || 'UNKNOWN'}
          </Text>
          <Text style={[styles.arcTierProgress, { color: theme.text.tertiary }]}>
            {activeCurrentTier >= 9 ? 'Maximum rank — Eternity' : `Tier ${activeCurrentTier} of 9`}
          </Text>

          {/* Score Bars */}
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
              onPress={onFetchWRALeaderboard}
              showCrown={wraScore > 0}
              mode={mode}
              cardBackground={theme.card.background}
              chips={[
                { label: 'Static', value: staticPts, color: '#9FC5E8' },
                { label: 'Power', value: powerPts, color: '#FF5722' },
                { label: '1MM', value: mmPts, color: '#4CAF50' },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Coaching / Warrior Program Button */}
      {mode !== undefined && (
        <View style={{ width: '92%', alignSelf: 'center', marginTop: 16, marginBottom: 8 }}>
          {(profile?.is_coach || profile?.is_admin) ? (
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
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 24,
    paddingTop: 36,
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
  concentricRing: {
    position: 'absolute',
  },
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
  arcTierNumber: {
    fontSize: 30,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    lineHeight: 48,
  },
  profileNameHeader: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 3,
    marginBottom: 20,
    textAlign: 'center',
  },
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
  rightStatsColumn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignSelf: 'center',
  },
});
