import React, { useMemo, useRef } from 'react';
import { Modal, PanResponder, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS, SharedValue, useAnimatedProps, useAnimatedReaction, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { kt } from '../worlds/kit';
import { useAfter, ShockRing } from '../fx/FxEffects';
import { useFxClock } from '../../lib/fx/useFxClock';
import { clamp01, countPassed, easeOutBack, easeOutCubic, seg } from '../../lib/fx/easing';
import { tierName } from '../../lib/strengthClimb';
import { WORLD_COLORS } from '../../lib/journeyAchievements';
import {
  firstNameOf, greetingSize, isCompactHeight, litRings, WT_END, WT_GO_AT, WT_LINE0, WT_LINE1, WT_LOCK, WT_NODE_T,
  WT_RADII, WT_SKIP_AT,
} from '../../lib/welcomeTour';
import { isRTL, ltr, t } from '../../i18n';

interface Props {
  visible: boolean;
  tier: number;
  name?: string | null;
  onStart: () => void;
  onSkip: () => void;
}

type Clock = SharedValue<number>;

const ACC = '#FC5454';
const WORLD_DOTS = [WORLD_COLORS.static, WORLD_COLORS.power, WORLD_COLORS.endurance];
const LATIN = /[A-Za-z]/;

const TOKENS = {
  dark: {
    sheet: '#0b0b0b', backdrop: 'rgba(0,0,0,0.78)', border: 'rgba(252,84,84,0.40)', radial: 0.12, glowK: 1,
    t1: '#ffffff', t3: '#a0a0a0', t4: '#8a8a8a', handle: '#2a2a2a',
    skipBorder: '#2a2626', skipFill: 'rgba(255,255,255,0.03)',
    ringDim: '#2a1a1a', ringMid: 'rgba(252,84,84,0.45)', track: '#1f1a1a', nodeDim: '#3a3030', nodeLit: 'rgba(252,84,84,0.12)',
  },
  light: {
    sheet: '#ffffff', backdrop: 'rgba(0,0,0,0.45)', border: 'rgba(252,84,84,0.45)', radial: 0.08, glowK: 0.55,
    t1: '#141010', t3: '#5e5858', t4: '#6e6868', handle: '#e2dcd9',
    skipBorder: '#e6dfdd', skipFill: '#faf8f7',
    ringDim: '#f0e2e0', ringMid: 'rgba(252,84,84,0.40)', track: '#efe7e5', nodeDim: '#d9cfcd', nodeLit: 'rgba(252,84,84,0.08)',
  },
};
type Tokens = typeof TOKENS.dark;

/**
 * Shown once on Profile after onboarding (useScreenTour marks it seen when it
 * opens): greets the athlete, lands their placed Strength tier, then draws a
 * route through the four stops the tour visits. DISCOVER THE APP starts the
 * tour; Skip, the backdrop or a swipe down on the handle dismisses it.
 * Settings > Replay Tutorial replays the tour.
 *
 * One UI-thread clock (useFxClock) drives every style; only transform,
 * opacity and the rings' strokeDashoffset animate. Tapping the card jumps to
 * the final frame; Reduce Motion starts there.
 */
export function WelcomeTourCard({ visible, ...rest }: Props) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={rest.onSkip}>
      {/* Mounted per showing, so the clock starts at 0 each time. */}
      {visible && <WelcomeSheet {...rest} />}
    </Modal>
  );
}

function WelcomeSheet({ tier, name, onStart, onSkip }: Omit<Props, 'visible'>) {
  const { mode } = useTheme();
  const k = mode === 'dark' ? TOKENS.dark : TOKENS.light;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = isCompactHeight(height);
  const padH = compact ? 18 : 22;
  const R = compact ? 92 : 124;
  const node = compact ? 36 : 42;

  const { clock, fade, skip } = useFxClock(WT_END);
  const skipReady = useAfter(clock, WT_SKIP_AT);
  const goReady = useAfter(clock, WT_GO_AT);
  const done = useAfter(clock, WT_END);

  // Each action fires once, and stops the clock first.
  const closed = useRef(false);
  const finish = (fn: () => void) => () => {
    if (closed.current) return;
    closed.current = true;
    fn();
  };
  const handleSkip = finish(onSkip);
  const handleStart = finish(onStart);

  // ── Haptics: success when the tier lands; a light tick per stop reached
  // while the line draws (a tap-to-end skips the unfired ticks). ──
  const lockCue = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
  const tick = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  useAnimatedReaction(() => clock.value >= WT_LOCK, (now, was) => { if (now && !was) runOnJS(lockCue)(); });
  useAnimatedReaction(
    () => countPassed(WT_NODE_T, clock.value),
    (now, was) => { if (was != null && now - was === 1 && clock.value < WT_LINE1 + 0.1) runOnJS(tick)(); },
  );

  // Swipe down on the handle = Skip.
  const handlePan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy > 40 || g.vy > 0.8) handleSkip(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  // ── Sheet + backdrop ──
  const sheetH = useSharedValue(700);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, 0, 0.3) * fade.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - easeOutCubic(seg(clock.value, 0.05, 0.5))) * sheetH.value }],
  }));
  const skipStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, WT_SKIP_AT, WT_SKIP_AT + 0.3) * fade.value }));

  const first = firstNameOf(name);
  const latinName = first != null && LATIN.test(first);
  const shownName = first == null ? null : latinName ? first.toUpperCase() : first;
  const gSize = greetingSize(first, compact) - (isRTL ? 4 : 0);
  // "WELCOME, " / "أهلًا، " with the name in its own Text (Latin names keep
  // Oswald and stay left-to-right inside Arabic).
  const greetHead = t('tour.welcomeName', { name: '' });

  const routeW = width - padH * 2;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end' }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: k.backdrop }, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleSkip} accessibilityLabel={t('tour.skip')} />
      </Animated.View>

      <Animated.View
        onLayout={e => { sheetH.value = e.nativeEvent.layout.height; }}
        style={[{
          width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden',
          backgroundColor: k.sheet, borderTopWidth: 1, borderColor: k.border,
        }, sheetStyle]}
      >
        <TopRadial k={k} />
        <Pressable
          onPress={skip}
          accessible={false}
          style={{ paddingTop: compact ? 8 : 10, paddingHorizontal: padH, paddingBottom: (compact ? 16 : 30) + insets.bottom }}
        >
          {/* Handle (swipe down to skip) + Skip pill on the start edge. */}
          <View {...handlePan.panHandlers} style={{ alignItems: 'center', paddingBottom: compact ? 8 : 10 }}>
            <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: k.handle }} />
          </View>
          <Animated.View style={[{ alignItems: 'flex-start', marginBottom: compact ? 6 : 10 }, skipStyle]} pointerEvents={skipReady ? 'auto' : 'none'}>
            <Pressable
              accessibilityRole="button"
              onPress={handleSkip}
              hitSlop={7}
              style={({ pressed }) => ({
                height: 30, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: k.skipBorder,
                backgroundColor: k.skipFill, justifyContent: 'center', opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={kt('semibold', isRTL ? 13 : 11.5, k.t3, 1.8)}>{t('tour.skip')}</Text>
            </Pressable>
          </Animated.View>

          <FadeUp clock={clock} t0={0.2} dy={10}>
            <Text style={[kt('bold', gSize, k.t1, 2), { textAlign: 'center' }]} numberOfLines={1} ellipsizeMode="tail">
              {shownName == null ? t('tour.welcome') : greetHead}
              {shownName != null && (
                <Text style={latinName ? kt('bold', gSize, k.t1, 2) : undefined}>{latinName ? ltr(shownName) : shownName}</Text>
              )}
            </Text>
          </FadeUp>

          <TierHero clock={clock} tier={tier} R={R} compact={compact} k={k} done={done} />

          <FadeUp clock={clock} t0={WT_LOCK} dy={10}>
            <Text style={[kt('bold', compact ? 26 : 32, k.t1, 2.4), { textAlign: 'center' }]} numberOfLines={1}>{tierName(tier)}</Text>
          </FadeUp>
          <FadeUp clock={clock} t0={WT_LOCK + 0.1} dy={8} style={{ marginTop: compact ? 3 : 5 }}>
            <Text style={[kt('semibold', isRTL ? 12.5 : 11.5, ACC, 2), { textAlign: 'center' }]}>
              {t('tour.startingTier', { n: tier, max: 9 })}
            </Text>
          </FadeUp>

          <FadeUp clock={clock} t0={1.1} dy={6} style={{ marginTop: compact ? 20 : 30 }}>
            <Text style={[kt('semibold', isRTL ? 12 : 10.5, k.t4, 2.6), { textAlign: 'center' }]}>{t('tour.showsYou')}</Text>
          </FadeUp>

          <Route clock={clock} width={routeW} node={node} compact={compact} k={k} done={done} />

          <DiscoverButton clock={clock} compact={compact} ready={goReady} onPress={handleStart} />

          <FadeUp clock={clock} t0={1.4} dy={6} style={{ marginTop: compact ? 10 : 12 }}>
            <Text style={[kt(isRTL ? 'regular' : 'light', 12.5, k.t4, 0.3, 18), { textAlign: 'center' }]}>{t('tour.note')}</Text>
          </FadeUp>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

/** Fades up `dy` px over `dur` from t0 (easeOutCubic). */
function FadeUp({ clock, t0, dy, dur = 0.45, style, children }: {
  clock: Clock; t0: number; dy: number; dur?: number; style?: object; children: React.ReactNode;
}) {
  const a = useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - t0) / dur));
    return { opacity: p, transform: [{ translateY: (1 - p) * dy }] };
  });
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

/** Static coral wash behind the top of the sheet. */
function TopRadial({ k }: { k: Tokens }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="wtRadial" cx="50%" cy="26%" rx="60%" ry="45%">
          <Stop offset="0" stopColor={ACC} stopOpacity={k.radial} />
          <Stop offset="1" stopColor={ACC} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#wtRadial)" />
    </Svg>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** One ring of the stack, drawn inner → outer from 0.30 + 0.07·i. */
function TierRingArc({ clock, i, r, stroke, width }: { clock: Clock; i: number; r: number; stroke: string; width: number }) {
  const C = 2 * Math.PI * r;
  const props = useAnimatedProps(() => {
    const p = easeOutCubic(seg(clock.value, 0.3 + i * 0.07, 0.8 + i * 0.07));
    return { strokeDashoffset: C * (1 - p) };
  });
  return (
    <AnimatedCircle
      cx={0} cy={0} r={r} fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round"
      strokeDasharray={C} animatedProps={props}
    />
  );
}

/** The placed tier: glow, ring stack, number, shock ring at LOCK. */
function TierHero({ clock, tier, R, compact, k, done }: { clock: Clock; tier: number; R: number; compact: boolean; k: Tokens; done: boolean }) {
  const lit = litRings(tier);
  const boxH = R + (compact ? 14 : 26);
  const glowD = R * 1.9;
  const shockD = (WT_RADII[lit - 1] * 2 / 200) * R;

  const glowStyle = useAnimatedStyle(() => {
    const T = clock.value;
    return { opacity: T < WT_LOCK ? 0.15 + 0.35 * seg(T, 0.3, WT_LOCK) : 0.45 + 0.5 * (1 - seg(T, WT_LOCK, WT_LOCK + 0.85)) };
  });
  const groupStyle = useAnimatedStyle(() => {
    const p = easeOutCubic(seg(clock.value, 0.3, 1.0));
    return { transform: [{ rotate: `${(1 - p) * -24}deg` }, { scale: 0.86 + 0.14 * p }] };
  });
  const numStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - 0.8) / 0.3);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? easeOutBack(p, 2) : 0 }] };
  });

  return (
    <View style={{ height: boxH, marginTop: compact ? 6 : 10, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={[{ position: 'absolute', width: glowD, height: glowD }, glowStyle]}>
        <Svg width={glowD} height={glowD}>
          <Defs>
            <RadialGradient id="wtGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACC} stopOpacity={0.5 * k.glowK} />
              <Stop offset="0.62" stopColor={ACC} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={glowD / 2} cy={glowD / 2} r={glowD / 2} fill="url(#wtGlow)" />
        </Svg>
      </Animated.View>
      {!done && (
        <View style={{ position: 'absolute', width: shockD, height: shockD }}>
          <ShockRing clock={clock} t0={WT_LOCK} dur={0.6} cx={shockD / 2} cy={shockD / 2} size={shockD} from={1} to={1.6} color={ACC} borderWidth={2} />
        </View>
      )}
      <Animated.View style={[{ width: R, height: R, alignItems: 'center', justifyContent: 'center' }, groupStyle]}>
        <Svg width={R} height={R} viewBox="-100 -100 200 200" style={StyleSheet.absoluteFill}>
          <G transform="rotate(-90)">
            {WT_RADII.map((r, i) => {
              const current = i === lit - 1;
              return (
                <TierRingArc
                  key={r} clock={clock} i={i} r={r}
                  stroke={current ? ACC : i < lit ? k.ringMid : k.ringDim}
                  width={current ? 5 : 3}
                />
              );
            })}
          </G>
        </Svg>
        <Animated.View style={numStyle}>
          <Text style={kt('bold', Math.round(R * 0.3), ACC)}>{tier}</Text>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const STOPS = ['stopLevel', 'stopWorlds', 'stopJourney', 'stopCommunity'] as const;
// The small word above each stop name ("YOUR LEVEL"); English only, the
// Arabic design has none.
const EYEBROW: Record<typeof STOPS[number], string> = { stopLevel: 'YOUR', stopWorlds: 'THE', stopJourney: 'YOUR', stopCommunity: 'YOUR' };

/** Four stops joined by a line that draws from LEVEL to COMMUNITY. */
function Route({ clock, width, node, compact, k, done }: { clock: Clock; width: number; node: number; compact: boolean; k: Tokens; done: boolean }) {
  const gap = 4;
  const colW = (width - gap * 3) / 4;
  const trackW = width - colW;
  const dir = isRTL ? -1 : 1;

  const trackStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, 1.1, 1.4) }));
  // Fill: a full-length bar slid in from the start edge (translate only).
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -dir * (1 - seg(clock.value, WT_LINE0, WT_LINE1)) * trackW }],
  }));
  const headStyle = useAnimatedStyle(() => {
    const T = clock.value;
    return {
      opacity: (T > WT_LINE0 ? 1 : 0) * (1 - seg(T, WT_LINE1, WT_LINE1 + 0.15)),
      transform: [{ translateX: dir * seg(T, WT_LINE0, WT_LINE1) * trackW }],
    };
  });

  return (
    <View style={{ marginTop: compact ? 12 : 16, flexDirection: 'row', gap }}>
      {/* `left` is the start edge here: React Native mirrors it in Arabic. */}
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: node / 2 - 1, left: colW / 2, width: trackW, height: 2, borderRadius: 1, overflow: 'hidden', backgroundColor: k.track }, trackStyle]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: ACC }, fillStyle]} />
      </Animated.View>
      {STOPS.map((key, i) => (
        <RouteStop key={key} clock={clock} i={i} stop={key} node={node} compact={compact} k={k} />
      ))}
      {!done && (
        <Animated.View
          pointerEvents="none"
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          style={[{ position: 'absolute', top: node / 2 - 11, left: colW / 2 - 11, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }, headStyle]}
        >
          <Svg width={22} height={22} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="wtHead" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={ACC} stopOpacity={0.8} />
                <Stop offset="1" stopColor={ACC} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={11} cy={11} r={11} fill="url(#wtHead)" />
          </Svg>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ffffff' }} />
        </Animated.View>
      )}
    </View>
  );
}

function RouteStop({ clock, i, stop, node, compact, k }: {
  clock: Clock; i: number; stop: typeof STOPS[number]; node: number; compact: boolean; k: Tokens;
}) {
  const t0 = WT_NODE_T[i];
  const worlds = stop === 'stopWorlds';
  const shellStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, 1.1, 1.4) }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: 1 - clamp01(clamp01((clock.value - t0) / 0.4) * 2) }));
  const litStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - t0) / 0.4);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.5 + 0.5 * easeOutBack(p, 1.8) : 0.5 }] };
  });
  const iconStyle = useAnimatedStyle(() => {
    const p = clamp01((clock.value - t0) / 0.4);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.4 + 0.6 * easeOutBack(p, 1.8) : 0.4 }] };
  });
  const eyebrow = isRTL ? null : EYEBROW[stop];

  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
      <Animated.View style={[{ width: node, height: node, borderRadius: node / 2, backgroundColor: k.sheet }, shellStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: node / 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: k.nodeDim }, dimStyle]} />
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: node / 2, borderWidth: 1.5, borderColor: ACC, backgroundColor: k.nodeLit }, litStyle]} />
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, iconStyle]}>
          <StopIcon stop={stop} color={worlds ? k.t1 : ACC} />
        </Animated.View>
      </Animated.View>
      <FadeUp clock={clock} t0={t0 + 0.05} dur={0.4} dy={6} style={{ marginTop: compact ? 6 : 8, alignItems: 'center', maxWidth: '100%' }}>
        {!!eyebrow && <Text style={kt('semibold', 9, k.t4, 1.6, 11)}>{eyebrow}</Text>}
        <Text style={kt('bold', isRTL ? 14 : compact ? 12.5 : 13.5, k.t1, 1)} numberOfLines={1}>{t(`tour.${stop}.word`)}</Text>
        <View style={{ marginTop: isRTL ? 0 : 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {worlds && <WorldDots clock={clock} t0={t0} />}
          <Text style={kt(isRTL ? 'medium' : 'regular', isRTL ? 11 : 10.5, k.t3, 0.3)} numberOfLines={1}>{t(`tour.${stop}.sub`)}</Text>
        </View>
      </FadeUp>
    </View>
  );
}

function WorldDot({ clock, t0, color }: { clock: Clock; t0: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const p = clamp01((clock.value - t0) / 0.3);
    return { opacity: clamp01(p * 2), transform: [{ scale: p > 0 ? easeOutBack(p, 2.2) : 0 }] };
  });
  return <Animated.View style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }, style]} />;
}

function WorldDots({ clock, t0 }: { clock: Clock; t0: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, direction: 'ltr' }}>
      {WORLD_DOTS.map((c, j) => <WorldDot key={c} clock={clock} t0={t0 + 0.15 + j * 0.07} color={c} />)}
    </View>
  );
}

// Official LeapLogo gaps (as JourneyBadge): screen degrees, 0 = right.
const MARK_GAPS = [
  { deg: -30, color: WORLD_COLORS.power },
  { deg: 90, color: WORLD_COLORS.endurance },
  { deg: 210, color: WORLD_COLORS.static },
];
const markPt = (deg: number, r = 8) => {
  const a = (deg * Math.PI) / 180;
  return [12 + r * Math.cos(a), 12 + r * Math.sin(a)].map(v => Math.round(v * 100) / 100);
};

function StopIcon({ stop, color }: { stop: typeof STOPS[number]; color: string }) {
  const common = { fill: 'none', stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (stop) {
    case 'stopLevel':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d="M5 12l7-7 7 7" {...common} strokeWidth={2.6} />
          <Path d="M5 19l7-7 7 7" {...common} strokeWidth={2.6} />
        </Svg>
      );
    case 'stopWorlds':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24">
          {MARK_GAPS.map((g, i) => {
            const next = MARK_GAPS[(i + 1) % 3].deg + (i === 2 ? 360 : 0);
            const [x1, y1] = markPt(g.deg + 17);
            const [x2, y2] = markPt(next - 17);
            return <Path key={`a${i}`} d={`M${x1} ${y1} A8 8 0 0 1 ${x2} ${y2}`} {...common} strokeWidth={2} />;
          })}
          {MARK_GAPS.map((g, i) => {
            const [x, y] = markPt(g.deg);
            return <Circle key={`d${i}`} cx={x} cy={y} r={1.6} fill={g.color} />;
          })}
        </Svg>
      );
    case 'stopJourney':
      return (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Circle cx={6} cy={18} r={2.5} {...common} strokeWidth={2.4} />
          <Circle cx={18} cy={6} r={2.5} {...common} strokeWidth={2.4} />
          <Path d="M8.5 18H15a3 3 0 000-6H9a3 3 0 010-6h6.5" {...common} strokeWidth={2.4} />
        </Svg>
      );
    default:
      return (
        <Svg width={19} height={19} viewBox="0 0 24 24">
          <Circle cx={9} cy={8} r={3.5} {...common} strokeWidth={2.2} />
          <Path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" {...common} strokeWidth={2.2} />
          <Path d="M16 4.8a3.5 3.5 0 0 1 0 6.4" {...common} strokeWidth={2.2} />
          <Path d="M18.5 14.8c1.6.8 2.6 2.6 3 5.2" {...common} strokeWidth={2.2} />
        </Svg>
      );
  }
}

/** DISCOVER THE APP: slides up at 1.30 (tappable from then), arrow nudges once. */
function DiscoverButton({ clock, compact, ready, onPress }: { clock: Clock; compact: boolean; ready: boolean; onPress: () => void }) {
  const wrapStyle = useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - WT_GO_AT) / 0.4));
    return { opacity: p, transform: [{ translateY: (1 - p) * 20 }] };
  });
  const arrowStyle = useAnimatedStyle(() => {
    const T = clock.value;
    const b = T > 2.3 && T < 2.7 ? Math.sin(((T - 2.3) / 0.4) * Math.PI) : 0;
    return { transform: [{ translateX: (isRTL ? -1 : 1) * b * 5 }, { scaleX: isRTL ? -1 : 1 }] };
  });
  return (
    <Animated.View style={[{ marginTop: compact ? 22 : 30 }, wrapStyle]} pointerEvents={ready ? 'auto' : 'none'}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
      >
        <View style={[{
          height: compact ? 52 : 56, borderRadius: 16, backgroundColor: ACC,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
        }, Platform.OS === 'ios' && { shadowColor: ACC, shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } }]}>
          <Text style={kt('bold', 16, '#ffffff', 2.6)}>{t('tour.discover')}</Text>
          <Animated.View style={arrowStyle}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M5 12h14" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" />
              <Path d="M13 6l6 6-6 6" fill="none" stroke="#ffffff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
