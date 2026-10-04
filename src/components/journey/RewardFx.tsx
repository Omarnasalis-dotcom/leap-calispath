import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { isRTL } from '../../i18n';

// Handoff reward animation (~1.25s, every earn) and bonus toast.
// Burst: two rings expanding, 14 sparks radiating out, the "+N" rising
// then arcing into the points counter, and a small label rising under it.
// All values are native-driven; each burst owns its own Animated values.

export const BURST_LAND_MS = 760;
const ACCENT = '#FF5A55';
const ORANGE = '#FFB347';

export interface Burst {
  id: number;
  /** Origin, relative to the FX layer. */
  x: number;
  y: number;
  /** Offset from origin to the counter. */
  dx: number;
  dy: number;
  amount: number;
  label: string;
}

function Ring({ delay, color }: { delay: number; color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={[
        styles.ring,
        {
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.2] }) }],
        },
      ]}
    />
  );
}

function Spark({ index }: { index: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const angle = ((index * 360) / 14 + (index % 2) * 8) * (Math.PI / 180);
  const dist = 38 + (index % 3) * 10;
  const size = index % 3 ? 6 : 4;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 420 + (index % 3) * 70,
      easing: Easing.bezier(0.2, 0.7, 0.3, 1),
      useNativeDriver: true,
    }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[
        styles.spark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          left: -size / 2,
          top: -size / 2,
          backgroundColor: index % 2 ? ORANGE : ACCENT,
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] }) },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ],
        },
      ]}
    />
  );
}

export function RewardBurst({ burst, isLight, onDone }: { burst: Burst; isLight: boolean; onDone: (id: number) => void }) {
  // One clock, 0 → 1 over 0.8s (the handoff's 1.25s felt slow on device);
  // the number's phases read off it: rise (0–22%), hold (22–38%), arc to
  // the counter (38–100%).
  const clock = useRef(new Animated.Value(0)).current;
  // The arc: x eases out, y eases in, so the path bows instead of a line.
  const flyX = useRef(new Animated.Value(0)).current;
  const flyY = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(clock, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(300),
      Animated.parallel([
        Animated.timing(flyX, { toValue: 1, duration: 480, easing: Easing.bezier(0.5, 0, 0.25, 1), useNativeDriver: true }),
        Animated.timing(flyY, { toValue: 1, duration: 480, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ]).start();
    Animated.timing(label, { toValue: 1, duration: 750, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    const t = setTimeout(() => onDone(burst.id), 950);
    return () => clearTimeout(t);
  }, [clock, flyX, flyY, label, burst.id, onDone]);

  const rise = clock.interpolate({ inputRange: [0, 0.22, 1], outputRange: [0, -52, -52], extrapolate: 'clamp' });
  return (
    // burst.x is a physical (window) x. RN swaps left/right in RTL, so in
    // Arabic the physical-left offset goes through `right`. Everything
    // inside is symmetric, and transforms (dx) are physical already.
    <View pointerEvents="none" style={[styles.origin, isRTL ? { right: burst.x } : { left: burst.x }, { top: burst.y }]}>
      <Ring delay={0} color={ACCENT} />
      <Ring delay={120} color={ORANGE} />
      {Array.from({ length: 14 }, (_, i) => (
        <Spark key={i} index={i} />
      ))}
      {burst.amount > 0 && (
      <Animated.View
        style={[
          styles.numberWrap,
          {
            opacity: clock.interpolate({ inputRange: [0, 0.05, 0.85, 1], outputRange: [0, 1, 0.9, 0] }),
            transform: [
              { translateX: flyX.interpolate({ inputRange: [0, 1], outputRange: [0, burst.dx] }) },
              // Rise, then from the risen point down/up to the counter.
              { translateY: Animated.add(rise, flyY.interpolate({ inputRange: [0, 1], outputRange: [0, burst.dy + 52] })) },
              {
                scale: clock.interpolate({
                  inputRange: [0, 0.22, 0.38, 1],
                  outputRange: [0.6, 1.25, 1.25, 0.3],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
      >
        <Text style={[styles.number, isLight && styles.numberLight]}>+{burst.amount}</Text>
      </Animated.View>
      )}
      {!!burst.label && (
        <Animated.Text
          style={[
            styles.label,
            isLight && styles.labelLight,
            {
              opacity: label.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [{ translateY: label.interpolate({ inputRange: [0, 1], outputRange: [14, -16] }) }],
            },
          ]}
          numberOfLines={1}
        >
          {burst.label}
        </Animated.Text>
      )}
    </View>
  );
}

export interface Toast {
  id: number;
  title: string;
  sub: string;
  points: number;
}

/** One toast at a time; auto-dismisses after 3.4s or on tap. */
export function RewardToast({ toast, top, isLight, onDismiss }: { toast: Toast; top: number; isLight: boolean; onDismiss: () => void }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    v.setValue(0);
    Animated.spring(v, { toValue: 1, friction: 6, tension: 110, useNativeDriver: true }).start();
    const t = setTimeout(onDismiss, 3400);
    return () => clearTimeout(t);
  }, [toast.id, v, onDismiss]);
  return (
    <Animated.View
      style={[
        styles.toastWrap,
        { top, opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }] },
      ]}
    >
      <TouchableOpacity activeOpacity={0.9} onPress={onDismiss} style={[styles.toast, isLight && styles.toastLight]} accessibilityRole="alert">
        <View style={styles.toastStar}>
          <MaterialCommunityIcons name="star" size={24} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.toastTitle, isLight && styles.toastTitleLight]} numberOfLines={1}>
            {toast.title}
          </Text>
          <Text style={[styles.toastSub, isLight && styles.toastSubLight]} numberOfLines={2}>
            {toast.sub}
          </Text>
        </View>
        <Text style={styles.toastPts}>+{toast.points}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  origin: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 2, left: -32, top: -32 },
  // No per-spark shadow: 14 moving shadows cost frames on long screens.
  spark: { position: 'absolute' },
  numberWrap: { position: 'absolute', width: 160, left: -80, top: -24, alignItems: 'center' },
  number: {
    fontFamily: 'BebasNeue-Regular',
    fontSize: 44,
    lineHeight: 48,
    color: '#FFFFFF',
    textShadowColor: 'rgba(255,90,85,0.95)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  // Light mode: white-on-white would vanish -- accent number, deeper label.
  numberLight: { color: ACCENT, textShadowColor: 'rgba(255,90,85,0.35)', textShadowRadius: 10 },
  labelLight: { color: '#D9443E' },
  label: {
    position: 'absolute',
    width: 220,
    left: -110,
    top: 14,
    textAlign: 'center',
    fontFamily: 'PlusJakartaSans-ExtraBold',
    fontSize: 10,
    letterSpacing: 2,
    color: '#FFB3A8',
  },
  toastWrap: { position: 'absolute', left: 16, right: 16, zIndex: 60 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,90,85,0.45)',
    backgroundColor: '#1A0F0F',
  },
  toastLight: {
    backgroundColor: '#FFF4F3',
    borderColor: 'rgba(255,90,85,0.45)',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  toastTitleLight: { color: '#151515' },
  toastSubLight: { color: '#7A5F5D' },
  toastStar: { width: 46, height: 46, borderRadius: 23, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' },
  toastTitle: { fontFamily: 'BebasNeue-Regular', fontSize: 26, color: '#FFFFFF', textAlign: 'left' },
  toastSub: { fontFamily: 'PlusJakartaSans-Regular', fontSize: 13, color: '#C9A9A7', textAlign: 'left' },
  toastPts: { fontFamily: 'BebasNeue-Regular', fontSize: 30, color: ACCENT },
});
