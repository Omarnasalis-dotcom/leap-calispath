import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { shareCardImage } from '../../lib/shareCard';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { kt } from '../worlds/kit';
import { LeapLogo } from '../LeapLogo';
import { clamp01, easeOutBack, easeOutCubic } from '../../lib/prCelebration';
import { inferBlockAccent } from '../../lib/warriorProgramDays';
import {
  cardGlow, completionPct, formatSessionDuration, programNameSize, segmentLand, segmentProgress, statSpans, statValueSize,
  WC_AFTER, wcTimeline,
} from '../../lib/workoutComplete';
import { getWCTokens, WCTokens } from './sessionCompleteTokens';
import { SessionRing } from './SessionRing';
import { isArabic, ltr, t } from '../../i18n';

export interface SessionCompleteBlock {
  name: string;
  status: 'completed' | 'missed';
}

interface SessionCompleteScreenProps {
  visible: boolean;
  programName: string;
  /** e.g. "WEEK 2 · DAY 3: PULL". */
  dayName: string;
  /** The day's blocks in workout order, every one logged or missed. */
  blocks: SessionCompleteBlock[];
  exercisesDone: number;
  totalReps: number;
  bodyweightKg: number | null;
  sessionSeconds: number;
  onClose: () => void;
}

/** Clock runs far past the end so the ambient motes keep drifting. */
const CLOCK_END = 900;
const MOTE_LOOP = 600;

/** Fades a block up `dy` px starting at `start` (seconds on the clock). */
function useFadeUp(clock: SharedValue<number>, start: number, dy = 14, dur = 0.5, fade?: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - start) / dur));
    return { opacity: p * (fade ? fade.value : 1), transform: [{ translateY: (1 - p) * dy }] };
  });
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function Mote({ clock, i, start, color, max }: { clock: SharedValue<number>; i: number; start: number; color: string; max: number }) {
  const x = (i * 53 + 17) % 330;
  const y = (i * 97 + 40) % MOTE_LOOP;
  const s = 2 + (i % 3);
  const v = 12 + (i % 4) * 5;
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    return {
      opacity: clamp01((T - start) / 1) * max,
      transform: [{ translateX: x + Math.sin(T * 1.3 + x) * 4 }, { translateY: (((y - T * v) % MOTE_LOOP) + MOTE_LOOP) % MOTE_LOOP }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: s, height: s, borderRadius: s / 2, backgroundColor: color }, style]} />;
}

function StatsGrid({ tokens: tk, stats }: { tokens: WCTokens; stats: { label: string; value: string; sub?: string }[] }) {
  const spans = statSpans(stats.length);
  const rows = stats.length === 5 ? [stats.slice(0, 3), stats.slice(3)] : [stats.slice(0, 2), stats.slice(2)];
  let k = 0;
  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: tk.statsBorder, overflow: 'hidden', backgroundColor: tk.statsBg }}>
      {rows.map((row, r) => (
        <View key={r} style={[{ flexDirection: 'row' }, r > 0 && { borderTopWidth: 1, borderTopColor: tk.statsBorder }]}>
          {row.map((s, c) => {
            const span = spans[k++];
            return (
              <View key={s.label} style={[{ flex: 1, minWidth: 0, paddingVertical: 14, paddingHorizontal: 16 }, c > 0 && { borderStartWidth: 1, borderStartColor: tk.statsBorder }]}>
                <Text style={kt('medium', isArabic ? 12 : 10.5, tk.t4, 2)} numberOfLines={1}>{s.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4, direction: 'ltr', alignSelf: 'flex-start' }}>
                  <Text style={[kt('bold', statValueSize(s.value, span), tk.t1), { fontVariant: ['tabular-nums'] }]} numberOfLines={1}>{s.value}</Text>
                  {!!s.sub && <Text style={kt('medium', 13, tk.t5)}>{s.sub}</Text>}
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function SessionCompleteScreen(props: SessionCompleteScreenProps) {
  if (!props.visible || props.blocks.length === 0) return null;
  return <SessionCompleteModal {...props} />;
}

/**
 * Workout Complete milestone card (assets/design_handoff_workout_complete):
 * the day's blocks light up around a segmented ring, then the session's
 * stats. One Reanimated clock drives the whole timeline.
 */
function SessionCompleteModal({
  programName, dayName, blocks, exercisesDone, totalReps, bodyweightKg, sessionSeconds, onClose,
}: SessionCompleteScreenProps) {
  const { mode } = useTheme();
  const tk = useMemo(() => getWCTokens(mode), [mode]);
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);

  const segments = useMemo(
    () => blocks.map(b => ({ color: inferBlockAccent(b.name).color, missed: b.status === 'missed' })),
    [blocks],
  );
  const n = segments.length;
  const completed = useMemo(() => segments.map((s, i) => (s.missed ? -1 : i)).filter(i => i >= 0), [segments]);
  const done = completed.length;
  const full = done === n;
  const none = done === 0;
  const pct = completionPct(done, n);
  const tl = useMemo(() => wcTimeline(n, full), [n, full]);
  const lands = useMemo(() => completed.map(i => segmentLand(i, tl)), [completed, tl]);

  const clock = useSharedValue(0);
  const fade = useSharedValue(1);

  const run = (from: number) => {
    cancelAnimation(clock);
    clock.value = from;
    clock.value = withTiming(CLOCK_END, { duration: (CLOCK_END - from) * 1000, easing: Easing.linear });
  };

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(rm => {
      if (!alive) return;
      if (rm) {
        fade.value = 0;
        fade.value = withTiming(1, { duration: 200 });
        run(tl.end);
      } else {
        run(0);
      }
    }).catch(() => run(0));
    return () => { alive = false; cancelAnimation(clock); };
  }, []);

  // ── Haptics + sound (sounds respect the Arena mute inside SoundService) ─
  const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); SoundService.playTick(); };
  const lockCue = () => {
    if (none) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    SoundService.playBoxingBell();
  };
  const fuseCue = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {}); };

  // A tick per completed block landing; a skip jumps several at once, so it
  // stays quiet (only the LOCK cue still plays).
  useAnimatedReaction(
    () => lands.filter(l => clock.value >= l).length,
    (now, was) => { if (was != null && now - was === 1 && clock.value < tl.lock + 0.05) runOnJS(tick)(); },
  );
  useAnimatedReaction(() => clock.value >= tl.lock, (now, was) => { if (now && was === false) runOnJS(lockCue)(); });
  useAnimatedReaction(
    () => full && clock.value >= tl.fuse,
    (now, was) => { if (now && was === false && clock.value < tl.fuse + 0.2) runOnJS(fuseCue)(); },
  );

  const skip = () => {
    if (clock.value < tl.end) run(tl.end);
  };

  // ── Animated styles ─────────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp01(clock.value / 0.35) * fade.value }));
  const cardStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - 0.05) / 0.55);
    return {
      opacity: clamp01(p * 1.6) * fade.value,
      transform: [{ translateY: (1 - easeOutCubic(p)) * 40 }, { scale: 0.9 + 0.1 * easeOutBack(p) }],
    };
  });
  const glowStyle = useAnimatedStyle(() => {
    const T = clock.value;
    let sum = 0;
    for (let k = 0; k < completed.length; k++) sum += segmentProgress(T, completed[k], n, tl);
    const frac = completed.length ? sum / completed.length : 0;
    return { opacity: Math.min(1, cardGlow(T, tl, frac, full, none) * 1.6 * tk.glowK) };
  });

  const eyebrowStyle = useFadeUp(clock, 0.35, 8);
  const titleStyle = useFadeUp(clock, tl.c0 + WC_AFTER.title);
  const statsStyle = useFadeUp(clock, tl.c0 + WC_AFTER.stats);
  const logoStyle = useFadeUp(clock, tl.c0 + WC_AFTER.logo, 6);
  const doneStyle = useFadeUp(clock, tl.c0 + WC_AFTER.share, 24, 0.5, fade);

  const handleShare = async () => {
    skip();
    const result = await shareCardImage(cardRef, 'session-complete-card', 'leap-arena-workout.png');
    if (result === 'unavailable') Alert.alert(t('sessionComplete.shareUnavailableTitle'), t('sessionComplete.shareUnavailable'));
    else if (result === 'failed') Alert.alert(t('sessionComplete.error'), t('sessionComplete.imageFailed'));
  };

  const name = programName || t('sessionComplete.yourWorkout');
  const nameSize = programNameSize(name);
  const date = new Date().toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const stats = [
    { label: t('sessionComplete.blocksDone'), value: String(done), sub: `/${n}` },
    { label: t('sessionComplete.duration'), value: formatSessionDuration(sessionSeconds) },
    { label: t('sessionComplete.totalReps'), value: Math.max(0, totalReps).toLocaleString('en-US') },
    { label: t('sessionComplete.exercises'), value: String(Math.max(0, exercisesDone)) },
    ...(bodyweightKg !== null && bodyweightKg > 0
      ? [{ label: t('sessionComplete.bodyweight'), value: String(Math.round(bodyweightKg * 10) / 10), sub: t('sessionComplete.kg') }]
      : []),
  ];

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: tk.backdrop }, backdropStyle]} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Tapping the card skips to the final frame; the backdrop does nothing. */}
        <Pressable onPress={skip} accessibilityHint={t('prCelebration.tapToSkip')}>
          <Animated.View style={cardStyle}>
            {/* Glow behind the card (not captured in the shared image). */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
              borderRadius: 30, backgroundColor: tk.card, boxShadow: `0 0 70px 4px ${tk.accent}`,
            }, glowStyle]} />
            <View
              ref={cardRef}
              collapsable={false}
              nativeID="session-complete-card"
              style={{ borderRadius: 30, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 24, backgroundColor: tk.card, borderWidth: 1, borderColor: tk.cardBorder, overflow: 'hidden' }}
            >
              <LinearGradient
                pointerEvents="none"
                colors={[tk.radial, 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.55 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, { direction: 'ltr' }]}>
                {Array.from({ length: 13 }, (_, i) => (
                  <Mote key={i} clock={clock} i={i} start={tl.c0 + WC_AFTER.motes} color={none ? tk.t5 : tk.mote} max={none ? 0.3 : 0.55} />
                ))}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <MaterialCommunityIcons name="dumbbell" size={13} color={tk.accent} />
                  <Text style={kt('semibold', isArabic ? 12 : 11, tk.accent, 2.4)}>{t('sessionComplete.training')}</Text>
                </View>
                <Text style={kt('medium', 11, tk.t5, 1.6)}>{ltr(date)}</Text>
              </View>

              <Animated.Text style={[kt('semibold', isArabic ? 14 : 12, tk.t2, 4), { marginTop: 20, textAlign: 'center' }, eyebrowStyle]}>
                {none ? t('sessionComplete.sessionLogged') : t('sessionComplete.workoutComplete')}
              </Animated.Text>

              <SessionRing clock={clock} tokens={tk} tl={tl} segments={segments} pct={pct} unit={t('sessionComplete.complete')} />

              <Animated.View style={[{ marginTop: 16 }, titleStyle]}>
                <Text
                  style={[kt('bold', nameSize, tk.t1, 1.4, Math.round(nameSize * 1.15)), { textAlign: 'center' }]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={22 / nameSize}
                >
                  {name.toUpperCase()}
                </Text>
                {!!dayName && (
                  <Text style={[kt('medium', 13, tk.t3, 1.6), { textAlign: 'center', marginTop: 6 }]} numberOfLines={1}>{dayName}</Text>
                )}
              </Animated.View>

              <Animated.View style={[{ marginTop: 18 }, statsStyle]}>
                <StatsGrid tokens={tk} stats={stats} />
              </Animated.View>

              <Animated.View style={[{ marginTop: 18, alignItems: 'center' }, logoStyle]}>
                <View style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: tk.pillBorder, flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' }}>
                  <LeapLogo size={18} animated={false} />
                  <Text style={kt('semibold', 11, tk.t1, 2.4)}>LEAP ARENA</Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </Pressable>

        {/* DONE is the one primary action; Share is a square icon beside it
            (outside the card, so it never appears in the shared image). */}
        <Animated.View style={[{ flexDirection: 'row', gap: 10, paddingTop: 20 }, doneStyle]}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => ({
              flex: 1, height: 56, borderRadius: 16, backgroundColor: tk.accent, alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 10px 30px ${tk.accent}4D`, opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={kt('bold', 16, '#ffffff', 2.6)}>{t('sessionComplete.done')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sessionComplete.share')}
            onPress={handleShare}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: tk.doneBorder, backgroundColor: tk.doneBg,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
            })}
          >
            <ShareIcon color={tk.doneText} />
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Modal>
  );
}
