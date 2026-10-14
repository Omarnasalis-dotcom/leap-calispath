import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { clamp01, easeOutCubic, flashAt, seg } from '../../lib/fx/easing';
import { BurstOptions, buildBurst, buildOrbit, orbitAt, sparkAt } from '../../lib/fx/particles';

/*
 * Shared effect layers for celebrations. Rules (docs/features/
 * JOURNEY_ACHIEVEMENTS_PLAN.md): every style is a pure function of one clock,
 * only transform/opacity animate, no shadows, particle tables are built once.
 * All layers are pointerEvents="none" and positioned absolutely in their
 * parent; (cx, cy) is the effect's centre in that parent.
 */

type Clock = SharedValue<number>;

/** True once the clock passes `t` (flips once; for unmounting transients). */
export function useAfter(clock: Clock, t: number): boolean {
  const [after, setAfter] = useState(false);
  useAnimatedReaction(
    () => clock.value >= t,
    (now, was) => { if (now && !was) runOnJS(setAfter)(true); },
  );
  return after;
}

// ── Sparks ────────────────────────────────────────────────────────────────

function Spark({ clock, t0, life, r0, gravity, cx, cy, angle, dist, size, delay, color }: {
  clock: Clock; t0: number; life: number; r0: number; gravity: boolean; cx: number; cy: number;
  angle: number; dist: number; size: number; delay: number; color: string;
}) {
  const style = useAnimatedStyle(() => {
    const f = sparkAt(clock.value, t0, angle, dist, delay, life, r0, gravity);
    return { opacity: f.opacity, transform: [{ translateX: f.x }, { translateY: f.y }, { rotate: `${f.rotate}deg` }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: 1, backgroundColor: color }, style]} />;
}

/**
 * A spark burst at t0. Pass the designed count; scale it with
 * particleCount() before calling for the lite profile.
 */
export const SparkBurst = React.memo(function SparkBurst({ clock, t0, cx, cy, scale = 1, life = 0.9, gravity = false, options }: {
  clock: Clock; t0: number; cx: number; cy: number; scale?: number; life?: number; gravity?: boolean; options: BurstOptions;
}) {
  const particles = useMemo(() => buildBurst(options), [options]);
  const r0 = (options.r0 ?? 30) * scale;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {particles.map((p, i) => (
        <Spark
          key={i} clock={clock} t0={t0} life={life} r0={r0} gravity={gravity} cx={cx} cy={cy}
          angle={p.angle} dist={p.dist * scale} size={p.size} delay={p.delay} color={p.color}
        />
      ))}
    </View>
  );
});

// ── Orbit ─────────────────────────────────────────────────────────────────

function OrbitDot({ clock, t0, t1, rx, ry, speed, cx, cy, phase, size, color }: {
  clock: Clock; t0: number; t1: number; rx: number; ry: number; speed: number; cx: number; cy: number;
  phase: number; size: number; color: string;
}) {
  const style = useAnimatedStyle(() => {
    const f = orbitAt(clock.value, t0, t1, phase, rx, ry, speed);
    return { opacity: f.opacity, transform: [{ translateX: f.x }, { translateY: f.y }, { scale: f.scale }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />;
}

/** Particles circling the centre on an ellipse between t0 and t1. */
export const OrbitParticles = React.memo(function OrbitParticles({ clock, t0, t1, cx, cy, rx, ry, speed, count, colors }: {
  clock: Clock; t0: number; t1: number; cx: number; cy: number; rx: number; ry: number; speed: number;
  count: number; colors: readonly string[];
}) {
  const dots = useMemo(() => buildOrbit(count, colors), [count, colors]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {dots.map((d, i) => (
        <OrbitDot key={i} clock={clock} t0={t0} t1={t1} rx={rx} ry={ry} speed={speed} cx={cx} cy={cy} phase={d.phase} size={d.size} color={d.color} />
      ))}
    </View>
  );
});

// ── Beam fan ──────────────────────────────────────────────────────────────

/**
 * Light beams from the centre that rotate as ONE view (the beams inside are
 * static), fading in at t0 and out over [outFrom, outTo].
 */
export const BeamFan = React.memo(function BeamFan({ clock, t0, outFrom, outTo, cx, cy, length, width = 10, count, colors, degPerSec = 40, peak = 0.7, fadeIn = 0.15, spreadDeg, gradients }: {
  clock: Clock; t0: number; outFrom: number; outTo: number; cx: number; cy: number; length: number;
  width?: number; count: number; colors: readonly string[]; degPerSec?: number; peak?: number;
  fadeIn?: number;
  /** Angle between beams (default 360 / count). Each beam spans the full diameter. */
  spreadDeg?: number;
  /** Per-beam gradient (5 stops: edge, 30%, centre, 70%, edge); overrides `colors`. */
  gradients?: readonly (readonly string[])[];
}) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const op = seg(t, t0, t0 + fadeIn) * (1 - seg(t, outFrom, outTo)) * peak;
    return { opacity: op, transform: [{ rotate: `${Math.max(0, t - t0) * degPerSec}deg` }] };
  });
  const box = length * 2;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: cx - length, top: cy - length, width: box, height: box }, style]}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: length - width / 2, top: 0, width, height: box, borderRadius: width / 2, overflow: 'hidden', transform: [{ rotate: `${i * (spreadDeg ?? 360 / count)}deg` }] }}
        >
          {gradients ? (
            <LinearGradient colors={gradients[i % gradients.length] as unknown as [string, string, ...string[]]} locations={[0, 0.3, 0.5, 0.7, 1]} style={StyleSheet.absoluteFill} />
          ) : (
            <LinearGradient colors={['transparent', colors[i % colors.length], 'transparent']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
          )}
        </View>
      ))}
    </Animated.View>
  );
});

// ── Shock ring ────────────────────────────────────────────────────────────

/** A ring that scales from `from` to `to` and fades over [t0, t0 + dur]. */
export function ShockRing({ clock, t0, dur, cx, cy, size, from, to, color, borderWidth = 3 }: {
  clock: Clock; t0: number; dur: number; cx: number; cy: number; size: number; from: number; to: number;
  color: string; borderWidth?: number;
}) {
  const style = useAnimatedStyle(() => {
    const p = clamp01((clock.value - t0) / dur);
    const on = p > 0 && p < 1;
    return { opacity: on ? (1 - p) * 0.85 : 0, transform: [{ scale: from + (to - from) * easeOutCubic(p) }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: cx - size / 2, top: cy - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth, borderColor: color }, style]}
    />
  );
}

// ── Flash ─────────────────────────────────────────────────────────────────

export interface FlashHit { t: number; dur: number; peak: number }

/** A full-cover flash (white by default) that peaks at each hit and decays. */
export const FlashLayer = React.memo(function FlashLayer({ clock, hits, color = '#ffffff', radius = 0 }: {
  clock: Clock; hits: readonly FlashHit[]; color?: string; radius?: number;
}) {
  const style = useAnimatedStyle(() => {
    let o = 0;
    for (let i = 0; i < hits.length; i++) o = Math.max(o, flashAt(clock.value, hits[i].t, hits[i].dur, hits[i].peak));
    return { opacity: o };
  });
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color, borderRadius: radius }, style]} />;
});
