import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { clamp01 } from '../../lib/worldProgress';
import { worldRgba } from '../../../constants/worldThemes';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface WorldRingProps {
  /** Outer square size of the ring in px. */
  size: number;
  strokeWidth: number;
  /** Real ratio 0–1. 0 renders a visibly empty track — never a full stroke. */
  progress: number;
  accent: string;
  /** Track color; defaults to accent at 15% opacity per the handoff. */
  trackColor?: string;
  /** Content rendered in the center of the ring. */
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Honest SVG progress ring (design handoff's core rule): the arc length is
 * always computed from the real value, starts at 12 o'clock, and animates
 * offset changes over 0.6s.
 */
export function WorldRing({
  size,
  strokeWidth,
  progress,
  accent,
  trackColor,
  children,
  style,
}: WorldRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = clamp01(progress);

  const animated = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(animated, {
      toValue: clamped,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      // strokeDashoffset is an SVG prop — not supported by the native driver.
      useNativeDriver: false,
    }).start();
  }, [clamped, animated]);

  const strokeDashoffset = animated.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      <Svg
        width={size}
        height={size}
        // Rotate the whole drawing so the arc starts at 12 o'clock.
        style={{ transform: [{ rotate: '-90deg' }], position: 'absolute' }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor ?? worldRgba(accent, 0.15)}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={accent}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
