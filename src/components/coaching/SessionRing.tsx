import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedProps, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, RadialGradient, Stop } from 'react-native-svg';
import { kt } from '../worlds/kit';
import { clamp01, easeOutCubic } from '../../lib/prCelebration';
import {
  completionCount, fuseProgress, ringGeometry, segmentLand, segmentProgress, segmentStart, WC_C, WC_RING, WCTimeline,
} from '../../lib/workoutComplete';
import { WCTokens } from './sessionCompleteTokens';
import { isRTL } from '../../i18n';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const { size: SZ, mid: MID, radius: R, stroke: SW } = WC_RING;

export interface RingSegment {
  color: string;
  missed: boolean;
}

interface SegmentCtx {
  clock: SharedValue<number>;
  tl: WCTimeline;
  n: number;
  tokens: WCTokens;
}

const deg = (px: number) => (px / WC_C) * 360;

/**
 * Arc drawn from `startPx` along the ring. Only strokeDashoffset and
 * strokeOpacity animate (the combo StaticHero already proves on device);
 * the dash pattern and rotation stay static.
 */
function Arc({ startPx, reverse, color, width, animatedProps }: {
  startPx: number; reverse?: boolean; color: string; width: number; animatedProps: any;
}) {
  return (
    <G transform={`rotate(${deg(startPx)} ${MID} ${MID})`}>
      <G transform={reverse ? `matrix(1 0 0 -1 0 ${SZ})` : undefined}>
        <AnimatedCircle
          cx={MID} cy={MID} r={R} fill="none" stroke={color} strokeWidth={width}
          strokeDasharray={WC_C} animatedProps={animatedProps}
        />
      </G>
    </G>
  );
}

function Segment({ ctx, i, seg, startPx, segLen }: { ctx: SegmentCtx; i: number; seg: RingSegment; startPx: number; segLen: number }) {
  const { clock, tl, n, tokens: t } = ctx;
  const land = segmentLand(i, tl);
  const fill = useAnimatedProps(() => ({ strokeDashoffset: WC_C - segLen * segmentProgress(clock.value, i, n, tl) }));
  const glow = useAnimatedProps(() => {
    const T = clock.value;
    const flash = T >= land ? 1 - clamp01((T - land) / 0.3) : 0;
    return {
      strokeDashoffset: WC_C - segLen * segmentProgress(T, i, n, tl),
      strokeOpacity: (0.16 + flash * 0.25) * t.glowK,
    };
  });
  const flash = useAnimatedProps(() => {
    const T = clock.value;
    return {
      strokeDashoffset: WC_C - segLen * segmentProgress(T, i, n, tl),
      strokeOpacity: T >= land ? (1 - clamp01((T - land) / 0.3)) * 0.7 : 0,
    };
  });
  return (
    <>
      <G transform={`rotate(${deg(startPx)} ${MID} ${MID})`}>
        <Circle cx={MID} cy={MID} r={R} fill="none" stroke={t.track} strokeWidth={SW} strokeDasharray={`${segLen} ${WC_C}`} />
      </G>
      {!seg.missed && (
        <>
          <Arc startPx={startPx} color={seg.color} width={SW + 10} animatedProps={glow} />
          <Arc startPx={startPx} color={seg.color} width={SW} animatedProps={fill} />
          <Arc startPx={startPx} color="#ffffff" width={SW} animatedProps={flash} />
        </>
      )}
    </>
  );
}

/**
 * 100% only: closes one gap. Each side's colour grows into it from its own
 * segment (the previous forwards, the next backwards) to the gap's middle,
 * so the fused ring keeps its colour bands.
 */
function GapFill({ ctx, fromPx, toPx, prevColor, nextColor, half }: {
  ctx: SegmentCtx; fromPx: number; toPx: number; prevColor: string; nextColor: string; half: number;
}) {
  const { clock, tl, tokens: t } = ctx;
  const len = useAnimatedProps(() => ({ strokeDashoffset: WC_C - half * fuseProgress(clock.value, tl) }));
  const glow = useAnimatedProps(() => ({ strokeDashoffset: WC_C - half * fuseProgress(clock.value, tl), strokeOpacity: 0.16 * t.glowK }));
  return (
    <>
      <Arc startPx={fromPx} color={prevColor} width={SW + 10} animatedProps={glow} />
      <Arc startPx={fromPx} color={prevColor} width={SW} animatedProps={len} />
      <Arc startPx={toPx} reverse color={nextColor} width={SW + 10} animatedProps={glow} />
      <Arc startPx={toPx} reverse color={nextColor} width={SW} animatedProps={len} />
    </>
  );
}

/** Small open dot on a missed block's segment, at its turn. */
function GapMarker({ ctx, i, centerPx }: { ctx: SegmentCtx; i: number; centerPx: number }) {
  const { clock, tl, tokens: t } = ctx;
  const a = (centerPx / WC_C) * Math.PI * 2 - Math.PI / 2;
  const x = MID + R * Math.cos(a);
  const y = MID + R * Math.sin(a);
  const start = segmentStart(i, tl) + tl.segDur * 0.5;
  const style = useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - start) / 0.25));
    return { opacity: p, transform: [{ scale: 0.6 + 0.4 * p }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: x - 4, top: y - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: t.card, borderWidth: 1.5, borderColor: t.t5 }, style]}
    />
  );
}

const SPARKS = Array.from({ length: 22 }, (_, i) => ({
  a: (i / 22) * Math.PI * 2 + ((i * 37) % 10) / 30,
  dist: 40 + ((i * 29) % 34),
  s: 4 + (i % 3),
  d: (i % 5) * 0.03,
  white: i % 4 === 0,
}));

function Spark({ clock, fuse, spark, color }: { clock: SharedValue<number>; fuse: number; spark: typeof SPARKS[number]; color: string }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const burst = clamp01((T - fuse) / 0.9);
    if (T < fuse || burst >= 1) return { opacity: 0 };
    const p = clamp01((burst - spark.d) / (1 - spark.d));
    const r = R + 4 + easeOutCubic(p) * spark.dist;
    return {
      opacity: p > 0 ? 1 - p : 0,
      transform: [
        { translateX: MID + r * Math.cos(spark.a) - spark.s / 2 },
        { translateY: MID + r * Math.sin(spark.a) - spark.s / 2 },
        { rotate: `${45 + p * 90}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: spark.s, height: spark.s, borderRadius: 1, backgroundColor: color, boxShadow: `0 0 ${spark.s * 2}px ${color}` }, style]}
    />
  );
}

/** Pulse ring + radial bloom at the LOCK (not at 0%). */
function LockBurst({ clock, tokens: t, lock, full }: { clock: SharedValue<number>; tokens: WCTokens; lock: number; full: boolean }) {
  const inner = SZ - 16;
  const pulse = useAnimatedStyle(() => {
    const T = clock.value;
    const p = clamp01((T - lock) / 0.9);
    return { opacity: T >= lock ? (1 - p) * (full ? 0.7 : 0.4) : 0, transform: [{ scale: 1 + easeOutCubic(p) * (full ? 0.45 : 0.25) }] };
  });
  const bloom = useAnimatedStyle(() => {
    const T = clock.value;
    return { opacity: T >= lock ? 1 - clamp01((T - lock) / 0.9) : 0 };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 8, top: 8, width: inner, height: inner }, bloom]}>
        <Svg width={inner} height={inner}>
          <Defs>
            <RadialGradient id="wcBloom" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={t.accent} stopOpacity={(full ? 0.32 : 0.16) * t.glowK} />
              <Stop offset="0.7" stopColor={t.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={inner / 2} cy={inner / 2} r={inner / 2} fill="url(#wcBloom)" />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{
        position: 'absolute', left: 8, top: 8, width: inner, height: inner, borderRadius: inner / 2, borderWidth: 2, borderColor: t.accent,
      }, pulse]} />
    </>
  );
}

function WhiteFlash({ clock, fuse }: { clock: SharedValue<number>; fuse: number }) {
  const props = useAnimatedProps(() => {
    const T = clock.value;
    return { strokeOpacity: T >= fuse ? (1 - clamp01((T - fuse) / 0.45)) * 0.85 : 0 };
  });
  return <AnimatedCircle cx={MID} cy={MID} r={R} fill="none" stroke="#ffffff" strokeWidth={SW + 1} animatedProps={props} />;
}

/** Whole-number % that follows the completed segments (JS state). */
function useCompletionCount(clock: SharedValue<number>, pct: number, completed: number[], n: number, tl: WCTimeline): number {
  const [count, setCount] = useState(0);
  useAnimatedReaction(
    () => completionCount(clock.value, pct, completed, n, tl),
    (now, was) => { if (now !== was) runOnJS(setCount)(now); },
  );
  return count;
}

function useLocked(clock: SharedValue<number>, lock: number): boolean {
  const [locked, setLocked] = useState(false);
  useAnimatedReaction(() => clock.value >= lock, (now, was) => { if (now !== was) runOnJS(setLocked)(now); });
  return locked;
}

/**
 * Centre % + unit. Owns the counter state, so each tick re-renders only this
 * text, not the ring's segments and sparks.
 */
function CenterCount({ clock, tokens: t, tl, pct, completed, n, full, none, unit }: {
  clock: SharedValue<number>; tokens: WCTokens; tl: WCTimeline; pct: number; completed: number[]; n: number; full: boolean; none: boolean; unit: string;
}) {
  const count = useCompletionCount(clock, pct, completed, n, tl);
  const locked = useLocked(clock, tl.lock);
  const bump = useAnimatedStyle(() => {
    const T = clock.value;
    const b1 = !none && T > tl.lock && T < tl.lock + 0.4 ? Math.sin(((T - tl.lock) / 0.4) * Math.PI) : 0;
    const b2 = full && T > tl.fuse && T < tl.fuse + 0.35 ? Math.sin(((T - tl.fuse) / 0.35) * Math.PI) : 0;
    return { transform: [{ scale: 1 + b1 * (full ? 0.12 : 0.06) + b2 * 0.1 }] };
  });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text
        style={[
          kt('bold', 76, t.t1, 0, 92),
          { fontVariant: ['tabular-nums'], paddingHorizontal: 18, marginVertical: -8, writingDirection: 'ltr' },
          locked && !none && { textShadowColor: `rgba(252,84,84,${0.5 * t.glowK})`, textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
          bump,
        ]}
      >
        {isRTL ? '\u2066' : ''}{count}
        <Text style={kt('semibold', 30, t.t3)}>%</Text>
        {isRTL ? '\u2069' : ''}
      </Animated.Text>
      <Text style={[kt('medium', 11, t.t4, 3), { marginTop: 6 }]}>{unit}</Text>
    </View>
  );
}

/**
 * Segmented session ring: one segment per block in workout order, lit in
 * turn; missed blocks stay dim with a gap marker; at 100% the gaps close.
 * Starts at 12 o'clock, clockwise (counter-clockwise in Arabic).
 */
export function SessionRing({ clock, tokens: t, tl, segments, pct, unit }: {
  clock: SharedValue<number>; tokens: WCTokens; tl: WCTimeline; segments: RingSegment[]; pct: number; unit: string;
}) {
  const n = segments.length;
  const geo = ringGeometry(n);
  const completed = segments.map((s, i) => (s.missed ? -1 : i)).filter(i => i >= 0);
  const full = completed.length === n && n > 0;
  const none = completed.length === 0;
  const ctx: SegmentCtx = { clock, tl, n, tokens: t };
  const sparkColors = completed.map(i => segments[i].color);

  return (
    <View style={{ width: SZ, height: SZ, alignSelf: 'center', marginTop: 12 }}>
      {/* Geometry box: laid out left-to-right in every language, then
          mirrored as a whole for Arabic so the ring runs counter-clockwise. */}
      <View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: SZ, height: SZ, direction: 'ltr' }, isRTL && { transform: [{ scaleX: -1 }] }]}>
        {!none && <LockBurst clock={clock} tokens={t} lock={tl.lock} full={full} />}
        <Svg width={SZ} height={SZ} style={{ position: 'absolute', overflow: 'visible', transform: [{ rotate: '-90deg' }] }}>
          {segments.map((seg, i) => (
            <Segment key={i} ctx={ctx} i={i} seg={seg} startPx={geo.starts[i]} segLen={geo.segLen} />
          ))}
          {full && n > 1 && segments.map((seg, i) => {
            const next = (i + 1) % n;
            return (
              <GapFill
                key={`g${i}`} ctx={ctx} half={geo.gapLen / 2}
                fromPx={geo.starts[i] + geo.segLen} toPx={geo.starts[next] + (next === 0 ? WC_C : 0)}
                prevColor={seg.color} nextColor={segments[next].color}
              />
            );
          })}
          {full && <WhiteFlash clock={clock} fuse={tl.fuse} />}
        </Svg>
        {segments.map((seg, i) => (seg.missed ? <GapMarker key={`m${i}`} ctx={ctx} i={i} centerPx={geo.starts[i] + geo.segLen / 2} /> : null))}
        {full && SPARKS.map((s, i) => (
          <Spark key={`s${i}`} clock={clock} fuse={tl.fuse} spark={s} color={s.white ? '#ffffff' : sparkColors[i % sparkColors.length]} />
        ))}
      </View>

      <CenterCount clock={clock} tokens={t} tl={tl} pct={pct} completed={completed} n={n} full={full} none={none} unit={unit} />
    </View>
  );
}
