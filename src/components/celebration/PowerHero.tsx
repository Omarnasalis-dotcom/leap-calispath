import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { kt } from '../worlds/kit';
import { clamp01, easeIn, easeOutCubic, FILL_START, formatKg, PlacedPlate, PlateStack, POWER_STAGE } from '../../lib/prCelebration';
import { HERO_LTR, HeroProps, useLocked } from './heroShared';
import { PRTokens } from './prTokens';
import { ltr, t as tr } from '../../i18n';

const { height: STAGE_H, floor: FLOOR, drop: DROP, dropFrom: DROP_FROM } = POWER_STAGE;
const PLATE_GRADIENT = ['#ff7a6f', '#FF4A3D', '#c22a20'] as const;
/** Height of the number row; its bottom edge sits 2px above the top plate. */
const NUM_H = 104;

const DUST = Array.from({ length: 12 }, (_, i) => ({ side: i % 2 ? 1 : -1, sp: 50 + (i % 4) * 22, up: 10 + (i % 3) * 10, s: 3 + (i % 3) }));

function Plate({ clock, plate }: { clock: SharedValue<number>; plate: PlacedPlate }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const { start, land, top } = plate;
    const dp = clamp01((T - start) / DROP);
    const settle = T > land ? Math.sin(clamp01((T - land) / 0.16) * Math.PI) * 3 : 0;
    const y = T < start ? DROP_FROM : dp < 1 ? DROP_FROM + (top - DROP_FROM) * easeIn(dp) : top + settle;
    const squash = T > land && T < land + 0.14 ? 1 - Math.sin(((T - land) / 0.14) * Math.PI) * 0.18 : 1;
    return { opacity: T < start ? 0 : 1, transform: [{ translateY: y }, { scaleY: squash }] };
  });
  return (
    <Animated.View
      style={[{
        position: 'absolute', left: '50%', marginLeft: -plate.width / 2, top: 0,
        width: plate.width, height: plate.height, borderRadius: Math.min(6, plate.height / 2.4),
        borderWidth: 1, borderColor: '#ff8f86', overflow: 'hidden', transformOrigin: 'bottom',
        boxShadow: '0 0 14px rgba(255,74,61,0.35)', justifyContent: 'center', alignItems: 'flex-end', paddingRight: 10,
      }, style]}
    >
      <LinearGradient colors={PLATE_GRADIENT} locations={[0, 0.35, 1]} style={StyleSheet.absoluteFill} />
      {plate.showLabel && (
        <Text style={kt('semibold', Math.min(12, plate.height - 4), '#ffffff', 0.6, Math.min(12, plate.height - 4) + 2)}>{formatKg(plate.kg)}</Text>
      )}
    </Animated.View>
  );
}

function Dust({ clock, tokens: t, lock, d, numBottom, stageW }: {
  clock: SharedValue<number>; tokens: PRTokens; lock: number; d: typeof DUST[number]; numBottom: number; stageW: number;
}) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const imp = clamp01((T - lock) / 0.9);
    if (T < lock || imp >= 1) return { opacity: 0 };
    const p = easeOutCubic(imp);
    return {
      opacity: 1 - imp,
      transform: [
        { translateX: stageW / 2 + d.side * (70 + p * d.sp) - d.s / 2 },
        { translateY: numBottom - 4 - Math.sin(p * Math.PI) * d.up },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: d.s, height: d.s, borderRadius: d.s / 2, backgroundColor: d.s > 4 ? '#ffb0a8' : t.accent, boxShadow: `0 0 6px ${t.accent}` }, style]}
    />
  );
}

/** Plates drop onto a pin, then the number slams onto the stack (the LOCK). */
export function PowerHero({ clock, tokens: t, value, previous, lock, stack }: HeroProps & { stack: PlateStack }) {
  const locked = useLocked(clock, lock);
  const [stageW, setStageW] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const { plates, stackTop, numberStart } = stack;
  const numBottom = stackTop - 2;
  const landTimes = plates.map(p => p.land);
  const totals = plates.map(p => p.loaded);

  useAnimatedReaction(
    () => {
      let kg = 0;
      for (let i = 0; i < landTimes.length; i++) if (clock.value >= landTimes[i]) kg = totals[i];
      return kg;
    },
    (now, was) => { if (now !== was) runOnJS(setLoaded)(now); },
  );

  const loadedStyle = useAnimatedStyle(() => {
    const T = clock.value;
    return { opacity: T > FILL_START && T < lock ? 1 : T >= lock ? 1 - clamp01((T - lock) / 0.3) : 0 };
  });

  const pinStyle = useAnimatedStyle(() => {
    const T = clock.value;
    return {
      opacity: clamp01((T - 0.45) / 0.3),
      height: Math.max(0, FLOOR - stackTop + (T >= numberStart ? -4 : 26)),
    };
  });

  const numStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const np = clamp01((T - numberStart) / 0.3);
    const y = T < numberStart ? -260 : np < 1 ? -260 + (numBottom + 260) * easeIn(np) : numBottom;
    const nsq = T >= lock && T < lock + 0.22 ? Math.sin(((T - lock) / 0.22) * Math.PI) : 0;
    return {
      opacity: T < numberStart ? 0 : 1,
      transform: [{ translateY: y - NUM_H }, { scaleX: 1 + nsq * 0.14 }, { scaleY: 1 - nsq * 0.2 }],
    };
  });

  const waveStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const imp = clamp01((T - lock) / 0.9);
    const p = easeOutCubic(imp);
    return {
      opacity: T >= lock ? (1 - imp) * 0.8 : 0,
      transform: [{ scaleX: 0.4 + p * 1.1 }, { scaleY: 0.4 + p * 0.8 }],
    };
  });

  const passedPrev = previous != null && loaded > previous + 1e-6;

  return (
    <View
      style={[HERO_LTR, { height: STAGE_H, marginTop: 4 }]}
      onLayout={e => setStageW(e.nativeEvent.layout.width)}
    >
      <Animated.Text style={[kt('semibold', 12, passedPrev ? t.accentText : t.textMuted, 2), { position: 'absolute', left: 0, top: 4, fontVariant: ['tabular-nums'] }, loadedStyle]}>
        {tr('prCelebration.loaded', { kg: formatKg(loaded) })}
      </Animated.Text>

      <Animated.View style={[{ position: 'absolute', left: '50%', marginLeft: -6, width: 12, bottom: 7, borderTopLeftRadius: 6, borderTopRightRadius: 6, overflow: 'hidden' }, pinStyle]}>
        <LinearGradient colors={['#2a2a2a', '#5a5a5a', '#2a2a2a']} locations={[0, 0.45, 1]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={{ position: 'absolute', left: 30, right: 30, bottom: 6, height: 2, borderRadius: 1, backgroundColor: t.floorLine }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 60, right: 60, bottom: 0, height: 10 }}>
        <Svg width="100%" height={10}>
          <Defs>
            <RadialGradient id="floorGlow" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={t.accent} stopOpacity={0.18} />
              <Stop offset="0.7" stopColor={t.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy={5} rx="50%" ry={5} fill="url(#floorGlow)" />
        </Svg>
      </View>

      {plates.map((p, i) => <Plate key={i} clock={clock} plate={p} />)}
      {stageW > 0 && DUST.map((d, i) => <Dust key={i} clock={clock} tokens={t} lock={lock} d={d} numBottom={numBottom} stageW={stageW} />)}

      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: '50%', marginLeft: -110, top: numBottom - 14, width: 220, height: 28, borderRadius: 110, borderWidth: 2, borderColor: t.accent }, waveStyle]} />

      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: NUM_H, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, transformOrigin: 'bottom' }, numStyle]}>
        <Text
          style={[
            kt('bold', 84, t.text, 0, NUM_H),
            { fontVariant: ['tabular-nums'], paddingHorizontal: 18, marginBottom: -12 },
            locked
              ? { textShadowColor: t.accent, textShadowRadius: 16, textShadowOffset: { width: 0, height: 0 } }
              : { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 12, textShadowOffset: { width: 0, height: 6 } },
          ]}
        >
          {ltr(formatKg(value))}
        </Text>
        <Text style={[kt('semibold', 18, t.accentText, 2), { paddingBottom: 9 }]}>{tr('prCelebration.kg')}</Text>
      </Animated.View>
    </View>
  );
}

