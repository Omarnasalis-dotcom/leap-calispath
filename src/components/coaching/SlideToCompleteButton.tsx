import React, { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View, Animated, Easing, AccessibilityInfo, LayoutChangeEvent } from 'react-native';

// Day Blocks v2 COMPLETE button (assets/design_handoff_day,blocks §4) —
// shipped choice is tap-triggered slide, not drag. A single tap runs a
// 450ms fill+thumb animation then commits; tapping again while done undoes
// instantly. Classic RN Animated, useNativeDriver:false throughout (width/
// left/backgroundColor aren't native-driver props) — deliberately not
// react-native-reanimated, which crashed here (Hermes abort inside
// worklets::scheduleOnUI). Single JS-driven clock for the whole animation,
// per the rn_animated_mixed_native_js_driver_crash incident's guidance:
// never split one animated value across native and JS drivers.
const BTN_HEIGHT = 30;
// Thumb is a slim full-height accent bar flush with the button's edge (the
// button's own radius + overflow:hidden rounds its outer corners) — no icon;
// the label carries the COMPLETE / COMPLETED state.
const THUMB_WIDTH = 12;
const SLIDE_MS = 450;

interface SlideToCompleteButtonProps {
  done: boolean;
  disabled?: boolean;
  // True while the log-details modal opened by onComplete is up for this
  // block. Keeps the thumb parked (instead of snapping back) while the
  // warrior is filling it in, and — once it goes false again — the sync
  // effect below reconciles the thumb against the real `done`: parked if
  // they submitted, back to idle if they cancelled.
  pending?: boolean;
  accentColor: string;
  label?: string; // e.g. "COMPLETE" — becomes "COMPLETED" once done
  onComplete: () => void;
  onUndo: () => void;
}

function hexAlpha(color: string, alpha: number): string {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const SlideToCompleteButton: React.FC<SlideToCompleteButtonProps> = ({
  done,
  disabled,
  pending,
  accentColor,
  label = 'COMPLETE',
  onComplete,
  onUndo,
}) => {
  const progress = useRef(new Animated.Value(done ? 1 : 0)).current;
  const [width, setWidth] = useState(0);
  const animatingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotionRef.current = !!v; }).catch(() => {});
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    // Keep the visual in sync with the real completedStatus. Skipped while
    // the log modal this button opened is still up (`pending`) — the thumb
    // stays parked at the end of its slide while the warrior fills it in.
    // Once the modal closes (`pending` goes false), this reconciles: parked
    // if they submitted (done true), back to idle if they cancelled (done
    // still false) — that's the "cancel snaps back" behavior.
    if (pending || animatingRef.current) return;
    Animated.timing(progress, { toValue: done ? 1 : 0, duration: SLIDE_MS, easing: Easing.bezier(0.6, 0, 0.2, 1), useNativeDriver: false }).start();
  }, [done, pending, progress]);

  const handlePress = () => {
    if (disabled || animatingRef.current) return;
    if (done) {
      onUndo();
      return;
    }
    if (reduceMotionRef.current) {
      progress.setValue(1);
      onComplete();
      return;
    }
    animatingRef.current = true;
    Animated.timing(progress, { toValue: 1, duration: SLIDE_MS, easing: Easing.bezier(0.6, 0, 0.2, 1), useNativeDriver: false }).start();
    timerRef.current = setTimeout(() => {
      animatingRef.current = false;
      onComplete();
    }, SLIDE_MS + 30);
  };

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const travel = Math.max(width - THUMB_WIDTH, 0);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPress={handlePress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={done ? 'Undo complete' : 'Complete block'}
      accessibilityState={{ disabled: !!disabled, selected: done }}
      style={{
        flex: 1,
        height: BTN_HEIGHT,
        borderRadius: 9,
        overflow: 'hidden',
        position: 'relative',
        backgroundColor: done ? hexAlpha(accentColor, 0.16) : '#1a1a1a',
        borderWidth: 1,
        borderColor: done ? hexAlpha(accentColor, 0.4) : '#2a2a2a',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {/* Tinted trail left behind the block as it slides. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }),
          backgroundColor: hexAlpha(accentColor, 0.22),
        }}
      />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingLeft: done ? 0 : THUMB_WIDTH, paddingRight: done ? THUMB_WIDTH : 0 }}>
        <Text style={{ color: done ? accentColor : '#fff', fontSize: 11.5, fontFamily: 'BarlowCondensed-ExtraBold', letterSpacing: 1.4 }}>
          {done ? `${label}D` : label}
        </Text>
      </View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: THUMB_WIDTH,
          backgroundColor: accentColor,
          left: progress.interpolate({ inputRange: [0, 1], outputRange: [0, travel] }),
        }}
      />
    </TouchableOpacity>
  );
};
