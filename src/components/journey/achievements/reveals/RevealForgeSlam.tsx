import React, { useMemo } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { clamp01, easeInCubic, easeOutCubic, seg } from '../../../../lib/fx/easing';
import { particleCount } from '../../../../lib/fx/quality';
import { ShockRing, SparkBurst, useAfter } from '../../../fx/FxEffects';
import { JourneyBadge } from '../../badges/JourneyBadge';
import { RevealProps } from './RevealRise';
import { Layer, RadialFlash, RevealBox } from './shared';

/*
 * DETERMINED (4): the forge. The badge appears red-hot and takes three hammer
 * strikes (0.8 / 1.2 / 1.6 = lock): a 4-px lift before each, a squash and a
 * flash on the hit, an upward spray of sparks with gravity, and the heat
 * fades a third after each strike.
 *
 * WARRIOR (5): the slam. The previous badge shrinks away, the shield drops
 * from 2.4× and slams at the lock: flash, three shock rings, 16 sparks (the
 * card shake lives on the card: cardShake()).
 */

const STRIKES = [0.8, 1.2, 1.6] as const;
const FORGE_COLORS = ['#FFD27A', '#FF6B2C', '#ffffff'];

export function RevealForge({ clock, size, quality, end }: RevealProps) {
  const settled = useAfter(clock, end);
  const raster = !settled;

  // Lift before each strike, squash on the hit (the whole stage).
  const stageStyle = useAnimatedStyle(() => {
    const t = clock.value;
    let lift = 0;
    let squash = 0;
    for (let i = 0; i < STRIKES.length; i++) {
      const before = STRIKES[i] - t;
      if (before > 0 && before < 0.2) lift = Math.max(lift, 1 - before / 0.2);
      const after = t - STRIKES[i];
      if (after >= 0 && after < 0.2) squash = Math.max(squash, Math.sin((after / 0.2) * Math.PI));
    }
    return { transform: [{ translateY: -lift * 4 }, { scaleX: 1 + squash * 0.06 }, { scaleY: 1 - squash * 0.07 }] };
  });
  const bodyStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, 0.45, 0.6) }));
  // Heat: full until the first strike, then a third cooler after each.
  const hotStyle = useAnimatedStyle(() => {
    const t = clock.value;
    let heat = 1;
    for (let i = 0; i < STRIKES.length; i++) {
      const a = t - STRIKES[i];
      if (a >= 0) heat = Math.min(heat, 1 - (i + easeOutCubic(clamp01(a / 0.3))) / 3);
    }
    return { opacity: seg(t, 0.45, 0.6) * heat };
  });

  const sprays = useMemo(() => STRIKES.map((s, i) => ({
    t0: s,
    options: {
      count: particleCount(i === 2 ? 18 : 10, quality),
      colors: FORGE_COLORS, a0: -Math.PI * 0.95, a1: -Math.PI * 0.05,
      dist: i === 2 ? 70 : 50, size: 4, r0: 40, seed: i + 3,
    },
  })), [quality]);
  const flashes = useMemo(() => STRIKES.map((s, i) => ({ t: s, dur: 0.18, peak: i === 2 ? 0.55 : 0.32 })), []);
  const k = size / 160;

  return (
    <RevealBox size={size}>
      <Layer size={size} style={stageStyle} raster={raster}>
        <Layer size={size} style={bodyStyle} raster={false}><JourneyBadge level={4} size={size} /></Layer>
        <Layer size={size} style={hotStyle} raster={false}><JourneyBadge level={4} size={size} hot /></Layer>
      </Layer>
      <RadialFlash clock={clock} hits={flashes} size={size} />
      {!settled && sprays.map((s, i) => (
        <SparkBurst key={i} clock={clock} t0={s.t0} cx={size / 2} cy={size / 2} scale={k} life={0.7} gravity options={s.options} />
      ))}
    </RevealBox>
  );
}

const SLAM_RINGS = [0, 0.08, 0.16];

export function RevealSlam({ clock, previousLevel, lock: L, size, tone, quality, slotColor, end }: RevealProps) {
  const settled = useAfter(clock, end);
  const raster = !settled;
  const k = size / 160;

  const prevStyle = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: seg(t, 0.45, 0.6) * (1 - seg(t, 0.8, 1.0)), transform: [{ scale: 1 - 0.3 * easeOutCubic(seg(t, 0.8, 1.0)) }] };
  });
  const bodyStyle = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: seg(t, 1.15, 1.3), transform: [{ scale: 2.4 - 1.4 * easeInCubic(seg(t, 1.15, L)) }] };
  });
  const burst = useMemo(() => ({ count: particleCount(16, quality), colors: [tone, '#ffffff', '#C9CED6'], dist: 80, size: 5, r0: 50 }), [quality, tone]);
  const flash = useMemo(() => [{ t: L, dur: 0.2, peak: 0.6 }], [L]);

  return (
    <RevealBox size={size}>
      <Layer size={size} style={prevStyle} raster={raster}><JourneyBadge level={previousLevel} size={size} slotColor={slotColor} /></Layer>
      <Layer size={size} style={bodyStyle} raster={raster}><JourneyBadge level={5} size={size} /></Layer>
      <RadialFlash clock={clock} hits={flash} size={size} />
      {!settled && SLAM_RINGS.map(d => (
        <ShockRing key={d} clock={clock} t0={L + d} dur={0.7} cx={size / 2} cy={size / 2} size={120 * k} from={0.7} to={2.5} color={tone} borderWidth={3} />
      ))}
      {!settled && <SparkBurst clock={clock} t0={L} cx={size / 2} cy={size / 2} scale={k} options={burst} />}
    </RevealBox>
  );
}
