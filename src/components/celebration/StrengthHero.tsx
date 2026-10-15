import React, { useState } from 'react';
import { View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedProps, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { clamp01, easeOutCubic, formatClock, RING_RADIUS, ringProgress } from '../../lib/prCelebration';
import { HERO_LTR, HeroProps, LockPulse, RingNumber, useLocked } from './heroShared';
import { PRTokens } from './prTokens';
import { t as tr } from '../../i18n';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const C = 2 * Math.PI * RING_RADIUS;

// 16 sparks at the LOCK (coral / white mix), same family as Static's burst.
const SPARKS = Array.from({ length: 16 }, (_, i) => ({
  a: (i / 16) * Math.PI * 2 + (i % 2 ? 0.1 : -0.06),
  d: 40 + (i % 3) * 16,
  s: i % 3 === 0 ? 7 : 5,
  white: i % 4 === 0,
}));

function Spark({ clock, tokens: t, lock, spark }: { clock: SharedValue<number>; tokens: PRTokens; lock: number; spark: typeof SPARKS[number] }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const burst = clamp01((T - lock) / 0.9);
    if (T < lock || burst >= 1) return { opacity: 0 };
    const p = easeOutCubic(burst);
    const r = RING_RADIUS + p * spark.d;
    return {
      opacity: 1 - burst,
      transform: [
        { translateX: 110 + r * Math.cos(spark.a) - spark.s / 2 },
        { translateY: 110 + r * Math.sin(spark.a) - spark.s / 2 },
        { scale: 1 - burst * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', left: 0, top: 0, width: spark.s, height: spark.s, borderRadius: spark.s / 2,
        backgroundColor: spark.white ? t.markerPassed : t.accent,
      }, style]}
    />
  );
}

/**
 * Strength trial new best: a stopwatch ring that starts full at the previous
 * best and winds back to the new time while the clock counts down, then
 * locks with a pulse and a spark burst. Lower is better, so the arc shrinks.
 */
export function StrengthHero({ clock, tokens: t, value, previous, lock }: HeroProps) {
  const prev = previous != null && previous > value ? previous : value;
  const endFrac = prev > 0 ? value / prev : 1;
  const locked = useLocked(clock, lock);

  // The clock reads the previous best and counts down to the new time.
  const [shown, setShown] = useState(prev);
  useAnimatedReaction(
    () => Math.round(prev - ringProgress(clock.value) * (prev - value)),
    (now, was) => { if (now !== was) runOnJS(setShown)(now); },
  );

  const arc = useAnimatedProps(() => {
    const frac = 1 - ringProgress(clock.value) * (1 - endFrac);
    return { strokeDashoffset: C * (1 - frac) };
  });
  const arcGlow = useAnimatedProps(() => {
    const T = clock.value;
    const frac = 1 - ringProgress(T) * (1 - endFrac);
    const bump = T > lock && T < lock + 0.4 ? Math.sin(((T - lock) / 0.4) * Math.PI) : 0;
    return { strokeDashoffset: C * (1 - frac), strokeOpacity: 0.22 + bump * 0.3 };
  });
  // The part of the ring you cut off: shows faintly where the old best ended.
  const cut = useAnimatedProps(() => ({ strokeOpacity: 0.35 * clamp01((clock.value - 0.4) / 0.4) }));

  return (
    <View style={[HERO_LTR, { width: 220, height: 220, alignSelf: 'center', marginTop: 14 }]}>
      <LockPulse clock={clock} tokens={t} lock={lock} inset={13} strength={0.35} />
      <Svg width={220} height={220} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.track} strokeWidth={10} />
        <AnimatedCircle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.markerIdle} strokeWidth={10} strokeDasharray={`2 6`} animatedProps={cut} />
        <AnimatedCircle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.accent} strokeWidth={20} strokeLinecap="round" strokeDasharray={C} animatedProps={arcGlow} />
        <AnimatedCircle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.accent} strokeWidth={10} strokeLinecap="round" strokeDasharray={C} animatedProps={arc} />
      </Svg>
      {SPARKS.map((s, i) => <Spark key={i} clock={clock} tokens={t} lock={lock} spark={s} />)}
      <RingNumber clock={clock} tokens={t} lock={lock} count={formatClock(shown)} unit={tr('prCelebration.time')} locked={locked} fontSize={66} />
    </View>
  );
}
