import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, { AnimatedStyle, SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { clamp01, easeOutBack, flashAt } from '../../../../lib/fx/easing';
import { FlashHit } from '../../../fx/FxEffects';

/** Pop-in: opacity + overshoot scale from `from` (handoff `pop()`). */
export const pop = (t: number, t0: number, dur: number, from: number, c: number) => {
  'worklet';
  const p = clamp01((t - t0) / dur);
  return { op: clamp01(p * 2.5), sc: from + (1 - from) * easeOutBack(p, c) };
};

/**
 * One badge layer filling the hero box, animated by transform/opacity only,
 * pivoting on `origin` (the handoff's wing / gem pivots), rasterized as a
 * texture while it moves.
 */
export function Layer({ size, style, origin, raster, children }: {
  size: number;
  style: StyleProp<AnimatedStyle<StyleProp<ViewStyle>>>;
  origin?: string;
  raster: boolean;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      renderToHardwareTextureAndroid={raster}
      shouldRasterizeIOS={raster}
      style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, transformOrigin: origin }, style]}
    >
      {children}
    </Animated.View>
  );
}

/** A soft white glow over the badge (1.3× its box) that peaks at each hit. */
export const RadialFlash = React.memo(function RadialFlash({ clock, hits, size }: { clock: SharedValue<number>; hits: readonly FlashHit[]; size: number }) {
  const d = size * 1.3;
  const style = useAnimatedStyle(() => {
    let o = 0;
    for (let i = 0; i < hits.length; i++) o = Math.max(o, flashAt(clock.value, hits[i].t, hits[i].dur, hits[i].peak));
    return { opacity: o };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: (size - d) / 2, top: (size - d) / 2, width: d, height: d }, style]}>
      <Svg width={d} height={d}>
        <Defs>
          <RadialGradient id="revealFlash" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
            <Stop offset="0.65" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={d / 2} cy={d / 2} r={d / 2} fill="url(#revealFlash)" />
      </Svg>
    </Animated.View>
  );
});

/** CHAMPION's 4-point glint twinkling on the right wing for 0.6 s from t0. */
export function Glint({ clock, t0, size }: { clock: SharedValue<number>; t0: number; size: number }) {
  const k = size / 160;
  const style = useAnimatedStyle(() => {
    const g = clamp01((clock.value - t0) / 0.6);
    const gp = g > 0 && g < 1 ? Math.sin(g * Math.PI) : 0;
    return { opacity: gp, transform: [{ rotate: `${45 * g}deg` }, { scale: 0.4 + gp }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 128 * k - 9, top: 40 * k - 9, width: 18, height: 18 }, style]}>
      <Svg width={18} height={18} viewBox="0 0 18 18">
        <Path d="M9 0 L10.6 7.4 L18 9 L10.6 10.6 L9 18 L7.4 10.6 L0 9 L7.4 7.4 Z" fill="#FFF6D6" />
      </Svg>
    </Animated.View>
  );
}

export function RevealBox({ size, children }: { size: number; children: React.ReactNode }) {
  return <View style={{ width: size, height: size }} pointerEvents="none">{children}</View>;
}
