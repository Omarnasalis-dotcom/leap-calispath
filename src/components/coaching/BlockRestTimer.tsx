import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { useAnchoredCountdown } from '../../hooks/useAnchoredTimer';
import { useBackgroundTimerAlerts } from '../../hooks/useBackgroundTimerAlerts';
import { useExclusiveRest } from '../../hooks/useExclusiveRest';
import { isRTL, t } from '../../i18n';
import { SoundServiceInstance } from '../../lib/SoundService';

/** How long the offer waits for the athlete. Any change restarts it. */
export const BLOCK_REST_OFFER_MS = 5000;
export const BLOCK_REST_DEFAULT_SEC = 90;
export const BLOCK_REST_STEP_SEC = 15;
export const BLOCK_REST_MIN_SEC = 15;
export const BLOCK_REST_MAX_SEC = 600;
const STORAGE_KEY = 'workout_block_rest_seconds';
const CORAL = '#FF5252';
/** The pill's distance below the top safe area. */
const PILL_TOP = 76;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Rest between blocks (owner, 2026-11-06), part 1: a card in the block list,
 * under the block just logged, so the rest of the screen stays usable.
 * −15 / +15, then Start. Closes after 5 seconds, on ✕, or on a tap elsewhere
 * (the screen handles that one; `onTouchInside` tells it apart). No timer
 * runs unless Start is tapped. Start keeps the length for next time.
 */
export function BlockRestOffer({ onStart, onClose, onTouchInside, onShown }: {
  onStart: (seconds: number) => void;
  onClose: () => void;
  onTouchInside: () => void;
  /** Where it landed on screen, so the list can scroll it into view. */
  onShown?: (y: number, height: number) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const card = useRef<View>(null);

  const [seconds, setSeconds] = useState(BLOCK_REST_DEFAULT_SEC);
  // Bumped by every change, so the 5 seconds restart.
  const [touches, setTouches] = useState(0);
  // Start was tapped: it's on its way to the side countdown.
  const leaving = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const appear = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(1)).current;
  const moveX = useRef(new Animated.Value(0)).current;
  const moveY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const saved = Number(await AsyncStorage.getItem(STORAGE_KEY));
        if (!cancelled && saved >= BLOCK_REST_MIN_SEC && saved <= BLOCK_REST_MAX_SEC) setSeconds(saved);
      } catch {
        // The default is fine.
      }
    })();
    Animated.timing(appear, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (leaving.current) return;
    bar.setValue(1);
    Animated.timing(bar, { toValue: 0, duration: BLOCK_REST_OFFER_MS, easing: Easing.linear, useNativeDriver: true }).start();
    closeTimer.current = setTimeout(() => {
      Animated.timing(appear, { toValue: 0, duration: 180, useNativeDriver: true }).start(onClose);
    }, BLOCK_REST_OFFER_MS);
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      bar.stopAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touches]);

  const adjust = (delta: number) => {
    setSeconds(s => Math.min(BLOCK_REST_MAX_SEC, Math.max(BLOCK_REST_MIN_SEC, s + delta)));
    setTouches(n => n + 1);
  };

  const start = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    bar.stopAnimation();
    AsyncStorage.setItem(STORAGE_KEY, String(seconds)).catch(() => {});
    SoundServiceInstance.playBoxingBell();
    onStart(seconds);

    let moved = false;
    const go = (x: number, y: number) => {
      if (moved) return;
      moved = true;
      const timing = (value: Animated.Value, toValue: number) =>
        Animated.timing(value, { toValue, duration: 260, easing: Easing.in(Easing.ease), useNativeDriver: true });
      Animated.parallel([timing(appear, 0), timing(moveX, x), timing(moveY, y), timing(scale, 0.3)]).start();
      // On a timer, not the animation's end: it must close whatever happens.
      setTimeout(onClose, 280);
    };
    // If the measure never answers, it still leaves.
    setTimeout(() => go(0, 0), 100);
    card.current?.measureInWindow?.((x, y, width, height) => {
      const screen = Dimensions.get('window').width;
      const pillX = isRTL ? 56 : screen - 56;
      go(pillX - (x + width / 2), insets.top + PILL_TOP - y - height / 2);
    });
  };

  return (
    <Animated.View
      ref={card as never}
      accessibilityLiveRegion="polite"
      onTouchEnd={onTouchInside}
      onLayout={() => card.current?.measureInWindow?.((_x, y, _w, height) => onShown?.(y, height))}
      style={[
        styles.offer,
        { backgroundColor: theme.card.background, borderColor: theme.card.border },
        { opacity: appear, transform: [{ translateX: moveX }, { translateY: moveY }, { scale }] },
      ]}
    >
      <View style={styles.offerTop}>
        <Text style={[styles.offerTitle, { color: theme.text.secondary }]} numberOfLines={1}>
          {t('workout.blockRestTitle')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('workout.blockRestClose')}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onClose}
        >
          <MaterialCommunityIcons name="close" size={18} color={theme.text.secondary} />
        </TouchableOpacity>
      </View>
      <View style={styles.offerRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('workout.blockRestLess')}
          disabled={seconds <= BLOCK_REST_MIN_SEC}
          onPress={() => adjust(-BLOCK_REST_STEP_SEC)}
          style={[styles.step, { borderColor: theme.card.border, opacity: seconds <= BLOCK_REST_MIN_SEC ? 0.4 : 1 }]}
        >
          <Text style={[styles.stepText, { color: theme.text.primary }]}>−15</Text>
        </TouchableOpacity>
        <Text style={[styles.offerTime, { color: theme.text.primary }]}>{clock(seconds)}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('workout.blockRestMore')}
          disabled={seconds >= BLOCK_REST_MAX_SEC}
          onPress={() => adjust(BLOCK_REST_STEP_SEC)}
          style={[styles.step, { borderColor: theme.card.border, opacity: seconds >= BLOCK_REST_MAX_SEC ? 0.4 : 1 }]}
        >
          <Text style={[styles.stepText, { color: theme.text.primary }]}>+15</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={start} style={styles.startBtn}>
          <Text style={styles.startText} numberOfLines={1} adjustsFontSizeToFit>{t('workout.blockRestStart')}</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.track, { backgroundColor: theme.card.border }]}>
        <Animated.View style={[styles.bar, { transformOrigin: isRTL ? 'right' : 'left', transform: [{ scaleX: bar }] }]} />
      </View>
    </Animated.View>
  );
}

/**
 * Part 2: the small countdown at the side. Rings when it ends, notifies if
 * the app is in the background, and is the one rest at a time
 * (useExclusiveRest). Give it a new key for each Start, so it starts clean.
 * Render it last inside the screen root.
 */
export function BlockRestPill({ seconds, onStop, onEnded }: { seconds: number; onStop: () => void; onEnded: () => void }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [left, setLeft] = useState(seconds);
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 260, delay: 120, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useExclusiveRest(true, onStop);
  useAnchoredCountdown(true, left, setLeft, () => {
    SoundServiceInstance.playDigitalBuzzer(4);
    onEnded();
  });
  useBackgroundTimerAlerts(() =>
    left > 0
      ? [{ inSeconds: left, title: t('timerAlerts.restOver'), body: t('timerAlerts.restOverBody') }]
      : []
  );

  return (
    <Animated.View
      style={[
        styles.pill,
        { top: insets.top + PILL_TOP, backgroundColor: theme.card.background, borderColor: theme.card.border },
        { opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
      ]}
    >
      <MaterialCommunityIcons name="timer-outline" size={16} color={CORAL} />
      <Text style={[styles.pillTime, { color: theme.text.primary }]}>{clock(left)}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('workout.blockRestStop')}
        hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
        onPress={onStop}
      >
        <MaterialCommunityIcons name="close" size={16} color={theme.text.secondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  offer: { borderRadius: 16, borderWidth: 1, paddingTop: 12, paddingHorizontal: 14, overflow: 'hidden' },
  offerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  offerTitle: { flex: 1, fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1.2 },
  offerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  offerTime: { minWidth: 64, textAlign: 'center', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 30, fontVariant: ['tabular-nums'] },
  step: { width: 50, height: 42, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16 },
  startBtn: { flex: 1, height: 42, paddingHorizontal: 8, borderRadius: 10, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 15, letterSpacing: 1 },
  track: { height: 3, marginTop: 12, marginHorizontal: -14 },
  bar: { height: 3, backgroundColor: CORAL },
  pill: {
    position: 'absolute',
    end: 16,
    zIndex: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pillTime: { fontFamily: 'BarlowCondensed-ExtraBold', fontSize: 18, fontVariant: ['tabular-nums'] },
});
