import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { runOnJS, SharedValue, useAnimatedProps, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { kt } from '../worlds/kit';
import { useFxClock } from '../../lib/fx/useFxClock';
import { useAfter } from '../fx/FxEffects';
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, seg } from '../../lib/fx/easing';
import { stepCount, StepNumber } from '../../lib/trialSteps';
import { formatTime } from '../../lib/trials';
import { tierName } from '../../lib/strengthClimb';
import { useTheme } from '../../contexts/ThemeContext';
import { FLIP_X, isRTL, ltr, t as tr } from '../../i18n';

/*
 * STEP CLEARED (design_handoff_trial_steps, piece B): the small-win card after
 * a step is saved. Lighter and shorter than Rank Up. One clock (END 1.90),
 * transform/opacity only, SVG only strokeDashoffset. Tap the card to jump to
 * the end; DONE is tappable from 1.00.
 */

const ACC = '#FC5454';
const END = 1.9;
const LOCK = 0.85;
const MOVE = 1.35;

export interface StepClearedData {
  /** The athlete tier whose steps these are. */
  tier: number;
  step: StepNumber;
  timeSeconds: number;
  /** Best before this run; null = first clear. */
  previousBest: number | null;
  /** Steps of this tier cleared BEFORE this run. */
  clearedBefore: number[];
  fromJourney: boolean;
  /** A past tier's step (practice): no next/ready guidance. */
  practice: boolean;
}

type Kind = 'first' | 'best' | 'slower';

function tokens(dark: boolean) {
  return dark ? {
    dark, backdrop: 'rgba(0,0,0,0.78)', card: '#0e0808', cardB: 'rgba(252,84,84,0.5)', radial: 0.15,
    panel: '#120b0b', panelB: '#2a1616', t1: '#ffffff', t2: '#d0d0d0', t3: '#a0a0a0', t4: '#8a8a8a', t5: '#6a6a6a',
    track: '#2a1d1d', nodeDim: '#3a3030', nextTint: 'rgba(252,84,84,0.12)', trialRing: '#3a2a2a', hl: 'rgba(252,84,84,0.07)',
    accentText: '#FC5454', glowK: 1,
  } : {
    dark, backdrop: 'rgba(17,17,19,0.42)', card: '#ffffff', cardB: 'rgba(252,84,84,0.45)', radial: 0.09,
    panel: '#fafafa', panelB: '#ececef', t1: '#111113', t2: '#3f3f46', t3: '#52525b', t4: '#71717a', t5: '#8a8a93',
    track: '#e4e4e7', nodeDim: '#d4d4d8', nextTint: 'rgba(252,84,84,0.08)', trialRing: '#d4d4d8', hl: 'rgba(252,84,84,0.06)',
    accentText: '#C43C3C', glowK: 0.55,
  };
}
type T = ReturnType<typeof tokens>;
type Clock = SharedValue<number>;

export function StepClearedCard({ data, onDone }: { data: StepClearedData | null; onDone: () => void }) {
  return (
    <Modal visible={data != null} transparent animationType="none" statusBarTranslucent onRequestClose={onDone}>
      {data && <Card data={data} onDone={onDone} />}
    </Modal>
  );
}

function Card({ data, onDone }: { data: StepClearedData; onDone: () => void }) {
  const { mode } = useTheme();
  const k = tokens(mode === 'dark');
  const { height } = useWindowDimensions();
  const compact = height < 760;
  const { clock, fade, skip } = useFxClock(END);
  const doneReady = useAfter(clock, 1.0);

  const kind: Kind = data.previousBest == null ? 'first' : data.timeSeconds < data.previousBest ? 'best' : 'slower';
  const n = stepCount(data.tier);
  const tierLabel = tierName(data.tier);
  const clearedAfter = Array.from(new Set([...data.clearedBefore, data.step])).sort();
  const allAfter = n > 0 && Array.from({ length: n }, (_, i) => i + 1).every(s => clearedAfter.includes(s));
  const nextStep = Array.from({ length: n }, (_, i) => (i + 1) as StepNumber).find(s => !clearedAfter.includes(s)) ?? null;

  // ── Cues ──
  const success = () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };
  const light = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
  useAnimatedReaction(() => clock.value >= LOCK, (now, was) => {
    if (now && !was && kind !== 'slower') runOnJS(success)();
  });
  useAnimatedReaction(() => clock.value >= 0.6, (now, was) => {
    if (now && !was && kind === 'slower') runOnJS(light)();
  });
  useAnimatedReaction(() => clock.value >= 1.15, (now, was) => {
    if (now && !was && data.fromJourney && clock.value < 1.3) runOnJS(light)();
  });
  useAnimatedReaction(() => clock.value >= MOVE, (now, was) => {
    if (now && !was && kind === 'first' && !data.practice && clock.value < MOVE + 0.15) runOnJS(light)();
  });

  const backdrop = useAnimatedStyle(() => ({ opacity: seg(clock.value, 0, 0.25) * fade.value }));
  const cardStyle = useAnimatedStyle(() => {
    const p = easeOutCubic(seg(clock.value, 0.05, 0.45));
    return { opacity: p * fade.value, transform: [{ translateY: (1 - p) * 24 }, { scale: 0.96 + 0.04 * p }] };
  });
  const doneStyle = useAnimatedStyle(() => {
    const p = easeOutCubic(seg(clock.value, 1.0, 1.3));
    return { opacity: p * fade.value, transform: [{ translateY: (1 - p) * 16 }] };
  });

  const big = compact ? 52 : 62;
  const hint = data.practice ? null
    : allAfter ? { pre: tr('trialSteps.readyFor'), bold: tr('trialSteps.trialName', { tier: tierLabel }), coral: true }
    : nextStep ? { pre: tr('trialSteps.next'), bold: `${tr('trialSteps.stepN', { n: nextStep })} · ${tr(nextStep === 1 ? 'trialSteps.firstTaste' : 'trialSteps.bridge')}`, coral: false }
    : null;

  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: compact ? 16 : 24, paddingTop: compact ? 34 : 50, paddingBottom: compact ? 16 : 24 }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: k.backdrop }, backdrop]} />

      <Animated.View style={cardStyle}>
        <Pressable onPress={skip} accessible={false}>
          <View style={{ borderRadius: compact ? 26 : 30, overflow: 'hidden', backgroundColor: k.card, borderWidth: 1, borderColor: k.cardB, padding: compact ? 16 : 22, paddingBottom: compact ? 16 : 20, alignItems: 'center' }}>
            <TopRadial k={k} />
            <FadeUp clock={clock} t0={0.15} dy={6} style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StrengthIcon />
                <Text style={kt('semibold', 11, ACC, 2.4)}>{tr('strength.title')}</Text>
              </View>
              <Text style={kt('medium', 11, k.t4, 1.6)}>{tr('trialSteps.stepOfN', { n: data.step, total: n })}</Text>
            </FadeUp>

            <FadeUp clock={clock} t0={0.18} dy={8} style={{ marginTop: compact ? 12 : 18 }}>
              <Text style={kt('semibold', 12, kind === 'best' ? ACC : k.t2, 4)}>{tr(kind === 'best' ? 'trialSteps.newBest' : 'trialSteps.cleared')}</Text>
            </FadeUp>
            <FadeUp clock={clock} t0={0.22} dy={10} style={{ marginTop: 6 }}>
              <Text style={[kt('bold', compact ? 24 : 28, k.t1, 1.6), { textAlign: 'center' }]} numberOfLines={1}>
                {tr('trialSteps.title', { tier: tierLabel, n: data.step })}
              </Text>
            </FadeUp>
            <FadeUp clock={clock} t0={0.26} dy={8} style={{ marginTop: 4 }}>
              <Text style={kt('semibold', 12, k.accentText, 2.2)}>{tr(data.step === 1 ? 'trialSteps.firstTaste' : 'trialSteps.bridge')}</Text>
            </FadeUp>

            {/* Time */}
            <TimeBlock k={k} clock={clock} kind={kind} data={data} big={big} compact={compact} />

            {/* Chips: delta (new best) · +100 POINTS (Journey) */}
            {(kind === 'best' || data.fromJourney) && (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                {kind === 'best' && data.previousBest != null && (
                  <Pop clock={clock} t0={0.95}>
                    <View style={{ height: 26, paddingHorizontal: 12, borderRadius: 13, backgroundColor: 'rgba(252,84,84,0.14)', justifyContent: 'center' }}>
                      <Text style={kt('bold', 12.5, ACC, 0.4)}>{ltr(`−${formatTime(data.previousBest - data.timeSeconds)}`)}</Text>
                    </View>
                  </Pop>
                )}
                {data.fromJourney && (
                  <Pop clock={clock} t0={1.15} from={0.6}>
                    <View style={{ height: 26, paddingHorizontal: 12, borderRadius: 13, backgroundColor: ACC, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={kt('bold', 11.5, '#ffffff', 1.6)}>{ltr('+100')}</Text>
                      <Text style={kt('bold', 11.5, '#ffffff', 1.6)}>{tr('trialSteps.pointsWord')}</Text>
                    </View>
                  </Pop>
                )}
              </View>
            )}

            {/* Path panel */}
            <FadeUp clock={clock} t0={0.25} dur={0.4} dy={8} style={{ alignSelf: 'stretch', marginTop: compact ? 14 : 18 }}>
              <View style={{ borderRadius: 18, paddingVertical: compact ? 8 : 10, paddingHorizontal: compact ? 12 : 14, backgroundColor: k.panel, borderWidth: 1, borderColor: k.panelB }}>
                <MiniRail k={k} clock={clock} data={data} kind={kind} clearedAfter={clearedAfter} compact={compact} />
              </View>
            </FadeUp>

            {hint && (
              <FadeUp clock={clock} t0={kind === 'first' ? 1.45 : 1.0} dy={6} style={{ marginTop: compact ? 12 : 14 }}>
                <Text style={[kt('regular', 14, k.t3, 0, 19), { textAlign: 'center' }]}>
                  {hint.pre}
                  <Text style={kt('semibold', 14, hint.coral ? ACC : k.t1, 0, 19)}>{hint.bold}</Text>
                </Text>
              </FadeUp>
            )}
          </View>
        </Pressable>
      </Animated.View>

      <Animated.View style={[{ marginTop: compact ? 10 : 14 }, doneStyle]} pointerEvents={doneReady ? 'auto' : 'none'}>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          style={({ pressed }) => [{
            height: compact ? 52 : 56, borderRadius: 16, backgroundColor: ACC, alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.88 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
          }, Platform.OS === 'ios' && { shadowColor: ACC, shadowOpacity: 0.3, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } }]}
        >
          <Text style={kt('bold', 16, '#ffffff', 2.6)}>{tr('trialSteps.done')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ── Time block ────────────────────────────────────────────────────────────

function TimeBlock({ k, clock, kind, data, big, compact }: { k: T; clock: Clock; kind: Kind; data: StepClearedData; big: number; compact: boolean }) {
  const label = kind === 'slower' ? tr('trialSteps.thisRun') : tr('trialSteps.yourTime');
  const timeIn = useAnimatedStyle(() => {
    const p = easeOutCubic(seg(clock.value, 0.3, 0.7));
    return { opacity: p, transform: [{ translateY: (1 - p) * 10 }, { scale: 0.94 + 0.06 * p }] };
  });
  const oldIn = useAnimatedStyle(() => ({ opacity: seg(clock.value, 0.3, 0.55) }));
  const strike = useAnimatedStyle(() => ({ transform: [{ scaleX: easeOutCubic(seg(clock.value, 0.55, 0.75)) }] }));
  const newPop = useAnimatedStyle(() => {
    const p = clamp01((clock.value - 0.72) / 0.33);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.8 + 0.2 * easeOutBack(p, 2) : 0.8 }] };
  });
  const time = ltr(formatTime(data.timeSeconds));

  return (
    <View style={{ marginTop: compact ? 12 : 16, alignItems: 'center' }}>
      <Animated.View style={kind === 'best' ? oldIn : timeIn}>
        <Text style={kt('semibold', 10.5, k.t4, 2)}>{label}</Text>
      </Animated.View>
      {kind === 'first' && (
        <Animated.View style={timeIn}>
          <Text style={kt('bold', big, k.t1, 0, big + 6)}>{time}</Text>
        </Animated.View>
      )}
      {kind === 'best' && data.previousBest != null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, direction: 'ltr' }}>
          <Animated.View style={oldIn}>
            <Text style={kt('medium', 24, k.t4)}>{formatTime(data.previousBest)}</Text>
            <Animated.View style={[{ position: 'absolute', left: -2, right: -2, top: '50%', height: 2, backgroundColor: ACC, transformOrigin: 'left' }, strike]} />
          </Animated.View>
          <Animated.View style={oldIn}>
            <Svg width={16} height={16} viewBox="0 0 24 24"><Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={k.t4} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Animated.View>
          <Animated.View style={newPop}>
            <Text style={kt('bold', big, k.t1, 0, big + 6)}>{formatTime(data.timeSeconds)}</Text>
          </Animated.View>
        </View>
      )}
      {kind === 'slower' && (
        <Animated.View style={[{ alignItems: 'center' }, timeIn]}>
          <Text style={kt('semibold', compact ? 40 : 46, k.t2, 0, (compact ? 40 : 46) + 6)}>{time}</Text>
          {data.previousBest != null && (
            <Text style={kt('regular', 13, k.t3, 0, 18)}>
              {tr('trialSteps.yourBestShort')} <Text style={kt('semibold', 15, k.t1)}>{ltr(formatTime(data.previousBest))}</Text>
            </Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ── Mini rail (B density) ─────────────────────────────────────────────────

type NodeState = 'locked' | 'next' | 'cleared';

function MiniRail({ k, clock, data, kind, clearedAfter, compact }: {
  k: T; clock: Clock; data: StepClearedData; kind: Kind; clearedAfter: number[]; compact: boolean;
}) {
  const n = stepCount(data.tier);
  const rowH = compact ? 36 : 40;
  const first = kind === 'first';
  const guide = !data.practice;

  // State of each step before and after this run.
  const stateOf = (s: number, cleared: number[]): NodeState =>
    cleared.includes(s) ? 'cleared' : !guide ? 'next' : s === 1 || cleared.includes(s - 1) ? 'next' : 'locked';
  const steps = Array.from({ length: n }, (_, i) => i + 1);
  const allBefore = steps.every(s => data.clearedBefore.includes(s));
  const allAfter = steps.every(s => clearedAfter.includes(s));
  // The row that becomes "next" when this step is first cleared.
  const nextAfter = steps.find(s => !clearedAfter.includes(s)) ?? 'trial';

  return (
    <View>
      {steps.map((s, i) => {
        const before = stateOf(s, data.clearedBefore);
        const after = stateOf(s, clearedAfter);
        const isThis = s === data.step;
        const role: RowRole = isThis ? (first ? 'clearing' : kind === 'best' ? 'bump' : 'static')
          : first && guide && nextAfter === s && before === 'locked' ? 'unlocking' : 'static';
        // Line below this row: lit when this step is cleared (after); it draws in when this is the step just cleared.
        return (
          <RailRow
            key={s} k={k} clock={clock} rowH={rowH} n={s} title={tr('trialSteps.stepN', { n: s })}
            nodeBefore={before} nodeAfter={after} role={role}
            highlightBefore={guide && before === 'next' && (first ? isThis : !allBefore && after === 'next')}
            highlightAfter={guide && after === 'next' && !allAfter && (first ? nextAfter === s : true)}
            chip={guide ? 'next' : null}
            lineLit={after === 'cleared'} lineDraws={first && isThis}
            first={first}
          />
        );
      })}
      <TrialRow
        k={k} clock={clock} rowH={rowH} tier={data.tier}
        ready={guide && allAfter} becomesReady={guide && first && !allBefore && allAfter}
      />
    </View>
  );
}

type RowRole = 'static' | 'clearing' | 'bump' | 'unlocking';

function RailRow({ k, clock, rowH, n, title, nodeBefore, nodeAfter, role, highlightBefore, highlightAfter, chip, lineLit, lineDraws, first }: {
  k: T; clock: Clock; rowH: number; n: number; title: string; nodeBefore: NodeState; nodeAfter: NodeState; role: RowRole;
  highlightBefore: boolean; highlightAfter: boolean; chip: 'next' | null; lineLit: boolean; lineDraws: boolean; first: boolean;
}) {
  const moving = first && (highlightBefore !== highlightAfter);
  const hl = useAnimatedStyle(() => {
    if (!moving) return { opacity: highlightAfter ? 1 : 0 };
    const p = seg(clock.value, MOVE, MOVE + 0.25);
    return { opacity: highlightBefore ? 1 - p : p };
  });
  const chipStyle = useAnimatedStyle(() => {
    if (!moving) return { opacity: highlightAfter ? 1 : 0, transform: [{ scale: 1 }] };
    if (highlightBefore) return { opacity: 1 - seg(clock.value, MOVE, MOVE + 0.15), transform: [{ scale: 1 }] };
    const p = clamp01((clock.value - (MOVE + 0.05)) / 0.3);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.6 + 0.4 * easeOutBack(p, 2) : 0.6 }] };
  });
  const fill = useAnimatedStyle(() => ({
    transform: [{ scaleY: lineDraws ? easeInOutCubic(seg(clock.value, 0.95, MOVE)) : 1 }],
  }));
  const segTop = rowH / 2 + 17;
  const segBottom = -(rowH / 2 - 17);
  const cleared = nodeAfter === 'cleared';
  const locked = nodeAfter === 'locked' && role !== 'unlocking';

  return (
    <View style={{ height: rowH, flexDirection: 'row', alignItems: 'center' }}>
      {(highlightBefore || highlightAfter) && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -8, right: -8, top: 3, bottom: 3, borderRadius: 14, backgroundColor: k.hl }, hl]} />
      )}
      <View pointerEvents="none" style={{ position: 'absolute', left: NODE_COL / 2 - 1, top: segTop, bottom: segBottom, width: 2, backgroundColor: k.track }} />
      {lineLit && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: NODE_COL / 2 - 1.25, top: segTop, bottom: segBottom, width: 2.5, backgroundColor: ACC, transformOrigin: 'top' }, fill]} />
      )}
      <View style={{ width: NODE_COL, alignItems: 'center', justifyContent: 'center' }}>
        <StepNodeB k={k} clock={clock} n={n} before={nodeBefore} after={nodeAfter} role={role} />
      </View>
      <Text
        style={[kt(cleared ? 'medium' : 'bold', 12.5, cleared ? k.t2 : locked ? k.t5 : k.t1, 1), { flex: 1, marginStart: 14 }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {chip && (highlightBefore || highlightAfter) && (
        <Animated.View style={[{ height: 20, paddingHorizontal: 9, borderRadius: 10, backgroundColor: k.nextTint, justifyContent: 'center' }, chipStyle]}>
          <Text style={kt('bold', 9.5, k.accentText, 1.4)}>{tr('trialSteps.nextChip')}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const NODE_COL = 30;
const NODE = 26;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A step node and its transition: first clear (draw ring → fill + check), new-best bump, or unlocking. */
function StepNodeB({ k, clock, n, before, after, role }: { k: T; clock: Clock; n: number; before: NodeState; after: NodeState; role: RowRole }) {
  const R = NODE / 2 + 3;
  const C = 2 * Math.PI * R;
  const drawProps = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - easeOutCubic(seg(clock.value, 0.45, LOCK))) }));
  const drawFade = useAnimatedStyle(() => ({ opacity: role === 'clearing' ? 1 - seg(clock.value, 1.0, 1.25) : 0 }));

  // Layers: dashed+lock (locked), coral ring+number (next), fill+check (cleared).
  const lockedL = useAnimatedStyle(() => {
    if (role === 'unlocking') return { opacity: 1 - seg(clock.value, MOVE, MOVE + 0.2) };
    return { opacity: after === 'locked' ? 1 : 0 };
  });
  const ringL = useAnimatedStyle(() => {
    if (role === 'unlocking') {
      const p = clamp01((clock.value - MOVE) / 0.35);
      return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.6 + 0.4 * easeOutBack(p, 1.8) : 0.6 }] };
    }
    if (role === 'clearing') return { opacity: 1 - seg(clock.value, LOCK, LOCK + 0.2), transform: [{ scale: 1 }] };
    return { opacity: after === 'next' ? 1 : 0, transform: [{ scale: 1 }] };
  });
  const numL = useAnimatedStyle(() => {
    if (role === 'unlocking') return { opacity: seg(clock.value, MOVE + 0.1, MOVE + 0.3) };
    if (role === 'clearing') return { opacity: 1 - seg(clock.value, LOCK, LOCK + 0.15) };
    return { opacity: after === 'next' ? 1 : 0 };
  });
  const fillL = useAnimatedStyle(() => {
    if (role === 'clearing') {
      const p = clamp01((clock.value - LOCK) / 0.3);
      return { opacity: p > 0 ? 1 : 0, transform: [{ scale: p > 0 ? 0.55 + 0.45 * easeOutBack(p, 1.6) : 0.55 }] };
    }
    if (role === 'bump') {
      const b = clock.value > LOCK && clock.value < LOCK + 0.3 ? Math.sin(((clock.value - LOCK) / 0.3) * Math.PI) : 0;
      return { opacity: 1, transform: [{ scale: 1 + 0.22 * b }] };
    }
    return { opacity: after === 'cleared' ? 1 : 0, transform: [{ scale: 1 }] };
  });
  const checkL = useAnimatedStyle(() => {
    if (role === 'clearing') {
      const p = clamp01((clock.value - 0.92) / 0.3);
      return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? easeOutBack(p, 2) : 0 }] };
    }
    return { opacity: after === 'cleared' ? 1 : 0, transform: [{ scale: 1 }] };
  });
  const shock = useAnimatedStyle(() => {
    const p = clamp01((clock.value - LOCK) / 0.6);
    const on = (role === 'clearing' || role === 'bump') && p > 0 && p < 1;
    return { opacity: on ? 0.7 * (1 - p) : 0, transform: [{ scale: 1 + 0.75 * easeOutCubic(p) }] };
  });
  const glow = useAnimatedStyle(() => {
    const T = clock.value;
    if (role === 'clearing') return { opacity: (T < LOCK ? 0.5 + 0.5 * seg(T, 0.45, LOCK) : 1 - seg(T, LOCK, 1.7)) * k.glowK };
    if (role === 'bump') return { opacity: (T >= LOCK ? 0.8 * (1 - seg(T, LOCK, LOCK + 0.5)) : 0) * k.glowK };
    if (role === 'unlocking') return { opacity: 0.5 * seg(T, MOVE, MOVE + 0.3) * k.glowK };
    return { opacity: after === 'next' ? 0.5 * k.glowK : 0 };
  });
  const showLock = before === 'locked' || after === 'locked';
  const showRing = before === 'next' || after === 'next' || role === 'unlocking';
  const showFill = after === 'cleared';
  const abs = { position: 'absolute' as const, width: NODE, height: NODE, borderRadius: NODE / 2, alignItems: 'center' as const, justifyContent: 'center' as const };

  return (
    <View style={{ width: NODE, height: NODE, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 52, height: 52 }, glow]}><Glow size={52} /></Animated.View>
      {(role === 'clearing' || role === 'bump') && (
        <Animated.View pointerEvents="none" style={[abs, { borderWidth: 2, borderColor: ACC }, shock]} />
      )}
      {showLock && (
        <Animated.View style={[abs, { borderWidth: 1.5, borderStyle: 'dashed', borderColor: k.nodeDim, backgroundColor: k.card }, lockedL]}>
          <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" fill="none" stroke={k.t5} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Animated.View>
      )}
      {showRing && (
        <Animated.View style={[abs, { borderWidth: 2, borderColor: ACC, backgroundColor: k.nextTint }, ringL]} />
      )}
      {showRing && (
        <Animated.View style={[abs, numL]}><Text style={kt('bold', 12, ACC, 0, 15)}>{n}</Text></Animated.View>
      )}
      {role === 'clearing' && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: R * 2 + 4, height: R * 2 + 4 }, drawFade]}>
          <Svg width={R * 2 + 4} height={R * 2 + 4} style={isRTL ? FLIP_X : undefined}>
            <AnimatedCircle
              cx={R + 2} cy={R + 2} r={R} fill="none" stroke={ACC} strokeWidth={2} strokeLinecap="round"
              strokeDasharray={C} animatedProps={drawProps} transform={`rotate(-90 ${R + 2} ${R + 2})`}
            />
          </Svg>
        </Animated.View>
      )}
      {showFill && <Animated.View style={[abs, { backgroundColor: ACC }, fillL]} />}
      {showFill && (
        <Animated.View style={[abs, checkL]}>
          <Svg width={13} height={13} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
        </Animated.View>
      )}
    </View>
  );
}

function TrialRow({ k, clock, rowH, tier, ready, becomesReady }: {
  k: T; clock: Clock; rowH: number; tier: number; ready: boolean; becomesReady: boolean;
}) {
  const S = 30;
  const fillL = useAnimatedStyle(() => {
    if (!becomesReady) return { opacity: ready ? 1 : 0, transform: [{ scale: 1 }] };
    const p = clamp01((clock.value - MOVE) / 0.35);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.55 + 0.45 * easeOutBack(p, 1.8) : 0.55 }] };
  });
  const hl = useAnimatedStyle(() => ({ opacity: becomesReady ? seg(clock.value, MOVE, MOVE + 0.25) : ready ? 1 : 0 }));
  const chip = useAnimatedStyle(() => {
    if (!becomesReady) return { opacity: ready ? 1 : 0, transform: [{ scale: 1 }] };
    const p = clamp01((clock.value - (MOVE + 0.05)) / 0.3);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? 0.6 + 0.4 * easeOutBack(p, 2) : 0.6 }] };
  });
  const shock = useAnimatedStyle(() => {
    const p = clamp01((clock.value - MOVE) / 0.5);
    const on = becomesReady && p > 0 && p < 1;
    return { opacity: on ? 0.6 * (1 - p) : 0, transform: [{ scale: 1 + 0.5 * easeOutCubic(p) }] };
  });
  const glow = useAnimatedStyle(() => ({ opacity: (becomesReady ? 0.6 * seg(clock.value, MOVE, MOVE + 0.3) : ready ? 0.6 : 0) * k.glowK }));
  const abs = { position: 'absolute' as const, width: S, height: S, borderRadius: S / 2, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ height: rowH + 4, flexDirection: 'row', alignItems: 'center' }}>
      {(ready || becomesReady) && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -8, right: -8, top: 3, bottom: 3, borderRadius: 14, backgroundColor: k.hl }, hl]} />
      )}
      <View style={{ width: NODE_COL, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 60, height: 60 }, glow]}><Glow size={60} /></Animated.View>
          <View style={[abs, { borderWidth: 2, borderColor: k.trialRing }]}><Summit color={k.t3} /></View>
          {(ready || becomesReady) && (
            <>
              <Animated.View pointerEvents="none" style={[abs, { borderWidth: 2, borderColor: ACC }, shock]} />
              <Animated.View style={[abs, { backgroundColor: ACC }, fillL]}><Summit color="#ffffff" /></Animated.View>
            </>
          )}
        </View>
      </View>
      <Text style={[kt('bold', 12.5, ready || becomesReady ? k.t1 : k.t3, 1), { flex: 1, marginStart: 14 }]} numberOfLines={1}>
        {tr('trialSteps.trialName', { tier: tierName(tier) })}
      </Text>
      {(ready || becomesReady) && (
        <Animated.View style={[{ height: 20, paddingHorizontal: 9, borderRadius: 10, backgroundColor: ACC, justifyContent: 'center' }, chip]}>
          <Text style={kt('bold', 9.5, '#ffffff', 1.4)}>{tr('trialSteps.readyChip')}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────

function FadeUp({ clock, t0, dy, dur = 0.4, style, children }: { clock: Clock; t0: number; dy: number; dur?: number; style?: object; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => {
    const p = easeOutCubic(clamp01((clock.value - t0) / dur));
    return { opacity: p, transform: [{ translateY: (1 - p) * dy }] };
  });
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

function Pop({ clock, t0, from = 0.6, children }: { clock: Clock; t0: number; from?: number; children: React.ReactNode }) {
  const a = useAnimatedStyle(() => {
    const p = clamp01((clock.value - t0) / 0.3);
    return { opacity: clamp01(p * 2.5), transform: [{ scale: p > 0 ? from + (1 - from) * easeOutBack(p, 2) : from }] };
  });
  return <Animated.View style={a}>{children}</Animated.View>;
}

function Glow({ size }: { size: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="scGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={ACC} stopOpacity={0.6} />
          <Stop offset="1" stopColor={ACC} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#scGlow)" />
    </Svg>
  );
}

function TopRadial({ k }: { k: T }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <RadialGradient id="scRadial" cx="50%" cy="0%" rx="70%" ry="45%">
          <Stop offset="0" stopColor={ACC} stopOpacity={k.radial} />
          <Stop offset="1" stopColor={ACC} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scRadial)" />
    </Svg>
  );
}

function StrengthIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 13 13">
      {[0, 1, 2, 3].map(i => <Rect key={i} x={i * 3.4} y={9 - i * 2.6} width={2.4} height={4 + i * 2.6} rx={1} fill={ACC} />)}
    </Svg>
  );
}

function Summit({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M3 20l6.5-11 3.5 6 2-3.5L21 20z" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M9.5 9V4l3 1.2-3 1.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

