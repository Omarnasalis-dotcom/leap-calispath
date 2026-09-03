import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, AccessibilityInfo } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgramDay } from '../../types/warriorProgram';
import { DayStateEntry, deriveDayStates, estimateSessionMinutes, countMovements } from '../../lib/warriorProgramDays';
import { TC_COLORS, TC_MOTION } from '../../../constants/trainingCenterTokens';
import { useTheme } from '../../contexts/ThemeContext';

// Program Days design (assets/design_handoff_program_days) §4 — day cards.
// Every day stays tappable regardless of state (no lock — see
// deriveNextDayIndex's own comment); "next" is a visual-only emphasis on
// exactly one card, everything else renders as a quieter "scheduled" card
// even if it's actually in_progress (the design's own state matrix only has
// done/next/scheduled, no partial-scheduled visual — the underlying % is
// still real, just not surfaced on non-next cards).
const PD_CORAL = '#FC5454';

// This design predates TC_COLORS (own bespoke hex literals throughout, not
// shared tokens) and was dark-only until now — light variant follows the
// same relationship-preservation approach used for TC_COLORS/COACH_COLORS.
interface PDPalette {
  cardBorderNext: string; cardBorderScheduled: string;
  cardBgNext: string; cardBgScheduled: string;
  plateBorderNext: string; plateBorderScheduled: string;
  plateBgNext: string; plateBgScheduled: string;
  plateLabelNext: string; plateLabelScheduled: string; plateNumberScheduled: string;
  statusChipQuietBg: string; statusChipQuietText: string;
  sessionName: string; sessionNameDone: string;
  metaText: string; metaDivider: string;
  doneBadgeBorder: string;
  startScheduledBorder: string; startScheduledText: string;
  sectionRuleBorder: string; sectionEyebrow: string; sectionCount: string;
}

const PD_COLORS: { dark: PDPalette; light: PDPalette } = {
  dark: {
    cardBorderNext: '#3a1d1d', cardBorderScheduled: '#191515',
    cardBgNext: '#170a0a', cardBgScheduled: '#0d0b0b',
    plateBorderNext: '#3a1d1d', plateBorderScheduled: '#1c1818',
    plateBgNext: 'rgba(252,84,84,.08)', plateBgScheduled: 'rgba(255,255,255,.015)',
    plateLabelNext: '#8a5555', plateLabelScheduled: '#4a4444', plateNumberScheduled: '#8a8a8a',
    statusChipQuietBg: 'rgba(255,255,255,.04)', statusChipQuietText: '#7a7a7a',
    sessionName: '#FFFFFF', sessionNameDone: '#8a8a8a',
    metaText: '#7a7a7a', metaDivider: '#221c1c',
    doneBadgeBorder: '#2a1d1d',
    startScheduledBorder: '#241f1f', startScheduledText: '#9a9a9a',
    sectionRuleBorder: '#161212', sectionEyebrow: '#3f3f3f', sectionCount: '#4a4a4a',
  },
  light: {
    cardBorderNext: '#E8B8B8', cardBorderScheduled: '#EAE0E0',
    cardBgNext: '#FFF0EE', cardBgScheduled: '#FBF8F8',
    plateBorderNext: '#E8B8B8', plateBorderScheduled: '#E5DADA',
    plateBgNext: 'rgba(252,84,84,.08)', plateBgScheduled: 'rgba(0,0,0,.02)',
    plateLabelNext: '#C57A7A', plateLabelScheduled: '#A89A9A', plateNumberScheduled: '#9A8A8A',
    statusChipQuietBg: 'rgba(0,0,0,.05)', statusChipQuietText: '#8A8A8A',
    sessionName: '#2A2A2A', sessionNameDone: '#A89A9A',
    metaText: '#8A8A8A', metaDivider: '#E5DADA',
    doneBadgeBorder: '#E5D0D0',
    startScheduledBorder: '#DDD0D0', startScheduledText: '#8A8A8A',
    sectionRuleBorder: '#E5DADA', sectionEyebrow: '#B5A5A5', sectionCount: '#9A8A8A',
  },
} as const;

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
  const { mode } = useTheme();
  const pd = PD_COLORS[mode];
  const styles = getStyles(pd, TC_COLORS[mode]);
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
  const statusLabel = done ? 'COMPLETED' : isNext ? 'UP NEXT' : 'SCHEDULED';

  const cardBorder = isNext ? pd.cardBorderNext : pd.cardBorderScheduled;
  const cardBg = isNext ? pd.cardBgNext : pd.cardBgScheduled;
  const plateBorder = isNext ? pd.plateBorderNext : pd.plateBorderScheduled;
  const plateBg = isNext ? pd.plateBgNext : pd.plateBgScheduled;

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
            <Text style={[styles.plateLabel, { color: isNext ? pd.plateLabelNext : pd.plateLabelScheduled }]}>DAY</Text>
            <Text style={[styles.plateNumber, { color: isNext ? PD_CORAL : pd.plateNumberScheduled }]}>{index + 1}</Text>
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={[styles.statusChip, done || !isNext ? styles.statusChipQuiet : styles.statusChipNext]}>
                <Text style={[styles.statusChipText, { color: done || !isNext ? pd.statusChipQuietText : '#FFFFFF' }]}>{statusLabel}</Text>
              </View>
            </View>
            <Text style={[styles.sessionName, done && { color: pd.sessionNameDone, textDecorationLine: 'line-through' }]} numberOfLines={2}>
              {day.name.toUpperCase()}
            </Text>
            <View style={styles.metaRow}>
              <MaterialCommunityIcons name="tune-variant" size={11} color={pd.metaText} />
              <Text style={styles.metaText}>{movementCount} MOVEMENTS</Text>
              <View style={styles.metaDivider} />
              <MaterialCommunityIcons name="clock-outline" size={11} color={pd.metaText} />
              <Text style={styles.metaText}>~{estimatedMinutes} MIN</Text>
            </View>
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
  const { mode } = useTheme();
  const c = TC_COLORS[mode];
  const styles = getStyles(PD_COLORS[mode], c);
  const entries = React.useMemo(() => deriveDayStates(days), [days]);

  if (entries.length === 0) {
    return (
      <View style={[styles.card, { borderColor: c.border, backgroundColor: c.cardFlat, justifyContent: 'center', padding: 20 }]}>
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

const getStyles = (pd: PDPalette, c: import('../../../constants/trainingCenterTokens').TCPalette) => StyleSheet.create({
  sectionRule: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderBottomWidth: 1, borderColor: pd.sectionRuleBorder, paddingBottom: 8, marginBottom: 13,
  },
  sectionEyebrow: { color: pd.sectionEyebrow, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.6 },
  sectionCount: { color: pd.sectionCount, fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.6 },

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
  statusChipQuiet: { backgroundColor: pd.statusChipQuietBg },
  statusChipText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 7.5, letterSpacing: 1.3 },

  sessionName: { color: pd.sessionName, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 17, letterSpacing: 0.5, marginTop: 5 },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  metaText: { color: pd.metaText, fontFamily: 'Barlow-Regular', fontSize: 10.5, letterSpacing: 0.4 },
  metaDivider: { width: 1, height: 10, backgroundColor: pd.metaDivider },

  doneBadge: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: pd.doneBadgeBorder, alignItems: 'center', justifyContent: 'center' },
  startBtnNext: {
    backgroundColor: PD_CORAL, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 11,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.34, shadowRadius: 20, elevation: 6,
  },
  startBtnNextText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 11.5, letterSpacing: 1.7 },
  startBtnScheduled: { borderWidth: 1, borderColor: pd.startScheduledBorder, borderRadius: 12, paddingHorizontal: 17, paddingVertical: 11 },
  startBtnScheduledText: { color: pd.startScheduledText, fontFamily: 'BarlowCondensed-Bold', fontSize: 10.5, letterSpacing: 1.6 },

  emptyText: { color: c.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 12, textAlign: 'center' },
});
