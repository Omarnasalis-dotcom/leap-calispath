import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path, Circle, Text as SvgText, G } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';


interface LeapLogoProps {
  size?: number;
  animated?: boolean;
}

const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
  const angleInRadians = (angleInDegrees - 90) * (Math.PI / 180.0);
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
};

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
  ].join(' ');
};

export const LeapLogo: React.FC<LeapLogoProps> = ({ size = 200, animated = true }) => {
  const { theme } = useTheme();
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animated) {
      Animated.loop(
        Animated.timing(rotation, {
          toValue: 1,
          duration: 20000, // Very slow, orbital rotation
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    }
  }, [animated]);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const cx = 50;
  const cy = 50;
  const r = 38;

  // 3 arcs, 100 degrees each, 20 degree gaps
  const topArc = describeArc(cx, cy, r, -50, 50);
  const rightArc = describeArc(cx, cy, r, 70, 170);
  const leftArc = describeArc(cx, cy, r, 190, 290);

  // Stealth styling constants
  const arcHighlight = 'rgba(255, 255, 255, 0.08)';
  const arcShadow = 'rgba(0, 0, 0, 0.8)';
  const arcMain = '#121212';
  const strokeWidth = 1.5;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: '100%', height: '100%', transform: [{ rotate: spin }] }}>
        <Svg viewBox="0 0 100 100" width="100%" height="100%">
          {/* Embossed Effect: Highlight (shifted slightly up/left) */}
          <G x="-0.5" y="-0.5">
            <Path d={topArc} fill="none" stroke={arcHighlight} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Path d={rightArc} fill="none" stroke={arcHighlight} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Path d={leftArc} fill="none" stroke={arcHighlight} strokeWidth={strokeWidth} strokeLinecap="round" />
          </G>

          {/* Embossed Effect: Shadow (shifted slightly down/right) */}
          <G x="0.5" y="0.5">
            <Path d={topArc} fill="none" stroke={arcShadow} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Path d={rightArc} fill="none" stroke={arcShadow} strokeWidth={strokeWidth} strokeLinecap="round" />
            <Path d={leftArc} fill="none" stroke={arcShadow} strokeWidth={strokeWidth} strokeLinecap="round" />
          </G>

          {/* Main Arcs */}
          <Path d={topArc} fill="none" stroke={arcMain} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d={rightArc} fill="none" stroke={arcMain} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d={leftArc} fill="none" stroke={arcMain} strokeWidth={strokeWidth} strokeLinecap="round" />

          {/* 3 Detached Dots inside the gaps */}
          {/* Gap 1: 50 to 70 (mid 60) -> Power Red */}
          <Circle cx={polarToCartesian(cx, cy, r, 60).x} cy={polarToCartesian(cx, cy, r, 60).y} r={1.2} fill="rgba(255, 82, 82, 0.5)" />
          {/* Gap 2: 170 to 190 (mid 180) -> Endurance Orange */}
          <Circle cx={polarToCartesian(cx, cy, r, 180).x} cy={polarToCartesian(cx, cy, r, 180).y} r={1.2} fill="rgba(255, 112, 67, 0.5)" />
          {/* Gap 3: 290 to 310 (mid 300) -> Static Purple */}
          <Circle cx={polarToCartesian(cx, cy, r, 300).x} cy={polarToCartesian(cx, cy, r, 300).y} r={1.2} fill="rgba(126, 87, 194, 0.5)" />
        </Svg>
      </Animated.View>

      {/* Static Centered Text */}
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
        <Svg viewBox="0 0 100 100" width={size} height={size}>
          <SvgText
            x="50"
            y="54"
            fill={theme?.text?.primary || 'rgba(255, 255, 255, 0.85)'}
            fontSize="14"
            fontFamily="Orbitron_900Black"
            textAnchor="middle"
            letterSpacing="3"
          >
            LEAP
          </SvgText>
        </Svg>
      </View>
    </View>
  );
};
