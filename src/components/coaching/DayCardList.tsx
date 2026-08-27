import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgramDay } from '../../types/warriorProgram';
import { DayStateEntry, deriveDayStates, estimateSessionMinutes, countMovements } from '../../lib/warriorProgramDays';
import { TC_COLORS, TC_MOTION } from '../../../constants/trainingCenterTokens';

// Program Days design (assets/design_handoff_program_days) §4 — day cards.
// Every day stays tappable regardless of state (no lock — see
// deriveNextDayIndex's own comment); "next" is a visual-only emphasis on
// exactly one card, everything else renders as a quieter "scheduled" card
// even if it's actually in_progress (the design's own state matrix only has
// done/next/scheduled, no partial-scheduled visual — the underlying % is
// still real, just not surfaced on non-next cards).
const PD_CORAL = '#FC5454';

function previewChipsFor(day: ProgramDay): { key: string; label: string }[] {
  const exercises = day.blocks.flatMap((b) => b.exercises);
  return exercises.slice(0, 3).map((ex, i) => ({
    key: ex.id + String(i),
    label: i === 2 && exercises.length > 3 ? `+${exercises.length - 2} MORE` : ex.name.toUpperCase(),
  }));
}

function DayCard({
  entry,
  isNext,
  index,
  onPress,
}: {
  entry: DayStateEntry;
  isNext: boolean;
  index: number;
  onPress: () => void;
}) {
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
      delay: Math.min(index, 8) * TC_MOTION.rowInStaggerMs,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1.2),
      useNativeDriver: true,
    }).start();
  }, [reduceMotion, index, anim]);

  const { day, status } = entry;
  const done = status === 'done';
  const movementCount = countMovements(day);
  const estimatedMinutes = estimateSessionMinutes(day);
  const chips = previewChipsFor(day);
  const statusLabel = done ? 'COMPLETED' : isNext ? 'UP NEXT' : 'SCHEDULED';

  const cardBorder = isNext ? '#3a1d1d' : '#191515';
  const cardBg = isNext ? '#170a0a' : '#0d0b0b';
  const plateBorder = isNext ? '#3a1d1d' : '#1c1818';
  const plateBg = isNext ? 'rgba(252,84,84,.08)' : 'rgba(255,255,255,.015)';

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [15, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        style={[styles.card, { borderColor: cardBorder, backgroundColor: cardBg, opacity: done ? 0.62 : 1 }]}
      >
        {/* Discipline mix bar — single full-width coral segment: no real
            per-day discipline composition exists in the schema (same gap
            already found for Program Templates/Customize/Quick Workout),
            so this uses the design's own documented coral fallback rather
            than fabricating a Static/Power/1MM split. */}
        <View style={[styles.mixBar, { opacity: done ? 0.35 : isNext ? 0.95 : 0.55 }]} />

        <View style={styles.body}>
          <View style={[styles.plate, { borderColor: plateBorder, backgroundColor: plateBg }]}>
            <Text style={[styles.plateLabel, { color: isNext ? '#8a5555' : '#4a4444' }]}>DAY</Text>
            <Text style={[styles.plateNumber, { color: isNext ? PD_CORAL : '#8a8a8a' }]}>{index + 1}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={[styles.statusChip, done || !isNext ? styles.statusChipQuiet : styles.statusChipNext]}>
                <Text style={[styles.statusChipText, { color: done || !isNext ? '#7a7a7a' : '#FFFFFF' }]}>{statusLabel}</Text>
              </View>
            </View>
            <Text style={[styles.sessionName, done && { color: '#8a8a8a', textDecorationLine: 'line-through' }]} numberOfLines={2}>
              {day.name.toUpperCase()}
            </Text>
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="tune-variant" size={11} color="#7a7a7a" />
              <Text style={styles.metaText}>{movementCount} MOVEMENTS</Text>
              <View style={styles.metaDivider} />
              <MaterialCommunityIcons name="clock-outline" size={11} color="#7a7a7a" />
              <Text style={styles.metaText}>~{estimatedMinutes} MIN</Text>
            </View>

            {chips.length > 0 && (
              <View style={styles.chipRow}>
                {chips.map((c) => (
                  <View key={c.key} style={styles.previewChip}>
                    <Text style={styles.previewChipText} numberOfLines={1}>{c.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {done ? (
            <View style={styles.doneBadge}>
              <MaterialCommunityIcons name="check" size={14} color={PD_CORAL} />
            </View>
          ) : isNext ? (
            <View style={styles.startBtnNext}>
              <Text style={styles.startBtnNextText}>START</Text>
            </View>
          ) : (
            <View style={styles.startBtnScheduled}>
              <Text style={styles.startBtnScheduledText}>START</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export function DayCardList({ days, nextIndex, onStartDay }: { days: ProgramDay[]; nextIndex: number | null; onStartDay: (dayIndex: number) => void }) {
  const entries = React.useMemo(() => deriveDayStates(days), [days]);

  if (entries.length === 0) {
    return (
      <View style={[styles.card, { borderColor: TC_COLORS.border, backgroundColor: TC_COLORS.cardFlat, justifyContent: 'center', padding: 20 }]}>
        <Text style={styles.emptyText}>NO SESSIONS SCHEDULED THIS WEEK.</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.sectionRule}>
        <Text style={styles.sectionEyebrow}>SESSIONS</Text>
        <Text style={styles.sectionCount}>{entries.length} DAY{entries.length === 1 ? '' : 'S'}</Text>
      </View>
      <View style={{ gap: 12 }}>
        {entries.map((entry) => (
          <DayCard key={entry.index} entry={entry} isNext={entry.index === nextIndex} index={entry.index} onPress={() => onStartDay(entry.index)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRule: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderColor: '#161212', paddingBottom: 8, marginBottom: 13,
  },
  sectionEyebrow: { color: '#3f3f3f', fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.6 },
  sectionCount: { color: '#4a4a4a', fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.6 },

  card: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  mixBar: { height: 3, backgroundColor: PD_CORAL },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14 },
  plate: {
    width: 46, borderWidth: 1, borderRadius: 14, alignItems: 'center',
    paddingTop: 8, paddingBottom: 9,
  },
  plateLabel: { fontFamily: 'Barlow-Regular', fontSize: 7.5, letterSpacing: 1.6 },
  plateNumber: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22 },

  statusChip: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  statusChipNext: { backgroundColor: PD_CORAL },
  statusChipQuiet: { backgroundColor: 'rgba(255,255,255,.04)' },
  statusChipText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 7.5, letterSpacing: 1.3 },

  sessionName: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-SemiBold', fontSize: 17, letterSpacing: 0.5, marginTop: 5 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  metaText: { color: '#7a7a7a', fontFamily: 'Barlow-Regular', fontSize: 10.5, letterSpacing: 0.4 },
  metaDivider: { width: 1, height: 10, backgroundColor: '#221c1c' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  previewChip: { borderWidth: 1, borderColor: '#1d1919', backgroundColor: 'rgba(255,255,255,.022)', borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 },
  previewChipText: { color: '#8a8a8a', fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.5 },

  doneBadge: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#2a1d1d', alignItems: 'center', justifyContent: 'center' },
  startBtnNext: {
    backgroundColor: PD_CORAL, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 20, elevation: 6,
  },
  startBtnNextText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 11.5, letterSpacing: 1.7 },
  startBtnScheduled: { borderWidth: 1, borderColor: '#241f1f', borderRadius: 12, paddingHorizontal: 17, paddingVertical: 11 },
  startBtnScheduledText: { color: '#9a9a9a', fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 1.6 },

  emptyText: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },
});
