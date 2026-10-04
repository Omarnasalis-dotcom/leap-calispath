import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { KitIcon, kt } from '../worlds/kit';
import { LeapLogo } from '../LeapLogo';
import { initials } from '../../lib/worldStanding';
import {
  AFTER_LOCK, clamp01, easeOutBack, easeOutCubic, formatKg, gainOf, plateStack, PRWorld, RING_LOCK, ringProgress, settledAt,
} from '../../lib/prCelebration';
import { getPRTokens, PRTokens } from './prTokens';
import { StaticHero } from './StaticHero';
import { EnduranceHero } from './EnduranceHero';
import { PowerHero } from './PowerHero';
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
  onDismiss: () => void;
}

/** Clock runs far past the end so the ambient motes keep drifting. */
const CLOCK_END = 900;

const WORLD_TITLE: Record<PRWorld, string> = {
  static: 'celebration.staticWorld',
  endurance: 'celebration.enduranceWorld',
  power: 'celebration.powerWorld',
};

export function formatPRValue(world: PRWorld, v: number): string {
  if (world === 'power') return tr('prCelebration.valueKg', { v: formatKg(v) });
  if (world === 'static') return tr('prCelebration.valueSec', { v: Math.round(v) });
  return tr('prCelebration.valueReps', { count: Math.round(v) });
}

function formatGain(world: PRWorld, gain: number): string {
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
  return <KitIcon name={world === 'static' ? 'snowflake' : world === 'endurance' ? 'stopwatch' : 'bolt'} size={12} color={color} strokeWidth={2.6} />;
}

export function PRCelebration(props: PRCelebrationProps) {
  if (!props.visible) return null;
  return <PRCelebrationModal {...props} />;
}

function PRCelebrationModal({ world, movement, value, previous, handle, onDismiss }: PRCelebrationProps) {
  const { mode } = useTheme();
  const t: PRTokens = useMemo(() => getPRTokens(world, mode), [world, mode]);
  const insets = useSafeAreaInsets();
  const cardRef = useRef<View>(null);

  const prev = previous != null && previous > 0 ? previous : null;
  const stack = useMemo(() => (world === 'power' ? plateStack(value) : null), [world, value]);
  const lock = stack ? stack.lock : RING_LOCK;
  const end = settledAt(lock);
  const landTimes = useMemo(() => stack?.plates.map(p => p.land) ?? [], [stack]);
  const gain = gainOf(value, prev);

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
    () => (world === 'power' ? landTimes.filter(l => clock.value >= l).length : -1),
    (now, was) => { if (was != null && now > was && clock.value < lock) runOnJS(tapLight)(); },
  );
  useAnimatedReaction(
    () => (world !== 'power' && prev != null ? ringProgress(clock.value) * value >= prev : false),
    (now, was) => { if (now && was === false && clock.value < lock) runOnJS(tapMedium)(); },
  );

  // A tick per count on the ring worlds — only for short counts, so a big
  // number doesn't turn into a buzz.
  useAnimatedReaction(
    () => (world !== 'power' && value <= 30 ? Math.round(ringProgress(clock.value) * value) : -1),
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
  const shareStyle = useFadeUp(clock, lock + AFTER_LOCK.share, 24);
  const saveStyle = useFadeUp(clock, lock + AFTER_LOCK.save, 24);
  const dismissStyle = useFadeUp(clock, lock + AFTER_LOCK.dismiss, 24);
  const gainPop = useAnimatedStyle(() => {
    const s = lock + AFTER_LOCK.stats;
    const T = clock.value;
    return { transform: [{ scale: T > s ? 1 + 0.25 * Math.sin(clamp01((T - s) / 0.35) * Math.PI) : 1 }] };
  });

  // ── Share / save (same capture path as CelebrationBanner) ───────────────
  const capture = async (): Promise<string | null> => {
    if (Platform.OS !== 'web') {
      try { return await captureRef(cardRef, { format: 'png', quality: 0.9 }); } catch { return null; }
    }
    try {
      const html2canvas = (await import('html2canvas')).default;
      const el = document.getElementById('pr-celebration-card');
      if (!el) return null;
      return (await html2canvas(el, { backgroundColor: null, scale: 2 })).toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const onShare = async () => {
    skip();
    if (Platform.OS === 'web') {
      const dataUrl = await capture();
      if (dataUrl && navigator.share) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          await navigator.share({ files: [new File([blob], 'leap-arena.png', { type: 'image/png' })], title: 'LEAP ARENA' });
          return;
        } catch { /* fall through */ }
      }
      window.alert(tr('celebration.shareWeb'));
      return;
    }
    try {
      const uri = await capture();
      if (!uri) throw new Error('capture failed');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else Alert.alert(tr('celebration.shareUnavailableTitle'), tr('celebration.shareUnavailable'));
    } catch (error) {
      console.error('Error sharing PR card:', error);
      Alert.alert(tr('celebration.error'), tr('celebration.shareFailed'));
    }
  };

  const onSave = async () => {
    skip();
    if (Platform.OS === 'web') {
      const dataUrl = await capture();
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'leap-arena-pr.png';
        a.click();
      }
      return;
    }
    try {
      // writeOnly — see CelebrationBanner (Play photo-permission policy).
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert(tr('celebration.permissionTitle'), tr('celebration.permission'));
        return;
      }
      const uri = await capture();
      if (!uri) throw new Error('capture failed');
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert(tr('celebration.savedTitle'), tr('celebration.saved'));
    } catch (error) {
      console.error('Error saving PR card:', error);
      Alert.alert(tr('celebration.error'), tr('celebration.saveFailed'));
    }
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
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: insets.top + (world === 'power' ? 8 : 16), paddingBottom: insets.bottom + 16 }}
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
                {tr('prCelebration.newRecord')}
              </Animated.Text>

              {world === 'static' && <StaticHero {...heroProps} />}
              {world === 'endurance' && <EnduranceHero {...heroProps} />}
              {world === 'power' && stack && <PowerHero {...heroProps} stack={stack} />}

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
                  <Text style={kt('medium', 10.5, t.textMuted, 2)}>{tr('prCelebration.gain')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6, marginTop: 4 }}>
                    <Animated.Text
                      style={[kt('bold', gainText.length > 8 ? 20 : 24, t.accentText), gainPop]}
                      numberOfLines={1}
                    >
                      {ltr(gainText)}
                    </Animated.Text>
                    {gain && <Text style={kt('medium', 12, t.textFaint)}>{ltr(`+${gain.pct}%`)}</Text>}
                  </View>
                </View>
              </Animated.View>

              <Animated.View style={[{ marginTop: 18, alignItems: 'center' }, logoStyle]}>
                <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, borderColor: t.pillBorder, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <LeapLogo size={18} animated={false} />
                  <Text style={kt('semibold', 11, t.text, 2.4)}>LEAP ARENA</Text>
                </View>
              </Animated.View>
            </View>
          </Animated.View>
        </Pressable>

        <View style={{ gap: 12, paddingTop: 20 }}>
          <Animated.View style={shareStyle}>
            <Pressable
              accessibilityRole="button"
              onPress={onShare}
              style={({ pressed }) => ({
                height: 56, borderRadius: 16, backgroundColor: t.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: `0 10px 30px ${t.accent}4D`, opacity: pressed ? 0.85 : 1,
              })}
            >
              <ShareIcon color={t.onAccent} />
              <Text style={kt('bold', 16, t.onAccent, 2.6)}>{tr('prCelebration.share')}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={saveStyle}>
            <Pressable
              accessibilityRole="button"
              onPress={onSave}
              style={({ pressed }) => ({ height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: t.saveBorder, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={kt('semibold', 14, t.saveText, 2.4)}>{tr('prCelebration.saveToPhotos')}</Text>
            </Pressable>
          </Animated.View>
          <Animated.View style={dismissStyle}>
            {/* Sits on the dimmed backdrop, not the card: in light mode that
                backdrop is mid-grey, so muted text vanished -- a white pill
                keeps it readable there. */}
            <Pressable
              accessibilityRole="button"
              onPress={onDismiss}
              style={({ pressed }) => ({
                height: 36,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
                ...(t.mode === 'dark'
                  ? null
                  : { alignSelf: 'center', paddingHorizontal: 22, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)' }),
              })}
            >
              <Text style={kt('medium', 13, t.mode === 'dark' ? '#8a8a8a' : t.text, 2.4)}>{tr('prCelebration.dismiss')}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </Modal>
  );
}
