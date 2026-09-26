import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { clamp01 } from '../../../lib/worldProgress';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export const KIT_EASE = Easing.bezier(0.4, 0, 0.2, 1);

interface Props {
  size: number;
  radius: number;
  strokeWidth: number;
  /** Real ratio 0–1 — 0 draws an empty track, never a full stroke. */
  progress: number;
  color: string;
  trackColor: string;
  /** Mount delay in ms (dashboard stagger .15/.25/.35s). */
  delay?: number;
  /** Duration for mount and later changes (default 1000ms, handoff curve). */
  duration?: number;
  /** Linear timing — the running 60s timer ring (.1s linear updates). */
  linear?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * SVG progress ring rotated to start at 12 o'clock. Animates from 0 on mount,
 * then to each new value. strokeDashoffset is an SVG prop, so this Value is
 * JS-driven only — never mixed with a native-driver animation (see the
 * 2026-09 mixed-driver crash).
 */
export function AnimatedRing({
  size, radius, strokeWidth, progress, color, trackColor,
  delay = 0, duration = 1000, linear = false, children, style,
}: Props) {
  const c = 2 * Math.PI * radius;
  const value = useRef(new Animated.Value(0)).current;
  const mounted = useRef(false);
  const target = clamp01(progress);

  useEffect(() => {
    const anim = Animated.timing(value, {
      toValue: target,
      duration,
      delay: mounted.current ? 0 : delay,
      easing: linear ? Easing.linear : KIT_EASE,
      useNativeDriver: false,
    });
    mounted.current = true;
    anim.start();
    return () => anim.stop();
  }, [target, duration, linear, delay, value]);

  const offset = value.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  const mid = size / 2;

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={mid} cy={mid} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={mid} cy={mid} r={radius}
          stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={offset}
          // A 0-length round-capped arc still paints a dot; hide it at 0.
          opacity={target > 0 ? 1 : 0}
        />
      </Svg>
      {children}
    </View>
  );
}
