import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { t, isRTL, FLIP_X } from '../../i18n';

// Onboarding welcome — assets/design_handoff_onboarding_welcome, direction
// "D — Slide". A ~6s greeting over the looping background video, shown
// once before a new user's first Journey screen, ending on a START YOUR
// JOURNEY button so the user chooses to begin rather than being moved on. One timeline value `clock`
// (seconds) drives every element, the same way the prototype's timeline
// does. Timings are slower than the handoff's 4.2s table (owner, on
// device: too quick to read); the motion and easing are unchanged.
// Oswald (handoff font) isn't bundled; BarlowCondensed stands in, as in the
// other handoffs.

const CORAL = '#FC5454';
const VIDEO = require('../../../assets/onboarding/welcome-bg.mp4');
const POSTER = require('../../../assets/onboarding/welcome-poster.jpg');

const END = 1e9; // "never" — the last line holds
const LINES = [
  { start: 0, end: 2.2 },
  { start: 2.2, end: 4.6 },
  { start: 4.6, end: END },
];
// The last line holds; the CTA fades in once it has landed.
const CTA_AT = 5.4;
const TOTAL = 6.0;
const IN = 0.8; // slide-in
const OUT = 0.4; // slide-out
const DOT = 0.5; // dot widen / shrink
// Slide distance; flipped in Arabic so lines enter from the reading side.
const SLIDE = 240 * (isRTL ? -1 : 1);

function clamp01(x: number) {
  'worklet';
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function outExpo(x: number) {
  'worklet';
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
}
function inCubic(x: number) {
  'worklet';
  return x * x * x;
}
function outCubic(x: number) {
  'worklet';
  return 1 - Math.pow(1 - x, 3);
}
// Eased 0→1 progress of T across [s, e].
function tw(T: number, s: number, e: number, ease: (x: number) => number) {
  'worklet';
  return ease(clamp01((T - s) / (e - s)));
}

type Part = [text: string, highlight: boolean];

function HeadlineText({ parts }: { parts: Part[] }) {
  return (
    <Text style={styles.headline}>
      {parts.map(([text, hl], k) => (
        <Text key={k} style={hl ? styles.highlight : undefined}>{text}</Text>
      ))}
    </Text>
  );
}

function Line({ clock, index, parts }: { clock: SharedValue<number>; index: number; parts: Part[] }) {
  const { start, end } = LINES[index];
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    const pi = tw(T, start + 0.02, start + IN, outExpo);
    const po = end === END ? 0 : tw(T, end - OUT, end, inCubic);
    const visible = T >= start && T < end;
    return {
      opacity: visible ? Math.min(1, pi * 1.4) * (1 - po) : 0,
      transform: [{ translateX: (1 - pi) * SLIDE - po * SLIDE }],
    };
  });
  const underline = useAnimatedStyle(() => ({ width: 56 * tw(clock.value, start + 0.3, start + 1.1, outExpo) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]}>
      <HeadlineText parts={parts} />
      <Animated.View style={[styles.underline, underline]} />
    </Animated.View>
  );
}

function Dot({ clock, index }: { clock: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const T = clock.value;
    let cur = 0;
    for (let j = 0; j < LINES.length; j++) if (T >= LINES[j].start) cur = j;
    const on = tw(T, LINES[index].start, LINES[index].start + DOT, outCubic);
    const next = LINES[index + 1];
    const off = index < cur && next ? tw(T, next.start, next.start + DOT, outCubic) : 0;
    const a = on * (1 - off);
    return {
      width: 6 + a * 18,
      backgroundColor: a > 0.01 ? CORAL : index < cur ? 'rgba(252,84,84,0.55)' : 'rgba(255,255,255,0.28)',
    };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

interface WelcomeIntroProps {
  /** The username chosen on Complete Profile; falls back to a generic greeting. */
  name: string | null | undefined;
  /** Called once, on START YOUR JOURNEY — 'skipped' if Skip was used to get there. */
  onDone: (how: 'completed' | 'skipped') => void;
}

export function WelcomeIntro({ name, onDone }: WelcomeIntroProps) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const clock = useSharedValue(0);
  const doneRef = useRef(false);
  const skippedRef = useRef(false);
  // The CTA only takes taps once it's on screen.
  const [ctaReady, setCtaReady] = useState(false);

  const start = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(skippedRef.current ? 'skipped' : 'completed');
  }, [onDone]);

  // Skip jumps to the final frame (line 3 + CTA) instead of leaving, so
  // everyone ends on the same choice.
  const skip = useCallback(() => {
    skippedRef.current = true;
    cancelAnimation(clock);
    clock.value = TOTAL;
    setCtaReady(true);
  }, [clock]);

  const player = useVideoPlayer(reduceMotion ? null : VIDEO, (p) => {
    p.loop = true;
    p.muted = true;
    p.playbackRate = 0.9;
    // Never pause the user's own music for a silent background loop.
    p.audioMixingMode = 'mixWithOthers';
    p.play();
  });

  useEffect(() => {
    if (reduceMotion) {
      // Reduced motion: all three lines and the CTA at once, still poster.
      clock.value = TOTAL;
      setCtaReady(true);
      return;
    }
    clock.value = withTiming(TOTAL, { duration: TOTAL * 1000, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(setCtaReady)(true);
    });
  }, [reduceMotion, clock]);

  const trimmed = name?.trim();
  const lines: Part[][] = [
    [[t('welcome.hi'), false], [trimmed || t('welcome.hiFallback'), true]],
    // Non-breaking space keeps the brand on one line ("WELCOME TO / LEAP
    // ARENA", never "WELCOME TO LEAP / ARENA").
    [[t('welcome.welcomeTo'), false], ['Leap\u00A0Arena', true]],
    [[t('welcome.steps'), true], [t('welcome.toFirstWorkout'), false]],
  ];

  // Slow push-in: 1.11 at the start, ~0.4% per second after (handoff layer 2).
  const videoStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1.11 + clock.value * 0.004 }] }));
  const ctaStyle = useAnimatedStyle(() => {
    const p = tw(clock.value, CTA_AT, TOTAL, outCubic);
    return { opacity: p, transform: [{ translateY: (1 - p) * 16 }] };
  });
  const kickerStyle = useAnimatedStyle(() => {
    const p = tw(clock.value, 0.05, 0.45, outCubic);
    return { opacity: p, transform: [{ translateY: (1 - p) * 8 }] };
  });

  return (
    // SpartanLayout pads its content by the safe-area insets; pull the
    // welcome back out to the real screen edges so the video runs full
    // bleed behind the status bar and home indicator.
    <View style={[styles.screen, { marginTop: -insets.top, marginBottom: -insets.bottom }]}>
      <StatusBar style="light" />
      <Animated.View style={[StyleSheet.absoluteFill, videoStyle]}>
        <Image source={POSTER} style={StyleSheet.absoluteFill} resizeMode="cover" />
        {!reduceMotion && (
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        )}
      </Animated.View>
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(0,0,0,0.56)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.80)']}
        locations={[0, 0.35, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.Text style={[styles.kicker, { top: height * 0.126 }, kickerStyle]}>LEAP ARENA</Animated.Text>

      {reduceMotion ? (
        <View style={[styles.lineBox, { top: height * 0.36 }]}>
          {lines.map((parts, i) => (
            <HeadlineText key={i} parts={parts} />
          ))}
        </View>
      ) : (
        <View style={[styles.lineBox, { top: height * 0.4 }]}>
          {lines.map((parts, i) => (
            <Line key={i} clock={clock} index={i} parts={parts} />
          ))}
        </View>
      )}

      {!reduceMotion && (
        <View style={styles.dots}>
          {LINES.map((_, i) => (
            <Dot key={i} clock={clock} index={i} />
          ))}
        </View>
      )}

      {!ctaReady && (
        <TouchableOpacity
          style={[styles.skip, { top: insets.top + 6 }]}
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel={t('welcome.skip')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skipText}>{t('welcome.skip')}</Text>
        </TouchableOpacity>
      )}

      <Animated.View
        style={[styles.ctaWrap, { bottom: insets.bottom + 28 }, ctaStyle]}
        pointerEvents={ctaReady ? 'auto' : 'none'}
      >
        <TouchableOpacity style={styles.cta} onPress={start} activeOpacity={0.85} accessibilityRole="button" disabled={!ctaReady}>
          <Text style={styles.ctaText}>{t('welcome.startJourney')}</Text>
          <MaterialCommunityIcons name="arrow-right" size={20} color="#000" style={FLIP_X} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 12,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  kicker: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: CORAL,
    fontFamily: 'BarlowCondensed-SemiBold',
    fontSize: 12,
    letterSpacing: 4,
    ...TEXT_SHADOW,
  },
  lineBox: { position: 'absolute', left: 32, right: 32, height: 220 },
  headline: {
    color: '#FFFFFF',
    fontFamily: 'BarlowCondensed-Bold',
    fontSize: 46,
    lineHeight: 48,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'left',
    ...TEXT_SHADOW,
  },
  highlight: { color: CORAL },
  underline: { marginTop: 18, height: 3, borderRadius: 2, backgroundColor: CORAL },
  dots: { position: 'absolute', bottom: 150, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  skip: {
    position: 'absolute',
    end: 20,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaWrap: { position: 'absolute', left: 24, right: 24 },
  cta: {
    height: 58,
    borderRadius: 18,
    backgroundColor: CORAL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  ctaText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 17, letterSpacing: 2.4 },
  skipText: { color: '#FFFFFF', fontFamily: 'BarlowCondensed-SemiBold', fontSize: 13, letterSpacing: 2 },
});
