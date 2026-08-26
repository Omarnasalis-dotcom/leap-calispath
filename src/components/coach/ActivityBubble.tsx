// Design handoff §3 "Live activity indicator" — replaces the old "nothing
// shown while loading" gap (there was no typing indicator at all before
// this). Renders real stages as they stream in over SSE (index.ts's
// `event: stage`), never a fake timer. Total stage count isn't known
// upfront (the backend has no declared plan, just tool calls as they
// happen) — per the handoff's own fallback rule ("If the backend can't
// declare the list up front... hide the counter until the total is
// known"), the counter is omitted and ticks grow with each stage rather
// than showing a fixed N.
//
// Motion follows this app's only existing pattern (plain RN `Animated`,
// no reanimated/moti — see LeapLogo.tsx, HighlightRing.tsx, Skeleton.tsx).
// The label "shimmer" is a color-interpolation substitute, not a masked
// gradient sweep — this app has no masking capability
// (@react-native-masked-view isn't installed) and a prior design hit the
// same wall (RankUpReveal.tsx:163), substituting the same technique.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo } from 'react-native';
import { CoachPalette } from './coachTokens';

export interface Stage {
  verb: string;
  label: string;
}

export function ActivityBubble({ stages, accent, colors }: { stages: Stage[]; accent: string; colors: CoachPalette }) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; sub.remove(); };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const spinLoop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 850, easing: Easing.linear, useNativeDriver: true }));
    const scanLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(scan, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 950, easing: Easing.linear, useNativeDriver: false }),
        Animated.timing(shimmer, { toValue: 0, duration: 950, easing: Easing.linear, useNativeDriver: false }),
      ])
    );
    spinLoop.start();
    scanLoop.start();
    shimmerLoop.start();
    return () => { spinLoop.stop(); scanLoop.stop(); shimmerLoop.stop(); };
  }, [reduceMotion]);

  const current = stages[stages.length - 1];
  if (!current) return null;

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scanX = scan.interpolate({ inputRange: [0, 1], outputRange: [-80, 80] });
  const labelColor = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [colors.shimmerDark, colors.shimmerLight, colors.shimmerDark] });

  return (
    <View
      style={[styles.bubble, { backgroundColor: colors.bubbleBg, borderColor: colors.bubbleBorder }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={current.label}
    >
      {!reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[styles.scanline, { transform: [{ translateX: scanX }], backgroundColor: accent, opacity: 0.6 }]}
        />
      )}
      <View style={styles.row}>
        <View style={[styles.spinnerBase, { borderColor: colors.bubbleBorder }]}>
          {!reduceMotion && (
            <Animated.View style={[styles.spinnerActive, { borderColor: accent, transform: [{ rotate }] }]} />
          )}
        </View>
        <Text style={[styles.verb, { color: accent }]}>{current.verb}</Text>
      </View>

      {reduceMotion ? (
        <Text style={[styles.label, { color: colors.secondaryText }]}>{current.label}</Text>
      ) : (
        <Animated.Text style={[styles.label, { color: labelColor }]}>{current.label}</Animated.Text>
      )}

      <View
        style={styles.ticks}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: stages.length, now: stages.length }}
      >
        {stages.map((_, i) => {
          const isCurrent = i === stages.length - 1;
          return (
            <View
              key={i}
              style={[
                styles.tick,
                { width: isCurrent ? 22 : 10, backgroundColor: accent },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 13,
    minWidth: 232,
    maxWidth: '84%',
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  scanline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinnerBase: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerActive: {
    position: 'absolute',
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  verb: {
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  label: {
    fontSize: 13.5,
    fontWeight: '300',
    lineHeight: 18,
    marginTop: 9,
  },
  ticks: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 12,
  },
  tick: {
    height: 3,
    borderRadius: 2,
  },
});
