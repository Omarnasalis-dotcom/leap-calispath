import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { Rect } from '../../types/tutorial';
import { physicalLeft } from '../../i18n';

const ACCENT = '#FF5252';
const RING_PAD = 6;

interface HighlightRingProps {
  rect: Rect;
}

export function HighlightRing({ rect }: HighlightRingProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1080, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 720, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  const { width: screenWidth } = useWindowDimensions();
  const box = {
    left: physicalLeft(rect.x - RING_PAD, rect.width + RING_PAD * 2, screenWidth),
    top: rect.y - RING_PAD,
    width: rect.width + RING_PAD * 2,
    height: rect.height + RING_PAD * 2,
    borderRadius: 16,
  };

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          box,
          { opacity: glowOpacity, transform: [{ scale: glowScale }] },
        ]}
      />
      <Animated.View pointerEvents="none" style={[styles.ring, box]} />
    </>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: ACCENT,
    zIndex: 3,
  },
  glow: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: ACCENT,
    zIndex: 2,
  },
});
