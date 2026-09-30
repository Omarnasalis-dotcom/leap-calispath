import React, { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { interpolateColor, SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { clamp01, easeOutCubic, RING_RADIUS, ringProgress, tickLayout, timeAtFill } from '../../lib/prCelebration';
import { HERO_LTR, HeroProps, LockPulse, PrevMarker, RingNumber, useLocked, useRingCounter } from './heroShared';
import { PRTokens } from './prTokens';
import { t as tr } from '../../i18n';

const TICK_H = 16;
const HOT = 'rgb(255,227,194)';

// 24 embers rising from the top half of the ring.
const EMBERS = Array.from({ length: 24 }, (_, i) => ({
  a: Math.PI + (i / 23) * Math.PI + ((i * 37) % 10) / 40,
  rise: 90 + ((i * 53) % 90),
  s: 3 + (i % 4),
  wob: 6 + (i % 5) * 3,
  ph: i * 1.7,
  d: (i % 6) * 0.05,
  hot: i % 3 === 0,
}));

function Tick({ clock, tokens: t, i, n, width, isNew, lock }: {
  clock: SharedValue<number>; tokens: PRTokens; i: number; n: number; width: number; isNew: boolean; lock: number;
}) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const lit = Math.floor(ringProgress(T) * n + 0.0001);
    const on = i < lit;
    const flash = T >= lock ? 1 - clamp01((T - lock) / 0.45) : 0;
    const bump = T > lock && T < lock + 0.4 ? Math.sin(((T - lock) / 0.4) * Math.PI) : 0;
    const color = !on ? t.track : !isNew ? t.tickOld : interpolateColor(flash, [0, 1], [t.accent, HOT]);
    return {
      backgroundColor: color,
      transform: [{ rotate: `${(i / n) * 360 + 180 / n}deg` }, { scaleY: on && isNew ? 1 + bump * 0.25 : 1 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', left: 110 - width / 2, top: 110 - RING_RADIUS - 8, width, height: TICK_H,
        borderRadius: Math.min(3, width / 2), transformOrigin: `${width / 2}px ${RING_RADIUS + 8}px`,
      }, style]}
    />
  );
}

function Ember({ clock, tokens: t, lock, e }: { clock: SharedValue<number>; tokens: PRTokens; lock: number; e: typeof EMBERS[number] }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const burst = clamp01((T - lock) / 1.3);
    if (T < lock || burst >= 1) return { opacity: 0 };
    const p = clamp01((burst - e.d) / (1 - e.d));
    const ep = easeOutCubic(p);
    return {
      opacity: p > 0 ? 1 - p : 0,
      transform: [
        { translateX: 110 + RING_RADIUS * Math.cos(e.a) + Math.sin(e.ph + p * 6) * e.wob - e.s / 2 },
        { translateY: 110 + RING_RADIUS * Math.sin(e.a) - ep * e.rise - e.s / 2 },
        { scale: 1 - p * 0.6 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{
        position: 'absolute', left: 0, top: 0, width: e.s, height: e.s, borderRadius: e.s / 2,
        backgroundColor: e.hot ? '#FFD2A8' : t.accent, boxShadow: `0 0 ${e.s * 2}px rgba(255,120,50,0.9)`,
      }, style]}
    />
  );
}

/** Stopwatch bezel: one tick per rep lights up, old best in ember, new reps hot, then embers rise. */
export function EnduranceHero({ clock, tokens: t, value, previous, lock }: HeroProps) {
  const count = useRingCounter(clock, value);
  const locked = useLocked(clock, lock);
  const { n, prevTicks, width } = useMemo(() => tickLayout(value, previous), [value, previous]);

  return (
    <View style={[HERO_LTR, { width: 220, height: 220, alignSelf: 'center', marginTop: 14 }]}>
      <LockPulse clock={clock} tokens={t} lock={lock} inset={10} strength={0.32} />
      {Array.from({ length: n }, (_, i) => (
        <Tick key={i} clock={clock} tokens={t} i={i} n={n} width={width} isNew={i >= prevTicks} lock={lock} />
      ))}
      {previous != null && (
        <PrevMarker
          clock={clock} tokens={t} lock={lock} bg={t.cardBg}
          angle={(prevTicks / n) * Math.PI * 2} dotRadius={RING_RADIUS + 20} labelRadius={RING_RADIUS + 36} size={10}
          label={tr('prCelebration.prevReps', { v: Math.round(previous) })}
          passedAt={timeAtFill(prevTicks / n)}
        />
      )}
      {EMBERS.map((e, i) => <Ember key={i} clock={clock} tokens={t} lock={lock} e={e} />)}
      <RingNumber clock={clock} tokens={t} lock={lock} count={count} unit={tr('prCelebration.reps')} locked={locked} />
    </View>
  );
}
