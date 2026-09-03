import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgramDay, ProgramBlock, ExerciseDetail } from '../../types/warriorProgram';
import { estimateSessionMinutes, countMovements, isWarmUpBlock } from '../../lib/warriorProgramDays';
import { TC_COLORS, TC_MOTION, TC_LAYOUT, TCPalette } from '../../../constants/trainingCenterTokens';
import { useTheme } from '../../contexts/ThemeContext';

// Pre-workout brief reached from a day card's START (design handoff §4).
// Points-on-deck is intentionally omitted — no real points-per-session
// mechanic exists for coaching-program completion yet (see the Phase 2
// plan's carried-over decision from Phase 1); showing a made-up number
// would fail the "nothing fabricated" bar the rest of this feature holds to.

function setPillLabel(ex: ExerciseDetail): string {
  if (ex.hold_seconds) return `${ex.hold_seconds}s`;
  return String(ex.reps || '0');
}

function RowIn({ index, children }: { index: number; children: React.ReactNode }) {
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

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function MovementCard({ block, exercise, index, onLog }: { block: ProgramBlock; exercise: ExerciseDetail; index: number; onLog: (blockId: string | number) => void }) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(c);
  const setCount = Math.max(parseInt(String(exercise.sets || '1'), 10) || 1, 1);
  const pillLabel = setPillLabel(exercise);

  return (
    <RowIn index={index}>
      <View style={styles.movementCard}>
        <View style={styles.movementTopRow}>
          <View style={styles.indexBox}>
            <Text style={styles.indexText}>{String(index + 1).padStart(2, '0')}</Text>
          </View>
          <Text style={styles.movementName} numberOfLines={2}>{exercise.name}</Text>
        </View>
        {!!exercise.notes && <Text style={styles.cue}>{exercise.notes}</Text>}
        <View style={styles.setPillRow}>
          {Array.from({ length: setCount }, (_, i) => (
            <View key={i} style={styles.setPill}>
              <Text style={styles.setPillText}>{i + 1} · {pillLabel}</Text>
            </View>
          ))}
        </View>
        <View style={styles.movementBottomRow}>
          {!!exercise.rest_seconds && Number(exercise.rest_seconds) > 0 && (
            <View style={styles.restRow}>
              <MaterialCommunityIcons name="clock-outline" size={12} color={c.textMuted} />
              <Text style={styles.restText}>{exercise.rest_seconds}s REST</Text>
            </View>
          )}
          <TouchableOpacity style={styles.logBtn} onPress={() => onLog(block.id)}>
            <Text style={styles.logBtnText}>LOG</Text>
          </TouchableOpacity>
        </View>
      </View>
    </RowIn>
  );
}

export function SessionDetailView({
  day,
  weekDisplayNumber,
  dayIndexInWeek,
  onLog,
  onStartSession,
  onBack,
}: {
  day: ProgramDay;
  weekDisplayNumber: number;
  dayIndexInWeek: number;
  onLog: (blockId: string | number) => void;
  onStartSession: () => void;
  onBack: () => void;
}) {
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(c);
  const warmUpBlocks = day.blocks.filter(isWarmUpBlock);
  const workBlocks = day.blocks.filter((b) => !isWarmUpBlock(b));
  const estimatedMinutes = estimateSessionMinutes(day);
  const movementCount = countMovements(day);

  const warmUpExercises = warmUpBlocks.flatMap((b) => b.exercises);
  const workMovements = workBlocks.flatMap((b) => b.exercises.map((ex) => ({ block: b, ex })));
  const warmUpMinutes = Math.max(Math.round(warmUpExercises.length * 1.5), 1);

  return (
    <View style={{ flex: 1, backgroundColor: c.screenBg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={c.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 6 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{day.name.toUpperCase()}</Text>
          <Text style={styles.headerSubline}>WEEK {weekDisplayNumber} · DAY {dayIndexInWeek + 1} · TODAY</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: TC_LAYOUT.screenPadding, paddingBottom: TC_LAYOUT.bottomBarOffset + 12 }}>
        <RowIn index={0}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue}>~{estimatedMinutes}</Text>
              <Text style={styles.summaryLabel}>EST. MIN</Text>
            </View>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryValue}>{movementCount}</Text>
              <Text style={styles.summaryLabel}>MOVEMENTS</Text>
            </View>
          </View>
        </RowIn>

        {warmUpExercises.length > 0 && (
          <RowIn index={1}>
            <View style={{ marginTop: 20 }}>
              <View style={styles.sectionRule}>
                <Text style={styles.sectionEyebrow}>WARM-UP · {warmUpMinutes} MIN</Text>
              </View>
              <View style={styles.pillWrapRow}>
                {warmUpExercises.map((ex, i) => (
                  <View key={i} style={styles.warmUpPill}>
                    <Text style={styles.warmUpPillText}>{ex.name} · {setPillLabel(ex)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </RowIn>
        )}

        <View style={{ marginTop: 20 }}>
          <View style={styles.sectionRule}>
            <Text style={styles.sectionEyebrow}>THE WORK</Text>
          </View>
          <View style={{ gap: 12 }}>
            {workMovements.map(({ block, ex }, i) => (
              <MovementCard key={String(ex.id)} block={block} exercise={ex} index={i + 2} onLog={onLog} />
            ))}
          </View>
        </View>
      </ScrollView>

      <RowIn index={0}>
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.startBtn} onPress={onStartSession} activeOpacity={0.85}>
            <MaterialCommunityIcons name="play" size={16} color="#000" />
            <Text style={styles.startBtnText}>START SESSION</Text>
          </TouchableOpacity>
        </View>
      </RowIn>
    </View>
  );
}

const getStyles = (c: TCPalette) => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: TC_LAYOUT.screenPadding, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17, letterSpacing: 1.6 },
  headerSubline: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },

  summaryCard: {
    flexDirection: 'row', borderRadius: 18, borderWidth: 1, borderColor: c.heroBorderActive,
    backgroundColor: c.cardFlat, padding: 16,
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryValue: { color: c.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 21 },
  summaryLabel: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 1.4, marginTop: 4 },

  sectionRule: { borderBottomWidth: 1, borderColor: c.dividerFaint, paddingBottom: 8, marginBottom: 12 },
  sectionEyebrow: { color: c.textFaint, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 2.4 },

  pillWrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  warmUpPill: { borderWidth: 1, borderColor: c.border, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  warmUpPillText: { color: c.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 10 },

  movementCard: { borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.cardRaised, padding: 14 },
  movementTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  indexBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: c.iconWell, borderWidth: 1, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center' },
  indexText: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 11 },
  movementName: { flex: 1, color: c.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 15 },
  cue: { color: c.textSecondary, fontFamily: 'Barlow-Light', fontSize: 11.5, lineHeight: 15, marginTop: 8 },
  setPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  setPill: { borderWidth: 1, borderColor: c.borderStrong, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  setPillText: { color: c.textBody, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5 },
  movementBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  restRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restText: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 1.2 },
  logBtn: { borderWidth: 1, borderColor: c.coral, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  logBtnText: { color: c.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 1 },

  bottomBar: { position: 'absolute', left: 16, right: 16, bottom: TC_LAYOUT.bottomBarOffset },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.coral, borderRadius: 16, height: 52,
    shadowColor: '#000', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.7, shadowRadius: 34, elevation: 10,
  },
  startBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1.9 },
});
