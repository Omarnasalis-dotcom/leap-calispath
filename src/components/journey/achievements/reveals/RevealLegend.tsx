import React, { useMemo } from 'react';
import { useAnimatedStyle } from 'react-native-reanimated';
import { clamp01, easeOutBack, easeOutCubic, seg } from '../../../../lib/fx/easing';
import { particleCount } from '../../../../lib/fx/quality';
import { WORLD_COLORS } from '../../../../lib/journeyAchievements';
import { BeamFan, OrbitParticles, ShockRing, SparkBurst, useAfter } from '../../../fx/FxEffects';
import { BadgePart, JourneyBadge } from '../../badges/JourneyBadge';
import { RevealProps } from './RevealRise';
import { Layer, RadialFlash, RevealBox } from './shared';

/*
 * LEGEND (8): the Elite badge charges (trembles, grows 10%), then a
 * prismatic burst at 1.2: full white flash, 12 world-coloured light beams
 * rotating as ONE view, the Legend crest lands (1.3 → 1); wings unfold
 * (1.45–2.05); the crown and its 3 gems pop (2.05–2.40); 12 particles orbit;
 * at the lock two shock rings and 16 sparks, then the static rays and halo
 * fade in. Trimmed from the handoff (18 orbit / 24 sparks) to stay in the
 * ~30 moving-view budget; lite drops the orbit and halves the sparks.
 */

const WC = [WORLD_COLORS.static, WORLD_COLORS.power, WORLD_COLORS.endurance];
const RAYS: readonly BadgePart[] = ['rays'];
const BODY: readonly BadgePart[] = ['body'];
const WING_L: readonly BadgePart[] = ['wingL'];
const WING_R: readonly BadgePart[] = ['wingR'];
const GEM: readonly BadgePart[] = ['gem'];
const BEAM_GRADIENTS = Array.from({ length: 12 }, (_, i) => [
  'transparent', `${WC[i % 3]}E6`, 'rgba(255,243,196,0.95)', `${WC[(i + 1) % 3]}E6`, 'transparent',
]);

export function RevealLegend({ clock, previousLevel, lock: L, size, quality, slotColor, end }: RevealProps) {
  const settled = useAfter(clock, end);
  const raster = !settled;
  const k = size / 160;

  const prevStyle = useAnimatedStyle(() => {
    const t = clock.value;
    const ch = seg(t, 0.6, 1.2);
    return {
      opacity: seg(t, 0.45, 0.6) * (t < 1.2 ? 1 : 0),
      transform: [{ translateX: Math.sin(t * 70) * ch * 3 }, { scale: 1 + ch * 0.1 }],
    };
  });
  const bodyStyle = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: t >= 1.2 ? 1 : 0, transform: [{ scale: 1.3 - 0.3 * easeOutCubic(clamp01((t - 1.2) / 0.45)) }] };
  });
  const wing = (side: 1 | -1) => () => {
    'worklet';
    const w = clamp01((clock.value - 1.45) / 0.6);
    const ew = easeOutBack(w, 1.3);
    return { opacity: clamp01(w * 3), transform: [{ rotate: `${(1 - ew) * -95 * side}deg` }, { scale: 0.3 + 0.7 * ew }] };
  };
  const wlStyle = useAnimatedStyle(wing(1));
  const wrStyle = useAnimatedStyle(wing(-1));
  const crownStyle = useAnimatedStyle(() => {
    const g = clamp01((clock.value - 2.05) / 0.35);
    return { opacity: clamp01(g * 3), transform: [{ translateY: (1 - easeOutCubic(g)) * 10 }, { scale: g > 0 ? easeOutBack(g, 2) : 0 }] };
  });
  const raysStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, L, L + 0.6) }));

  const burstEarly = useMemo(() => ({ count: particleCount(12, quality), colors: ['#ffffff', '#FFD36B'], dist: 60, size: 4, r0: 30, seed: 5 }), [quality]);
  const burstLock = useMemo(() => ({ count: particleCount(16, quality), colors: [...WC, '#FFD36B', '#ffffff'], dist: 92, size: 6, r0: 50 }), [quality]);
  const flash = useMemo(() => [{ t: 1.2, dur: 0.45, peak: 1 }], []);

  return (
    <RevealBox size={size}>
      <Layer size={size} style={raysStyle} raster={raster}><JourneyBadge level={8} size={size} parts={RAYS} /></Layer>
      {!settled && (
        <BeamFan
          clock={clock} t0={1.2} fadeIn={0.3} outFrom={L + 0.3} outTo={L + 1.2} cx={size / 2} cy={size / 2}
          length={95 * k} width={4} count={12} spreadDeg={15} degPerSec={30} peak={0.7} colors={WC} gradients={BEAM_GRADIENTS}
        />
      )}
      <Layer size={size} style={prevStyle} raster={raster}><JourneyBadge level={previousLevel} size={size} slotColor={slotColor} /></Layer>
      <Layer size={size} style={wlStyle} origin="25.6% 40%" raster={raster}><JourneyBadge level={8} size={size} parts={WING_L} /></Layer>
      <Layer size={size} style={wrStyle} origin="74.4% 40%" raster={raster}><JourneyBadge level={8} size={size} parts={WING_R} /></Layer>
      <Layer size={size} style={bodyStyle} raster={raster}><JourneyBadge level={8} size={size} parts={BODY} /></Layer>
      <Layer size={size} style={crownStyle} origin="50% 14%" raster={raster}><JourneyBadge level={8} size={size} parts={GEM} /></Layer>
      <RadialFlash clock={clock} hits={flash} size={size} />
      {!settled && quality === 'full' && (
        <OrbitParticles clock={clock} t0={1.3} t1={L + 1.1} cx={size / 2} cy={size / 2} rx={90 * k} ry={30 * k} speed={2.8} count={12} colors={WC} />
      )}
      {!settled && <ShockRing clock={clock} t0={L} dur={0.8} cx={size / 2} cy={size / 2} size={120 * k} from={0.7} to={2.6} color="#FF7BB0" borderWidth={3} />}
      {!settled && <ShockRing clock={clock} t0={L + 0.1} dur={0.8} cx={size / 2} cy={size / 2} size={120 * k} from={0.7} to={2.6} color="#FFD36B" borderWidth={3} />}
      {!settled && <SparkBurst clock={clock} t0={1.2} cx={size / 2} cy={size / 2} scale={k} life={0.6} options={burstEarly} />}
      {!settled && <SparkBurst clock={clock} t0={L} cx={size / 2} cy={size / 2} scale={k} options={burstLock} />}
    </RevealBox>
  );
}
