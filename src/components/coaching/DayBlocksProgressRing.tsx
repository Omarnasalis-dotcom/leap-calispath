import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// Day Blocks v2 header ring (assets/design_handoff_day,blocks §2) — 52x52,
// r22/stroke4, circumference 2*PI*22 = 138.2. Mirrors WorldRing's proven
// approach (src/components/worlds/WorldRing.tsx): classic RN Animated with
// useNativeDriver:false, since strokeDashoffset is an SVG prop the native
// driver can't touch. Deliberately not react-native-reanimated's
// useAnimatedProps on an SVG Circle — untested combo in this app, and
// WorldRing already proves the classic-Animated route works here.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CIRCUMFERENCE = 138.2;

interface DayBlocksProgressRingProps {
  pct: number;
  color?: string;
  trackColor?: string;
  size?: number;
}

export const DayBlocksProgressRing: React.FC<DayBlocksProgressRingProps> = ({
  pct,
  color = '#FC5454',
  trackColor = '#1f1f1f',
  size = 52,
}) => {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const animated = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(animated, {
      toValue: clamped,
      duration: 600,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [clamped, animated]);

  const strokeDashoffset = animated.interpolate({
    inputRange: [0, 100],
    outputRange: [CIRCUMFERENCE, 0],
  });
  const opacity = animated.interpolate({
    inputRange: [0, 0.001, 100],
    outputRange: [0, 1, 1],
  });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 52 52" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={26} cy={26} r={22} fill="none" stroke={trackColor} strokeWidth={4} />
        <AnimatedCircle
          cx={26}
          cy={26}
          r={22}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          opacity={opacity}
        />
      </Svg>
      <View style={{ position: 'absolute', flexDirection: 'row', alignItems: 'flex-end', paddingLeft: 3 }}>
        <Text style={{ color: '#fff', fontSize: clamped === 100 ? 12.5 : 15, fontWeight: '700', lineHeight: clamped === 100 ? 14 : 16 }}>
          {clamped}
        </Text>
        <Text style={{ color: '#a0a0a0', fontSize: 8, lineHeight: 14 }}>%</Text>
      </View>
    </View>
  );
};
