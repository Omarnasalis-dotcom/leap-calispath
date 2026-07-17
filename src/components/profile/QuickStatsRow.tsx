import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { WORLD_THEMES, WORLD_NEUTRALS, worldRgba } from '../../../constants/worldThemes';

interface QuickStatsRowProps {
  streakDays: number;
  pointsThisWeek: number;
  workoutsCompleted: number;
  theme: any;
  // Replaces the first tile with arbitrary content (same flex:1 slot) —
  // used to fit SuggestedTestCard's compact tile into this row instead.
  // Falls back to a Day Streak tile when omitted.
  firstTile?: React.ReactNode;
}

/**
 * 3-column stat grid (design handoff): each card carries its own tint AND a
 * caption stating what kind of number it shows (weekly stat vs. lifetime
 * count) — the original three cards looked identical with no indication of
 * what distinguished them.
 */
export function QuickStatsRow({ streakDays, pointsThisWeek, workoutsCompleted, theme, firstTile }: QuickStatsRowProps) {
  const stats: { icon: keyof typeof MaterialCommunityIcons.glyphMap; tint: string; value: string; label: string }[] = [
    {
      icon: 'trending-up',
      tint: WORLD_THEMES.power.accent,
      value: `${pointsThisWeek >= 0 ? '+' : ''}${pointsThisWeek}`,
      label: 'PTS THIS WEEK',
    },
    {
      icon: 'target',
      tint: WORLD_THEMES.onemm.accent,
      value: `${workoutsCompleted}`,
      label: 'WORKOUTS LOGGED',
    },
  ];

  return (
    <View style={styles.row}>
      {firstTile ?? (
        <View style={[styles.tile, { borderColor: worldRgba(WORLD_THEMES.power.accent, 0.3), backgroundColor: worldRgba(WORLD_THEMES.power.accent, 0.06) }]}>
          <MaterialCommunityIcons name="fire" size={16} color={WORLD_THEMES.power.accent} style={styles.icon} />
          <Text style={styles.value}>{streakDays}</Text>
          <Text style={styles.label}>DAY STREAK</Text>
        </View>
      )}
      {stats.map((s) => (
        <View key={s.label} style={[styles.tile, { borderColor: worldRgba(s.tint, 0.3), backgroundColor: worldRgba(s.tint, 0.06) }]}>
          <MaterialCommunityIcons name={s.icon} size={16} color={s.tint} style={styles.icon} />
          <Text style={styles.value}>{s.value}</Text>
          <Text style={styles.label} numberOfLines={1}>{s.label}</Text>
        </View>
      ))}
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
    color: WORLD_NEUTRALS.textPrimary,
  },
  label: {
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 8.5,
    letterSpacing: 0.5,
    marginTop: 2,
    color: 'rgba(255,255,255,0.4)',
  },
});
