import React from 'react';
import { View } from 'react-native';
import Animated, { SharedValue, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { clamp01, easeOutCubic, prevMarkerAngle, RING_RADIUS, ringProgress, timeAtFill } from '../../lib/prCelebration';
import { HERO_LTR, HeroProps, LockPulse, PrevMarker, RingNumber, useLocked, useRingCounter } from './heroShared';
import { PRTokens } from './prTokens';
import { t as tr } from '../../i18n';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const C = 2 * Math.PI * RING_RADIUS;

// 18 crystal sparks (handoff: 5–8px squares at 45°, accent/white mix).
const SPARKS = Array.from({ length: 18 }, (_, i) => ({
  a: (i / 18) * Math.PI * 2 + (i % 2 ? 0.12 : -0.08),
  d: 44 + (i % 3) * 16,
  s: i % 3 === 0 ? 8 : 5,
  white: i % 4 === 0,
}));

function Spark({ clock, tokens: t, lock, spark }: { clock: SharedValue<number>; tokens: PRTokens; lock: number; spark: typeof SPARKS[number] }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const burst = clamp01((T - lock) / 0.9);
    if (T < lock || burst >= 1) return { opacity: 0 };
    const p = easeOutCubic(burst);
    const r = RING_RADIUS + p * spark.d;
    const x = 110 + r * Math.cos(spark.a) - spark.s / 2;
    return {
      opacity: 1 - burst,
      transform: [
        { translateX: x },
        { translateY: 110 + r * Math.sin(spark.a) - spark.s / 2 },
        { rotate: `${45 + p * 90}deg` },
        { scale: 1 - burst * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', left: 0, top: 0, width: spark.s, height: spark.s,
        backgroundColor: spark.white ? t.markerPassed : t.accent, boxShadow: `0 0 8px ${t.accent}`,
      }, style]}
    />
  );
}

/** Hold ring that fills to the new time, passes PREV, then locks with a crystal burst. */
export function StaticHero({ clock, tokens: t, value, previous, lock }: HeroProps) {
  const count = useRingCounter(clock, value);
  const locked = useLocked(clock, lock);

  const arc = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - ringProgress(clock.value)) }));
  const arcGlow = useAnimatedProps(() => {
    const T = clock.value;
    const bump = T > lock && T < lock + 0.4 ? Math.sin(((T - lock) / 0.4) * Math.PI) : 0;
    return { strokeDashoffset: C * (1 - ringProgress(T)), strokeOpacity: 0.22 + bump * 0.3 };
  });

  return (
    <View style={[HERO_LTR, { width: 220, height: 220, alignSelf: 'center', marginTop: 14 }]}>
      <LockPulse clock={clock} tokens={t} lock={lock} inset={13} strength={0.35} />
      <Svg width={220} height={220} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.track} strokeWidth={10} />
        {/* Soft glow under the fill (stands in for the handoff's drop-shadow). */}
        <AnimatedCircle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.accent} strokeWidth={20} strokeLinecap="round" strokeDasharray={C} animatedProps={arcGlow} />
        <AnimatedCircle cx={110} cy={110} r={RING_RADIUS} fill="none" stroke={t.accent} strokeWidth={10} strokeLinecap="round" strokeDasharray={C} animatedProps={arc} />
      </Svg>
      {previous != null && (
        <PrevMarker
          clock={clock} tokens={t} lock={lock} bg={t.cardBg}
          angle={prevMarkerAngle(previous, value)} dotRadius={RING_RADIUS} labelRadius={RING_RADIUS + 26} size={14}
          label={tr('prCelebration.prevSec', { v: Math.round(previous) })}
          passedAt={timeAtFill(previous / value)}
        />
      )}
      {SPARKS.map((s, i) => <Spark key={i} clock={clock} tokens={t} lock={lock} spark={s} />)}
      <RingNumber clock={clock} tokens={t} lock={lock} count={count} unit={tr('prCelebration.seconds')} locked={locked} />
    </View>
  );
}
