import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LeapLoop } from './LeapLoop';
import { medallionStage } from '../../lib/journeyPoints';
import { t } from '../../i18n';

// Handoff "fire medallion" (centre of the Journey top bar), with the Leap
// loop in place of the flame: 72×72, a ring of one arc per task today,
// an inner disc, the loop growing (20 → 42pt) and spinning faster with
// progress, and a stage pill hanging off the bottom.

const SIZE = 72;
const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;
const GAP = 7;
const ACCENT = '#FF5A55';
const LOOP_MAX = 42;

interface Palette {
  open: string;
  discUnlit: string;
  discUnlitBorder: string;
  discLitInner: string;
  discLitOuter: string;
  discLitBorder: string;
  loopCold: string;
  pillUnlitBg: string;
  pillUnlitText: string;
  pillBorder: string;
}

const DARK: Palette = {
  open: '#2A2A2A',
  discUnlit: '#141414',
  discUnlitBorder: '#262626',
  discLitInner: '#3A1410',
  discLitOuter: '#140A0A',
  discLitBorder: 'rgba(255,90,85,0.35)',
  loopCold: '#3A3A3C',
  pillUnlitBg: '#232323',
  pillUnlitText: '#8A8A8E',
  pillBorder: '#0A0A0A',
};

const LIGHT: Palette = {
  open: '#E4E4E6',
  discUnlit: '#F4F4F5',
  discUnlitBorder: '#E2E2E4',
  discLitInner: '#FFE1D4',
  discLitOuter: '#FFF6F2',
  discLitBorder: 'rgba(255,90,85,0.35)',
  loopCold: '#C9C9CE',
  pillUnlitBg: '#EDEDEF',
  pillUnlitText: '#8A8A8E',
  pillBorder: '#FFFFFF',
};

interface TodayMedallionProps {
  segments: boolean[];
  isLight: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}

export function TodayMedallion({ segments, isLight, onPress, onLongPress }: TodayMedallionProps) {
  const c = isLight ? LIGHT : DARK;
  const total = segments.length;
  const done = segments.filter(Boolean).length;
  const pct = total > 0 ? done / total : 0;
  const lit = done > 0;
  const full = total > 0 && done === total;
  const stage = medallionStage(done, total);

  // Loop size: animated scale over a fixed 42pt loop (handoff: .5s).
  const loopScale = useRef(new Animated.Value((20 + 22 * pct) / LOOP_MAX)).current;
  useEffect(() => {
    Animated.timing(loopScale, {
      toValue: (20 + 22 * pct) / LOOP_MAX,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pct, loopScale]);

  // Disc pop on each newly done task (1 → 1.18 → 1, .5s).
  const pop = useRef(new Animated.Value(1)).current;
  const prevDone = useRef(done);
  useEffect(() => {
    if (done > prevDone.current) {
      pop.setValue(1);
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.18, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      ]).start();
    }
    prevDone.current = done;
  }, [done, pop]);

  // Stage pill slides in (6pt up + fade) whenever the stage changes.
  const pillIn = useRef(new Animated.Value(1)).current;
  const prevStage = useRef(stage);
  useEffect(() => {
    if (stage !== prevStage.current) {
      pillIn.setValue(0);
      Animated.timing(pillIn, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    prevStage.current = stage;
  }, [stage, pillIn]);

  const seg = total > 0 ? RING_C / total : RING_C;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('journeyPoints.medallionA11y', { done, total })}
      style={styles.wrap}
    >
      <View style={[StyleSheet.absoluteFill, full && styles.ringGlow]}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {segments.map((isDone, i) => (
            <Circle
              key={i}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RING_R}
              fill="none"
              stroke={isDone ? ACCENT : c.open}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${seg - GAP} ${RING_C}`}
              transform={`rotate(${-90 + (i * 360) / total + (GAP / RING_C) * 180} ${SIZE / 2} ${SIZE / 2})`}
            />
          ))}
        </Svg>
      </View>

      {/* Glow lives on this wrapper: the disc itself clips (overflow hidden). */}
      <Animated.View style={[styles.discWrap, full && styles.discGlow, { transform: [{ scale: pop }] }]}>
      <View
        style={[
          styles.disc,
          { backgroundColor: lit ? (isLight ? '#FFFFFF' : '#140A0A') : c.discUnlit, borderColor: lit ? c.discLitBorder : c.discUnlitBorder },
        ]}
      >
        {lit && (
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <RadialGradient id="medallionDisc" cx="50%" cy="70%" r="70%">
                <Stop offset="0" stopColor={c.discLitInner} />
                <Stop offset="1" stopColor={c.discLitOuter} />
              </RadialGradient>
            </Defs>
            <Circle cx="50%" cy="50%" r="50%" fill="url(#medallionDisc)" />
          </Svg>
        )}
        <Animated.View style={{ transform: [{ scale: loopScale }] }}>
          <LeapLoop
            size={LOOP_MAX}
            variant={lit ? 'lit' : 'solid'}
            color={c.loopCold}
            strokeWidth={2}
            // Slow when cold, faster as it fills (handoff flicker 1.4s → 0.8s).
            spinMs={lit ? Math.round(6000 - 4000 * pct) : 0}
            glow={lit ? 3 + 8 * pct : 0}
          />
        </Animated.View>
      </View>
      </Animated.View>

      <Animated.View
        style={[
          styles.pill,
          { backgroundColor: lit ? ACCENT : c.pillUnlitBg, borderColor: c.pillBorder },
          { opacity: pillIn, transform: [{ translateY: pillIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] },
        ]}
      >
        <Text style={[styles.pillText, { color: lit ? '#FFFFFF' : c.pillUnlitText }]}>
          {t(`journeyPoints.stage.${stage}`)}
          <Text style={styles.pillCount}>{`  ${done}/${total}`}</Text>
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE },
  ringGlow:
    Platform.OS === 'ios'
      ? { shadowColor: ACCENT, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }
      : {},
  discWrap: {
    position: 'absolute',
    top: 9,
    left: 9,
    right: 9,
    bottom: 9,
    borderRadius: (SIZE - 18) / 2,
  },
  disc: {
    flex: 1,
    borderRadius: (SIZE - 18) / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  discGlow:
    Platform.OS === 'ios'
      ? { shadowColor: '#FF783C', shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, backgroundColor: '#140A0A' }
      : {},
  pill: {
    position: 'absolute',
    bottom: -9,
    alignSelf: 'center',
    height: 17,
    paddingHorizontal: 7,
    borderRadius: 9,
    borderWidth: 2,
    justifyContent: 'center',
  },
  pillText: { fontFamily: 'PlusJakartaSans-ExtraBold', fontSize: 8.5, letterSpacing: 1.2, includeFontPadding: false },
  pillCount: { opacity: 0.75 },
});
