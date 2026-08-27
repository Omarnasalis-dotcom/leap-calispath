import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgramDay } from '../../types/warriorProgram';
import { DayStateEntry, deriveDayStates, estimateSessionMinutes, countMovements } from '../../lib/warriorProgramDays';
import { TC_COLORS, TC_MOTION } from '../../../constants/trainingCenterTokens';

// One row per day.entries — completed (struck-through, checkmark),
// today (highlighted, START — the only tappable one), or upcoming
// (locked). Per design handoff §3.
function DayCard({ entry, index, onStart }: { entry: DayStateEntry; index: number; onStart: () => void }) {
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

  const { day, status } = entry;
  const movementCount = countMovements(day);
  const estimatedMinutes = estimateSessionMinutes(day);

  const railColor = status === 'today' ? TC_COLORS.coral : status === 'completed' ? '#2a1212' : '#181010';
  const cardBorder = status === 'today' ? TC_COLORS.coral : TC_COLORS.border;
  const cardBg = status === 'today' ? '#120707' : TC_COLORS.cardRaised;
  const nameColor = status === 'completed' ? TC_COLORS.textFaint3 : TC_COLORS.textPrimary;

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
      }}
    >
      <View
        style={[
          styles.card,
          { borderColor: cardBorder, backgroundColor: cardBg },
          status === 'upcoming' && { opacity: 0.6 },
        ]}
      >
        <View style={[styles.rail, { backgroundColor: railColor }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>SESSION</Text>
          <Text style={[styles.name, { color: nameColor }, status === 'completed' && styles.strike]} numberOfLines={1}>
            {day.name.toUpperCase()}
          </Text>
          <Text style={styles.meta}>{movementCount} MOVEMENTS · ~{estimatedMinutes} MIN</Text>
        </View>

        {status === 'completed' && (
          <View style={[styles.ctaCircle, { backgroundColor: TC_COLORS.coral }]}>
            <MaterialCommunityIcons name="check" size={16} color="#000" />
          </View>
        )}
        {status === 'today' && (
          <TouchableOpacity style={styles.startBtn} onPress={onStart} activeOpacity={0.8}>
            <Text style={styles.startBtnText}>START</Text>
          </TouchableOpacity>
        )}
        {status === 'upcoming' && (
          <Text style={styles.lockedText}>LOCKED</Text>
        )}
      </View>
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
        <DayCard key={entry.index} entry={entry} index={entry.index} onStart={() => onStartDay(entry.index)} />
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
  ctaCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  startBtn: { backgroundColor: TC_COLORS.coral, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  startBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.2 },
  lockedText: { color: TC_COLORS.textFaint, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 1 },
});
