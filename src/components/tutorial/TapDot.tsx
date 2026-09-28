import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { Rect } from '../../types/tutorial';
import { physicalLeft } from '../../i18n';

interface TapDotProps {
  rect: Rect;
}

const DOT_SIZE = 22;

export function TapDot({ rect }: TapDotProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 550, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.55] });

  const { width: screenWidth } = useWindowDimensions();
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.dot,
        {
          left: physicalLeft(rect.x + rect.width / 2 - DOT_SIZE / 2, DOT_SIZE, screenWidth),
          top: rect.y + rect.height / 2 - DOT_SIZE / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: '#FF8A8A',
    zIndex: 4,
  },
});
