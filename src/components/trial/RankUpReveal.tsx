import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { TIER_NAMES } from '../../types';
import { formatTime } from '../../lib/trials';
import { useTheme } from '../../contexts/ThemeContext';

const ACCENT = '#FF5252'; // matches worldThemes.strength.accent / DESIGN.md ember-red — same in both modes

const TOTAL_MS = 5000;
// Cue start times (ms), matching the design handoff's scene timeline
// (Impact .4s / Rings .8s / Forge 1.4s / Reveal 1.0s / Stats .6s / Hold .8s).
const CUE = {
  rings: 400,
  forge: 1200,
  reveal: 2600,
  stats: 3600,
  hold: 4200,
};

const STAGE = 240;
const BEZEL_RADIUS = 110;
const BADGE_SIZE = 224;
const TIER_RING_BASE_RADIUS = 22;
const TIER_RING_GAP = 11;

interface RankUpRevealProps {
  /** Tier just reached (i.e. the completed trial's tier + 1). */
  tier: number;
  /** Name of the trial that triggered the advance, e.g. "Lochagos Trial". */
  trialName: string;
  timeSeconds: number;
  onContinue?: () => void;
}

export function RankUpReveal({ tier, trialName, timeSeconds, onContinue }: RankUpRevealProps) {
  const { mode } = useTheme();
  const isDark = mode === 'dark';
  // Accent is brand-fixed (works on both grounds per worldThemes.ts); only
  // the ground itself and ink/muted/dim tones flip between modes.
  const palette = {
    bg: isDark ? '#000000' : '#FFF8F7',
    ink: isDark ? '#FFFFFF' : '#170707',
    muted: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(23,7,7,0.45)',
    accentDim: isDark ? 'rgba(255,82,82,0.22)' : 'rgba(255,82,82,0.28)',
    bezel: isDark ? 'rgba(255,255,255,0.09)' : 'rgba(23,7,7,0.10)',
    flash: isDark ? '#FFFFFF' : ACCENT,
  };

  const tierName = TIER_NAMES[tier] ?? `Tier ${tier}`;
  const maxTier = TIER_NAMES.length - 1;
  const milestoneCaption =
    tier === 6 ? 'POWER WORLD UNLOCKED' : tier === maxTier ? 'ETERNITY REACHED' : 'RANK SECURED';

  // Single master clock (0→1 over TOTAL_MS) — every beat below derives its
  // opacity/scale/position from this one value so skip-to-end is just
  // stopping this one Animated.Value and snapping it to 1.
  const T = useRef(new Animated.Value(0)).current;
  const [ctaReady, setCtaReady] = useState(false);

  useEffect(() => {
    const anim = Animated.timing(T, {
      toValue: 1,
      duration: TOTAL_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    const ctaTimer = setTimeout(() => setCtaReady(true), CUE.hold);
    return () => {
      anim.stop();
      clearTimeout(ctaTimer);
    };
  }, [T]);

  function handleSkip() {
    if (ctaReady) return;
    T.stopAnimation();
    T.setValue(1);
    setCtaReady(true);
  }

  // 0→1 progress clamped to a [startMs, endMs] window of the master clock.
  const beat = (startMs: number, endMs: number) =>
    T.interpolate({
      inputRange: [0, Math.max(startMs, 0) / TOTAL_MS, endMs / TOTAL_MS, 1],
      outputRange: [0, 0, 1, 1],
      extrapolate: 'clamp',
    });

  const enter = (startMs: number, endMs: number, dist = 14) => {
    const p = beat(startMs, endMs);
    return {
      opacity: p,
      transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [dist, 0] }) }],
    };
  };

  const pop = (startMs: number, endMs: number) => {
    const dur = endMs - startMs;
    const scale = T.interpolate({
      inputRange: [0, startMs / TOTAL_MS, (startMs + dur * 0.7) / TOTAL_MS, endMs / TOTAL_MS, 1],
      outputRange: [0, 0, 1.12, 1, 1],
      extrapolate: 'clamp',
    });
    return { opacity: beat(startMs, startMs + dur * 0.6), transform: [{ scale }] };
  };

  // Impact flash + center glow. The glow's intensity is baked into its own
  // radial-gradient stops (see the Svg below) — this only fades the whole
  // gradient in, so there's no separate opacity value to clash with it.
  const flashOpacity = T.interpolate({ inputRange: [0, 0.11, 1], outputRange: [0.35, 0, 0], extrapolate: 'clamp' });
  const glowOpacity = beat(0, CUE.forge);

  // Two expanding rings + a handful of radiating sparks behind the badge
  const ring = (startMs: number, dur: number, maxScale: number) => {
    const p = beat(startMs, startMs + dur);
    return {
      opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
      transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.3, maxScale] }) }],
    };
  };
  const ring1 = ring(CUE.rings, 900, 2.6);
  const ring2 = ring(CUE.rings + 150, 800, 2.0);

  const sparkAngles = [10, 70, 130, 190, 250, 310];
  const sparks = sparkAngles.map((angle, i) => {
    const start = CUE.rings + i * 50;
    const p = beat(start, start + 700);
    const rad = (angle * Math.PI) / 180;
    const dist = 90 + (i % 3) * 12;
    return {
      opacity: p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.85, 0] }),
      transform: [
        { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(rad) * dist] }) },
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(rad) * dist] }) },
      ],
    };
  });

  // Badge: one concentric ring per tier reached, thrown into place in
  // sequence, then the tier number pops into the center.
  const ringCount = Math.max(tier, 1);
  const ringStagger = Math.min(120, 900 / ringCount);
  const ringPopDur = 380;
  const tierRings = Array.from({ length: ringCount }, (_, i) => {
    const start = CUE.forge + i * ringStagger;
    const radius = TIER_RING_BASE_RADIUS + i * TIER_RING_GAP;
    const isOutermost = i === ringCount - 1;
    const strokeWidth = isOutermost ? 2.5 : 1.5;
    const svgSize = radius * 2 + strokeWidth * 2;
    return {
      style: pop(start, start + ringPopDur),
      radius,
      strokeWidth,
      svgSize,
      color: isOutermost ? ACCENT : palette.accentDim,
    };
  });
  const lastRingStart = CUE.forge + (ringCount - 1) * ringStagger;
  const numberStyle = pop(lastRingStart + ringPopDur * 0.6, lastRingStart + ringPopDur * 0.6 + 300);

  // Rank name: rises in with a brief color pulse standing in for the design's shimmer sweep
  const rankEnter = enter(CUE.reveal, CUE.reveal + 450, 16);
  const rankColor = T.interpolate({
    inputRange: [0, CUE.reveal / TOTAL_MS, (CUE.reveal + 350) / TOTAL_MS, (CUE.reveal + 700) / TOTAL_MS, 1],
    outputRange: [palette.ink, palette.ink, ACCENT, palette.ink, palette.ink],
    extrapolate: 'clamp',
  });

  const subEnter = enter(CUE.reveal + 150, CUE.reveal + 550);
  const trialEnter = enter(CUE.stats - 200, CUE.stats + 200);
  const timeEnter = enter(CUE.stats, CUE.stats + 400);

  // Decorative fill — purely celebratory, no real per-tier progress metric exists.
  const barStart = CUE.stats + 200;
  const barDur = 600;
  const barP = beat(barStart, barStart + barDur);
  const burstP = beat(barStart + barDur, barStart + barDur + 400);
  const barLabel = enter(barStart + barDur, barStart + barDur + 300, 6);

  const confettiOffsets = [10, 40, 80, 130, 180, 220];
  const confetti = confettiOffsets.map((x, i) => {
    const start = barStart + i * 60;
    const p = beat(start, start + 700);
    return {
      x,
      opacity: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.9, 0] }),
      transform: [
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -(60 + (i % 3) * 20)] }) },
        { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${140 + i * 30}deg`] }) },
      ],
    };
  });

  const ctaStyle = pop(CUE.hold, CUE.hold + 400);

  return (
    <TouchableWithoutFeedback onPress={handleSkip}>
      <View style={[styles.container, { backgroundColor: palette.bg }]}>
        <Animated.View style={[styles.flash, { backgroundColor: palette.flash, opacity: flashOpacity }]} pointerEvents="none" />

        <View style={styles.body}>
          <Animated.Text style={[styles.rankUpLabel, enter(150, 450)]}>RANK UP</Animated.Text>

          <View style={styles.stage}>
            <Animated.View style={[styles.glowWrap, { opacity: glowOpacity }]} pointerEvents="none">
              <Svg width={STAGE} height={STAGE}>
                <Circle
                  cx={STAGE / 2}
                  cy={STAGE / 2}
                  r={BEZEL_RADIUS}
                  stroke={palette.bezel}
                  strokeWidth={1}
                  fill="none"
                />
              </Svg>
            </Animated.View>
            <Animated.View style={[styles.ring, ring1]} pointerEvents="none" />
            <Animated.View style={[styles.ring, ring2]} pointerEvents="none" />
            {sparks.map((s, i) => (
              <Animated.View key={i} style={[styles.spark, s]} pointerEvents="none" />
            ))}

            <View style={styles.badge}>
              {tierRings.map((r, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.tierRingWrap,
                    { width: r.svgSize, height: r.svgSize, marginLeft: -r.svgSize / 2, marginTop: -r.svgSize / 2 },
                    r.style,
                  ]}
                >
                  <Svg width={r.svgSize} height={r.svgSize}>
                    <Circle
                      cx={r.svgSize / 2}
                      cy={r.svgSize / 2}
                      r={r.radius}
                      stroke={r.color}
                      strokeWidth={r.strokeWidth}
                      fill="none"
                    />
                  </Svg>
                </Animated.View>
              ))}
              <Animated.Text style={[styles.badgeNumber, numberStyle]}>{tier}</Animated.Text>
            </View>
          </View>

          <Animated.Text style={[styles.rankName, rankEnter, { color: rankColor }]}>
            {tierName.toUpperCase()}
          </Animated.Text>
          <Animated.Text style={[styles.tierSubLabel, subEnter]}>
            TIER {tier} OF {maxTier}
          </Animated.Text>

          <Animated.Text style={[styles.trialLine, trialEnter, { color: palette.ink }]}>
            <Text style={[styles.trialLineMuted, { color: palette.muted }]}>CHALLENGE COMPLETED · </Text>
            {trialName.toUpperCase()}
          </Animated.Text>
          <Animated.Text style={[styles.timeLine, timeEnter, { color: palette.muted }]}>Time: {formatTime(timeSeconds)}</Animated.Text>

          <View style={styles.progressWrap}>
            {confetti.map((c, i) => (
              <Animated.View
                key={i}
                style={[styles.confettiBit, { left: c.x, opacity: c.opacity, transform: c.transform }]}
                pointerEvents="none"
              />
            ))}
            <View style={[styles.progressTrack, { backgroundColor: palette.accentDim }]}>
              <Animated.View
                style={[
                  styles.progressFill,
                  { width: barP.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
                ]}
              />
              <Animated.View
                style={[styles.progressBurst, { opacity: burstP.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ scale: burstP.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }] }]}
                pointerEvents="none"
              />
            </View>
            <Animated.Text style={[styles.progressCaption, barLabel, { color: palette.muted }]}>{milestoneCaption}</Animated.Text>
          </View>
        </View>

        <Animated.View style={[styles.ctaWrap, ctaStyle]} pointerEvents={ctaReady ? 'auto' : 'none'}>
          <TouchableOpacity style={styles.cta} onPress={onContinue} disabled={!ctaReady}>
            <Text style={styles.ctaText}>CONTINUE</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  rankUpLabel: {
    color: ACCENT,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 5,
    marginBottom: 12,
  },
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowWrap: {
    position: 'absolute',
    width: STAGE,
    height: STAGE,
  },
  ring: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  spark: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierRingWrap: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  badgeNumber: {
    position: 'absolute',
    color: ACCENT,
    fontSize: 56,
    fontFamily: 'BarlowCondensed-ExtraBold',
  },
  rankName: {
    fontSize: 36,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 2,
    marginTop: 20,
    textAlign: 'center',
  },
  tierSubLabel: {
    color: ACCENT,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 2,
    marginTop: 8,
  },
  trialLine: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-Bold',
    letterSpacing: 0.5,
    marginTop: 22,
    textAlign: 'center',
  },
  trialLineMuted: {
    fontFamily: 'PlusJakartaSans-Bold',
  },
  timeLine: {
    fontSize: 15,
    fontFamily: 'Barlow-Regular',
    marginTop: 6,
  },
  progressWrap: {
    width: '100%',
    maxWidth: 280,
    marginTop: 22,
  },
  confettiBit: {
    position: 'absolute',
    bottom: 12,
    width: 5,
    height: 9,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'visible',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  progressBurst: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: ACCENT,
  },
  progressCaption: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 10,
  },
  ctaWrap: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 44,
  },
  cta: {
    height: 56,
    borderRadius: 16,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'BarlowCondensed-ExtraBold',
    letterSpacing: 3,
  },
});
