import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  AccessibilityInfo,
  ImageBackground,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { BottomTabBar } from '../components/profile/BottomTabBar';
import { ActivityStatsService } from '../services/ActivityStatsService';
import { getAllPublishedTemplates } from '../lib/templateLibrary';
import { getStandaloneWorkouts } from '../lib/workoutLibrary';
import { TC_COLORS, TC_HERO_GRADIENT, TC_BUTTON_GRADIENT, TC_MOTION, TC_LAYOUT } from '../../constants/trainingCenterTokens';
import {
  HubBlock,
  HubWorkoutLog,
  computeDisplayWeeks,
  computeWeekStats,
  computeAllTimeStats,
  formatSessionsLeftSubline,
  formatWeekMeta,
  formatTemplatesSub,
  formatMovementsSub,
  formatQuickWorkoutSub,
  formatActiveProgramSub,
} from '../lib/trainingCenter';

interface HubData {
  hasActiveProgram: boolean;
  programName: string;
  currentDisplayWeek: number;
  totalWeeks: number;
  frequencyThisWeek: number;
  percentCompleteThisWeek: number;
  sessionsLeftThisWeek: number;
  nextUpBlockName: string | null;
  sessionsDone: number;
  adherencePct: number | null;
  hasHistory: boolean;
  streakDays: number;
  templatesCount: number | null;
  movementsCount: number | null;
  quickMin: number | null;
  quickMax: number | null;
}

// Staggered entrance (design handoff "rowIn": 0.4s cubic-bezier(.2,.9,.3,1.2),
// Y+14 + scale .98 -> 1) — collapses to an instant, non-staggered render
// under reduce-motion, same guard pattern as QuickWorkoutTimerModal.
function RowIn({ index, children, style }: { index: number; children: React.ReactNode; style?: any }) {
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
      style={[
        style,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function ProgressDonut({ percent, size = 96, strokeWidth = 5 }: { percent: number; size?: number; strokeWidth?: number }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(percent);
      return;
    }
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: percent,
      duration: TC_MOTION.ringDrawMs,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: false,
    }).start();
  }, [percent, reduceMotion, anim]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={TC_COLORS.ringTrack} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={TC_COLORS.coral}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
        />
      </Svg>
      <Text style={{ color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 24 }}>{percent}%</Text>
      <Text style={{ color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 8, letterSpacing: 1.4 }}>COMPLETE</Text>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface PathTileDef {
  key: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  sub: string;
  locked: boolean;
  badge: 'LIVE' | 'LOCKED' | null;
  /** The one tile that deserves the premium purple->orange treatment —
   * same gradient/sheen language as the Profile screen's own "TRAINING
   * CENTER" entry button — reserved for "my active program," the single
   * primary action in this grid. Ignored while locked (no active program
   * yet), which keeps its existing dimmed look instead. */
  primary?: boolean;
  /** Non-primary tiles each get their own accent identity instead of a
   * uniform gray card, so the whole 2x2 grid reads as four deliberate,
   * colorful destinations rather than one bright tile next to three flat
   * ones. Ignored when primary/locked. */
  accent?: string;
  /** Optional cover photo (require(...) result) — when set, the tile
   * renders as an ImageBackground with a bottom scrim instead of a flat
   * tinted card, same treatment as the primary tile. Rolling out per-tile
   * as photos are supplied; a tile with no bgImage keeps the flat
   * accent-card look. */
  bgImage?: number;
  onPress: () => void;
}

function hexToRgba(color: string, alpha: number): string {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Same slow diagonal sheen as ProfileHeader.tsx's TrainingCenterSheen —
// kept as its own local copy (not shared) matching this session's existing
// convention for this exact effect, sized for the tile's own border radius.
function TileSheen() {
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
      Animated.timing(anim, { toValue: 1, duration: TC_MOTION.sheenMs, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, width, anim]);

  if (reduceMotion) return null;
  const streakWidth = 60;
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [-streakWidth, width + streakWidth] });

  return (
    <View pointerEvents="none" style={{ ...StyleSheet.absoluteFillObject, overflow: 'hidden', borderRadius: 15 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.View style={{ position: 'absolute', top: -20, bottom: -20, width: streakWidth, transform: [{ translateX }, { rotate: '18deg' }] }}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.12)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        </Animated.View>
      )}
    </View>
  );
}

function PathTile({ def, index }: { def: PathTileDef; index: number }) {
  const isPrimary = !!def.primary && !def.locked;
  const accent = def.accent ?? TC_COLORS.coral;
  const hasPhoto = !!def.bgImage && !def.locked;

  const content = (
    <>
      {!def.locked && (hasPhoto ? <TileSheen /> : <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, { backgroundColor: hexToRgba(accent, 0.05), borderRadius: 16 }]} />)}
      <View style={styles.tileTopRow}>
        <View
          style={[
            styles.tileIconWell,
            def.locked ? { backgroundColor: 'rgba(90,90,90,0.1)' } : { backgroundColor: accent },
          ]}
        >
          <MaterialCommunityIcons name={def.icon} size={18} color={def.locked ? TC_COLORS.textFaint2 : '#000'} />
        </View>
        {def.badge && (
          <View
            style={[
              styles.tileBadge,
              def.badge === 'LIVE' ? { backgroundColor: TC_COLORS.coral } : { backgroundColor: TC_COLORS.cardLocked },
            ]}
          >
            <Text style={[styles.tileBadgeText, { color: def.badge === 'LIVE' ? '#000' : TC_COLORS.textMuted }]}>{def.badge}</Text>
          </View>
        )}
      </View>
      <Text
        style={[
          styles.tileTitle,
          { color: def.locked ? TC_COLORS.textFaint3 : TC_COLORS.textPrimary },
          hasPhoto && { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
        ]}
        numberOfLines={2}
      >
        {def.title}
      </Text>
      <Text style={[styles.tileSub, { color: def.locked ? TC_COLORS.textMuted : hexToRgba(accent, 0.9) }]} numberOfLines={1}>
        {def.sub}
      </Text>
    </>
  );

  // One shared pressable/flex container for every state — a cover photo
  // (when supplied) is just an absolute-fill layer behind `content`, not a
  // different component tree, so every tile (photo or flat) lays out
  // identically and only the primary tile needs its own outer gradient-
  // border wrapper.
  const card = (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={def.onPress}
      style={[
        styles.tile,
        isPrimary
          ? { borderWidth: 0, overflow: 'hidden' }
          : def.locked
            ? { borderColor: TC_COLORS.borderLocked, backgroundColor: TC_COLORS.cardLocked, opacity: 0.5 }
            : {
                borderColor: hexToRgba(accent, hasPhoto ? 0.45 : 0.35),
                backgroundColor: hasPhoto ? undefined : TC_COLORS.cardRaised,
                overflow: hasPhoto ? 'hidden' : undefined,
              },
      ]}
    >
      {hasPhoto && (
        <>
          <ImageBackground source={def.bgImage!} style={StyleSheet.absoluteFillObject} imageStyle={{ borderRadius: 16 }} />
          {/* Bottom-weighted scrim — the photo stays visible up top (the
              whole point of adding it), text/badges stay legible at the
              bottom where they actually sit. */}
          <LinearGradient
            colors={['rgba(5,3,3,0.15)', 'rgba(5,3,3,0.25)', 'rgba(5,3,3,0.92)']}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
        </>
      )}
      {content}
    </TouchableOpacity>
  );

  return (
    <RowIn index={index} style={{ width: '48%' }}>
      {isPrimary ? (
        <LinearGradient colors={TC_BUTTON_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileGradientBorder}>
          {card}
        </LinearGradient>
      ) : (
        card
      )}
    </RowIn>
  );
}

async function fetchMovementsCount(): Promise<number | null> {
  try {
    const { count } = await supabase.from('exercise_library').select('id', { count: 'exact', head: true });
    return count ?? null;
  } catch {
    return null;
  }
}

export function TrainingCenterScreen() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [data, setData] = useState<HubData | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const [assignmentRes, templatesRes, movementsCount, quickWorkouts, streakStats] = await Promise.all([
        supabase
          .from('warrior_programs')
          .select('id, template_id, current_week, program_templates:template_id ( name )')
          .eq('warrior_id', user.id)
          .eq('status', 'active')
          .maybeSingle(),
        getAllPublishedTemplates().catch(() => null),
        fetchMovementsCount(),
        getStandaloneWorkouts('quick_workout').catch(() => []),
        ActivityStatsService.getWeeklyStats(user.id).catch(() => ({ streakDays: 0, pointsThisWeek: 0, workoutsCompleted: 0 })),
      ]);

      const assignment = assignmentRes.data as any;
      const templatesCount = templatesRes ? templatesRes.length : null;
      const durations = quickWorkouts.map((w) => w.duration_minutes).filter((d): d is number => d != null);
      const quickMin = durations.length ? Math.min(...durations) : null;
      const quickMax = durations.length ? Math.max(...durations) : null;

      if (!assignment) {
        setData({
          hasActiveProgram: false,
          programName: '',
          currentDisplayWeek: 1,
          totalWeeks: 1,
          frequencyThisWeek: 0,
          percentCompleteThisWeek: 0,
          sessionsLeftThisWeek: 0,
          nextUpBlockName: null,
          sessionsDone: 0,
          adherencePct: null,
          hasHistory: false,
          streakDays: streakStats.streakDays,
          templatesCount,
          movementsCount,
          quickMin,
          quickMax,
        });
        return;
      }

      const templateId = assignment.template_id;
      const currentRawWeek = assignment.current_week || 1;
      const templateInfo: any = assignment.program_templates;
      const programName = Array.isArray(templateInfo) ? templateInfo[0]?.name : templateInfo?.name;

      const [archivedRes, blocksRes] = await Promise.all([
        supabase.from('program_week_archive').select('week_number').eq('template_id', templateId),
        supabase.from('program_blocks').select('id, name, order_index, week_number').eq('template_id', templateId).order('order_index', { ascending: true }),
      ]);

      const archivedRawWeekNumbers = (archivedRes.data || []).map((w: any) => w.week_number);
      const blocks: HubBlock[] = blocksRes.data || [];
      const { filteredBlocks, totalWeeks, currentDisplayWeek } = computeDisplayWeeks(blocks, archivedRawWeekNumbers, currentRawWeek);

      const [logsThisWeekRes, allLogsRes] = await Promise.all([
        supabase.from('workout_logs').select('block_id, notes').eq('warrior_program_id', assignment.id).in(
          'block_id',
          filteredBlocks.filter((b) => (b.week_number ?? 1) === currentRawWeek).map((b) => b.id)
        ),
        supabase.from('workout_logs').select('block_id, notes').eq('warrior_program_id', assignment.id),
      ]);

      const logsThisWeek: HubWorkoutLog[] = logsThisWeekRes.data || [];
      const allLogs: HubWorkoutLog[] = allLogsRes.data || [];

      const weekStats = computeWeekStats(filteredBlocks, currentRawWeek, logsThisWeek);
      const allTimeStats = computeAllTimeStats(filteredBlocks, allLogs);

      setData({
        hasActiveProgram: true,
        programName: programName || 'YOUR PROGRAM',
        currentDisplayWeek,
        totalWeeks,
        frequencyThisWeek: weekStats.frequencyThisWeek,
        percentCompleteThisWeek: weekStats.percentCompleteThisWeek,
        sessionsLeftThisWeek: weekStats.sessionsLeftThisWeek,
        nextUpBlockName: weekStats.nextUpDayName,
        sessionsDone: allTimeStats.sessionsDone,
        adherencePct: allTimeStats.adherencePct,
        hasHistory: allTimeStats.hasHistory,
        streakDays: streakStats.streakDays,
        templatesCount,
        movementsCount,
        quickMin,
        quickMax,
      });
    } catch (err: any) {
      console.error('TrainingCenterScreen load failed:', err);
      setErrorMsg('COULD NOT LOAD YOUR TRAINING CENTER.');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const tiles: PathTileDef[] = data
    ? [
        {
          key: 'active',
          icon: 'calendar-check-outline',
          title: 'ACTIVE\nPROGRAM',
          sub: formatActiveProgramSub(data.hasActiveProgram, data.currentDisplayWeek, data.totalWeeks),
          locked: !data.hasActiveProgram,
          badge: data.hasActiveProgram ? 'LIVE' : 'LOCKED',
          primary: true,
          bgImage: require('../../assets/active-program-bg.jpg'),
          onPress: () => (data.hasActiveProgram ? router.push('/warrior-program') : router.push('/program-templates')),
        },
        {
          key: 'templates',
          icon: 'layers-outline',
          title: 'PROGRAM\nTEMPLATES',
          sub: data.templatesCount != null ? formatTemplatesSub(data.templatesCount) : 'READY PLANS',
          locked: false,
          badge: null,
          accent: '#8b5cf6',
          bgImage: require('../../assets/program-templates-bg.png'),
          onPress: () => router.push('/program-templates'),
        },
        {
          key: 'customize',
          icon: 'tune-vertical',
          title: 'CUSTOMIZE\nPROGRAM',
          sub: data.movementsCount != null ? formatMovementsSub(data.movementsCount) : 'MOVEMENTS',
          locked: false,
          badge: null,
          accent: '#C9A227',
          bgImage: require('../../assets/customize-program-bg.png'),
          onPress: () => router.push('/customize-program'),
        },
        {
          key: 'quick',
          icon: 'lightning-bolt-outline',
          title: 'QUICK\nWORKOUT',
          sub: formatQuickWorkoutSub(data.quickMin, data.quickMax),
          locked: false,
          badge: null,
          accent: '#f97316',
          bgImage: require('../../assets/quick-workout-bg.png'),
          onPress: () => router.push('/quick-workout'),
        },
      ]
    : [];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={TC_COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>TRAINING CENTER</Text>
          {data && (
            <Text style={styles.headerSubline}>
              {formatSessionsLeftSubline(data.hasActiveProgram, data.sessionsLeftThisWeek, data.currentDisplayWeek)}
            </Text>
          )}
        </View>
        <View style={{ width: 26 }} />
      </View>

      {loading && (
        <View style={styles.centerFill}>
          <ActivityIndicator color={TC_COLORS.coral} />
        </View>
      )}

      {!loading && errorMsg && (
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryBtnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}

      {!loading && !errorMsg && data && (
        <ScrollView contentContainerStyle={{ padding: TC_LAYOUT.screenPadding, paddingBottom: 24 }}>
          <RowIn index={0}>
            {data.hasActiveProgram ? (
              <View style={[styles.heroCard, { borderColor: TC_COLORS.heroBorderActive }]}>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <ProgressDonut percent={data.percentCompleteThisWeek} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.heroEyebrow}>ACTIVE PROGRAM</Text>
                    <Text style={styles.heroProgramName} numberOfLines={2}>{data.programName.toUpperCase()}</Text>
                    <Text style={styles.heroMeta}>{formatWeekMeta(data.currentDisplayWeek, data.totalWeeks, data.frequencyThisWeek)}</Text>
                    {data.nextUpBlockName && (
                      <View style={styles.heroNextRow}>
                        <View style={styles.heroDot} />
                        <Text style={styles.heroNextText} numberOfLines={1}>Next up · {data.nextUpBlockName}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <TouchableOpacity style={styles.continueBtn} onPress={() => router.push('/warrior-program')}>
                    <MaterialCommunityIcons name="play" size={16} color="#000" />
                    <Text style={styles.continueBtnText}>CONTINUE</Text>
                  </TouchableOpacity>
                  {/* Same visual identity as the Leap Coach FAB on Profile
                      (CoachFab.tsx) — circular, coral fill, coral glow, the
                      waveform-bar icon (its own shared motif with the chat
                      composer's send button) — just docked inline here
                      instead of floating, and without the FAB's own
                      breathing-ring/bob/greeting-bubble behavior. */}
                  <TouchableOpacity style={styles.coachEntryBtn} onPress={() => router.push('/coach')} accessibilityLabel="Open Leap Coach">
                    {[8, 14, 10, 6].map((h, i) => (
                      <View key={i} style={[styles.coachEntryBar, { height: h }]} />
                    ))}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.heroCard, styles.heroCardEmpty]}>
                <View style={styles.heroEmptyIconWrap}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={28} color={TC_COLORS.textFaint} />
                </View>
                <Text style={styles.heroEmptyTitle}>No program assigned</Text>
                <Text style={styles.heroEmptySub}>Pick a template or build your own to unlock your plan.</Text>
                <TouchableOpacity style={[styles.continueBtn, { alignSelf: 'stretch', justifyContent: 'center' }]} onPress={() => router.push('/program-templates')}>
                  <Text style={styles.continueBtnText}>BROWSE TEMPLATES</Text>
                </TouchableOpacity>
              </View>
            )}
          </RowIn>

          {data.hasHistory && (
            <RowIn index={1} style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.sessionsDone}</Text>
                <Text style={styles.statLabel}>SESSIONS DONE</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={[styles.statValue, { color: TC_COLORS.coral }]}>{data.adherencePct ?? 0}%</Text>
                <Text style={styles.statLabel}>ADHERENCE</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{data.streakDays}</Text>
                <Text style={styles.statLabel}>WEEK STREAK</Text>
              </View>
            </RowIn>
          )}

          <Text style={styles.sectionEyebrow}>CHOOSE YOUR PATH</Text>
          <View style={styles.tileGrid}>
            {tiles.map((t, i) => (
              <PathTile key={t.key} def={t} index={i + 2} />
            ))}
          </View>
        </ScrollView>
      )}

      <BottomTabBar activeTab="profile" strengthTier={profile?.strength_tier || 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: TC_COLORS.screenBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: TC_LAYOUT.screenPadding,
    paddingTop: 14,
    paddingBottom: 10,
  },
  headerTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 19, letterSpacing: 1.9 },
  headerSubline: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 9.5, letterSpacing: 2, marginTop: 3 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { color: TC_COLORS.textSecondary, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, textAlign: 'center', paddingHorizontal: 30 },
  retryBtn: { backgroundColor: TC_COLORS.coral, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.4 },

  heroCard: { borderRadius: 20, borderWidth: 1, padding: 18, backgroundColor: TC_COLORS.cardFlat },
  heroCardEmpty: { borderColor: TC_COLORS.dividerFaint, backgroundColor: TC_COLORS.cardFlat, alignItems: 'center', gap: 6 },
  heroEmptyIconWrap: {
    width: 52, height: 52, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: TC_COLORS.borderStrong,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  heroEmptyTitle: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 14 },
  heroEmptySub: { color: TC_COLORS.textMuted, fontFamily: 'Barlow-Regular', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  heroEyebrow: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 2 },
  heroProgramName: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-Bold', fontSize: 19, marginTop: 2 },
  heroMeta: { color: TC_COLORS.coral, fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1.6, marginTop: 4 },
  heroNextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: TC_COLORS.coral },
  heroNextText: { color: TC_COLORS.textBody, fontFamily: 'Barlow-Light', fontSize: 12.5, flexShrink: 1 },
  continueBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: TC_COLORS.coral, borderRadius: 12, height: 46,
  },
  continueBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.6 },
  coachEntryBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: TC_COLORS.coral,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2.5,
    shadowColor: TC_COLORS.coral, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 16, elevation: 10,
  },
  coachEntryBar: { width: 2, borderRadius: 2, backgroundColor: '#fff' },

  statCard: { flex: 1, borderWidth: 1, borderColor: TC_COLORS.border, borderRadius: 12, backgroundColor: TC_COLORS.cardFlat, alignItems: 'center', paddingVertical: 12, gap: 4 },
  statValue: { color: TC_COLORS.textPrimary, fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 17 },
  statLabel: { color: TC_COLORS.textMuted, fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 1.3 },

  sectionEyebrow: { color: TC_COLORS.textFaint, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 2.4, marginTop: 22, marginBottom: 10 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: TC_LAYOUT.tileGap, justifyContent: 'space-between' },
  tile: { borderWidth: 1, borderRadius: 16, padding: 14, minHeight: 118, justifyContent: 'space-between' },
  tileGradientBorder: {
    padding: 1.5, borderRadius: 17,
    shadowColor: TC_COLORS.coral, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 16, elevation: 5,
  },
  tileTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileIconWell: { width: 36, height: 36, borderRadius: 10, backgroundColor: TC_COLORS.iconWell, alignItems: 'center', justifyContent: 'center' },
  tileBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  tileBadgeText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 8, letterSpacing: 1.1 },
  tileTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 13.5, letterSpacing: 1.1, lineHeight: 16, marginTop: 10 },
  tileSub: { fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 1.4, marginTop: 4 },
});
