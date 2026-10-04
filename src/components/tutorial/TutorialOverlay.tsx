import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Mask, Rect } from 'react-native-svg';
import { useTutorial } from '../../contexts/TutorialContext';
import { useTheme } from '../../contexts/ThemeContext';
import { HighlightRing } from './HighlightRing';
import { TapDot } from './TapDot';
import { TutorialCaption } from './TutorialCaption';
import { TutorialDots } from './TutorialDots';
import { TargetId } from '../../types/tutorial';
import { t, physicalLeft } from '../../i18n';

const ACCENT = '#FF5252';
const RING_PAD = 6;
const DIM_OPACITY = 0.68;
// Light mode dims less (same as WelcomeTourCard's 0.45 backdrop), so the
// screen still reads as the light app behind the highlight.
const DIM_OPACITY_LIGHT = 0.45;
const CHROME_CLEARANCE = 20;
// How tall the caption card is assumed to be until it has measured itself
// (first frame of each step). The real, measured height is used after that
// -- the old fixed 240 overestimated the ~190pt card, so a tall highlight
// (e.g. the WRA top entries) found "no room" on either side and the card
// fell back to the bottom, right on top of the highlight.
const ESTIMATED_CHROME_HEIGHT = 240;

// RN's <Modal> renders its content in a separate native layer, entirely
// outside the normal view tree — the global overlay below (mounted above
// the Stack) can never visually cover or gate touches on anything inside
// one. Steps whose target lives inside a Modal are rendered instead by a
// <TutorialModalOverlay> mounted directly inside that modal's own content
// (see LeaderboardModals.tsx, OneMinMaxScreen.tsx) — this set is what tells
// the global overlay to stand down for those steps so the two don't both
// try to render (invisibly, behind the modal) at once.
const MODAL_HOSTED_TARGETS = new Set<TargetId>([
  'wra.topEntries',
  'wra.closeButton',
  'onemm.startSprintButton',
  'onemm.timerCloseButton',
]);

export function TutorialOverlay() {
  const { active, currentStep: step } = useTutorial();
  if (!active) return null;
  if (MODAL_HOSTED_TARGETS.has(step.targetId)) return null;
  return <TutorialStepOverlayContent />;
}

// Mount this inside any <Modal>'s own content (as its last child, so it
// renders on top of the modal's own UI) to gate the steps whose target
// lives inside that modal — same visuals/behavior as the global overlay,
// just scoped to fire only for the target ids this modal owns.
export function TutorialModalOverlay({ targetIds }: { targetIds: TargetId[] }) {
  const { active, currentStep: step } = useTutorial();
  if (!active) return null;
  if (!targetIds.includes(step.targetId)) return null;
  return <TutorialStepOverlayContent />;
}

function TutorialStepOverlayContent() {
  const { stepIndex, totalSteps, currentStep: step, targets, next, advance, skip } = useTutorial();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLight = useTheme().mode === 'light';
  const [chromeHeight, setChromeHeight] = useState(ESTIMATED_CHROME_HEIGHT);

  const rect = targets[step.targetId] ?? null;
  const ready = !!rect;
  const isDecoy = step.mode === 'decoy';
  const isLast = stepIndex === totalSteps - 1;

  // The box the ring/hole sits in — matches HighlightRing's own padding math.
  const box = ready
    ? {
        left: rect!.x - RING_PAD,
        top: rect!.y - RING_PAD,
        width: rect!.width + RING_PAD * 2,
        height: rect!.height + RING_PAD * 2,
      }
    : null;

  // Anchor the caption/dots right next to whatever's highlighted — directly
  // below it if there's room, directly above it if not, and only falls
  // back to a fixed bottom-pinned position when neither side has enough
  // space (e.g. before the target has measured, or a highlight tall enough
  // to leave no good spot on either side).
  const defaultChromeBottom = insets.bottom + CHROME_CLEARANCE;
  const neededSpace = chromeHeight + CHROME_CLEARANCE;
  const spaceBelow = ready ? height - (box!.top + box!.height) - insets.bottom : 0;
  const spaceAbove = ready ? box!.top - insets.top : 0;
  const chromeStyle: { top?: number; bottom?: number } =
    ready && spaceBelow >= neededSpace
      ? { top: box!.top + box!.height + CHROME_CLEARANCE }
      : ready && spaceAbove >= neededSpace
      ? { bottom: height - box!.top + CHROME_CLEARANCE }
      : { bottom: defaultChromeBottom };

  return (
    // box-none: this full-screen container must not itself swallow touches
    // over the "hole" left for real-mode steps — a plain View spanning the
    // screen intercepts everything in its bounds by default even where it
    // has no child there. Each blocking piece below (frame strips, decoy
    // cover, skip button) still captures touches normally on its own.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Purely visual dim + cutout — wrapped in a plain View with
          pointerEvents="none" rather than relying on that prop on <Svg>
          itself, since react-native-svg's root doesn't reliably honor it —
          a plain View is guaranteed to. The frame strips below (or the
          full-screen block, before the target is measured) are what
          actually block interaction. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Mask id="tutorialDimMask">
            <Rect x={0} y={0} width={width} height={height} fill="white" />
            {box && (
              <Rect x={box.left} y={box.top} width={box.width} height={box.height} rx={16} ry={16} fill="black" />
            )}
          </Mask>
          <Rect x={0} y={0} width={width} height={height} fill="black" fillOpacity={isLight ? DIM_OPACITY_LIGHT : DIM_OPACITY} mask="url(#tutorialDimMask)" />
        </Svg>
      </View>

      {!box ? (
        // Target not measured yet — block everything so nothing is
        // interactive until we know where to leave a hole open.
        <View style={StyleSheet.absoluteFill} />
      ) : (
        <>
          {/* Four strips framing the highlighted box — block touches
              everywhere outside it. The box itself is left open for "real"
              steps (the tap reaches the actual element beneath), or gets a
              5th, tappable cover below for "decoy" steps. */}
          <View style={{ position: 'absolute', left: 0, top: 0, width, height: box.top }} />
          <View style={{ position: 'absolute', left: 0, top: box.top + box.height, width, height: height - (box.top + box.height) }} />
          <View style={{ position: 'absolute', left: physicalLeft(0, box.left, width), top: box.top, width: box.left, height: box.height }} />
          <View style={{ position: 'absolute', left: physicalLeft(box.left + box.width, width - (box.left + box.width), width), top: box.top, width: width - (box.left + box.width), height: box.height }} />

          <HighlightRing rect={rect!} />
          {isDecoy && <TapDot rect={rect!} />}

          {isDecoy && (
            <TouchableOpacity
              onPress={next}
              activeOpacity={1}
              style={{ position: 'absolute', left: physicalLeft(box.left, box.width, width), top: box.top, width: box.width, height: box.height, borderRadius: 16 }}
            />
          )}
        </>
      )}

      {/* Chrome (caption/dots) renders immediately every step regardless of
          measurement state, so slower-loading screens never leave the user
          staring at a bare dimmed screen with no feedback.

          Wrapped in one opaque card (rather than each piece carrying its
          own, or none) because "below the target" can still land on real
          page content further down a dense scrollable screen (e.g. a step
          targeting something near the top of Profile) — the global dim
          mask alone doesn't fully hide bright text/numbers under it, so
          without a solid backing that content visibly bled through the
          gaps around the dots and button. */}
      <View
        style={[styles.bottomChrome, chromeStyle]}
        onLayout={(e) => {
          const h = Math.ceil(e.nativeEvent.layout.height);
          if (Math.abs(h - chromeHeight) > 1) setChromeHeight(h);
        }}
      >
        <BlurView intensity={30} tint={isLight ? 'light' : 'dark'} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={isLight ? ['rgba(255,255,255,0.97)', 'rgba(255,248,247,0.97)'] : ['rgba(20,10,10,0.94)', 'rgba(10,6,6,0.94)']}
          style={StyleSheet.absoluteFill}
        />
        <TutorialCaption
          stepIndex={stepIndex}
          tag={t('tour.stepOf', { n: stepIndex + 1, total: totalSteps })}
          caption={step.caption}
          isLight={isLight}
        />
        <TutorialDots total={totalSteps} activeIndex={stepIndex} isLight={isLight} />
        {/* Skip lives here, beside Next, rather than floating in the top
            corner: there it sat on top of the dimmed screen (often right
            over the highlighted header buttons) and was hard to see. This
            card always positions itself clear of the highlight. */}
        {/* Next on every step. On a real step it does what tapping the
            highlighted element does (see TutorialContext.advance). */}
        <View style={styles.navRow}>
          {!isLast && (
            <TouchableOpacity style={[styles.skipBtn, isLight && styles.skipBtnLight]} onPress={skip} activeOpacity={0.8} accessibilityRole="button">
              <Text style={[styles.skipText, isLight && styles.skipTextLight]}>{t('tour.skip')}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.nextBtn} onPress={isDecoy ? next : advance} activeOpacity={0.85} accessibilityRole="button">
            <Text style={styles.nextText}>{isLast ? t('tour.gotIt') : t('tour.next')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Secondary to Next: outlined, same height, on the card's dark backing.
  skipBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  skipText: {
    color: '#E6E6E6',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1.2,
  },
  skipBtnLight: { borderColor: 'rgba(0,0,0,0.2)' },
  skipTextLight: { color: '#3A3A3C' },
  bottomChrome: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,82,82,0.28)',
    paddingVertical: 18,
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
  },
  nextBtn: {
    paddingHorizontal: 36,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  nextText: {
    color: '#150404',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1.2,
  },
});
