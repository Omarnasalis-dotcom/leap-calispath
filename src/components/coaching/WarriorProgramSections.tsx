import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

const bronzeGold = '#C8A040';

// Program Days design tokens (assets/design_handoff_program_days) — fixed
// dark palette, same choice already made across the rest of the Training
// Center flow, independent of the app's own light/dark theme toggle.
const PD = {
  coral: '#FC5454',
  gold: '#C9A227',
  purpleText: '#c4b5fd',
  screenBg: '#000000',
  identityBorder: '#1e1a20',
  identityGradient: ['#120e14', '#0b0909', '#090707'] as const,
  chipBorder: '#2a2230',
  panelBg: '#0A0808',
  panelBorder: '#1a1616',
  panelDivider: '#161212',
  panelFooterWash: 'rgba(255,255,255,.012)',
  zeroArc: '#2a2222',
  zeroValue: '#3a3232',
  textPrimary: '#FFFFFF',
  textBody: '#9a9a9a',
  textSecondary: '#8a8a8a',
  textMuted: '#6d6d6d',
  textFaint: '#5a5a5a',
  textFainter: '#4a4a4a',
};

const DISCIPLINE_MAP: Record<string, string> = {
  STATIC: '#8b5cf6',
  POWER: '#FC5454',
  '1MM': '#f97316',
};

// Reused everywhere a small control needs the "discoverable but quiet"
// diagonal sheen (SWITCH here; the same technique as the Training Center
// button's sheen on Profile) — a slow, subtle streak rather than a loud
// full-width gradient bar.
function Sheen({ borderRadius }: { borderRadius: number }) {
  const [width, setWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    anim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(anim, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, width, anim]);

  if (reduceMotion) return null;
  const streakWidth = 40;
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-streakWidth, width + streakWidth] });

  return (
    <View
      pointerEvents="none"
      style={{ ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View style={{ position: 'absolute', top: -10, bottom: -10, width: streakWidth, transform: [{ translateX }, { rotate: '18deg' }] }}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.10)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}

function PulseDot() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.3, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, anim]);

  return <Animated.View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: PD.coral, opacity: anim }} />;
}

// ─── Program Identity Card ──────────────────────────────────────────────────
// Replaces the old ProgramHeaderCard + the full-width gradient
// SwitchWorkoutButton — SWITCH is now a small outlined control with a sheen,
// living inside this card rather than competing with START for attention.
interface ProgramIdentityCardProps {
  programName: string;
  coachName: string;
  sessionsTotal: number;
  sessionsDoneThisWeek: number;
  onSwitch: () => void;
}
export function ProgramIdentityCard({ programName, coachName, sessionsTotal, sessionsDoneThisWeek, onSwitch }: ProgramIdentityCardProps) {
  return (
    <View style={styles.identityCard}>
      <LinearGradient colors={PD.identityGradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.identityEyebrow}>ACTIVE PROGRAM</Text>
          {/* Real, user-authored casing — never uppercased, never truncated to one line. */}
          <Text style={styles.identityProgramName} numberOfLines={2}>{programName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 }}>
            <PulseDot />
            <Text style={styles.identityMeta} numberOfLines={1}>
              {sessionsTotal} session{sessionsTotal === 1 ? '' : 's'} · {sessionsDoneThisWeek} done this week
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 9 }}>
          <View style={styles.coachChip}>
            <MaterialCommunityIcons name="account" size={11} color={PD.gold} />
            <Text style={styles.coachChipLabel}>COACH</Text>
            <Text style={styles.coachChipName}>{coachName.toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={onSwitch} activeOpacity={0.8} style={styles.switchControl}>
            <Sheen borderRadius={9} />
            <MaterialCommunityIcons name="swap-horizontal" size={13} color={PD.purpleText} />
            <Text style={styles.switchLabel}>SWITCH</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Program Load Panel ─────────────────────────────────────────────────────
// One card replacing three floating rings + the orphaned bodyweight pill —
// a TOTAL PTS figure, three normalized arcs, and bodyweight in the footer.
function DisciplineArc({ label, value, maxValue }: { label: string; value: number; maxValue: number }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const size = 74;
  const strokeWidth = 3;
  const r = 27;
  const circumference = 2 * Math.PI * r;
  const color = DISCIPLINE_MAP[label] ?? PD.coral;
  const isZero = value <= 0;
  // Normalized against the highest of the 3 scores, not a fixed ceiling —
  // the panel reads as a comparison between disciplines. 0.03 floor keeps a
  // real non-zero score from rendering as an empty ring.
  const fraction = isZero ? 0 : Math.max(value / Math.max(maxValue, 0.0001), 0.03);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(fraction);
      return;
    }
    Animated.timing(anim, { toValue: fraction, duration: 1000, easing: Easing.bezier(0.2, 0.9, 0.3, 1), useNativeDriver: false }).start();
  }, [fraction, reduceMotion, anim]);

  const strokeDashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={isZero ? PD.zeroArc : PD.panelDivider} strokeWidth={strokeWidth} fill="none" />
          {!isZero && (
            <AnimatedCircle
              cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={strokeWidth} fill="none"
              strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={strokeDashoffset}
            />
          )}
        </Svg>
        <Text style={[styles.arcValue, { color: isZero ? PD.zeroValue : color, fontSize: value >= 10 ? 19 : 21 }]}>
          {value >= 100 ? value.toFixed(0) : value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}
        </Text>
      </View>
      <Text style={[styles.arcLabel, { color: isZero ? PD.textFainter : '#7a7a7a' }]}>{label} PTS</Text>
    </View>
  );
}
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ProgramLoadPanelProps {
  staticPoints: number;
  powerPoints: number;
  oneMmPoints: number;
  bodyweightKg: number | null;
  onEditBodyweight: () => void;
}
export function ProgramLoadPanel({ staticPoints, powerPoints, oneMmPoints, bodyweightKg, onEditBodyweight }: ProgramLoadPanelProps) {
  const total = staticPoints + powerPoints + oneMmPoints;
  const maxValue = Math.max(staticPoints, powerPoints, oneMmPoints);
  return (
    <View style={styles.loadPanel}>
      <View style={styles.loadHeaderRow}>
        <Text style={styles.loadEyebrow}>PROGRAM LOAD</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
          <Text style={styles.loadTotalValue}>{total % 1 === 0 ? total.toFixed(0) : total.toFixed(1)}</Text>
          <Text style={styles.loadTotalLabel}>TOTAL PTS</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8, paddingTop: 12 }}>
        <DisciplineArc label="STATIC" value={staticPoints} maxValue={maxValue} />
        <DisciplineArc label="POWER" value={powerPoints} maxValue={maxValue} />
        <DisciplineArc label="1MM" value={oneMmPoints} maxValue={maxValue} />
      </View>
      <TouchableOpacity onPress={onEditBodyweight} activeOpacity={0.7} style={styles.bodyweightFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="kettlebell" size={14} color={PD.gold} />
          <Text style={styles.bodyweightLabel}>BODYWEIGHT</Text>
          <Text style={styles.bodyweightValue}>{bodyweightKg !== null ? `${bodyweightKg} KG` : '— —'}</Text>
        </View>
        <Text style={[styles.bodyweightEdit, { color: bodyweightKg !== null ? PD.gold : PD.coral }]}>EDIT</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Week Navigator ─────────────────────────────────────────────────────────
interface WeekNavigatorProps {
  weeksData: Record<number, any[]>;
  activeWeek: number;
  onSelectWeek: (week: number) => void;
  theme: any;
}
export function WeekNavigator({ weeksData, activeWeek, onSelectWeek, theme }: WeekNavigatorProps) {
  if (Object.keys(weeksData).length <= 1) return null;
  return (
    <View style={{ marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 2 }}>
        {Object.keys(weeksData).map(weekStr => {
          const wNum = parseInt(weekStr, 10);
          const isActive = wNum === activeWeek;
          const weekBlocks = weeksData[wNum].flatMap((d: any) => d.blocks);
          const allCompleted = weekBlocks.length > 0 && weekBlocks.every((b: any) => b.completedStatus === 'completed');
          return (
            <TouchableOpacity
              key={wNum}
              onPress={() => onSelectWeek(wNum)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 18,
                borderRadius: 999,
                backgroundColor: isActive ? 'rgba(252,84,84,.12)' : 'transparent',
                borderWidth: 1,
                borderColor: isActive ? PD.coral : '#241f1f',
              }}
            >
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.8, color: isActive ? PD.coral : '#6d6d6d' }}>
                WEEK {wNum} {allCompleted ? '✓' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Progress Bar ───────────────────────────────────────────────────────────
interface ProgressBarProps {
  blocks: any[];
  theme: any;
}
export function DayProgressBar({ blocks, theme }: ProgressBarProps) {
  const total = blocks.length;
  const completed = blocks.filter(b => b.completedStatus === 'completed').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  if (total === 0) return null;
  return (
    <View style={[styles.progressBarWrapper, { borderColor: theme.card.border, backgroundColor: 'rgba(255,255,255,0.01)' }]}>
      <View style={styles.progressHeader}>
        <Text style={[styles.progressLabel, { color: theme.text.secondary }]}>TODAY'S WORKOUT PROGRESS</Text>
        <Text style={[styles.progressValue, { color: '#FF7043' }]}>
          {percent}% <Text style={{ color: theme.text.tertiary, fontFamily: 'BarlowCondensed-Bold' }}>({completed}/{total} BLOCKS)</Text>
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
        {percent > 0 && (
          <LinearGradient
            colors={['#7E57C2', '#FF5252', '#FF7043']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: `${percent}%`, height: '100%', borderRadius: 3 }}
          />
        )}
      </View>
    </View>
  );
}

// ─── Day Carousel ───────────────────────────────────────────────────────────
interface DayCarouselProps {
  days: any[];
  activeDayIndex: number;
  onPrev: () => void;
  onNext: () => void;
  theme: any;
  solidCardBg: string;
  mode: string;
}
export function DayCarousel({ days, activeDayIndex, onPrev, onNext, theme, solidCardBg, mode }: DayCarouselProps) {
  const activeDay = days[activeDayIndex];
  if (!activeDay) return null;
  return (
    <LinearGradient
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ padding: 1.2, borderRadius: 10, marginVertical: 4 }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: solidCardBg, padding: 12, borderRadius: 9 }}>
        <TouchableOpacity disabled={activeDayIndex === 0} onPress={onPrev} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: activeDayIndex === 0 ? theme.text.tertiary : (mode === 'dark' ? '#A78BFA' : '#7E57C2'), fontSize: 18, fontFamily: 'BarlowCondensed-Bold' }}>◄</Text>
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: theme.text.primary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 16, letterSpacing: 0.5 }}>
            {(activeDay.name || 'UNNAMED DAY').toUpperCase()}
          </Text>
          <Text style={{ color: theme.text.tertiary, fontSize: 10, fontFamily: 'BarlowCondensed-Bold', marginTop: 2 }}>
            DAY {activeDayIndex + 1} OF {days.length} • {activeDay.blocks?.length || 0} BLOCKS
          </Text>
        </View>
        <TouchableOpacity disabled={activeDayIndex === days.length - 1} onPress={onNext} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: activeDayIndex === days.length - 1 ? theme.text.tertiary : '#FF7043', fontSize: 18, fontFamily: 'BarlowCondensed-Bold' }}>►</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  progressBarWrapper: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 },
  progressValue: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 11, letterSpacing: 0.5 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },

  // Program Days redesign (assets/design_handoff_program_days)
  identityCard: {
    borderRadius: 20, borderWidth: 1, borderColor: PD.identityBorder,
    padding: 17, overflow: 'hidden',
  },
  identityEyebrow: { color: PD.textFainter, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.4 },
  identityProgramName: { color: PD.textPrimary, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 21, letterSpacing: 0.6, lineHeight: 24, marginTop: 3 },
  identityMeta: { color: PD.textBody, fontFamily: 'Barlow-Light', fontSize: 11, flexShrink: 1 },
  coachChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, borderWidth: 1, borderColor: PD.chipBorder,
    backgroundColor: 'rgba(255,255,255,.02)', paddingHorizontal: 10, paddingVertical: 6,
  },
  coachChipLabel: { color: PD.textMuted, fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.6 },
  coachChipName: { color: PD.gold, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 8.5 },
  switchControl: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, borderWidth: 1, borderColor: PD.chipBorder,
    paddingHorizontal: 11, paddingVertical: 7, overflow: 'hidden',
  },
  switchLabel: { color: PD.purpleText, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 9, letterSpacing: 0.8 },

  loadPanel: { borderRadius: 20, borderWidth: 1, borderColor: PD.panelBorder, backgroundColor: PD.panelBg, overflow: 'hidden' },
  loadHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 14, paddingHorizontal: 17 },
  loadEyebrow: { color: PD.textFainter, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.4 },
  loadTotalValue: { color: PD.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 0.4 },
  loadTotalLabel: { color: PD.textFainter, fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.6 },
  arcValue: { fontFamily: 'BarlowCondensed-Bold', letterSpacing: 0.3 },
  arcLabel: { fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.7, marginTop: 4 },
  bodyweightFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14,
    borderTopWidth: 1, borderTopColor: PD.panelDivider, backgroundColor: PD.panelFooterWash, padding: 11, paddingHorizontal: 17,
  },
  bodyweightLabel: { color: PD.textMuted, fontFamily: 'Barlow-Regular', fontSize: 9.5, letterSpacing: 0.6 },
  bodyweightValue: { color: PD.textPrimary, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 12 },
  bodyweightEdit: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 9, letterSpacing: 0.6 },
});
