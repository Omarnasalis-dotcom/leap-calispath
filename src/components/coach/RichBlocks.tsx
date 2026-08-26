// Design handoff §2.3 "Rich blocks inside a coach bubble" — renders typed
// blocks the ai-coach edge function attaches via attach_stat_bars/
// attach_steps (supabase/functions/ai-coach/tools/). Switches on `type`,
// same as the handoff requires — an unknown/missing type renders nothing,
// never a fallback guess at what it might have meant.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { CoachPalette } from './coachTokens';

export interface StatBarRow {
  key: string;
  label: string;
  value: number;
  color: string;
  emphasize: boolean;
}
export interface StatBarsBlock { type: 'stat_bars'; max: number; rows: StatBarRow[] }
export interface StepsBlock { type: 'steps'; items: string[] }
export type ResponseBlock = StatBarsBlock | StepsBlock;

function StatBarRow({ row, max, accent, colors }: { row: StatBarRow; max: number; accent: string; colors: CoachPalette }) {
  const width = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? Math.min(1, row.value / max) : 0;

  useEffect(() => {
    Animated.timing(width, { toValue: pct, duration: 500, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();
  }, [pct]);

  const labelColor = row.emphasize ? accent : colors.mutedLabel;
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, { color: labelColor, fontWeight: row.emphasize ? '700' : '500' }]} numberOfLines={1}>
        {row.label}
      </Text>
      <View style={[styles.statTrack, { backgroundColor: colors.track }]}>
        <Animated.View
          style={[
            styles.statFill,
            { backgroundColor: row.color, width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
      <Text style={[styles.statValue, { color: row.emphasize ? accent : '#fff', fontWeight: row.emphasize ? '700' : '600' }]}>
        {row.value.toFixed(2)}
      </Text>
    </View>
  );
}

export function ResponseBlockView({ block, accent, colors }: { block: ResponseBlock; accent: string; colors: CoachPalette }) {
  if (block.type === 'stat_bars') {
    if (!block.rows?.length) return null;
    return (
      <View style={[styles.wrap, styles.statsWrap, { borderTopColor: colors.richBlockDivider }]}>
        {block.rows.map((row) => (
          <StatBarRow key={row.key} row={row} max={block.max} accent={accent} colors={colors} />
        ))}
      </View>
    );
  }
  if (block.type === 'steps') {
    if (!block.items?.length) return null;
    return (
      <View style={styles.wrap}>
        {block.items.map((item, i) => (
          <View key={i} style={styles.stepRow}>
            <Text style={[styles.stepIndex, { color: accent }]}>{i + 1}</Text>
            <Text style={[styles.stepText, { color: colors.secondaryText }]}>{item}</Text>
          </View>
        ))}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  statsWrap: { borderTopWidth: 1, paddingTop: 12, gap: 9 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabel: { width: 52, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' },
  statTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  statFill: { height: 5, borderRadius: 3 },
  statValue: { width: 32, fontSize: 11, textAlign: 'right' },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepIndex: { width: 12, fontSize: 11, fontWeight: '700' },
  stepText: { flex: 1, fontSize: 13, fontWeight: '300', lineHeight: 18 },
});
