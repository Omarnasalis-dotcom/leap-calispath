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
import { ActiveProgramCard } from './ActiveProgramCard';
import { CommunitySection } from './CommunitySection';
import { GlobalWellRoundedEntry } from '../../services/LeaderboardService';
import { useTutorialTarget } from '../../hooks/useTutorialTarget';
import { WORLD_THEMES, getWorldNeutrals, worldRgba } from '../../../constants/worldThemes';
import { clamp01 } from '../../lib/worldProgress';
import { ActiveProgramSummary } from '../../lib/activeProgramSummary';
import { getSubscriptionTier, hasExpiredSubscription, SubscriptionTier } from '../../lib/entitlement';

const SUBSCRIPTION_TIER_COLORS: Record<SubscriptionTier, string> = {
  free: '#8a8a8a',
  first: '#C9A227',
  pro: '#FC5454',
  max: '#a479e2',
};

// Distinct from SUBSCRIPTION_TIER_COLORS.free — a lapsed subscriber reads
// the badge as "you had access, it ran out" rather than "you never had it",
// same reasoning as hasExpiredSubscription's own doc comment.
const EXPIRED_BADGE_COLOR = '#a1584a';

const W = WORLD_THEMES.strength;

interface ProfileHeaderProps {
  scrollRef?: React.RefObject<ScrollView | null>;
  profile: any;
  paywallEnabled: boolean;
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
  /** undefined = still loading, null = no active program. */
  activeProgram: ActiveProgramSummary | null | undefined;
  onOpenActiveWorkout: () => void;
  onCreateProgram: () => void;
  onShowWarriorModal: () => void;
  onOpenAdmin: () => void;
  onOpenPaywall: () => void;
  onFetchWRALeaderboard: () => void;
  onFetchGloryLeaderboard: () => void;
  onOpenCoachingCenter?: () => void;
}

/**
 * Tier-level ring badge (design handoff): N concentric rings where N equals
 * the tier level — recomputed from the live tier, never a fixed decoration
 * count. Rings space evenly from a 34px inner to a 73px outer radius, fade
 * from ~0.22 opacity innermost toward ~0.5, and the outermost ring is solid
 * full-opacity accent. Only the tier number sits inside.
 */
function TierRingBadge({ tierLevel }: { tierLevel: number }) {
  const OUTER_R = 64;
  const INNER_R = 30;
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
  paywallEnabled,
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
  activeProgram,
  onOpenActiveWorkout,
  onCreateProgram,
  onShowWarriorModal,
  onOpenAdmin,
  onOpenPaywall,
  onFetchWRALeaderboard,
  onFetchGloryLeaderboard,
  onOpenCoachingCenter,
}: ProfileHeaderProps) {
  // useScreenMeasure=true: see useTutorialTarget's own comment — Android's
  // measureInWindow() under-reports these targets' y once scrollIntoView
  // has actually had to scroll the page (not a no-op at y=0), so pageX/pageY
  // is used instead for a position that's correct regardless of scroll state.
  const { ref: levelCircleRef, onLayout: onLevelCircleLayout } = useTutorialTarget('profile.levelCircle', scrollRef, true);
  const { ref: wraScoreBarRef, onLayout: onWraScoreBarLayout, reportInteraction: reportWraScoreBar } = useTutorialTarget('profile.wraScoreBar', scrollRef, true);

  const tierName = (category === 'strength' ? TIER_NAMES[activeCurrentTier] : POWER_TIER_NAMES[activeCurrentTier])?.toUpperCase() || 'UNKNOWN';
  const displayName = profile.first_name || profile.last_name
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').toUpperCase()
    : 'WARRIOR';
  const subscriptionTier = getSubscriptionTier(profile, paywallEnabled);
  const isExpiredSubscriber = hasExpiredSubscription(profile, paywallEnabled);
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
        {/* Badge + upgrade chip together, above the name, both sized down —
            a small row of "status" info sitting above the name rather than
            sharing a row with it. */}
        <View style={styles.tierBadgeRow}>
          <TouchableOpacity
            activeOpacity={subscriptionTier === 'max' ? 1 : 0.7}
            disabled={subscriptionTier === 'max'}
            onPress={onOpenPaywall}
            style={[
              styles.subscriptionBadge,
              { backgroundColor: isExpiredSubscriber ? EXPIRED_BADGE_COLOR : SUBSCRIPTION_TIER_COLORS[subscriptionTier] },
            ]}
          >
            <Text style={styles.subscriptionBadgeText}>{isExpiredSubscriber ? 'EXPIRED' : subscriptionTier.toUpperCase()}</Text>
          </TouchableOpacity>

          {/* Only makes sense while "Pro" is actually an upgrade — hidden
              once already Pro or Max, same tier the label names. Outlined
              chip (no fill) rather than a second gradient block next to the
              badge — the one accent color (coral) plus a crown icon reads
              as "there's an upgrade here" without competing for attention. */}
          {(subscriptionTier === 'free' || subscriptionTier === 'first') && (
            <TouchableOpacity activeOpacity={0.7} onPress={onOpenPaywall} style={styles.upgradePill}>
              <MaterialCommunityIcons name="crown-outline" size={9} color="#FC5454" />
              <Text style={styles.upgradePillText}>{isExpiredSubscriber ? 'RENEW' : 'UPGRADE'}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.name, { color: neutrals.textPrimary }]} numberOfLines={1}>{displayName}</Text>

        {/* Tier-level ring badge — whole badge opens the warrior modal */}
        <TouchableOpacity
          ref={levelCircleRef}
          onLayout={onLevelCircleLayout}
          activeOpacity={0.7}
          onPress={onShowWarriorModal}
          style={{ marginTop: 10 }}
        >
          <TierRingBadge tierLevel={activeCurrentTier} />
        </TouchableOpacity>

        <Text style={[styles.tierLine, { color: W.accent, marginTop: 8 }]}>
          {tierName} · TIER {activeCurrentTier} OF {category === 'strength' ? TIER_NAMES.length - 1 : POWER_TIER_NAMES.length - 1}
        </Text>
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
          <MaterialCommunityIcons name="trophy-outline" size={14} color={W.accent} />
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

      {/* Active program "up next" + continue — Profile's one training entry
          point now that the TRAIN tab owns the Training Center hub. Hidden
          until the lookup resolves so a slow fetch never flashes the
          no-program CTA at someone who has a program. */}
      {activeProgram !== undefined && (
        <View style={{ marginHorizontal: 20, marginTop: 14 }}>
          <ActiveProgramCard
            hasActiveProgram={activeProgram !== null}
            nextUpDayName={activeProgram?.nextUpDayName ?? null}
            onContinue={onOpenActiveWorkout}
            onCreateProgram={onCreateProgram}
          />
        </View>
      )}

      {/* Coaching Center — coaches/admins only, same tri-color gradient
          border used on the Warrior Program screen itself. */}
      {(profile?.is_coach || profile?.is_admin) && onOpenCoachingCenter && (
        <View style={{ marginHorizontal: 20, marginTop: 16, marginBottom: 8 }}>
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
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  identityHeader: {
    alignItems: 'center',
    paddingTop: 18,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  name: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 21,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 5,
  },
  tierBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  subscriptionBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  subscriptionBadgeText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: '#000',
  },
  upgradePill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 18,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(252,84,84,0.5)',
  },
  upgradePillText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9.5,
    letterSpacing: 0.3,
    color: '#FC5454',
  },
  tierLine: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 10.5,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  ringBadge: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTierNumber: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 37,
  },
  wraCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  wraHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  wraTitle: {
    flex: 1,
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 14,
  },
  wraTotal: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 16,
  },
  wraSubcaption: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 9.5,
    marginLeft: 21,
    marginTop: 1,
  },
  wraTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },
  wraFill: {
    height: '100%',
    borderRadius: 999,
  },
  wraLegend: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 9,
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
    fontSize: 10,
  },
  wraLegendLabel: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 10,
  },
  programGradient: {
    padding: 1.5,
    borderRadius: 15,
  },
  programButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  programButtonText: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 15,
    letterSpacing: 1.8,
  },
});
