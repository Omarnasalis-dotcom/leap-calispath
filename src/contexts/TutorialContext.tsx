import React, { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { TUTORIAL_STEPS } from '../components/tutorial/tutorialSteps';
import { Rect, TargetId, TutorialStep } from '../types/tutorial';

interface TutorialContextType {
  active: boolean;
  stepIndex: number;
  totalSteps: number;
  currentStep: TutorialStep;
  targets: Record<string, Rect | null>;
  // Bumped whenever something that isn't itself a tutorial target (e.g. an
  // async section loading in above one) finishes and may have shifted
  // other elements' positions — useTutorialTarget re-measures whenever
  // this changes, on top of its own layout-driven measurement.
  remeasureNonce: number;
  // Set when the tour (started with showObjectiveAfter) finishes — read
  // this from ProfileScreen instead of tracking the active→inactive
  // transition locally: the tour navigates through several other routes,
  // unmounting/remounting ProfileScreen along the way, so any local ref
  // tracking "was active a moment ago" is wiped out before the tour
  // actually ends. This flag lives here, at the root, so it survives that.
  pendingObjective: boolean;
  clearPendingObjective: () => void;
  isTargetNeeded: (id: TargetId) => boolean;
  registerTarget: (id: TargetId, rect: Rect | null) => void;
  reportInteraction: (id: TargetId) => void;
  requestRemeasure: () => void;
  start: (options?: { showObjectiveAfter?: boolean }) => void;
  next: () => void;
  skip: () => void;
  dismiss: () => void;
}

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targets, setTargets] = useState<Record<string, Rect | null>>({});
  const [remeasureNonce, setRemeasureNonce] = useState(0);
  const requestRemeasure = useCallback(() => setRemeasureNonce((n) => n + 1), []);
  const [pendingObjective, setPendingObjective] = useState(false);
  const clearPendingObjective = useCallback(() => setPendingObjective(false), []);
  const showObjectiveAfterRef = useRef(false);

  const currentStep = TUTORIAL_STEPS[stepIndex];

  const dismiss = useCallback(() => {
    setActive(false);
    setStepIndex(0);
    setTargets({});
    if (showObjectiveAfterRef.current) {
      showObjectiveAfterRef.current = false;
      setPendingObjective(true);
    }
  }, []);

  const start = useCallback((options?: { showObjectiveAfter?: boolean }) => {
    showObjectiveAfterRef.current = !!options?.showObjectiveAfter;
    setTargets({});
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((i) => {
      if (i >= TUTORIAL_STEPS.length - 1) {
        dismiss();
        return i;
      }
      return i + 1;
    });
  }, [dismiss]);

  const registerTarget = useCallback((id: TargetId, rect: Rect | null) => {
    setTargets((prev) => ({ ...prev, [id]: rect }));
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
    stepIndex,
    totalSteps: TUTORIAL_STEPS.length,
    currentStep,
    targets,
    remeasureNonce,
    pendingObjective,
    clearPendingObjective,
    isTargetNeeded,
    registerTarget,
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
