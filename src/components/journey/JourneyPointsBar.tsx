import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { PointsOdometer } from './PointsOdometer';
import { TodayMedallion } from './TodayMedallion';
import { JourneyBadge } from './badges/JourneyBadge';
import { StreakStrip } from './StreakStrip';
import { JourneyPointsSummary } from '../../lib/journeyPoints';
import { ltr, t } from '../../i18n';

// Handoff top bar (60pt, pinned over the Journey path): points counter |
// today medallion (hangs ~18pt below the bar) | 7-day streak strip.
// Mirrors in Arabic with the rest of the layout.

export const POINTS_BAR_HEIGHT = 60;

interface JourneyPointsBarProps {
  summary: JourneyPointsSummary;
  /** The counter's value — lags summary.total while a reward is flying in. */
  displayTotal: number;
  segments: boolean[];
  isLight: boolean;
  onOpenHistory: () => void;
  onOpenTasks: () => void;
  /** The counter, for the reward FX to fly to. */
  counterRef?: React.Ref<View>;
  /** Changes whenever points land — the number pops (1 → 1.28 → 1). */
  popSignal?: number;
  /** Dev builds only: preview the reward FX. */
  onLongPressMedallion?: () => void;
  /** Journey achievements: your badge (0 = none yet) and this week's community rank. */
  badgeLevel?: number;
  communityRank?: number | null;
  /** Opens your badge + the community leaderboard. Without it no badge shows. */
  onOpenAchievements?: () => void;
}

/** Your badge with a small coral "#rank" tag when you're ranked in your community this week. */
function TopBarBadge({ level, rank, isLight, onPress }: { level: number; rank: number | null | undefined; isLight: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('journeyAchievements.openA11y')}
      style={styles.badge}
    >
      <JourneyBadge level={level} size={32} simple slotColor={isLight ? '#a8a2a0' : '#5a5a5a'} />
      {rank != null && (
        <View style={styles.rankPip}>
          <Text style={styles.rankPipText}>{ltr(rank > 99 ? '99+' : `#${rank}`)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function JourneyPointsBar({
  summary,
  displayTotal,
  segments,
  isLight,
  onOpenHistory,
  onOpenTasks,
  counterRef,
  popSignal = 0,
  onLongPressMedallion,
  badgeLevel = 0,
  communityRank,
  onOpenAchievements,
}: JourneyPointsBarProps) {
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!popSignal) return;
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.28, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(pop, { toValue: 1, duration: 240, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [popSignal, pop]);
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <BlurView
        intensity={40}
        tint={isLight ? 'light' : 'dark'}
        style={[StyleSheet.absoluteFill, { backgroundColor: isLight ? 'rgba(255,255,255,0.88)' : 'rgba(10,10,10,0.88)' }]}
      />
      <View style={[styles.border, { backgroundColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)' }]} />

      <View style={[styles.side, styles.sideStart]}>
        {onOpenAchievements && (
          <TopBarBadge level={badgeLevel} rank={communityRank} isLight={isLight} onPress={onOpenAchievements} />
        )}
        <TouchableOpacity
          onPress={onOpenHistory}
          // Dev builds only: the Journey achievements badge gallery.
          onLongPress={__DEV__ ? () => router.push('/dev-badges') : undefined}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('journeyPoints.totalA11y', { count: summary.total })}
        >
          <View ref={counterRef} collapsable={false} style={styles.counter}>
            <View style={styles.counterLabelRow}>
              <MaterialCommunityIcons name="lightning-bolt" size={12} color="#FF5A55" />
              <Text style={styles.counterLabel}>{t('journeyPoints.points')}</Text>
            </View>
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <PointsOdometer value={displayTotal} color={isLight ? '#151515' : '#FFFFFF'} />
            </Animated.View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.center}>
        <TodayMedallion segments={segments} isLight={isLight} onPress={onOpenTasks} onLongPress={onLongPressMedallion} />
      </View>

      <View style={[styles.side, styles.sideEnd]}>
        <StreakStrip
          week={summary.week}
          today={summary.today}
          streak={summary.streak}
          isLight={isLight}
          onPress={onOpenHistory}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: POINTS_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 25,
  },
  border: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1 },
  side: { flex: 1, alignItems: 'flex-start' },
  sideEnd: { alignItems: 'flex-end' },
  sideStart: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  rankPip: {
    position: 'absolute', right: -6, bottom: -3, minWidth: 20, height: 15, paddingHorizontal: 4,
    borderRadius: 8, backgroundColor: '#FC5454', alignItems: 'center', justifyContent: 'center',
  },
  rankPipText: { fontFamily: 'Oswald-Bold', fontSize: 9.5, color: '#ffffff', includeFontPadding: false },
  // The medallion hangs below the bar (handoff: top margin 6 in a 60pt bar).
  center: { width: 76, alignSelf: 'flex-start', marginTop: 6, alignItems: 'center' },
  counter: { alignItems: 'flex-start' },
  counterLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  counterLabel: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 9, letterSpacing: 2, color: '#8A8A8E' },
});
