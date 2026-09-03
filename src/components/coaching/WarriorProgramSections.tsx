import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

const bronzeGold = '#C8A040';

// Program Days design tokens (assets/design_handoff_program_days) — was a
// fixed dark-only palette, independent of the app's own light/dark theme
// toggle; now split {dark, light} on request, same relationship-
// preservation approach as TC_COLORS/COACH_COLORS. Only fields actually
// used in this file are kept (screenBg/panelDivider/panelFooterWash/
// zeroArc/zeroValue/textSecondary/textFaint were already dead in the prior
// version — dropped rather than inventing light values nothing reads).
interface PDPalette {
  identityBorder: string;
  identityGradient: readonly [string, string, string];
  chipBorder: string;
  panelBg: string;
  panelBorder: string;
  textPrimary: string;
  textBody: string;
  textMuted: string;
  textFainter: string;
  purpleText: string;
  weekChipBorder: string;
  weekChipText: string;
}

const PD_COLORS: { dark: PDPalette; light: PDPalette } = {
  dark: {
    identityBorder: '#1e1a20',
    identityGradient: ['#120e14', '#0b0909', '#090707'],
    chipBorder: '#2a2230',
    panelBg: '#0A0808',
    panelBorder: '#1a1616',
    textPrimary: '#FFFFFF',
    textBody: '#9a9a9a',
    textMuted: '#6d6d6d',
    textFainter: '#4a4a4a',
    purpleText: '#c4b5fd',
    weekChipBorder: '#241f1f',
    weekChipText: '#6d6d6d',
  },
  light: {
    identityBorder: '#E5DFE8',
    identityGradient: ['#F8F5FA', '#FBF8F8', '#FFFFFF'],
    chipBorder: '#E0D8E8',
    panelBg: '#FBF8F8',
    panelBorder: '#EAE0E0',
    textPrimary: '#2A2A2A',
    textBody: '#5A5A5A',
    textMuted: '#8A8A8A',
    textFainter: '#B5B5B5',
    purpleText: '#7C5CD6',
    weekChipBorder: '#E5DADA',
    weekChipText: '#8A8A8A',
  },
};

// coral/gold are brand/accent colors, not surface colors — same in both
// modes, matching how theme.accent stays fixed elsewhere in this app.
const PD_BRAND = { coral: '#FC5454', gold: '#C9A227' };

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

  return <Animated.View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: PD_BRAND.coral, opacity: anim }} />;
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
  const { mode } = useTheme();
  const pd = PD_COLORS[mode];
  const styles = getStyles(pd);
  return (
    <View style={styles.identityCard}>
      <LinearGradient colors={pd.identityGradient} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFillObject} />
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.identityEyebrow}>ACTIVE PROGRAM</Text>
          {/* Real, user-authored casing — never uppercased, never truncated to one line. */}
          <Text style={styles.identityProgramName} numberOfLines={2}>{programName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 10 }}>
            <PulseDot />
            <Text style={styles.identityMeta} numberOfLines={1}>
              {sessionsTotal} session{sessionsTotal === 1 ? '' : 's'} · {sessionsDoneThisWeek} done this week
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 9 }}>
          <View style={styles.coachChip}>
            <MaterialCommunityIcons name="account" size={11} color={PD_BRAND.gold} />
            <Text style={styles.coachChipLabel}>COACH</Text>
            <Text style={styles.coachChipName}>{coachName.toUpperCase()}</Text>
          </View>
          <TouchableOpacity onPress={onSwitch} activeOpacity={0.8} style={styles.switchControl}>
            <Sheen borderRadius={9} />
            <MaterialCommunityIcons name="swap-horizontal" size={13} color={pd.purpleText} />
            <Text style={styles.switchLabel}>SWITCH</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Program Load Panel ─────────────────────────────────────────────────────
// The Static/Power/1MM arc trio + TOTAL PTS read as too busy next to the
// identity card and day list, so this panel is now just the one real,
// actionable control left in it — bodyweight. If discipline scores get a
// real "compare at a glance" use case again later, reintroduce the arcs
// deliberately rather than restoring this wholesale.
interface ProgramLoadPanelProps {
  bodyweightKg: number | null;
  onEditBodyweight: () => void;
}
export function ProgramLoadPanel({ bodyweightKg, onEditBodyweight }: ProgramLoadPanelProps) {
  const { mode } = useTheme();
  const styles = getStyles(PD_COLORS[mode]);
  return (
    <TouchableOpacity onPress={onEditBodyweight} activeOpacity={0.7} style={styles.bodyweightCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialCommunityIcons name="kettlebell" size={14} color={PD_BRAND.gold} />
        <Text style={styles.bodyweightLabel}>BODYWEIGHT</Text>
        <Text style={styles.bodyweightValue}>{bodyweightKg !== null ? `${bodyweightKg} KG` : '— —'}</Text>
      </View>
      <Text style={[styles.bodyweightEdit, { color: bodyweightKg !== null ? PD_BRAND.gold : PD_BRAND.coral }]}>EDIT</Text>
    </TouchableOpacity>
  );
}

// ─── Week Navigator ─────────────────────────────────────────────────────────
interface WeekNavigatorProps {
  weeksData: Record<number, any[]>;
  activeWeek: number;
  onSelectWeek: (week: number) => void;
}
export function WeekNavigator({ weeksData, activeWeek, onSelectWeek }: WeekNavigatorProps) {
  const { mode } = useTheme();
  const pd = PD_COLORS[mode];
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
                borderColor: isActive ? PD_BRAND.coral : pd.weekChipBorder,
              }}
            >
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 0.8, color: isActive ? PD_BRAND.coral : pd.weekChipText }}>
                WEEK {wNum} {allCompleted ? '✓' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}


const getStyles = (pd: PDPalette) => StyleSheet.create({
  // Program Days redesign (assets/design_handoff_program_days)
  identityCard: {
    borderRadius: 20, borderWidth: 1, borderColor: pd.identityBorder,
    padding: 20, overflow: 'hidden',
  },
  identityEyebrow: { color: pd.textFainter, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.4 },
  identityProgramName: { color: pd.textPrimary, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 21, letterSpacing: 0.6, lineHeight: 24, marginTop: 7 },
  identityMeta: { color: pd.textBody, fontFamily: 'Barlow-Light', fontSize: 11, flexShrink: 1 },
  coachChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, borderWidth: 1, borderColor: pd.chipBorder,
    backgroundColor: 'rgba(255,255,255,.02)', paddingHorizontal: 10, paddingVertical: 6,
  },
  coachChipLabel: { color: pd.textMuted, fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.6 },
  coachChipName: { color: PD_BRAND.gold, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 8.5 },
  switchControl: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, borderWidth: 1, borderColor: pd.chipBorder,
    paddingHorizontal: 11, paddingVertical: 7, overflow: 'hidden',
  },
  switchLabel: { color: pd.purpleText, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 9, letterSpacing: 0.8 },

  bodyweightCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: 16, borderWidth: 1, borderColor: pd.panelBorder, backgroundColor: pd.panelBg,
    paddingVertical: 14, paddingHorizontal: 17,
  },
  bodyweightLabel: { color: pd.textMuted, fontFamily: 'Barlow-Regular', fontSize: 9.5, letterSpacing: 0.6 },
  bodyweightValue: { color: pd.textPrimary, fontFamily: 'BarlowCondensed-SemiBold', fontSize: 12 },
  bodyweightEdit: { fontFamily: 'BarlowCondensed-SemiBold', fontSize: 9, letterSpacing: 0.6 },
});
