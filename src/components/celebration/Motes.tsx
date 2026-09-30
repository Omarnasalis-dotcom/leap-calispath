import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { clamp01, PRWorld } from '../../lib/prCelebration';
import { PRTokens } from './prTokens';

const LOOP = 560;

/** Ambient dots drifting up inside the card after the LOCK (Static and Endurance). */
function Mote({ clock, tokens: t, x, y, s, v, wobble, start, max }: {
  clock: SharedValue<number>; tokens: PRTokens; x: number; y: number; s: number; v: number; wobble: boolean; start: number; max: number;
}) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const top = (((y - T * v) % LOOP) + LOOP) % LOOP;
    return {
      opacity: clamp01((T - start) / 1) * max,
      transform: [{ translateX: x + (wobble ? Math.sin(T * 1.3 + x) * 4 : 0) }, { translateY: top }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: s, height: s, borderRadius: s / 2, backgroundColor: t.mote }, style]} />;
}

export function Motes({ clock, tokens, world, lock }: { clock: SharedValue<number>; tokens: PRTokens; world: PRWorld; lock: number }) {
  const warm = world === 'endurance';
  const count = warm ? 14 : 12;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { direction: 'ltr' }]}>
      {Array.from({ length: count }, (_, i) => (
        <Mote
          key={i}
          clock={clock}
          tokens={tokens}
          x={(i * 53 + 17) % 330}
          y={(i * 97 + 40) % LOOP}
          s={2 + (i % 3)}
          v={warm ? 14 + (i % 4) * 6 : 8 + (i % 4) * 4}
          wobble={warm}
          start={lock + (warm ? 0.3 : 0.1)}
          max={warm ? 0.55 : 0.6}
        />
      ))}
    </View>
  );
}
