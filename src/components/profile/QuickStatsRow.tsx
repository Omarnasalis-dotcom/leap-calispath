import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface QuickStatsRowProps {
  streakDays: number;
  pointsThisWeek: number;
  workoutsCompleted: number;
  theme: any;
}

export function QuickStatsRow({ streakDays, pointsThisWeek, workoutsCompleted, theme }: QuickStatsRowProps) {
  const stats: { icon: keyof typeof MaterialCommunityIcons.glyphMap; value: string; label: string }[] = [
    { icon: 'fire', value: `${streakDays}`, label: 'DAY STREAK' },
    { icon: 'trending-up', value: `${pointsThisWeek >= 0 ? '+' : ''}${pointsThisWeek}`, label: 'PTS THIS WEEK' },
    { icon: 'target', value: `${workoutsCompleted}`, label: 'WORKOUTS' },
  ];

  return (
    <View style={styles.row}>
      {stats.map((s) => (
        <View key={s.label} style={[styles.tile, { backgroundColor: theme.card.background, borderColor: theme.card.border }]}>
          <MaterialCommunityIcons name={s.icon} size={16} color={theme.accent} style={styles.icon} />
          <Text style={[styles.value, { color: theme.text.primary }]}>{s.value}</Text>
          <Text style={[styles.label, { color: theme.text.secondary }]}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 4,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
  },
  icon: {
    marginBottom: 4,
  },
  value: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'PlusJakartaSans-ExtraBold',
  },
  label: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
    fontFamily: 'PlusJakartaSans-Bold',
  },
});
