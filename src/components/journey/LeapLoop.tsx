import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, View, ViewStyle, StyleProp, Platform } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

// The Leap loop: the LeapLogo.tsx mark exactly -- three thin arcs on r=38
// (100° each, 20° gaps) with a world-coloured dot in each gap -- used by
// Journey points wherever the design handoff
// (assets/design_handoff_journey_points) drew a flame — the today
// medallion, the 7-day streak strip and the lit "+" node. It spins where
// the flame flickered.

const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
  const a = ((angleInDegrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

const describeArc = (r: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(50, 50, r, endAngle);
  const end = polarToCartesian(50, 50, r, startAngle);
  return ['M', start.x, start.y, 'A', r, r, 0, endAngle - startAngle <= 180 ? '0' : '1', 0, end.x, end.y].join(' ');
};

const R = 38;
const ARCS = [describeArc(R, -50, 50), describeArc(R, 70, 170), describeArc(R, 190, 290)];
// Gap midpoints and the logo's dot colours: Power red, Endurance orange, Static purple.
const DOTS = [
  { ...polarToCartesian(50, 50, R, 60), color: '#FF5252' },
  { ...polarToCartesian(50, 50, R, 180), color: '#FF7043' },
  { ...polarToCartesian(50, 50, R, 300), color: '#7E57C2' },
];

/** Handoff fire gradient, bottom → top. */
export const FIRE_STOPS = ['#FF5A55', '#FF8A3D', '#FFD27A'] as const;

export type LeapLoopVariant =
  /** Fire gradient. */
  | 'lit'
  /** One flat colour (see `color`). */
  | 'solid'
  /** Dashed outline only — "not yet" (today before the first point). */
  | 'dashed';

interface LeapLoopProps {
  size: number;
  variant?: LeapLoopVariant;
  color?: string;
  /** Rendered line width in px (the logo's 1.5 of 100, floored at 1.5px). */
  strokeWidth?: number;
  /** The three world dots in the gaps (hidden on the dashed variant). */
  dots?: boolean;
  opacity?: number;
  /** One full turn, in ms. 0 = still. */
  spinMs?: number;
  /** iOS glow radius (Android has no coloured shadows). */
  glow?: number;
  style?: StyleProp<ViewStyle>;
}

export function LeapLoop({
  size,
  variant = 'lit',
  color = '#FF5A55',
  strokeWidth = 1.5,
  dots = true,
  opacity = 1,
  spinMs = 0,
  glow = 0,
  style,
}: LeapLoopProps) {
  const gradientId = `leaploop${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spinMs) {
      rotation.stopAnimation();
      return;
    }
    // Restart from the current angle so a speed change never jumps.
    rotation.setValue(0);
    const loop = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: spinMs, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spinMs, rotation]);

  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  // px → viewBox units, never thinner than the logo's own proportion.
  const sw = Math.max(1.5, (Math.max(strokeWidth, 1.5) * 100) / size);
  const dotR = sw * 0.8;
  const stroke = variant === 'lit' ? `url(#${gradientId})` : color;
  const glowStyle: ViewStyle | undefined =
    glow > 0 && Platform.OS === 'ios'
      ? { shadowColor: '#FF823C', shadowOpacity: 0.9, shadowRadius: glow, shadowOffset: { width: 0, height: 0 } }
      : undefined;

  return (
    <View style={[{ width: size, height: size, opacity }, glowStyle, style]}>
      <Animated.View style={{ width: size, height: size, transform: [{ rotate: spin }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {variant === 'lit' && (
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={FIRE_STOPS[0]} />
                <Stop offset="0.6" stopColor={FIRE_STOPS[1]} />
                <Stop offset="1" stopColor={FIRE_STOPS[2]} />
              </LinearGradient>
            </Defs>
          )}
          {ARCS.map((d, i) => (
            <Path
              key={i}
              d={d}
              fill="none"
              stroke={stroke}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeDasharray={variant === 'dashed' ? `${sw * 1.6} ${sw * 1.4}` : undefined}
            />
          ))}
          {dots &&
            variant !== 'dashed' &&
            DOTS.map((d, i) => (
              <Circle key={i} cx={d.x} cy={d.y} r={dotR} fill={variant === 'lit' ? d.color : color} />
            ))}
        </Svg>
      </Animated.View>
    </View>
  );
}
