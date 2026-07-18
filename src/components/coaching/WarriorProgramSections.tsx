import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const bronzeGold = '#C8A040';

// ─── Program Header Card ────────────────────────────────────────────────────
interface ProgramHeaderCardProps {
  programName: string;
  coachName: string;
  theme: any;
  solidCardBg: string;
}
export function ProgramHeaderCard({ programName, coachName, theme, solidCardBg }: ProgramHeaderCardProps) {
  return (
    <LinearGradient
      colors={['#7E57C2', '#FF5252', '#FF7043']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{ padding: 1.2, borderRadius: 12 }}
    >
      <View style={[styles.introCard, { backgroundColor: solidCardBg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 11 }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={[styles.programName, { color: theme.text.primary }]} numberOfLines={1}>
            {programName.toUpperCase()}
          </Text>
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: theme.card.border, borderRadius: 20, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.5, color: theme.text.secondary }}>
            COACH: <Text style={{ color: bronzeGold }}>{coachName.toUpperCase()}</Text>
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

// ─── Switch Workout Button ──────────────────────────────────────────────────
// Deliberately high-contrast and full-width, not a small pill — this is the
// only way back to the template library once a program is already assigned,
// so it needs to be recognizable at a glance, not discovered by hunting.
interface SwitchWorkoutButtonProps {
  onPress: () => void;
  theme: any;
}
export function SwitchWorkoutButton({ onPress, theme }: SwitchWorkoutButtonProps) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <LinearGradient
        colors={['#7E57C2', '#FF5252', '#FF7043']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: 10,
          paddingVertical: 13,
        }}
      >
        <Text style={{ fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 14, letterSpacing: 1.5, color: '#FFFFFF' }}>
          ⇄ SWITCH WORKOUT
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Points Dashboard ───────────────────────────────────────────────────────
interface PointsDashboardProps {
  staticPoints: number;
  powerPoints: number;
  oneMmPoints: number;
}
export function PointsDashboard({ staticPoints, powerPoints, oneMmPoints }: PointsDashboardProps) {
  const metrics = [
    { label: 'STATIC PTS', value: staticPoints, color: '#7E57C2' },
    { label: 'POWER PTS', value: powerPoints, color: '#FF5252' },
    { label: '1MM PTS', value: oneMmPoints, color: '#FF7043' },
  ];
  return (
    <View style={styles.dashboardContainer}>
      {metrics.map(m => (
        <View key={m.label} style={styles.circleMetric}>
          <View style={[styles.outerRing, { borderColor: m.color, shadowColor: m.color }]}>
            <Text style={[styles.pointsNumber, { color: m.color }]}>{m.value}</Text>
          </View>
          <Text style={[styles.metricLabel, { color: m.color }]}>{m.label}</Text>
        </View>
      ))}
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
    <View style={{ marginBottom: 16 }}>
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
                paddingHorizontal: 20,
                borderRadius: 20,
                backgroundColor: isActive ? 'rgba(200,160,64,0.15)' : theme.card.background,
                borderWidth: 1,
                borderColor: isActive ? bronzeGold : theme.card.border,
              }}
            >
              <Text style={{ fontFamily: 'BarlowCondensed-Bold', fontSize: 14, color: isActive ? bronzeGold : theme.text.secondary }}>
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
  introCard: { borderWidth: 0, borderRadius: 12, padding: 20 },
  programName: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 15, letterSpacing: 0.8 },
  dashboardContainer: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 12, gap: 12 },
  circleMetric: { flex: 1, alignItems: 'center' },
  outerRing: { width: 68, height: 68, borderRadius: 34, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.02)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3, marginBottom: 6 },
  pointsNumber: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18, letterSpacing: 0.5 },
  metricLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 0.8 },
  progressBarWrapper: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 0.5 },
  progressValue: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 11, letterSpacing: 0.5 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', width: '100%' },
});
