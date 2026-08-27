import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgramDay } from '../../types/warriorProgram';
import { DayStateEntry, deriveDayStates, estimateSessionMinutes, countMovements } from '../../lib/warriorProgramDays';
import { TC_COLORS, TC_MOTION } from '../../../constants/trainingCenterTokens';

// Every day is tappable, in any order — the program itself is the plan, not
// a rigid unlock sequence. Status is pure logging-progress feedback: clean
// (nothing logged), in_progress (a real % badge, "come back and finish"),
// or done (every block logged, whether completed or missed).
function DayCard({ entry, index, onPress }: { entry: DayStateEntry; index: number; onPress: () => void }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: TC_MOTION.rowInMs,
      delay: index * TC_MOTION.rowInStaggerMs,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1.2),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, index, anim]);

  const { day, status, progressPct } = entry;
  const movementCount = countMovements(day);
  const estimatedMinutes = estimateSessionMinutes(day);

  const railColor = status === 'done' ? TC_COLORS.coral : status === 'in_progress' ? TC_COLORS.coral : '#181010';
  const cardBorder = status === 'in_progress' ? TC_COLORS.coral : TC_COLORS.border;
  const cardBg = status === 'in_progress' ? '#120707' : TC_COLORS.cardRaised;
  const nameColor = status === 'done' ? TC_COLORS.textFaint3 : TC_COLORS.textPrimary;

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onPress}
        style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg }]}
      >
        <View style={[styles.rail, { backgroundColor: railColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SESSION</Text>
          <Text style={[styles.name, { color: nameColor }, status === 'done' && styles.strike]} numberOfLines={1}>
            {day.name.toUpperCase()}
          </Text>
          <Text style={styles.meta}>{movementCount} MOVEMENTS · ~{estimatedMinutes} MIN</Text>
        </View>

        {status === 'done' && (
          <View style={[styles.badgeCircle, { backgroundColor: TC_COLORS.coral }]}>
            <MaterialCommunityIcons name="check" size={16} color="#000" />
          </View>
        )}
        {status === 'in_progress' && (
          <View style={styles.progressBadge}>
            <MaterialCommunityIcons name="pause-circle-outline" size={14} color={TC_COLORS.coral} />
            <Text style={styles.progressBadgeText}>{progressPct}%</Text>
          </View>
        )}
        {status === 'clean' && (
          <View style={styles.startBtn}>
            <Text style={styles.startBtnText}>START</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

export function DayCardList({ days, onStartDay }: { days: ProgramDay[]; onStartDay: (dayIndex: number) => void }) {
  const entries = React.useMemo(() => deriveDayStates(days), [days]);

  if (entries.length === 0) {
    return (
      <View style={[styles.card, { borderColor: TC_COLORS.border, backgroundColor: TC_COLORS.cardFlat, justifyContent: 'center' }]}>
        <Text style={[styles.meta, { textAlign: 'center' }]}>NO SESSIONS SCHEDULED THIS WEEK.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {entries.map((entry) => (
        <DayCard key={entry.index} entry={entry} index={entry.index} onPress={() => onStartDay(entry.index)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  rail: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  eyebrow: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 1.6 },
  name: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15.5, marginTop: 2 },
  strike: { textDecorationLine: 'line-through' },
  meta: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.6, marginTop: 4 },
  badgeCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  progressBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: TC_COLORS.coral, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  progressBadgeText: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 },
  startBtn: { backgroundColor: TC_COLORS.coral, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  startBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.2 },
});
