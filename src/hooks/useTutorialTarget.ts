import { useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useTutorial } from '../contexts/TutorialContext';
import { TargetId } from '../types/tutorial';

// How far below the top of the scroll container to land a target once
// scrolled into view — enough clearance that it doesn't sit flush against
// the edge.
const SCROLL_INTO_VIEW_TOP_MARGIN = 100;

// Some siblings above a target (e.g. CommunitySection, which renders
// nothing until its own async fetch resolves) can shift the target's
// position well after this hook's own onLayout/needed-flip measurement —
// re-measuring only once misses that. These are extra follow-up passes,
// not a poll loop.
const SETTLE_REMEASURE_DELAYS_MS = [300, 900];

export function useTutorialTarget(
  targetId: TargetId | undefined,
  scrollRef?: React.RefObject<ScrollView | null>,
  // Android-only quirk: measureInWindow() under-reports y by exactly
  // insets.top (status bar height) for elements outside any ScrollView,
  // like the bottom tab bar — verified by comparing against measure()'s
  // pageX/pageY, which reports the true screen-relative position for those
  // same elements. Elements inside a ScrollView (scrollRef passed above)
  // measure correctly with measureInWindow as-is, so this only opts in
  // fixed, non-scrolling targets like the tab bar into the pageX/pageY path
  // rather than risk changing behavior for everything.
  useScreenMeasure?: boolean
) {
  const { isTargetNeeded, registerTarget, reportInteraction, remeasureNonce } = useTutorial();
  const ref = useRef<View>(null);
  const needed = !!targetId && isTargetNeeded(targetId);

  const measure = useCallback(() => {
    if (!targetId || !isTargetNeeded(targetId)) return;
    const node = ref.current;
    if (!node) return;
    if (useScreenMeasure && Platform.OS === 'android') {
      (node as any).measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
        if (width <= 0 || height <= 0) return;
        registerTarget(targetId, { x: pageX, y: pageY, width, height });
      });
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      registerTarget(targetId, { x, y, width, height });
    });
  }, [isTargetNeeded, registerTarget, targetId, useScreenMeasure]);

  const onLayout = useCallback(() => {
    measure();
    // Layout can settle a frame late (fonts/images/async content) — one
    // extra measure after paint catches those without polling forever.
    requestAnimationFrame(measure);
  }, [measure]);

  // The element may already be mounted but scrolled out of the viewport
  // (e.g. below the fold, or the scroll position was left elsewhere by a
  // prior tab) — measureInWindow would then report an off-screen rect and
  // the ring would never visibly frame anything. Scroll it into view first.
  //
  // measureLayout's first argument must be an actual ref to a native
  // component, not a findNodeHandle() node id — passing a node id logs
  // "ref.measureLayout must be called with a ref to a native component"
  // and silently no-ops without ever calling back.
  const scrollIntoView = useCallback(() => {
    if (!scrollRef?.current || !ref.current) return;
    ref.current.measureLayout(
      scrollRef.current as unknown as React.ComponentRef<typeof View>,
      (_x: number, y: number) => {
        scrollRef?.current?.scrollTo({ y: Math.max(0, y - SCROLL_INTO_VIEW_TOP_MARGIN), animated: false });
        requestAnimationFrame(measure);
      },
      () => {}
    );
  }, [scrollRef, measure]);

  // onLayout only fires on a real native layout event — for elements that
  // are already mounted on screen before the tutorial starts (e.g. the
  // profile/strength tab, which exists well before the tutorial activates),
  // that event already happened once and never fires again just because
  // this target becomes "needed" later. Re-measure whenever that flips.
  useEffect(() => {
    if (!needed) return;
    scrollIntoView();
    measure();
    // A sibling above this target can still be loading (e.g. an
    // async-fetched section that renders nothing until it resolves) and
    // shift this target further down the page after the passes above —
    // catch that without polling indefinitely.
    const timers = SETTLE_REMEASURE_DELAYS_MS.map((delay) => setTimeout(measure, delay));
    return () => timers.forEach(clearTimeout);
  }, [needed, measure, scrollIntoView]);

  // Precise version of the same problem: a known async section (e.g.
  // CommunitySection) calls requestRemeasure() the moment it actually
  // finishes loading and may have shifted this target — re-measure right
  // then instead of guessing how long it'll take.
  useEffect(() => {
    if (needed) measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remeasureNonce]);

  // For "real" steps, call this inside the element's own onPress alongside
  // its normal logic — it's a no-op unless this target is the currently
  // active real-mode step, in which case it advances the tour.
  const report = useCallback(() => {
    if (targetId) reportInteraction(targetId);
  }, [reportInteraction, targetId]);

  return { ref, onLayout, reportInteraction: report };
}
