import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

// Handoff: each digit is a 15×32 window over a 0–9 column that slides to
// the digit; higher places settle later, like a mechanical counter
// (0.45s + 0.08s per place — tightened from the handoff's 0.7s + 0.12s).
// Commas are static.

const DIGIT_W = 15;
const DIGIT_H = 32;
const EASE = Easing.bezier(0.2, 0.9, 0.25, 1.05);

function Digit({ digit, place, color }: { digit: number; place: number; color: string }) {
  const y = useRef(new Animated.Value(-digit * DIGIT_H)).current;
  useEffect(() => {
    Animated.timing(y, {
      toValue: -digit * DIGIT_H,
      duration: 450 + place * 80,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  }, [digit, place, y]);
  return (
    <View style={styles.window}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {Array.from({ length: 10 }, (_, k) => (
          <Text key={k} style={[styles.digit, { color }]}>
            {k}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

export function PointsOdometer({ value, color = '#FFFFFF' }: { value: number; color?: string }) {
  // By hand: Hermes' Intl number formatting isn't reliable on every platform.
  const str = String(Math.max(0, Math.round(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const chars = str.split('');
  return (
    // Numbers read left → right in Arabic too.
    <View style={styles.row}>
      {chars.map((ch, i) => {
        const place = chars.length - i; // stable key per place from the right
        return ch === ',' ? (
          <Text key={`c${place}`} style={[styles.comma, { color }]}>
            ,
          </Text>
        ) : (
          <Digit key={`d${place}`} digit={Number(ch)} place={place} color={color} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', direction: 'ltr' },
  window: { width: DIGIT_W, height: DIGIT_H, overflow: 'hidden' },
  digit: {
    height: DIGIT_H,
    lineHeight: 34,
    width: DIGIT_W,
    textAlign: 'center',
    fontFamily: 'BebasNeue-Regular',
    fontSize: 30,
  },
  comma: { width: 6, height: DIGIT_H, lineHeight: 34, fontFamily: 'BebasNeue-Regular', fontSize: 30 },
});
