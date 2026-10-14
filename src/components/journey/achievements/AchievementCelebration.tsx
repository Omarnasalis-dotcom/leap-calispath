import React, { useMemo, useRef, useState } from 'react';
import { Alert, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, Path, RadialGradient, Circle, Stop } from 'react-native-svg';
import { useTheme } from '../../../contexts/ThemeContext';
import { SoundServiceInstance as SoundService } from '../../../lib/SoundService';
import { shareCardImage } from '../../../lib/shareCard';
import { clamp01, easeOutBack, easeOutCubic, seg } from '../../../lib/fx/easing';
import { useFxClock } from '../../../lib/fx/useFxClock';
import { useFxQuality } from '../../../lib/fx/quality';
import { achievementFor } from '../../../lib/journeyAchievements';
import { AFTER, CelebrationData, celebrationTimeline, REVEAL_TICKS } from '../../../lib/journeyCelebration';
import { kt } from '../../worlds/kit';
import { LeapLogo } from '../../LeapLogo';
import { RevealRise } from './reveals/RevealRise';
import { isArabic, isRTL, ltr, t as tr } from '../../../i18n';

/*
 * Journey achievement celebration (handoff §2): the sibling cards' shell,
 * with a per-level hero reveal. One UI-thread clock (useFxClock) drives it;
 * counters re-render only their own text; transient effects unmount at the
 * end. Plays once: the caller marks it celebrated in onDone.
 */

const CORAL = '#FC5454';
const COMPACT_BELOW_H = 760;

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function palette(light: boolean) {
  return light
    ? { backdrop: 'rgba(30,18,18,0.42)', card: '#ffffff', t1: '#141010', t2: '#3a3434', t3: '#5e5858', t4: '#6e6868', t5: '#7a7474',
        panel: '#faf8f7', panelBorder: '#efe9e7', track: '#efe9e7', pill: 'rgba(252,84,84,0.22)', shareBorder: '#e6d3d1', shareBg: '#ffffff',
        slot: '#a8a2a0', glowK: 0.55, borderA: 0.6, radialA: 0.1 }
    : { backdrop: 'rgba(0,0,0,0.78)', card: '#0c0b0d', t1: '#ffffff', t2: '#d0d0d0', t3: '#a0a0a0', t4: '#8a8a8a', t5: '#6a6a6a',
        panel: 'rgba(255,255,255,0.025)', panelBorder: '#1d1b1e', track: '#1c1a1d', pill: 'rgba(252,84,84,0.28)', shareBorder: '#3a2a2a', shareBg: 'transparent',
        slot: '#5a5a5a', glowK: 1, borderA: 0.5, radialA: 0.16 };
}

function badgeName(level: number): string {
  const def = achievementFor(level);
  return def ? tr(`journeyAchievements.${def.key}` as 'journeyAchievements.rising') : '';
}

function useFadeUp(clock: SharedValue<number>, start: number, dy: number, fade: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - start) / 0.5));
    return { opacity: p * fade.value, transform: [{ translateY: (1 - p) * dy }] };
  });
}

/** Lifetime points counting up; owns its state so only this text re-renders. */
function PointsCounter({ clock, from, to, t0, t1, color }: { clock: SharedValue<number>; from: number; to: number; t0: number; t1: number; color: string }) {
  const [shown, setShown] = useState(from);
  useAnimatedReaction(
    () => Math.round(from + (to - from) * easeOutCubic(seg(clock.value, t0, t1))),
    (now, was) => { if (now !== was) runOnJS(setShown)(now); },
  );
  return <Text style={[kt('bold', 16, color), { fontVariant: ['tabular-nums'] }]}>{ltr(shown.toLocaleString('en-US'))}</Text>;
}

function JourneyIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Path d="M4 20c4-1 5-5 8-7s6-2 8-8" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={20} cy={5} r={2.2} fill={color} />
    </Svg>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function AchievementCelebration({ data, onDone }: { data: CelebrationData | null; onDone: () => void }) {
  if (!data) return null;
  return <CelebrationModal key={data.level} data={data} onDone={onDone} />;
}

function CelebrationModal({ data, onDone }: { data: CelebrationData; onDone: () => void }) {
  const { mode } = useTheme();
  const light = mode === 'light';
  const p = palette(light);
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const cardRef = useRef<View>(null);
  const quality = useFxQuality();

  const def = achievementFor(data.level)!;
  const tone = def.tone;
  const tl = celebrationTimeline(data.level);
  const L = tl.lock;
  const { clock, fade, skip } = useFxClock(tl.end);

  // Compact when the screen is short or the group doesn't fit (Arabic's taller lines).
  const [compact, setCompact] = useState(winH < COMPACT_BELOW_H);
  const badgeSize = compact ? 128 : 160;
  const onGroupLayout = (e: LayoutChangeEvent) => {
    const available = winH - insets.top - insets.bottom - (compact ? 50 : 74);
    if (!compact && e.nativeEvent.layout.height > available) setCompact(true);
  };

  // ── Haptics + sound (sounds respect the Arena mute inside SoundService) ─
  const ticks = REVEAL_TICKS[data.level] ?? [];
  const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); SoundService.playTick(); };
  const lockCue = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); SoundService.playBoxingBell(); };
  const settleTick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  // A skip jumps past several cues at once and stays quiet (only the lock plays).
  useAnimatedReaction(
    () => ticks.filter(c => clock.value >= c).length,
    (now, was) => { if (was != null && now - was === 1 && clock.value < L) runOnJS(tick)(); },
  );
  useAnimatedReaction(() => clock.value >= L, (now, was) => { if (now && was === false) runOnJS(lockCue)(); });
  useAnimatedReaction(
    () => clock.value >= L + AFTER.countTo,
    (now, was) => { if (now && was === false && clock.value < L + AFTER.countTo + 0.1) runOnJS(settleTick)(); },
  );

  // ── Styles ────────────────────────────────────────────────────────────────
  const backdropStyle = useAnimatedStyle(() => ({ opacity: clamp01(clock.value / 0.35) * fade.value }));
  const cardStyle = useAnimatedStyle(() => {
    const q = clamp01((clock.value - 0.05) / 0.55);
    return { opacity: clamp01(q * 1.6) * fade.value, transform: [{ translateY: (1 - easeOutCubic(q)) * 40 }, { scale: 0.9 + 0.1 * easeOutBack(q) }] };
  });
  const outerGlow = useAnimatedStyle(() => {
    const t = clock.value;
    const g = t < L ? 0.12 + seg(t, 0.45, L) * 0.14 : 0.26 + 0.24 * (1 - seg(t, L, L + 0.9));
    return { opacity: Math.min(1, g * 1.6 * p.glowK) };
  });
  const heroPeak = data.level === 1 ? 0.5 : 0.6;
  const heroGlow = useAnimatedStyle(() => {
    const t = clock.value;
    const g = t < L ? 0.12 + seg(t, 0.45, L) * 0.2 : 0.35 + (heroPeak - 0.35) * (1 - seg(t, L, L + 0.9));
    return { opacity: g * p.glowK };
  });
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: easeOutCubic(seg(clock.value, L + AFTER.countFrom, L + AFTER.countTo)) }] }));
  const eyebrowStyle = useFadeUp(clock, 0.3, 8, fade);
  const titleStyle = useFadeUp(clock, L + AFTER.title, 10, fade);
  const warmStyle = useFadeUp(clock, L + AFTER.warm, 8, fade);
  const skippedStyle = useFadeUp(clock, L + AFTER.skipped, 8, fade);
  const statsStyle = useFadeUp(clock, L + AFTER.stats, 10, fade);
  const logoStyle = useFadeUp(clock, L + AFTER.logo, 6, fade);
  const doneStyle = useFadeUp(clock, L + AFTER.done, 24, fade);
  const shareStyle = useFadeUp(clock, L + AFTER.share, 24, fade);

  const name = badgeName(data.level);
  const next = data.nextThreshold != null ? achievementFor(data.level + 1) : undefined;
  const barTarget = data.nextThreshold ? Math.min(1, data.toPoints / data.nextThreshold) : 1;
  const skippedLine = useMemo(() => {
    const names = data.skipped.map(badgeName).filter(Boolean);
    if (names.length === 0) return null;
    return names.length === 1
      ? tr('journeyAchievements.skippedOne', { name: names[0] })
      : tr('journeyAchievements.skippedMany', { names: names.join(tr('journeyAchievements.and')) });
  }, [data.skipped]);
  const date = new Date().toLocaleDateString(isArabic ? 'ar' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  const handleShare = async () => {
    skip();
    const result = await shareCardImage(cardRef, 'achievement-card', 'leap-arena-badge.png');
    if (result === 'unavailable') Alert.alert(tr('celebration.shareUnavailableTitle'), tr('celebration.shareUnavailable'));
    else if (result === 'failed') Alert.alert(tr('celebration.error'), tr('celebration.shareFailed'));
  };

  const gap = compact ? 10 : 14;
  const heroBox = badgeSize + (compact ? 16 : 30);
  const glowSize = badgeSize * 1.6;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: p.backdrop }, backdropStyle]} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: compact ? 16 : 24, paddingTop: insets.top + (compact ? 16 : 24), paddingBottom: insets.bottom + (compact ? 16 : 24) }}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View onLayout={onGroupLayout}>
          <Pressable onPress={skip} accessibilityHint={tr('prCelebration.tapToSkip')}>
            <Animated.View style={cardStyle}>
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: compact ? 26 : 30, backgroundColor: p.card, boxShadow: `0 0 70px 4px ${tone}` }, outerGlow]} />
              <View
                ref={cardRef}
                collapsable={false}
                nativeID="achievement-card"
                style={{
                  borderRadius: compact ? 26 : 30, paddingTop: compact ? 16 : 22, paddingHorizontal: compact ? 18 : 22, paddingBottom: compact ? 18 : 24,
                  backgroundColor: p.card, borderWidth: 1, borderColor: rgba(tone, p.borderA), overflow: 'hidden',
                }}
              >
                <LinearGradient pointerEvents="none" colors={[rgba(tone, p.radialA), 'transparent']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.55 }} style={StyleSheet.absoluteFill} />

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <JourneyIcon color={CORAL} />
                    <Text style={kt('semibold', isArabic ? 12 : 11, CORAL, 2.4)}>{tr('journeyAchievements.journey')}</Text>
                  </View>
                  <Text style={kt('medium', 11, p.t5, 1.6)}>{ltr(date)}</Text>
                </View>

                <Animated.Text style={[kt('semibold', isArabic ? 14 : 12, p.t2, 4), { marginTop: compact ? 12 : 18, textAlign: 'center' }, eyebrowStyle]}>
                  {tr('journeyAchievements.unlocked')}
                </Animated.Text>

                {/* Hero: glow disc behind, then the per-level reveal. */}
                <View style={{ height: heroBox, alignItems: 'center', justifyContent: 'center' }}>
                  <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: glowSize, height: glowSize }, heroGlow]}>
                    <Svg width={glowSize} height={glowSize}>
                      <Defs>
                        <RadialGradient id="achGlow" cx="50%" cy="50%" r="50%">
                          <Stop offset="0" stopColor={tone} stopOpacity={0.55} />
                          <Stop offset="1" stopColor={tone} stopOpacity={0} />
                        </RadialGradient>
                      </Defs>
                      <Circle cx={glowSize / 2} cy={glowSize / 2} r={glowSize / 2} fill="url(#achGlow)" />
                    </Svg>
                  </Animated.View>
                  <RevealRise
                    clock={clock} level={data.level} previousLevel={data.previousLevel} lock={L} end={tl.end}
                    size={badgeSize} tone={tone} quality={quality} slotColor={p.slot}
                  />
                </View>

                <Animated.Text style={[kt('bold', compact ? 26 : 30, p.t1, 2, compact ? 30 : 34), { textAlign: 'center' }, titleStyle]} numberOfLines={1} adjustsFontSizeToFit>
                  {name}
                </Animated.Text>
                <Animated.Text style={[kt('regular', 14, p.t3, 0, 19), { textAlign: 'center', marginTop: 6 }, warmStyle]}>
                  {tr('journeyAchievements.earned', { name })}
                </Animated.Text>
                {skippedLine && (
                  <Animated.Text style={[kt('semibold', 12, tone, 0.6), { textAlign: 'center', marginTop: 6 }, skippedStyle]}>{skippedLine}</Animated.Text>
                )}

                <Animated.View style={[{ marginTop: compact ? 12 : 18, borderRadius: 16, borderWidth: 1, borderColor: p.panelBorder, backgroundColor: p.panel, paddingVertical: 13, paddingHorizontal: 15, gap: 9 }, statsStyle]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={kt('semibold', 12, p.t1, 2)}>{tr('journeyAchievements.levelOf', { n: ltr(String(data.level)) })}</Text>
                    <Text style={kt('semibold', 10, p.t4, 1.8)}>{tr('journeyAchievements.lifetimeLabel')}</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: p.track, overflow: 'hidden' }}>
                    <Animated.View
                      style={[{ width: `${barTarget * 100}%`, height: 8, borderRadius: 4, backgroundColor: tone, transformOrigin: isRTL ? 'right' : 'left' }, barStyle]}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, direction: 'ltr' }}>
                      <PointsCounter clock={clock} from={data.fromPoints} to={data.toPoints} t0={L + AFTER.countFrom} t1={L + AFTER.countTo} color={p.t1} />
                      {next && <Text style={kt('medium', 13, p.t4)}>{ltr(`/ ${(data.nextThreshold ?? 0).toLocaleString('en-US')}`)}</Text>}
                    </View>
                    <View style={{ flex: 1 }} />
                    <Text style={kt('semibold', 11, tone, 1.8)} numberOfLines={1}>
                      {next ? tr('journeyAchievements.toNext', { name: badgeName(next.level) }) : tr('journeyAchievements.allEarned')}
                    </Text>
                  </View>
                </Animated.View>

                <Animated.View style={[{ marginTop: compact ? 12 : 16, alignItems: 'center' }, logoStyle]}>
                  <View style={{ height: 30, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: p.pill, flexDirection: 'row', alignItems: 'center', gap: 8, direction: 'ltr' }}>
                    <LeapLogo size={18} animated={false} />
                    <Text style={kt('semibold', 11, p.t1, 2.4)}>LEAP ARENA</Text>
                  </View>
                </Animated.View>
              </View>
            </Animated.View>
          </Pressable>

          {/* DONE + share, attached under the card (outside the shared image). */}
          <View style={{ flexDirection: 'row', gap: 10, paddingTop: gap }}>
            <Animated.View style={[{ flex: 1 }, doneStyle]}>
              <Pressable
                accessibilityRole="button"
                onPress={onDone}
                style={({ pressed }) => ({ height: 56, borderRadius: 16, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 30px ${rgba(CORAL, 0.3)}`, opacity: pressed ? 0.85 : 1 })}
              >
                <Text style={kt('bold', 16, '#ffffff', 2.6)}>{tr('journeyAchievements.done')}</Text>
              </Pressable>
            </Animated.View>
            <Animated.View style={shareStyle}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tr('journeyAchievements.share')}
                onPress={handleShare}
                hitSlop={4}
                style={({ pressed }) => ({ width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, borderColor: p.shareBorder, backgroundColor: p.shareBg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
              >
                <ShareIcon color={p.t1} />
              </Pressable>
            </Animated.View>
          </View>
        </View>
      </ScrollView>
    </Modal>
  );
}
