import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { countPassed } from '../../lib/fx/easing';
import { useTheme } from '../../contexts/ThemeContext';
import { shareCardImage } from '../../lib/shareCard';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { KitIcon, kt } from '../worlds/kit';
import { LeapLogo } from '../LeapLogo';
import { initials } from '../../lib/worldStanding';
import {
  AFTER_LOCK, clamp01, easeOutBack, easeOutCubic, formatKg, gainOf, plateStack, PRWorld, RING_LOCK, ringProgress, settledAt, formatClock,
} from '../../lib/prCelebration';
import { getPRTokens, PRTokens } from './prTokens';
import { StaticHero } from './StaticHero';
import { EnduranceHero } from './EnduranceHero';
import { PowerHero } from './PowerHero';
import { StrengthHero } from './StrengthHero';
import { Motes } from './Motes';
import { isArabic, ltr, t as tr } from '../../i18n';

export interface PRCelebrationProps {
  visible: boolean;
  world: PRWorld;
  movement: string;
  /** Seconds (static), reps (endurance) or kg (power). */
  value: number;
  /** null / 0 for a first record. */
  previous: number | null;
  handle: string;
  /** Strength: leaderboard rank before → after the new best (row counts it up). */
  rank?: { from: number; to: number; of: number } | null;
  onDismiss: () => void;
}

/** Clock runs far past the end so the ambient motes keep drifting. */
const CLOCK_END = 900;

const WORLD_TITLE: Record<PRWorld, string> = {
  static: 'celebration.staticWorld',
  endurance: 'celebration.enduranceWorld',
  power: 'celebration.powerWorld',
  strength: 'celebration.strengthWorld',
};

export function formatPRValue(world: PRWorld, v: number): string {
  if (world === 'strength') return formatClock(v);
  if (world === 'power') return tr('prCelebration.valueKg', { v: formatKg(v) });
  if (world === 'static') return tr('prCelebration.valueSec', { v: Math.round(v) });
  return tr('prCelebration.valueReps', { count: Math.round(v) });
}

function formatGain(world: PRWorld, gain: number): string {
  if (world === 'strength') return `−${formatClock(gain)}`;
  if (world === 'power') return tr('prCelebration.gainKg', { v: formatKg(gain) });
  if (world === 'static') return tr('prCelebration.gainSec', { v: Math.round(gain) });
  return tr('prCelebration.gainReps', { count: Math.round(gain) });
}

/** Fades a block up `dy` px starting at `start` (seconds on the clock). */
function useFadeUp(clock: SharedValue<number>, start: number, dy = 14, dur = 0.5) {
  return useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - start) / dur));
    return { opacity: p, transform: [{ translateY: (1 - p) * dy }] };
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

function WorldIcon({ world, color }: { world: PRWorld; color: string }) {
  if (world === 'strength') {
    return (
      <Svg width={12} height={12} viewBox="0 0 13 13">
        {[0, 1, 2, 3].map(i => <Rect key={i} x={i * 3.4} y={9 - i * 2.6} width={2.4} height={4 + i * 2.6} rx={1} fill={color} />)}
      </Svg>
    );
  }
  return <KitIcon name={world === 'static' ? 'snowflake' : world === 'endurance' ? 'stopwatch' : 'bolt'} size={12} color={color} strokeWidth={2.6} />;
}

export function PRCelebration(props: PRCelebrationProps) {
  if (!props.visible) return null;
  return <PRCelebrationModal {...props} />;
}

function PRCelebrationModal({ world, movement, value, previous, handle, rank, onDismiss }: PRCelebrationProps) {
  const { mode } = useTheme();
  const t: PRTokens = useMemo(() => getPRTokens(world, mode), [world, mode]);
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);

  const prev = previous != null && previous > 0 ? previous : null;
  const stack = useMemo(() => (world === 'power' ? plateStack(value) : null), [world, value]);
  const lock = stack ? stack.lock : RING_LOCK;
  // The rank count (Strength) can run past the usual settled frame; skip and
  // Reduce Motion land after it, on the final rank.
  const end = rank ? Math.max(settledAt(lock), rankSchedule(lock, rank).end + 0.3) : settledAt(lock);
  const landTimes = useMemo(() => stack?.plates.map(p => p.land) ?? [], [stack]);
  const strength = world === 'strength';
  const gain = gainOf(value, prev, strength);

  const clock = useSharedValue(0);
  const fade = useSharedValue(1);
  const [reduceMotion, setReduceMotion] = useState(false);

  const run = (from: number) => {
    cancelAnimation(clock);
    clock.value = from;
    clock.value = withTiming(CLOCK_END, { duration: (CLOCK_END - from) * 1000, easing: Easing.linear });
  };

  useEffect(() => {
    let alive = true;
    // Sounds loaded before their beats (the first play is otherwise late).
    SoundService.preload();
    AccessibilityInfo.isReduceMotionEnabled().then(rm => {
      if (!alive) return;
      setReduceMotion(rm);
      if (rm) {
        fade.value = 0;
        fade.value = withTiming(1, { duration: 200 });
        run(end);
      } else {
        run(0);
      }
    }).catch(() => run(0));
    return () => { alive = false; cancelAnimation(clock); };
  }, []);

  // ── Haptics (and the skip still plays the LOCK one) ─────────────────────
  // Sounds respect the Arena sounds mute inside SoundService.
  const tapLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); SoundService.playTick(); };
  const tick = () => SoundService.playTick();
  const tapMedium = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); };
  const tapLock = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); SoundService.playBoxingBell(); };

  useAnimatedReaction(() => clock.value >= lock, (now, was) => {
    if (now && was === false) runOnJS(tapLock)();
  });
  useAnimatedReaction(
    () => (world === 'power' ? countPassed(landTimes, clock.value) : -1),
    (now, was) => { if (was != null && now > was && clock.value < lock) runOnJS(tapLight)(); },
  );
  useAnimatedReaction(
    () => (world !== 'power' && prev != null ? ringProgress(clock.value) * value >= prev : false),
    (now, was) => { if (now && was === false && clock.value < lock) runOnJS(tapMedium)(); },
  );

  // A tick per count on the ring worlds — only for short counts, so a big
  // number doesn't turn into a buzz.
  useAnimatedReaction(
    () => (world !== 'power' && !strength && value <= 30 ? Math.round(ringProgress(clock.value) * value) : -1),
    (now, was) => { if (was != null && now > was && now - was === 1 && clock.value < lock) runOnJS(tick)(); },
  );

  const skip = () => {
    if (clock.value < end) run(end);
  };

  // ── Animated styles ─────────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp01(clock.value / 0.35) * fade.value }));

  const cardStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const p = clamp01((T - 0.05) / 0.55);
    let shake = 0;
    if (world === 'power') {
      if (T >= lock && T < lock + 0.4) {
        shake = Math.sin((T - lock) * 70) * 8 * (1 - (T - lock) / 0.4);
      } else if (T < lock) {
        let lastLand = -1;
        for (let i = 0; i < landTimes.length; i++) if (T >= landTimes[i]) lastLand = landTimes[i];
        const hit = lastLand > 0 && T - lastLand < 0.18 ? 1 - (T - lastLand) / 0.18 : 0;
        shake = Math.sin(T * 90) * hit * 3;
      }
    }
    return {
      opacity: clamp01(p * 1.6) * fade.value,
      transform: [
        { translateX: shake },
        { translateY: (1 - easeOutCubic(p)) * 40 },
        { scale: 0.9 + 0.1 * easeOutBack(p) },
      ],
    };
  });

  const glowStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const locked = T >= lock;
    const settle = clamp01((T - lock) / 0.9);
    let g: number;
    if (world === 'power') g = locked ? 0.3 + 0.25 * (1 - settle) : 0.12;
    else g = locked ? 0.3 + 0.2 * (1 - settle) : 0.12 + ringProgress(T) * 0.1;
    return { opacity: g * 1.6 };
  });

  const borderFlash = useAnimatedStyle(() => {
    const T = clock.value;
    return { opacity: world === 'power' && T >= lock ? 0.8 * (1 - clamp01((T - lock) / 0.9)) : 0 };
  });

  const flashStyle = useAnimatedStyle(() => {
    const T = clock.value;
    return { opacity: world === 'power' && T >= lock ? 0.2 * (1 - clamp01((T - lock) / 0.25)) : 0 };
  });

  const titleStyle = useFadeUp(clock, 0.35, 8);
  const nameStyle = useFadeUp(clock, lock + AFTER_LOCK.movement);
  const statsStyle = useFadeUp(clock, lock + AFTER_LOCK.stats);
  const logoStyle = useFadeUp(clock, lock + AFTER_LOCK.logo, 6);
  const actionsStyle = useFadeUp(clock, lock + AFTER_LOCK.share, 24);
  const gainPop = useAnimatedStyle(() => {
    const s = lock + AFTER_LOCK.stats;
    const T = clock.value;
    return { transform: [{ scale: T > s ? 1 + 0.25 * Math.sin(clamp01((T - s) / 0.35) * Math.PI) : 1 }] };
  });

  // ── Share / save (same capture path as CelebrationBanner) ───────────────
  const onShare = async () => {
    skip();
    const result = await shareCardImage(cardRef, 'pr-celebration-card', 'leap-arena-pr.png');
    if (result === 'unavailable') Alert.alert(tr('celebration.shareUnavailableTitle'), tr('celebration.shareUnavailable'));
    else if (result === 'failed') Alert.alert(tr('celebration.error'), tr('celebration.shareFailed'));
  };

  const date = new Date().toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  // A first record counts the whole result as the gain (owner decision).
  const gainText = formatGain(world, gain ? gain.gain : value);
  const heroProps = { clock, tokens: t, value, previous: prev, lock, reduceMotion };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onDismiss}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }, backdropStyle]} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top + (world === 'power' ? 8 : 16), paddingBottom: insets.bottom + 16 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        {/* Tapping the card skips to the final frame; the backdrop does nothing. */}
        <Pressable onPress={skip} accessibilityHint={tr('prCelebration.tapToSkip')}>
          <Animated.View style={cardStyle}>
            {/* Glow behind the card (not captured in the shared image). */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, {
              borderRadius: 30, backgroundColor: t.cardBg, boxShadow: `0 0 70px 4px ${t.accent}`,
            }, glowStyle]} />
            <View
              ref={cardRef}
              collapsable={false}
              nativeID="pr-celebration-card"
              style={{ borderRadius: 30, paddingTop: 22, paddingHorizontal: 22, paddingBottom: 24, backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder, overflow: 'hidden' }}
            >
              <LinearGradient
                pointerEvents="none"
                colors={[t.cardGlow, 'transparent']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 0.55 }}
                style={StyleSheet.absoluteFill}
              />
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: 30, borderWidth: 1, borderColor: t.accent }, borderFlash]} />
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#ffd6d0' }, flashStyle]} />
              {!reduceMotion && world !== 'power' && <Motes clock={clock} tokens={t} world={world} lock={lock} />}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                  <WorldIcon world={world} color={t.accentText} />
                  <Text style={kt('semibold', 11, t.accentText, 2.4)}>{tr(WORLD_TITLE[world] as 'celebration.staticWorld')}</Text>
                </View>
                <Text style={kt('medium', 11, t.textFaint, 1.6)}>{date}</Text>
              </View>

              <Animated.Text style={[kt('semibold', 12, t.textSecondary, 4), { marginTop: 20, textAlign: 'center' }, titleStyle]}>
                {tr(strength ? 'prCelebration.newBestTime' : 'prCelebration.newRecord')}
              </Animated.Text>

              {world === 'static' && <StaticHero {...heroProps} />}
              {world === 'endurance' && <EnduranceHero {...heroProps} />}
              {world === 'power' && stack && <PowerHero {...heroProps} stack={stack} />}
              {strength && <StrengthHero {...heroProps} />}

              <Animated.View style={[{ marginTop: 16 }, nameStyle]}>
                <Text style={[kt('bold', 30, t.text, 1.4, 34), { textAlign: 'center' }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {movement.toUpperCase()}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.avatarBg, borderWidth: 1.5, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={kt('semibold', 9, t.text)}>{initials(handle)}</Text>
                  </View>
                  <Text style={kt('medium', 13, t.textDim, 1.6)} numberOfLines={1}>{`@${handle.replace(/^@/, '').toUpperCase()}`}</Text>
                </View>
              </Animated.View>

              <Animated.View style={[{
                marginTop: 20, flexDirection: 'row', paddingVertical: 16, borderRadius: 18,
                backgroundColor: t.statsBg, borderWidth: 1, borderColor: t.statsBorder,
              }, statsStyle]}>
                <View style={{ flex: 1, paddingHorizontal: 18 }}>
                  <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('prCelebration.previousBest')}</Text>
                  <Text
                    style={[kt('semibold', 22, t.textDim), { marginTop: 4 }, prev != null && { textDecorationLine: 'line-through', textDecorationColor: t.strike }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {prev != null ? ltr(formatPRValue(world, prev)) : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 18, borderStartWidth: 1, borderStartColor: t.statsBorder }}>
                  <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr(strength ? 'prCelebration.timeSaved' : 'prCelebration.gain')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, marginTop: 4 }}>
                    <Animated.Text
                      style={[kt('bold', gainText.length > 8 ? 20 : 24, t.accentText), gainPop]}
                      numberOfLines={1}
                    >
                      {ltr(gainText)}
                    </Animated.Text>
                    {gain && <Text style={kt('medium', 12, t.textFaint)}>{ltr(`${strength ? '−' : '+'}${gain.pct}%`)}</Text>}
                  </View>
                </View>
              </Animated.View>

              {rank && <RankRow clock={clock} tokens={t} lock={lock} rank={rank} reduceMotion={reduceMotion} />}

              <Animated.View style={[{ marginTop: 18, alignItems: 'center' }, logoStyle]}>
                <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: t.pillBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <LeapLogo size={18} animated={false} />
                  <Text style={kt('semibold', 11, t.text, 2.4)}>LEAP ARENA</Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </Pressable>

        {/* DONE is the one primary action; Share is a square icon beside it
            (outside the card, so it never appears in the shared image). The
            share sheet also offers saving the image to Photos. */}
        <Animated.View style={[{ flexDirection: 'row', gap: 10, paddingTop: 20 }, actionsStyle]}>
          <Pressable
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => ({
              flex: 1, height: 56, borderRadius: 16, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 10px 30px ${t.accent}4D`, opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={kt('bold', 16, t.onAccent, 2.6)}>{tr('prCelebration.done')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr('prCelebration.share')}
            onPress={onShare}
            hitSlop={4}
            style={({ pressed }) => ({
              width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: t.saveBorder,
              // Sits on the dimmed backdrop: light mode's mid-grey needs a solid fill.
              backgroundColor: t.mode === 'dark' ? 'transparent' : t.cardBg,
              alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1,
            })}
          >
            <ShareIcon color={t.saveText} />
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Modal>
  );
}

const PODIUM = ['#F5C451', '#C9CED6', '#CD7F32'] as const;

/**
 * Rank count timing: constant deceleration, like braking evenly. The count
 * starts at full speed and its speed falls in a straight line to zero just as
 * it reaches your rank: position = 1 − (1 − t)², so place k is passed at
 * t = 1 − √(1 − k/n). The whole count lasts 0.8·√n s (0.8–3.2 s), which makes
 * the last place take about 0.8 s on any board. `steps[i]` = absolute clock.
 */
function rankSchedule(lock: number, rank: { to: number; of: number }) {
  const start = lock + AFTER_LOCK.stats + 0.15;
  const n = Math.max(0, rank.of - rank.to);
  const total = n > 0 ? Math.min(3.2, Math.max(0.8, 0.8 * Math.sqrt(n))) : 0;
  const steps = Array.from({ length: n }, (_, i) => start + total * (1 - Math.sqrt(1 - (i + 1) / n)));
  // A tick for every place slow enough to hear on its own (≥ 0.1 s since the
  // previous one); the quick run-in of a big board stays quiet.
  const audible = steps.map((t, i) => t - (i === 0 ? start : steps[i - 1]) >= 0.1);
  return { start, steps, end: start + total, audible };
}

/**
 * Strength: the leaderboard rank the new best earned, counted from the
 * board's size down to it (#48 → #5) under constant deceleration, a tick on
 * each of the last three. Top 3 lands with a crown (1st) or a silver / bronze medal. Inside
 * the card, so it's in the shared image.
 */
function RankRow({ clock, tokens: t, lock, rank, reduceMotion }: {
  clock: SharedValue<number>; tokens: PRTokens; lock: number; rank: { from: number; to: number; of: number }; reduceMotion: boolean;
}) {
  // Reduce Motion: no count, the final rank at once (the rank usually
  // arrives after the card opened, so the clock alone can't settle it).
  const sched = useMemo(() => (reduceMotion ? { start: 0, steps: [] as number[], end: 0, audible: [] as boolean[] } : rankSchedule(lock, rank)), [lock, rank, reduceMotion]);
  const steps = sched.steps;
  const improved = Math.max(0, rank.from - rank.to);
  const podium = rank.to <= 3 ? rank.to : 0;
  const [shown, setShown] = useState(reduceMotion ? rank.to : rank.of);
  const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); SoundService.playTick(); };
  const land = () => {
    if (podium) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    SoundService.playLand();
  };
  const audible = sched.audible;
  useAnimatedReaction(
    () => countPassed(steps, clock.value),
    (now, was) => {
      if (now === was || reduceMotion) return;
      runOnJS(setShown)(rank.of - now);
      // One cue per place as the number changes (a skip jumps several: quiet,
      // except the landing). Sounds respect the app mute inside SoundService.
      if (was == null || now <= was) return;
      if (now === steps.length) runOnJS(land)();
      else if (now - was === 1 && audible[now - 1]) runOnJS(tick)();
    },
  );
  const rowStyle = useFadeUp(clock, sched.start - 0.3, 10, 0.35);
  const popAt = sched.end;
  const chipStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - popAt) / 0.3);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.6 + 0.4 * easeOutBack(p) : 0.6 }] };
  });
  const medalStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - popAt) / 0.4);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.3 + 0.7 * easeOutBack(p) : 0.3 }, { rotate: `${(1 - clamp01(p)) * -25}deg` }] };
  });
  const numBump = useAnimatedStyle(() => {
    const b = clock.value > popAt && clock.value < popAt + 0.35 ? Math.sin(((clock.value - popAt) / 0.35) * Math.PI) : 0;
    return { transform: [{ scale: 1 + 0.2 * b }] };
  });
  const numColor = podium ? PODIUM[podium - 1] : t.text;
  return (
    <Animated.View style={[{
      marginTop: 12, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 18,
      backgroundColor: t.statsBg, borderWidth: 1, borderColor: t.statsBorder,
    }, rowStyle]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('prCelebration.rankLabel')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {podium > 0 && (
            <Animated.View style={medalStyle}>
              {podium === 1 ? <KitIcon name="crown" size={22} color={PODIUM[0]} /> : <Medal color={PODIUM[podium - 1]} n={podium} />}
            </Animated.View>
          )}
          <Animated.Text style={[kt('bold', 26, shown === rank.to ? numColor : t.text, 0.4), numBump]}>{ltr(`#${shown}`)}</Animated.Text>
          <Text style={kt('medium', 12, t.textFaint)} numberOfLines={1}>{tr('prCelebration.rankOf', { n: rank.of })}</Text>
        </View>
      </View>
      {improved > 0 && (
        <Animated.View style={[{ height: 28, paddingHorizontal: 12, borderRadius: 14, backgroundColor: t.accent, flexDirection: 'row', alignItems: 'center', gap: 5 }, chipStyle]}>
          <Svg width={10} height={10} viewBox="0 0 10 10"><Path d="M5 1.5L9 7.5H1z" fill={t.onAccent} /></Svg>
          <Text style={kt('bold', 13, t.onAccent, 0.4)}>{ltr(String(improved))}</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** Silver / bronze medal: a disc with its place on a short ribbon. */
function Medal({ color, n }: { color: string; n: number }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path d="M7 2h4l2 6H9zM13 2h4l-2 6h-4z" fill={color} opacity={0.7} />
      <Circle cx={12} cy={15} r={7} fill={color} />
      <Circle cx={12} cy={15} r={5} fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.2} />
      <SvgText x={12} y={18.4} fontSize={9} fontWeight="bold" fill="#ffffff" textAnchor="middle">{n}</SvgText>
    </Svg>
  );
}
