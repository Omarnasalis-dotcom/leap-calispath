import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { WorldKitTokens, WORLD_FONTS } from '../../../constants/worldKitTokens';
import { kt } from '../worlds/kit';
import { easeInOutCubic, easeOutCubic, seg } from '../../lib/fx/easing';
import { getTrialStep, stepCount, StepNumber } from '../../lib/trialSteps';
import { formatTime } from '../../lib/trials';
import { tierName } from '../../lib/strengthClimb';
import { StepProgress } from '../../services/StepService';
import { FLIP_X, isRTL, ltr, t as tr } from '../../i18n';

/*
 * The current tier card with the path to the trial (design_handoff_trial_steps,
 * piece A): Step 1 → Step 2, the line running into the trial button. The line
 * below each cleared step turns coral. Steps started here pay no points; the trial is never blocked. Mount:
 * one 1 s clock, transform and opacity only, replayed only when the path
 * changed since the last visit.
 *
 * mode 'practice' (past tiers): the same card with PRACTICE instead of START,
 * no locking, no "you are here" highlight, and the past tier's chip/colours.
 */

export interface PathChip { text: string; bg: string; fg: string; border: string }

const ACC = '#FC5454';
const END = 1.0;

function pathTokens(t: WorldKitTokens) {
  const dark = t.mode === 'dark';
  return {
    dark,
    accentText: dark ? '#FC5454' : '#C43C3C',
    track: dark ? '#2a1d1d' : '#e4e4e7',
    nodeDim: dark ? '#3a3030' : '#d4d4d8',
    nextTint: dark ? 'rgba(252,84,84,0.12)' : 'rgba(252,84,84,0.08)',
    trialRing: dark ? '#3a2a2a' : '#d4d4d8',
    hlBg: dark ? 'rgba(252,84,84,0.07)' : 'rgba(252,84,84,0.06)',
    btnOutlineFill: dark ? 'rgba(252,84,84,0.06)' : '#ffffff',
    glowK: dark ? 1 : 0.55,
    t2: t.textSecondary, t4: t.textMuted, t5: t.textDisabled,
  };
}
type PT = ReturnType<typeof pathTokens>;

// Which states this session has already drawn, per tier (no replay unless changed).
const drawnState = new Map<number, string>();

interface Row { step: StepNumber; state: 'locked' | 'next' | 'open' | 'cleared' }

export const StepPathCard = React.memo(function StepPathCard({
  tokens: t, mode = 'current', chip, caption, cardBg, cardBorder, ghostColor, tier, progress, compact, active, onStartStep, onStartTrial, onShowDetails, onMeasured, buttonRef, onButtonLayout,
}: {
  tokens: WorldKitTokens; mode?: 'current' | 'practice'; chip: PathChip; caption: string;
  cardBg: string; cardBorder: string; ghostColor: string; tier: number; progress: StepProgress | null;
  compact: boolean; active: boolean;
  onStartStep: (step: StepNumber) => void; onStartTrial: () => void; onShowDetails: () => void;
  /** The card's natural height, so the carousel can fit it. */
  onMeasured: (height: number) => void;
  buttonRef?: React.Ref<View>; onButtonLayout?: () => void;
}) {
  const p = useMemo(() => pathTokens(t), [t]);
  const cleared = progress?.cleared ?? [];
  const n = stepCount(tier);
  const allCleared = n > 0 && cleared.length >= n && Array.from({ length: n }, (_, i) => i + 1).every(s => cleared.includes(s));
  const name = tierName(tier);
  const rowH = compact ? 46 : 50;
  const btnH = 52; // same as TierCard's button
  const railGap = compact ? 12 : 16;
  const headerH = useRef(0);
  const railH = useRef(0);
  const report = () => {
    if (headerH.current > 0 && railH.current > 0) {
      onMeasured(Math.ceil(pad + headerH.current + railGap + railH.current + MIN_CONNECTOR + btnH + CARD_BOTTOM_PAD + 2));
    }
  };
  const pad = compact ? 18 : 22;

  const practice = mode === 'practice';
  const rows: Row[] = [];
  for (let s = 1; s <= n; s++) {
    const st = cleared.includes(s) ? 'cleared'
      : practice ? 'open'
      : s === 1 || cleared.includes(s - 1) ? 'next' : 'locked';
    rows.push({ step: s as StepNumber, state: st });
  }
  // Segment i joins row i to row i+1 (the last one runs into the button); it
  // lights once the step above is cleared.
  const segLit = rows.map(r => r.state === 'cleared');

  // ── Mount clock: draws once per changed state. ──
  const stateKey = cleared.join(',');
  // Only the card you're looking at draws in; side cards show the final state.
  const clock = useSharedValue(drawnState.get(tier) === stateKey || !active ? END : 0);
  useEffect(() => {
    if (progress == null) return;
    if (!active) { drawnState.set(tier, stateKey); clock.value = END; return; }
    if (drawnState.get(tier) === stateKey) { clock.value = END; return; }
    drawnState.set(tier, stateKey);
    clock.value = 0;
    clock.value = withTiming(END, { duration: END * 1000, easing: Easing.linear });
  }, [active, progress, stateKey, tier, clock]);

  const railStyle = useAnimatedStyle(() => {
    const k = easeOutCubic(seg(clock.value, 0, 0.35));
    return { opacity: k, transform: [{ translateY: (1 - k) * 6 }] };
  });

  const press = (fn: () => void) => () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); fn(); };

  return (
    <View style={{ flex: 1, borderRadius: 26, overflow: 'hidden', backgroundColor: cardBg, borderWidth: 1, borderColor: cardBorder }}>
      {/* Ghost numeral: outlined, decorative only (same as the other tier cards). */}
      <Svg pointerEvents="none" width={230} height={200} style={{ position: 'absolute', right: -8, top: -26 }}>
        <SvgText
          x={222} y={168} textAnchor="end" fontSize={190} fontFamily={WORLD_FONTS.bold} letterSpacing={-4}
          fill="none" stroke={ghostColor} strokeWidth={1.5}
        >
          {String(tier).padStart(2, '0')}
        </SvgText>
      </Svg>
      {/* The trial button is pinned to the card's bottom (same place as the
          other tier cards). Spare height (the carousel is as tall as its
          tallest card, e.g. Arabic tier cards) goes ABOVE the steps, so the
          line from the last step to the button stays short.
          Natural height = header + gap + rail + connector + button. */}
      <View style={{ flex: 1, paddingTop: pad, paddingHorizontal: pad, paddingBottom: CARD_BOTTOM_PAD }}>
      <View onLayout={e => { headerH.current = e.nativeEvent.layout.height; report(); }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={kt('semibold', 11, practice ? t.textMuted : t.accentText, 2.2)}>{tr('strength.cardTier', { tier, max: 9 })}</Text>
          <View style={{ paddingVertical: 3, paddingHorizontal: 9, borderRadius: 7, backgroundColor: chip.bg, borderWidth: practice ? 1 : 0, borderColor: chip.border }}>
            <Text style={kt('bold', 10.5, chip.fg, 1.6)}>{chip.text}</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel={tr('strength.tierDetailsA11y', { name })} disabled={!active} onPress={onShowDetails} style={{ marginTop: compact ? 10 : 14 }}>
          <Text style={kt('bold', compact ? 38 : name.length > 8 ? 40 : 46, t.text, 1.4, compact ? 42 : name.length > 8 ? 44 : 50)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {name}
          </Text>
        </Pressable>

        <Text style={[kt('regular', 12.5, t.textSecondary, 0.2, 18), { marginTop: 8 }]} numberOfLines={1}>{caption}</Text>
      </View>

      <View style={{ flex: 1, minHeight: railGap }} />

        {/* Path rail: one column with the trial button below; the line ends in it. */}
        <Animated.View style={railStyle} onLayout={e => { railH.current = e.nativeEvent.layout.height; report(); }}>
          {rows.map((r, i) => (
            <PathRow
              key={r.step}
              practice={practice}
              p={p} t={t} row={r} tier={tier} progress={progress} rowH={rowH} clock={clock} index={i}
              segLit={segLit[i]} isLast={i === rows.length - 1} active={active}
              onPress={r.state !== 'locked' ? press(() => onStartStep(r.step)) : undefined}
            />
          ))}
        </Animated.View>

      <Animated.View style={railStyle}>
        <Connector p={p} lit={segLit[rows.length - 1]} clock={clock} index={rows.length - 1} />
          <View ref={buttonRef} onLayout={onButtonLayout} collapsable={false} style={{ marginHorizontal: -2 }}>
            <Pressable
              accessibilityRole="button"
              disabled={!active}
              onPress={press(onStartTrial)}
              style={({ pressed }) => ({
                height: btnH, borderRadius: 15, flexDirection: 'row', alignItems: 'center', paddingEnd: 16,
                backgroundColor: allCleared ? (pressed ? t.accentHover : t.accent) : p.btnOutlineFill,
                borderWidth: allCleared ? 0 : 1.5, borderColor: 'rgba(252,84,84,0.55)', opacity: pressed && !allCleared ? 0.85 : 1,
              })}
            >
              <View style={{ width: NODE_COL + 2, alignItems: 'center' }}>
                <SummitIcon color={allCleared ? t.onAccent : p.accentText} size={18} />
              </View>
              {/* textAlign 'left' is the start edge in Arabic too (React Native mirrors it); no
                  auto-fit there, which shrinks aligned single-line text on iOS in RTL. */}
              <Text style={[kt('bold', 14, allCleared ? t.onAccent : p.accentText, 1.4), { flex: 1, marginStart: 14 - 2, textAlign: 'left' }]} numberOfLines={1} adjustsFontSizeToFit={!isRTL} minimumFontScale={0.8}>
                {practice ? tr('strength.practice', { name }) : tr('trialSteps.startTrial', { tier: name })}
              </Text>
              <Svg width={16} height={16} viewBox="0 0 24 24" style={FLIP_X}>
                <Path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke={allCleared ? t.onAccent : p.accentText} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>
      </Animated.View>
      </View>
    </View>
  );
});

const NODE_COL = 34;
/** The lit line (coral, over the 2 pt track). */
const LIT_W = 2.5;
/** The line between the last step row and the trial button. */
const MIN_CONNECTOR = 14;
/** Same bottom padding as TierCard, so the button sits in the same place on every card. */
const CARD_BOTTOM_PAD = 22;

/**
 * The short line from the last step row down to the trial button. Lights once the last step is cleared, drawn on the same beat as that step's segment.
 */
function Connector({ p, lit, clock, index }: {
  p: PT; lit: boolean; clock: SharedValue<number>; index: number;
}) {
  const t0 = 0.15 + index * 0.3;
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: easeInOutCubic(seg(clock.value, t0 + 0.2, t0 + 0.4)) }] }));
  return (
    <View pointerEvents="none" style={{ height: MIN_CONNECTOR }}>
      <View style={{ position: 'absolute', left: NODE_COL / 2 - 1, top: 0, bottom: 0, width: 2, backgroundColor: p.track }} />
      {lit && (
        <Animated.View style={[{ position: 'absolute', left: NODE_COL / 2 - LIT_W / 2, top: 0, bottom: 0, width: LIT_W, backgroundColor: ACC, transformOrigin: 'top' }, fillStyle]} />
      )}
    </View>
  );
}


function PathRow({ practice, p, t, row, tier, progress, rowH, clock, index, segLit, isLast, active, onPress }: {
  practice: boolean; p: PT; t: WorldKitTokens; row: Row; tier: number; progress: StepProgress | null; rowH: number;
  clock: SharedValue<number>; index: number; segLit: boolean; isLast: boolean; active: boolean;
  onPress?: () => void;
}) {
  const isNext = row.state === 'next';
  const textStyle = useAnimatedStyle(() => {
    const k = easeOutCubic(seg(clock.value, 0.1, 0.5));
    return { opacity: k, transform: [{ translateY: (1 - k) * 6 }] };
  });
  const hlStyle = useAnimatedStyle(() => ({ opacity: seg(clock.value, 0.25, 0.6) }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.5 * seg(clock.value, 0.4, 0.9) }));
  // Lit segments draw in order (0.15–0.50, then 0.45–0.80).
  const t0 = 0.15 + index * 0.3;
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: easeInOutCubic(seg(clock.value, t0, t0 + 0.35)) }] }));

  // From 4 pt under this node to 4 pt above the next one, or on into the
  // trial button's top edge (10 pt below the last row).
  const segTop = rowH / 2 + 18;
  const segBottom = isLast ? 0 : -(rowH / 2 - 18);

  const step = getTrialStep(tier, row.step);
  const best = progress?.best[row.step];
  const title = tr('trialSteps.stepN', { n: row.step });
  const sub = step?.movements.slice(0, step.openers).map(m => (m.reps > 1 ? `${m.reps} × ${m.name}` : m.name)).join(' · ');

  const body = (
    <View style={{ height: rowH, flexDirection: 'row', alignItems: 'center' }}>
      {isNext && (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -8, right: -8, top: 3, bottom: 3, borderRadius: 14, backgroundColor: p.hlBg }, hlStyle]} />
      )}
      {/* The line down to the next row (or the trial button). `left` mirrors in Arabic. */}
      <View pointerEvents="none" style={{ position: 'absolute', left: NODE_COL / 2 - 1, top: segTop, bottom: segBottom, width: 2, backgroundColor: p.track }} />
      {segLit && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: NODE_COL / 2 - LIT_W / 2, top: segTop, bottom: segBottom, width: LIT_W, backgroundColor: ACC, transformOrigin: 'top' }, fillStyle]}
        />
      )}
      <View style={{ width: NODE_COL, alignItems: 'center', justifyContent: 'center' }}>
        {isNext && (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 56, height: 56 }, glowStyle]}>
            <Glow size={56} k={p.glowK} />
          </Animated.View>
        )}
        <StepNode p={p} state={row.state === 'open' ? 'next' : row.state} n={row.step} />
      </View>
      <Animated.View style={[{ flex: 1, minWidth: 0, marginStart: 14 }, textStyle]}>
        <Text
          style={kt(row.state === 'cleared' ? 'medium' : 'bold', 13.5, row.state === 'cleared' ? p.t2 : row.state === 'locked' ? p.t5 : t.text, 1)}
          numberOfLines={1}
        >
          {title}
        </Text>
        {!!sub && (
          <Text style={[kt('regular', 11.5, row.state === 'locked' ? p.t5 : p.t4, 0.2), { writingDirection: 'ltr', textAlign: 'left' }]} numberOfLines={1}>
            {ltr(sub)}
          </Text>
        )}
      </Animated.View>
      <Animated.View style={[{ marginStart: 8, alignItems: 'flex-end' }, textStyle]}>
        {row.state === 'cleared' && best != null ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={kt('semibold', 9, p.t4, 1.4)}>{tr('trialSteps.bestLabel')}</Text>
            <Text style={kt('semibold', 14, t.text, 0.4, 17)}>{ltr(formatTime(best))}</Text>
          </View>
        ) : isNext || row.state === 'open' ? (
          <View style={{ height: 26, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.accent, justifyContent: 'center' }}>
            <Text style={kt('bold', 10.5, t.onAccent, 1.4)}>{tr(practice ? 'trialSteps.practice' : 'trialSteps.start')}</Text>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={!active}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      {body}
    </Pressable>
  );
}

function StepNode({ p, state, n }: { p: PT; state: 'locked' | 'next' | 'cleared'; n: number }) {
  const S = 28;
  if (state === 'cleared') {
    return (
      <View style={{ width: S, height: S, borderRadius: S / 2, backgroundColor: ACC, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={14} height={14} viewBox="0 0 24 24"><Path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#ffffff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /></Svg>
      </View>
    );
  }
  if (state === 'next') {
    return (
      <View style={{ width: S, height: S, borderRadius: S / 2, borderWidth: 2, borderColor: ACC, backgroundColor: p.nextTint, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={kt('bold', 13, ACC, 0, 16)}>{n}</Text>
      </View>
    );
  }
  return (
    <View style={{ width: S, height: S, borderRadius: S / 2, borderWidth: 1.5, borderStyle: 'dashed', borderColor: p.nodeDim, backgroundColor: p.dark ? '#0e0909' : '#ffffff', alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={12} height={12} viewBox="0 0 24 24">
        <Path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" fill="none" stroke={p.t5} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function Glow({ size, k }: { size: number; k: number }) {
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="spGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={ACC} stopOpacity={0.55 * k} />
          <Stop offset="1" stopColor={ACC} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#spGlow)" />
    </Svg>
  );
}


function SummitIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 20l6.5-11 3.5 6 2-3.5L21 20z" fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
      <Path d="M9.5 9V4l3 1.2-3 1.2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

