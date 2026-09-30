import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { kt } from '../worlds/kit';
import { clamp01, easeOutCubic, ringProgress } from '../../lib/prCelebration';
import { PRTokens } from './prTokens';

/**
 * Hero boxes are laid out left-to-right in every language: ring positions
 * are geometry, not reading order (RN mirrors `left` in RTL otherwise).
 */
export const HERO_LTR = { direction: 'ltr' } as const;

export interface HeroProps {
  clock: SharedValue<number>;
  tokens: PRTokens;
  value: number;
  previous: number | null;
  lock: number;
  reduceMotion: boolean;
}

/** Whole-number counter that follows the ring fill (JS state, ≤ value updates). */
export function useRingCounter(clock: SharedValue<number>, value: number): number {
  const [count, setCount] = useState(0);
  useAnimatedReaction(
    () => Math.round(ringProgress(clock.value) * value),
    (now, was) => { if (now !== was) runOnJS(setCount)(now); },
  );
  return count;
}

/** true from the LOCK on. */
export function useLocked(clock: SharedValue<number>, lock: number): boolean {
  const [locked, setLocked] = useState(false);
  useAnimatedReaction(() => clock.value >= lock, (now, was) => { if (now !== was) runOnJS(setLocked)(now); });
  return locked;
}

/** The big counter + unit in the middle of the ring, with the LOCK bump. */
export function RingNumber({ clock, tokens: t, lock, count, unit, locked }: {
  clock: SharedValue<number>; tokens: PRTokens; lock: number; count: number; unit: string; locked: boolean;
}) {
  const bump = useAnimatedStyle(() => {
    const T = clock.value;
    const b = T > lock && T < lock + 0.4 ? Math.sin(((T - lock) / 0.4) * Math.PI) : 0;
    return { transform: [{ scale: 1 + b * 0.14 }] };
  });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text
        style={[
          // Oswald's digits are taller than 1× — a tight line box clipped the top and
          // boxed in the glow, so give both room.
          kt('bold', 92, t.text, 0, 116),
          { fontVariant: ['tabular-nums'], paddingHorizontal: 22, marginVertical: -10 },
          locked && { textShadowColor: t.accent, textShadowRadius: 14, textShadowOffset: { width: 0, height: 0 } },
          bump,
        ]}
      >
        {count}
      </Animated.Text>
      <Text style={[kt('medium', 11, t.textMuted, 3), { marginTop: 4 }]}>{unit}</Text>
    </View>
  );
}

/** Pulse ring + radial bloom at the LOCK (Static and Endurance). */
export function LockPulse({ clock, tokens: t, lock, inset, strength }: {
  clock: SharedValue<number>; tokens: PRTokens; lock: number; inset: number; strength: number;
}) {
  const size = 220 - inset * 2;
  const pulse = useAnimatedStyle(() => {
    const T = clock.value;
    const p = clamp01((T - lock) / 0.9);
    return { opacity: T >= lock ? (1 - p) * 0.7 : 0, transform: [{ scale: 1 + easeOutCubic(p) * 0.45 }] };
  });
  const bloom = useAnimatedStyle(() => {
    const T = clock.value;
    return { opacity: T >= lock ? 1 - clamp01((T - lock) / 0.9) : 0 };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: inset, top: inset, width: size, height: size }, bloom]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="bloom" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={t.accent} stopOpacity={strength} />
              <Stop offset="0.7" stopColor={t.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#bloom)" />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: inset, top: inset, width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: t.accent,
      }, pulse]} />
    </>
  );
}

/** Small PREV dot + label at an angle around the ring centre (110,110). */
export function PrevMarker({ clock, tokens: t, angle, dotRadius, labelRadius, size, label, passedAt, lock, bg }: {
  clock: SharedValue<number>; tokens: PRTokens; angle: number; dotRadius: number; labelRadius: number; size: number;
  label: string; passedAt: number; lock: number; bg: string;
}) {
  const a = angle - Math.PI / 2;
  const mx = 110 + dotRadius * Math.cos(a);
  const my = 110 + dotRadius * Math.sin(a);
  const lx = 110 + labelRadius * Math.cos(a);
  const ly = 110 + labelRadius * Math.sin(a);
  const dot = useAnimatedStyle(() => {
    const T = clock.value;
    const passed = T >= passedAt;
    const markIn = clamp01((T - 0.5) / 0.3);
    const fadeOut = T >= lock ? 1 - clamp01((T - lock) / 0.9) * 0.6 : 1;
    return {
      opacity: markIn * fadeOut,
      backgroundColor: passed ? t.markerPassed : bg,
      borderColor: passed ? t.markerPassed : t.markerIdle,
      transform: [{ scale: passed && T < lock ? 1.25 : 1 }],
    };
  });
  const text = useAnimatedStyle(() => {
    const T = clock.value;
    const markIn = clamp01((T - 0.5) / 0.3);
    return {
      opacity: markIn * (T >= lock ? 1 - clamp01((T - lock) / 0.9) : 1),
      color: T >= passedAt ? t.markerPassed : t.textFaint,
    };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: mx - size / 2, top: my - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 2 }, dot]} />
      <Animated.Text pointerEvents="none" style={[kt('semibold', 10.5, t.textFaint, 1.4), { position: 'absolute', left: lx - 30, top: ly - 9, width: 60, textAlign: 'center' }, text]}>
        {label}
      </Animated.Text>
    </>
  );
}
