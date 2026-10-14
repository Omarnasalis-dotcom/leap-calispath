import React, { useMemo } from 'react';
import { View } from 'react-native';
import Animated, { SharedValue, useAnimatedProps, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { clamp01, easeOutBack, easeOutCubic, seg } from '../../../../lib/fx/easing';
import { FxQuality, particleCount } from '../../../../lib/fx/quality';
import { SparkBurst, useAfter } from '../../../fx/FxEffects';
import { JourneyBadge } from '../../badges/JourneyBadge';

/*
 * Reveals for RISING (1), CONSISTENT (2) and COMMITTED (3), from the
 * handoff's hero table:
 *  1  the empty slot; a tone ring draws clockwise; the badge pops in
 *  2  the previous badge; the ring draws; the old badge swells and fades as
 *     the new one pops; 8 sparks
 *  3  as 2, the new badge also spins in from −40°; 12 sparks
 * Only transform/opacity animate, plus strokeDashoffset on the ring.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING_R = 72;
const RING_C = 2 * Math.PI * RING_R;

export interface RevealProps {
  clock: SharedValue<number>;
  level: number;
  previousLevel: number;
  lock: number;
  end: number;
  /** Badge box size (160, or 128 compact). */
  size: number;
  tone: string;
  quality: FxQuality;
  slotColor: string;
}

/** Pop-in progress: opacity + overshoot scale from `from`. */
const pop = (t: number, t0: number, dur: number, from: number, c: number) => {
  'worklet';
  const p = clamp01((t - t0) / dur);
  return { op: clamp01(p * 2.5), sc: from + (1 - from) * easeOutBack(p, c) };
};

export function RevealRise({ clock, level, previousLevel, lock: L, end, size, tone, quality, slotColor }: RevealProps) {
  const k = size / 160;
  const ringC = RING_C * k;
  const first = level === 1;
  // Rasterize the moving badges as textures, then drop back to crisp vector at the end.
  const settled = useAfter(clock, end);

  const prevStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const op = first ? 1 - seg(t, 0.75, 1.0) : seg(t, 0.45, 0.6) * (1 - seg(t, L - 0.2, L + 0.05));
    return { opacity: op, transform: [{ scale: 1 + 0.08 * seg(t, L - 0.2, L) }] };
  });

  const newStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const b = first ? pop(t, 0.75, 0.55, 0.6, 1.5) : pop(t, L - 0.15, 0.4, 0.85, 2);
    const rot = level === 3 ? (1 - easeOutCubic(clamp01((t - L + 0.15) / 0.45))) * -40 : 0;
    return { opacity: b.op, transform: [{ scale: b.sc }, { rotate: `${rot}deg` }] };
  });

  const ringProps = useAnimatedProps(() => {
    const t = clock.value;
    const drawP = easeOutCubic(seg(t, 0.5, first ? 1.05 : L - 0.15));
    return {
      strokeDashoffset: ringC * (1 - drawP),
      strokeOpacity: (t > 0.5 ? 1 : 0) * (1 - seg(t, L, L + 0.5)),
    };
  });

  const burst = useMemo(
    () => level >= 2
      ? { count: particleCount(level === 2 ? 8 : 12, quality), colors: [tone, '#ffffff'], dist: level === 2 ? 34 : 48, size: level === 2 ? 4 : 5, r0: 56 }
      : null,
    [level, quality, tone],
  );

  const raster = !settled;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, prevStyle]} renderToHardwareTextureAndroid={raster} shouldRasterizeIOS={raster}>
        <JourneyBadge level={first ? 0 : previousLevel} size={size} slotColor={slotColor} />
      </Animated.View>
      <Svg width={size} height={size} style={{ position: 'absolute', left: 0, top: 0, transform: [{ rotate: '-90deg' }] }}>
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={RING_R * k} fill="none" stroke={tone} strokeWidth={3}
          strokeDasharray={ringC} animatedProps={ringProps}
          strokeLinecap="round"
        />
      </Svg>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, newStyle]} renderToHardwareTextureAndroid={raster} shouldRasterizeIOS={raster}>
        <JourneyBadge level={level} size={size} />
      </Animated.View>
      {burst && !settled && <SparkBurst clock={clock} t0={L} cx={size / 2} cy={size / 2} scale={k} options={burst} />}
    </View>
  );
}
