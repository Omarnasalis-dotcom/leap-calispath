import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WORLD_THEMES, getWorldNeutrals, worldRgba } from '../../../constants/worldThemes';
import { useTheme } from '../../contexts/ThemeContext';

interface QuickStatsRowProps {
  streakDays: number;
  pointsThisWeek: number;
  workoutsCompleted: number;
  theme: any;
  // Replaces the first tile with arbitrary content (same flex:1 slot) —
  // used to fit SuggestedTestCard's compact tile into this row instead.
  // Falls back to a Day Streak tile when omitted.
  firstTile?: React.ReactNode;
  // Quick-access nav into the athlete's active workout — the tile itself
  // becomes a "CONTINUE" CTA when one exists (the weekly count isn't shown
  // in that state, a raw number reads oddly next to a CTA). With no active
  // program it falls back to a locked, inert state (no redirect) that does
  // show the weekly count.
  hasActiveWorkout: boolean;
  onOpenActiveWorkout: () => void;
}

/**
 * 3-column stat grid (design handoff): each card carries its own tint AND a
 * caption stating what kind of number it shows (weekly stat vs. lifetime
 * count) — the original three cards looked identical with no indication of
 * what distinguished them.
 */
export function QuickStatsRow({ streakDays, pointsThisWeek, workoutsCompleted, theme, firstTile, hasActiveWorkout, onOpenActiveWorkout }: QuickStatsRowProps) {
  const { mode } = useTheme();
  const neutrals = getWorldNeutrals(mode);
  const workoutsTint = hasActiveWorkout ? WORLD_THEMES.onemm.accent : neutrals.textMuted;

  return (
    <View style={styles.row}>
      {firstTile ?? (
        <View style={[styles.tile, { borderColor: worldRgba(WORLD_THEMES.power.accent, 0.3), backgroundColor: worldRgba(WORLD_THEMES.power.accent, 0.06) }]}>
          <MaterialCommunityIcons name="fire" size={16} color={WORLD_THEMES.power.accent} style={styles.icon} />
          <Text style={[styles.value, { color: neutrals.textPrimary }]}>{streakDays}</Text>
          <Text style={[styles.label, { color: neutrals.textMuted }]}>DAY STREAK</Text>
        </View>
      )}
      <View style={[styles.tile, { borderColor: worldRgba(WORLD_THEMES.power.accent, 0.3), backgroundColor: worldRgba(WORLD_THEMES.power.accent, 0.06) }]}>
        <MaterialCommunityIcons name="trending-up" size={16} color={WORLD_THEMES.power.accent} style={styles.icon} />
        <Text style={[styles.value, { color: neutrals.textPrimary }]}>{`${pointsThisWeek >= 0 ? '+' : ''}${pointsThisWeek}`}</Text>
        <Text style={[styles.label, { color: neutrals.textMuted }]} numberOfLines={1}>PTS THIS WEEK</Text>
      </View>
      <TouchableOpacity
        activeOpacity={hasActiveWorkout ? 0.8 : 1}
        disabled={!hasActiveWorkout}
        onPress={onOpenActiveWorkout}
        style={[
          styles.tile,
          // Same tint treatment as the other two tiles — just orange
          // (onemm accent) instead of power's red, no special solid-fill
          // treatment for this one.
          { borderColor: worldRgba(workoutsTint, 0.3), backgroundColor: worldRgba(workoutsTint, 0.06) },
        ]}
      >
        {hasActiveWorkout ? (
          <>
            <MaterialCommunityIcons name="play-circle" size={16} color={workoutsTint} style={styles.icon} />
            <Text style={[styles.value, styles.activeProgramValue, { color: neutrals.textPrimary }]} numberOfLines={1}>ACTIVE PROGRAM</Text>
            <Text style={[styles.continueLabel, { color: workoutsTint }]}>CONTINUE</Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="lock" size={16} color={workoutsTint} style={styles.icon} />
            <Text style={[styles.value, { color: neutrals.textMuted }]}>{workoutsCompleted}</Text>
            <Text style={[styles.label, { color: neutrals.textMuted }]} numberOfLines={1}>NO ACTIVE WORKOUT YET</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 14,
    marginBottom: 4,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 7,
  },
  icon: {
    marginBottom: 4,
  },
  value: {
    fontFamily: 'BarlowCondensed-ExtraBold',
    fontSize: 14,
  },
  // "ACTIVE PROGRAM" is a phrase, not a 1-3 digit number like the sibling
  // tiles' values — same weight/family, sized down so it still reads at
  // the same visual scale on one line instead of looking oversized/cramped.
  activeProgramValue: {
    fontSize: 10.5,
    letterSpacing: 0.3,
  },
  label: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 8.5,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  // The CTA itself — smaller than the ACTIVE PROGRAM title above it, but
  // bold/letter-spaced like a button label, not a plain caption.
  continueLabel: {
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 9.5,
    letterSpacing: 1.2,
    marginTop: 3,
  },
});
