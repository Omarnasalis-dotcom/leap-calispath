import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { TOURS } from '../components/tutorial/tutorialSteps';
import { Rect, TargetId, TourId, TutorialStep } from '../types/tutorial';

// Optional steps: how long to wait for the target to mount at all (covers a
// screen transition that's still landing), then how long a mounted target
// gets to produce a real measurement before the step is skipped.
const OPTIONAL_MOUNT_GRACE_MS = 500;
const OPTIONAL_MEASURE_GRACE_MS = 2500;

interface TutorialContextType {
  active: boolean;
  tourId: TourId;
  stepIndex: number;
  totalSteps: number;
  currentStep: TutorialStep;
  targets: Record<string, Rect | null>;
  // Bumped whenever something that isn't itself a tutorial target (e.g. an
  // async section loading in above one) finishes and may have shifted
  // other elements' positions — useTutorialTarget re-measures whenever
  // this changes, on top of its own layout-driven measurement.
  remeasureNonce: number;
  isTargetNeeded: (id: TargetId) => boolean;
  registerTarget: (id: TargetId, rect: Rect | null) => void;
  // Mount/unmount bookkeeping for every target, needed or not — lets an
  // optional step tell "not on this screen at all" (skip right away) from
  // "on screen but still measuring" (give it a moment).
  setTargetMounted: (id: TargetId, mounted: boolean) => void;
  reportInteraction: (id: TargetId) => void;
  requestRemeasure: () => void;
  start: (tourId?: TourId) => void;
  next: () => void;
  skip: () => void;
  dismiss: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [tourId, setTourId] = useState<TourId>('main');
  const [stepIndex, setStepIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, Rect | null>>({});
  const [remeasureNonce, setRemeasureNonce] = useState(0);
  const requestRemeasure = useCallback(() => setRemeasureNonce((n) => n + 1), []);
  // Refs, not state: read only from timers, never rendered.
  const mountedTargetsRef = useRef<Map<TargetId, number>>(new Map());
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const steps = TOURS[tourId];
  const currentStep = steps[stepIndex];

  const dismiss = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    setTargets({});
  }, []);

  const start = useCallback((nextTourId: TourId = 'main') => {
    setTourId(nextTourId);
    setTargets({});
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        dismiss();
        return i;
      }
      return i + 1;
    });
  }, [dismiss, steps]);

  const registerTarget = useCallback((id: TargetId, rect: Rect | null) => {
    setTargets((prev) => ({ ...prev, [id]: rect }));
  }, []);

  // Counted, not a Set: the same id can briefly be mounted twice (e.g. an
  // old screen unmounting while its replacement mounts).
  const setTargetMounted = useCallback((id: TargetId, mounted: boolean) => {
    const counts = mountedTargetsRef.current;
    const n = (counts.get(id) ?? 0) + (mounted ? 1 : -1);
    if (n > 0) counts.set(id, n);
    else counts.delete(id);
  }, []);

  const isTargetNeeded = useCallback(
    (id: TargetId) => active && currentStep.targetId === id,
    [active, currentStep]
  );

  const reportInteraction = useCallback(
    (id: TargetId) => {
      if (active && currentStep.targetId === id && currentStep.mode === 'real') {
        next();
      }
    },
    [active, currentStep, next]
  );

  // Optional steps skip themselves when their target isn't there — see
  // TutorialStep.optional.
  useEffect(() => {
    if (!active || !currentStep.optional) return;
    const id = currentStep.targetId;
    const mountTimer = setTimeout(() => {
      if (!mountedTargetsRef.current.has(id)) next();
    }, OPTIONAL_MOUNT_GRACE_MS);
    const measureTimer = setTimeout(() => {
      if (!targetsRef.current[id]) next();
    }, OPTIONAL_MEASURE_GRACE_MS);
    return () => {
      clearTimeout(mountTimer);
      clearTimeout(measureTimer);
    };
  }, [active, tourId, stepIndex, currentStep, next]);

  // Real steps cause their own navigation when tapped — some of them chain
  // through an async check before landing (MY WORKOUT PROGRAM routes through
  // a screen that queries for an existing assignment before redirecting),
  // which can take longer than any fixed timing window depending on network
  // speed. Rather than guess "was this navigation expected?" from timing
  // (which false-positived on exactly that chain under a slow connection),
  // listen for the one concrete signal that means the user left on their
  // own: Android's hardware back button. Don't intercept it — just end the
  // tour alongside whatever the button already does.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return false;
    });
    return () => sub.remove();
  }, [active, dismiss]);

  const value: TutorialContextType = {
    active,
    tourId,
    stepIndex,
    totalSteps: steps.length,
    currentStep,
    targets,
    remeasureNonce,
    isTargetNeeded,
    registerTarget,
    setTargetMounted,
    reportInteraction,
    requestRemeasure,
    start,
    next,
    skip: dismiss,
    dismiss,
  };

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorial() {
  const context = useContext(TutorialContext);
  if (context === undefined) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
}
