import React, { useMemo } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { clamp01, easeOutBack, seg } from '../../../../lib/fx/easing';
import { particleCount } from '../../../../lib/fx/quality';
import { OrbitParticles, ShockRing, SparkBurst, useAfter } from '../../../fx/FxEffects';
import { BadgePart, JourneyBadge } from '../../badges/JourneyBadge';
import { RevealProps } from './RevealRise';
import { Glint, Layer, pop, RadialFlash, RevealBox } from './shared';

/*
 * CHAMPION (6): the Warrior shield upgrades (crossfade + pop), then the gold
 * wings unfold on their pivots (rotate ∓95° → 0, scale .3 → 1); at the lock a
 * glint twinkles on the right wing, a gold ring and 18 sparks.
 *
 * ELITE (7): the Champion badge upgrades to the crest + platinum wings, 10
 * particles orbit (accelerating), the gem ignites (pop + flash + 8 sparks),
 * then 12 sparks at the lock. Counts trimmed from the handoff to stay in the
 * ~30 moving-view budget; the lite profile drops the orbit.
 */

const WING_L_ORIGIN = '25.6% 40%';
const WING_R_ORIGIN = '74.4% 40%';
const GEM_ORIGIN = '50% 14%';
const BODY: readonly BadgePart[] = ['body'];
const WING_L: readonly BadgePart[] = ['wingL'];
const WING_R: readonly BadgePart[] = ['wingR'];
const GEM: readonly BadgePart[] = ['gem'];
const CREST_AND_WINGS: readonly BadgePart[] = ['wingL', 'wingR', 'body'];
const GOLD = ['#FFD36B', '#ffffff', '#FFF0B8'];
const ELITE = ['#A98BFF', '#ffffff', '#8FDCFF'];

function usePrevStyle(clock: RevealProps['clock'], fadeOutFrom: number, fadeOutTo: number) {
  return useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: seg(t, 0.45, 0.6) * (1 - seg(t, fadeOutFrom, fadeOutTo)) };
  });
}

export function RevealChampion({ clock, previousLevel, lock: L, size, quality, slotColor, end }: RevealProps) {
  const settled = useAfter(clock, end);
  const raster = !settled;
  const k = size / 160;

  const prevStyle = usePrevStyle(clock, 0.85, 1.05);
  const bodyStyle = useAnimatedStyle(() => {
    const b = pop(clock.value, 0.85, 0.45, 0.9, 2);
    return { opacity: b.op, transform: [{ scale: b.sc }] };
  });
  const wing = (side: 1 | -1) => () => {
    'worklet';
    const w = clamp01((clock.value - 1.05) / 0.7);
    const ew = easeOutBack(w, 1.3);
    return { opacity: clamp01(w * 3), transform: [{ rotate: `${(1 - ew) * -95 * side}deg` }, { scale: 0.3 + 0.7 * ew }] };
  };
  const wlStyle = useAnimatedStyle(wing(1));
  const wrStyle = useAnimatedStyle(wing(-1));
  const burst = useMemo(() => ({ count: particleCount(18, quality), colors: GOLD, dist: 70, size: 5, r0: 46 }), [quality]);

  return (
    <RevealBox size={size}>
      <Layer size={size} style={prevStyle} raster={raster}><JourneyBadge level={previousLevel} size={size} slotColor={slotColor} /></Layer>
      <Layer size={size} style={wlStyle} origin={WING_L_ORIGIN} raster={raster}><JourneyBadge level={6} size={size} parts={WING_L} /></Layer>
      <Layer size={size} style={wrStyle} origin={WING_R_ORIGIN} raster={raster}><JourneyBadge level={6} size={size} parts={WING_R} /></Layer>
      <Layer size={size} style={bodyStyle} raster={raster}><JourneyBadge level={6} size={size} parts={BODY} /></Layer>
      {!settled && <Glint clock={clock} t0={L} size={size} />}
      {!settled && <ShockRing clock={clock} t0={L} dur={0.8} cx={size / 2} cy={size / 2} size={120 * k} from={0.8} to={2.0} color="#FFD36B" borderWidth={2} />}
      {!settled && <SparkBurst clock={clock} t0={L} cx={size / 2} cy={size / 2} scale={k} options={burst} />}
    </RevealBox>
  );
}

export function RevealElite({ clock, previousLevel, lock: L, size, quality, slotColor, end }: RevealProps) {
  const settled = useAfter(clock, end);
  const raster = !settled;
  const k = size / 160;

  const prevStyle = usePrevStyle(clock, 0.85, 1.1);
  // Crest and wings pop together.
  const bodyStyle = useAnimatedStyle(() => {
    const b = pop(clock.value, 0.85, 0.45, 0.9, 2);
    return { opacity: b.op, transform: [{ scale: b.sc }] };
  });
  const gemStyle = useAnimatedStyle(() => {
    const g = clamp01((clock.value - 1.6) / 0.4);
    return { opacity: clamp01(g * 3), transform: [{ scale: g > 0 ? easeOutBack(g, 2.6) : 0 }] };
  });
  const gemBurst = useMemo(() => ({ count: particleCount(8, quality), colors: ['#ffffff', '#8FDCFF'], dist: 34, size: 3.5, r0: 8 }), [quality]);
  const lockBurst = useMemo(() => ({ count: particleCount(12, quality), colors: ELITE, dist: 76, size: 5, r0: 46 }), [quality]);
  const gemFlash = useMemo(() => [{ t: 1.6, dur: 0.2, peak: 0.35 }], []);

  return (
    <RevealBox size={size}>
      <Layer size={size} style={prevStyle} raster={raster}><JourneyBadge level={previousLevel} size={size} slotColor={slotColor} /></Layer>
      <Layer size={size} style={bodyStyle} raster={raster}><JourneyBadge level={7} size={size} parts={CREST_AND_WINGS} /></Layer>
      <Layer size={size} style={gemStyle} origin={GEM_ORIGIN} raster={raster}><JourneyBadge level={7} size={size} parts={GEM} /></Layer>
      <RadialFlash clock={clock} hits={gemFlash} size={size} />
      {!settled && quality === 'full' && (
        <OrbitParticles clock={clock} t0={1.0} t1={L + 1.1} cx={size / 2} cy={size / 2} rx={86 * k} ry={26 * k} speed={2.4} count={10} colors={ELITE} />
      )}
      {/* Gem sparks start at the gem (80, 22 in badge units). */}
      {!settled && <SparkBurst clock={clock} t0={1.6} cx={size / 2} cy={22 * k} scale={k} life={0.6} options={gemBurst} />}
      {!settled && <SparkBurst clock={clock} t0={L} cx={size / 2} cy={size / 2} scale={k} options={lockBurst} />}
    </RevealBox>
  );
}
