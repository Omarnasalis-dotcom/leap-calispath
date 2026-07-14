import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Mask, Rect } from 'react-native-svg';
import { useTutorial } from '../../contexts/TutorialContext';
import { TUTORIAL_STEPS } from './tutorialSteps';
import { HighlightRing } from './HighlightRing';
import { TapDot } from './TapDot';
import { TutorialCaption } from './TutorialCaption';
import { TutorialDots } from './TutorialDots';
import { TargetId } from '../../types/tutorial';

const ACCENT = '#FF5252';
const RING_PAD = 6;
const DIM_OPACITY = 0.68;
const CHROME_CLEARANCE = 20;
// Rough ceiling on how tall the bottom chrome (caption + dots [+ nav row])
// ever gets — used only to decide whether a highlight sits low enough on
// screen to need the chrome pushed up above it, not for exact layout.
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
  const { active, stepIndex } = useTutorial();
  if (!active) return null;
  const step = TUTORIAL_STEPS[stepIndex];
  if (MODAL_HOSTED_TARGETS.has(step.targetId)) return null;
  return <TutorialStepOverlayContent />;
}

// Mount this inside any <Modal>'s own content (as its last child, so it
// renders on top of the modal's own UI) to gate the steps whose target
// lives inside that modal — same visuals/behavior as the global overlay,
// just scoped to fire only for the target ids this modal owns.
export function TutorialModalOverlay({ targetIds }: { targetIds: TargetId[] }) {
  const { active, stepIndex } = useTutorial();
  if (!active) return null;
  const step = TUTORIAL_STEPS[stepIndex];
  if (!targetIds.includes(step.targetId)) return null;
  return <TutorialStepOverlayContent />;
}

function TutorialStepOverlayContent() {
  const { stepIndex, totalSteps, targets, next, skip } = useTutorial();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const step = TUTORIAL_STEPS[stepIndex];
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
  const neededSpace = ESTIMATED_CHROME_HEIGHT + CHROME_CLEARANCE;
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
          <Rect x={0} y={0} width={width} height={height} fill="black" fillOpacity={DIM_OPACITY} mask="url(#tutorialDimMask)" />
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
          <View style={{ position: 'absolute', left: 0, top: box.top, width: box.left, height: box.height }} />
          <View style={{ position: 'absolute', left: box.left + box.width, top: box.top, width: width - (box.left + box.width), height: box.height }} />

          <HighlightRing rect={rect!} />
          {isDecoy && <TapDot rect={rect!} />}

          {isDecoy && (
            <TouchableOpacity
              onPress={next}
              activeOpacity={1}
              style={{ position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, borderRadius: 16 }}
            />
          )}
        </>
      )}

      <TouchableOpacity
        style={[styles.skipBtn, { top: insets.top + 16 }]}
        onPress={skip}
        activeOpacity={0.8}
      >
        <Text style={styles.skipText}>SKIP</Text>
      </TouchableOpacity>

      {/* Chrome (caption/dots) renders immediately every step regardless of
          measurement state, so slower-loading screens never leave the user
          staring at a bare dimmed screen with no feedback. */}
      <View style={[styles.bottomChrome, chromeStyle]} pointerEvents="box-none">
        <TutorialCaption stepIndex={stepIndex} tag={step.tag} caption={step.caption} />
        <TutorialDots total={totalSteps} activeIndex={stepIndex} />
        {isDecoy && (
          <View style={styles.navRow}>
            <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
              <Text style={styles.nextText}>{isLast ? 'GOT IT' : 'NEXT'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skipBtn: {
    position: 'absolute',
    left: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    zIndex: 20,
  },
  skipText: {
    color: '#C9C9C9',
    fontSize: 11,
    fontFamily: 'PlusJakartaSans-ExtraBold',
    letterSpacing: 1,
  },
  bottomChrome: {
    position: 'absolute',
    left: 20,
    right: 20,
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
