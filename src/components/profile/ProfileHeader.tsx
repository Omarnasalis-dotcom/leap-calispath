import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { TIER_NAMES, POWER_TIER_NAMES } from '../../types';
import { SuggestedTestCard } from './SuggestedTestCard';
import { QuickStatsRow } from './QuickStatsRow';
import { CommunitySection } from './CommunitySection';
import { GlobalWellRoundedEntry } from '../../services/LeaderboardService';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { WORLD_THEMES, getWorldNeutrals, worldRgba } from '../../../constants/worldThemes';
import { clamp01 } from '../../lib/worldProgress';

const W = WORLD_THEMES.strength;

interface ProfileHeaderProps {
  scrollRef?: React.RefObject<ScrollView | null>;
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
  staticPbs: Record<string, number>;
  powerPbs: Record<string, number>;
  oneMMPbs: Record<string, number>;
  weeklyStats: { streakDays: number; pointsThisWeek: number; workoutsCompleted: number };
  onShowWarriorModal: () => void;
  onShowCoachPrompt: () => void;
  onOpenAdmin: () => void;
  onFetchWRALeaderboard: () => void;
  onFetchGloryLeaderboard: () => void;
  onOpenCoachingCenter?: () => void;
  onOpenWarriorProgram?: () => void;
  onOpenStaticWorld: () => void;
  onOpenPowerAssessment: () => void;
  onOpenOneMinMax: (category?: 'entry' | 'main' | 'advanced') => void;
}

/**
 * Tier-level ring badge (design handoff): N concentric rings where N equals
 * the tier level — recomputed from the live tier, never a fixed decoration
 * count. Rings space evenly from a 34px inner to a 73px outer radius, fade
 * from ~0.22 opacity innermost toward ~0.5, and the outermost ring is solid
 * full-opacity accent. Only the tier number sits inside.
 */
function TierRingBadge({ tierLevel }: { tierLevel: number }) {
  const OUTER_R = 73;
  const INNER_R = 34;
  const ringCount = Math.max(1, tierLevel);
  const rings = Array.from({ length: ringCount }, (_, i) => {
    const r = ringCount === 1 ? OUTER_R : INNER_R + (OUTER_R - INNER_R) * (i / (ringCount - 1));
    const isOutermost = i === ringCount - 1;
    // Tier 0 gets a single faint ring — an honest "nothing earned yet"
    // state rather than a solid outer ring it hasn't reached.
    const color = tierLevel === 0
      ? worldRgba(W.accent, 0.15)
      : isOutermost
        ? W.accent
        : worldRgba(W.accent, 0.22 + 0.28 * (i / Math.max(1, ringCount - 1)));
    return { r, color };
  });

  return (
    <View style={styles.ringBadge}>
      {rings.map((ring, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: ring.r * 2,
            height: ring.r * 2,
            borderRadius: ring.r,
            borderWidth: 1.5,
            borderColor: ring.color,
          }}
        />
      ))}
      <Text style={[styles.ringTierNumber, { color: W.accent }]}>{tierLevel}</Text>
    </View>
  );
}

export function ProfileHeader({
  scrollRef,
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
  staticPbs,
  powerPbs,
  oneMMPbs,
  weeklyStats,
  onShowWarriorModal,
  onShowCoachPrompt,
  onOpenAdmin,
  onFetchWRALeaderboard,
  onFetchGloryLeaderboard,
  onOpenCoachingCenter,
  onOpenWarriorProgram,
  onOpenStaticWorld,
  onOpenPowerAssessment,
  onOpenOneMinMax,
}: ProfileHeaderProps) {
  // useScreenMeasure=true: see useTutorialTarget's own comment — Android's
  // measureInWindow() under-reports these targets' y once scrollIntoView
  // has actually had to scroll the page (not a no-op at y=0), so pageX/pageY
  // is used instead for a position that's correct regardless of scroll state.
  const { ref: levelCircleRef, onLayout: onLevelCircleLayout } = useTutorialTarget('profile.levelCircle', scrollRef, true);
  const { ref: wraScoreBarRef, onLayout: onWraScoreBarLayout, reportInteraction: reportWraScoreBar } = useTutorialTarget('profile.wraScoreBar', scrollRef, true);
  const { ref: workoutProgramButtonRef, onLayout: onWorkoutProgramButtonLayout, reportInteraction: reportWorkoutProgramButton } = useTutorialTarget('profile.workoutProgramButton', scrollRef, true);

  const tierName = (category === 'strength' ? TIER_NAMES[activeCurrentTier] : POWER_TIER_NAMES[activeCurrentTier])?.toUpperCase() || 'UNKNOWN';
  const displayName = profile.first_name || profile.last_name
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').toUpperCase()
    : 'WARRIOR';
  const wraPct = clamp01(wraScore / WRA_MAX) * 100;
  const neutrals = getWorldNeutrals(mode);
  const subtleOverlay = mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <>
      {/* Admin shield - Top Left */}
      <View style={{ position: 'absolute', top: 12, left: 12, zIndex: 100, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {profile?.is_admin && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onOpenAdmin}
            style={{
              width: 24,
              height: 24,
              borderRadius: 4,
              backgroundColor: worldRgba(W.accent, 0.13),
              borderColor: worldRgba(W.accent, 0.25),
              borderWidth: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <MaterialCommunityIcons name="shield-crown" size={12} color={W.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* Identity header (design handoff): centered avatar / name / tier
          line column. The settings gear sits outside this block, absolutely
          positioned by ProfileScreen, so the column stays truly centered. */}
      <View style={styles.identityHeader}>
        <Text style={[styles.name, { color: neutrals.textPrimary }]} numberOfLines={1}>{displayName}</Text>
        <Text style={[styles.tierLine, { color: W.accent }]}>
          {tierName} · TIER {activeCurrentTier} OF {category === 'strength' ? TIER_NAMES.length - 1 : POWER_TIER_NAMES.length - 1}
        </Text>

        {/* Tier-level ring badge — whole badge opens the warrior modal */}
        <TouchableOpacity
          ref={levelCircleRef}
          onLayout={onLevelCircleLayout}
          activeOpacity={0.7}
          onPress={onShowWarriorModal}
          style={{ marginTop: 22 }}
        >
          <TierRingBadge tierLevel={activeCurrentTier} />
        </TouchableOpacity>
      </View>

      {/* Well-Rounded Athlete achievement card */}
      <TouchableOpacity
        ref={wraScoreBarRef}
        onLayout={onWraScoreBarLayout}
        activeOpacity={0.8}
        onPress={() => {
          onFetchWRALeaderboard();
          reportWraScoreBar();
        }}
        style={[styles.wraCard, { borderColor: worldRgba(W.accent, 0.3), backgroundColor: worldRgba(W.accent, 0.05) }]}
      >
        <View style={styles.wraHeaderRow}>
          <MaterialCommunityIcons name="trophy-outline" size={16} color={W.accent} />
          <Text style={[styles.wraTitle, { color: neutrals.textPrimary }]}>Well-Rounded Athlete</Text>
          <Text style={[styles.wraTotal, { color: W.accent }]}>{wraScore.toFixed(2)}</Text>
        </View>
        <Text style={[styles.wraSubcaption, { color: neutrals.textMuted }]}>Static · Power · 1MM</Text>
        {/* Honest bar: width always computed from the real total — never a
            hard-coded full bar at 0 (the original app's recurring bug). */}
        <View style={[styles.wraTrack, { backgroundColor: subtleOverlay }]}>
          <View style={[styles.wraFill, { backgroundColor: W.accent, width: `${wraPct}%` }]} />
        </View>
        <View style={styles.wraLegend}>
          {[
            { label: 'Static', value: staticPts, color: WORLD_THEMES.static.accent },
            { label: 'Power', value: powerPts, color: WORLD_THEMES.power.accent },
            { label: '1MM', value: mmPts, color: WORLD_THEMES.onemm.accent },
          ].map((d) => (
            <View key={d.label} style={styles.wraLegendItem}>
              <View style={[styles.wraLegendDot, { backgroundColor: d.color }]} />
              <Text style={[styles.wraLegendValue, { color: neutrals.textPrimary }]}>{d.value.toFixed(2)}</Text>
              <Text style={[styles.wraLegendLabel, { color: neutrals.textSecondary }]}>{d.label}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>

      {/* Create / Join community actions */}
      {profile?.id && (
        <View style={{ marginHorizontal: 20 }}>
          <CommunitySection userId={profile.id} communityId={profile.community_id} scrollRef={scrollRef} />
        </View>
      )}

      <QuickStatsRow
        streakDays={weeklyStats.streakDays}
        pointsThisWeek={weeklyStats.pointsThisWeek}
        workoutsCompleted={weeklyStats.workoutsCompleted}
        theme={theme}
        firstTile={
          <SuggestedTestCard
            compact
            userId={profile?.id}
            staticPts={staticPts}
            powerPts={powerPts}
            mmPts={mmPts}
            strengthTier={profile?.strength_tier || 0}
            staticPbs={staticPbs}
            powerPbs={powerPbs}
            oneMMPbs={oneMMPbs}
            onOpenStatic={onOpenStaticWorld}
            onOpenPower={onOpenPowerAssessment}
            onOpenOneMinMax={onOpenOneMinMax}
            theme={theme}
          />
        }
      />

      {/* My Workout Program / Coaching Center — same tri-color gradient
          border used on the Warrior Program screen itself. */}
      {mode !== undefined && (
        <View style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 8 }}>
          {(profile?.is_coach || profile?.is_admin) ? (
            onOpenCoachingCenter && (
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.programGradient}
              >
                <TouchableOpacity
                  style={[styles.programButton, { backgroundColor: mode === 'dark' ? '#151515' : '#FFFFFF', borderWidth: 0 }]}
                  onPress={onOpenCoachingCenter}
                >
                  <MaterialCommunityIcons name="brain" size={16} color={W.accent} />
                  <Text style={[styles.programButtonText, { color: neutrals.textPrimary }]}>COACHING CENTER</Text>
                </TouchableOpacity>
              </LinearGradient>
            )
          ) : (
            onOpenWarriorProgram && (
              <LinearGradient
                colors={['#7E57C2', '#FF5252', '#FF7043']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.programGradient}
              >
                <TouchableOpacity
                  ref={workoutProgramButtonRef}
                  onLayout={onWorkoutProgramButtonLayout}
                  style={[styles.programButton, { backgroundColor: mode === 'dark' ? '#151515' : '#FFFFFF', borderWidth: 0 }]}
                  onPress={() => {
                    onOpenWarriorProgram();
                    reportWorkoutProgramButton();
                  }}
                >
                  <MaterialCommunityIcons name="calendar-check-outline" size={16} color={W.accent} />
                  <Text style={[styles.programButtonText, { color: neutrals.textPrimary }]}>MY WORKOUT PROGRAM</Text>
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
  identityHeader: {
    alignItems: 'center',
    paddingTop: 22,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  name: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 23,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  tierLine: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11.5,
    letterSpacing: 1.5,
    marginTop: 3,
  },
  ringBadge: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTierNumber: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 42,
  },
  wraCard: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  wraHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  wraTitle: {
    flex: 1,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15.5,
  },
  wraTotal: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 18,
  },
  wraSubcaption: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 10.5,
    marginLeft: 23,
    marginTop: 1,
  },
  wraTrack: {
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 13,
  },
  wraFill: {
    height: '100%',
    borderRadius: 999,
  },
  wraLegend: {
    flexDirection: 'row',
    gap: 17,
    marginTop: 11,
  },
  wraLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  wraLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  wraLegendValue: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 11,
  },
  wraLegendLabel: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 11,
  },
  programGradient: {
    padding: 1.2,
    borderRadius: 15,
  },
  programButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  programButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
    letterSpacing: 1,
  },
});
