import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { SoundServiceInstance } from '../lib/SoundService';
import { advanceIntervals, upcomingBoundaries } from '../lib/intervalClock';
import { useBackgroundTimerAlerts, TimerAlert } from './useBackgroundTimerAlerts';
import { t } from '../i18n';

export interface ProgramBlockParams {
  id: string | number;
  metadata?: any;
  exercises?: unknown[];
}

interface UseWarriorTimerProps {
  onAmrapComplete: (blockId: string | number, roundsCompleted: number) => void;
  onForTimeComplete: (blockId: string | number, elapsedSeconds: number) => void;
  onTabataComplete?: (blockId: string | number, roundsCompleted: number, holdTimes: TabataHold[]) => void;
}

/** A hold logged during a Tabata interval, on that interval's exercise. */
export interface TabataHold {
  exerciseId: string | number | null;
  seconds: number;
}

export function useWarriorTimer({ onAmrapComplete, onForTimeComplete, onTabataComplete }: UseWarriorTimerProps) {
  const [activeTimerBlockId, setActiveTimerBlockId] = useState<string | number | null>(null);
  const [timerType, setTimerType] = useState<'amrap' | 'fortime' | 'rest' | 'tabata' | null>(null);
  const [tabataPhase, setTabataPhase] = useState<'work' | 'rest'>('work');
  const [tabataWorkSecs, setTabataWorkSecs] = useState(20);
  const [tabataRestSecs, setTabataRestSecs] = useState(10);
  // Tabata runs every exercise once per round, one work interval each, so
  // currentRound/totalRounds count work intervals (rounds × exercises).
  // Mirrored into a ref for the tick effect's completion callback.
  const [tabataExerciseCount, setTabataExerciseCount] = useState(1);
  const tabataExerciseCountRef = useRef(1);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [timerModalVisible, setTimerModalVisible] = useState<boolean>(false);
  const [timerPrepCountdown, setTimerPrepCountdown] = useState<number | null>(null);

  const [currentRound, setCurrentRound] = useState<number>(1);
  const [totalRounds, setTotalRounds] = useState<number>(1);
  const [restSeconds, setRestSeconds] = useState<number>(0);
  const [timeCapSecs, setTimeCapSecs] = useState<number>(0);

  // AMRAP round counting — distinct from currentRound/totalRounds (which
  // drive Tabata/rest cycling): AMRAP has no fixed round count, the warrior
  // just taps +1 for each completed round as they go. Mirrored into a ref so
  // the tick effect's completion callback (set up once per timer, not
  // re-subscribed on every tap) reads the latest count rather than a stale one.
  const [amrapRoundsCompleted, setAmrapRoundsCompleted] = useState<number>(0);
  const amrapRoundsRef = useRef(0);

  const logRound = useCallback(() => {
    setAmrapRoundsCompleted(prev => {
      const next = prev + 1;
      amrapRoundsRef.current = next;
      return next;
    });
  }, []);

  // Tabata best-hold tracking, one entry appended per round for hold/skill exercises.
  // Mirrored into a ref for the same stale-closure reason as amrapRoundsRef.
  // Each hold carries the exercise it was done on, so it's saved against it.
  const [holdTimes, setHoldTimes] = useState<TabataHold[]>([]);
  const holdTimesRef = useRef<TabataHold[]>([]);

  const logHoldTime = useCallback((seconds: number, exerciseId: string | number | null = null) => {
    setHoldTimes(prev => {
      const next = [...prev, { exerciseId, seconds }];
      holdTimesRef.current = next;
      return next;
    });
  }, []);

  // Timer completions are detected inside setState updaters (the tick
  // effects below), which run during this hook's own render — calling
  // onAmrapComplete/onForTimeComplete directly from there would update the
  // parent component's state while this one is still rendering. Recording
  // the completion as local state and firing the actual callback from an
  // effect defers it until after render commits, which is safe.
  const [completionEvent, setCompletionEvent] = useState<
    | { type: 'amrap'; blockId: string | number; roundsCompleted?: number }
    | { type: 'fortime'; blockId: string | number; elapsedSeconds: number }
    | { type: 'tabata'; blockId: string | number; roundsCompleted: number; holdTimes: TabataHold[] }
    | null
  >(null);


  useEffect(() => {
    if (!completionEvent) return;
    if (completionEvent.type === 'amrap') {
      onAmrapComplete(completionEvent.blockId, completionEvent.roundsCompleted ?? 0);
    } else if (completionEvent.type === 'tabata') {
      onTabataComplete?.(completionEvent.blockId, completionEvent.roundsCompleted, completionEvent.holdTimes);
    } else {
      onForTimeComplete(completionEvent.blockId, completionEvent.elapsedSeconds);
    }
    setCompletionEvent(null);
  }, [completionEvent, onAmrapComplete, onForTimeComplete, onTabataComplete]);

  // Latest timer state for the AppState handler and the background alerts
  // (both run outside a render, so they read this instead of stale closures).
  const prepEndRef = useRef<number | null>(null);
  const live = {
    timerType, timeLeft, elapsedTime, tabataPhase, currentRound, totalRounds, restSeconds,
    timeCapSecs, tabataWorkSecs, tabataRestSecs, timerRunning, timerPrepCountdown, activeTimerBlockId,
  };
  const liveRef = useRef(live);
  liveRef.current = live;

  // Tabata as one run of intervals: work, rest, work, rest… (one work
  // interval per exercise per round), ending on the last work: no rest after
  // it, the block is done. Position = (interval index, seconds left).
  const tabataDurations = (l: typeof live) =>
    Array.from({ length: Math.max(1, l.totalRounds * 2 - 1) }, (_, i) => (i % 2 === 0 ? l.tabataWorkSecs : l.tabataRestSecs));
  const tabataIndex = (l: typeof live) => (l.currentRound - 1) * 2 + (l.tabataPhase === 'rest' ? 1 : 0);

  // Wall-clock timing. Every running timer is measured from when it
  // (re)started: `run` holds that moment and the timer's state then, and
  // each sync recomputes the current state from the clock. Counting ticks
  // (prev - 1) lost the time the app spent in the background — on iOS the
  // overdue tick can even fire before the AppState event on return.
  const runRef = useRef<{ startedAt: number; timeLeft: number; elapsed: number; index: number; lastIndex: number } | null>(null);
  // When a get-ready that ended in the background really ended: the run
  // starts from then, not from the return.
  const pendingStartAtRef = useRef<number | null>(null);

  const syncRunning = () => {
    const run = runRef.current;
    const l = liveRef.current;
    if (!run || !l.timerRunning) return;
    const secs = Math.max(0, Math.floor((Date.now() - run.startedAt) / 1000));

    if (l.timerType === 'amrap' || l.timerType === 'rest') {
      const left = run.timeLeft - secs;
      if (left > 0) {
        setTimeLeft(left);
        return;
      }
      runRef.current = null;
      setTimeLeft(0);
      setTimerRunning(false);
      if (l.timerType === 'rest') {
        SoundServiceInstance.playDigitalBuzzer(4);
        if (l.currentRound < l.totalRounds) setTimeout(() => setTimeLeft(l.restSeconds), 100);
      } else {
        SoundServiceInstance.playDigitalBuzzer();
        if (l.activeTimerBlockId) {
          setCompletionEvent({ type: 'amrap', blockId: l.activeTimerBlockId, roundsCompleted: amrapRoundsRef.current });
        }
      }
    } else if (l.timerType === 'fortime') {
      const elapsed = run.elapsed + secs;
      if (l.timeCapSecs > 0 && elapsed >= l.timeCapSecs) {
        runRef.current = null;
        setElapsedTime(l.timeCapSecs);
        setTimerRunning(false);
        SoundServiceInstance.playDigitalBuzzer();
        if (l.activeTimerBlockId) {
          setCompletionEvent({ type: 'fortime', blockId: l.activeTimerBlockId, elapsedSeconds: l.timeCapSecs });
        }
        return;
      }
      setElapsedTime(elapsed);
    } else if (l.timerType === 'tabata') {
      const pos = advanceIntervals(tabataDurations(l), run.index, run.timeLeft, secs);
      if (pos.done) {
        runRef.current = null;
        setTimeLeft(0);
        setTimerRunning(false);
        SoundServiceInstance.playDigitalBuzzer(4);
        if (l.activeTimerBlockId) {
          setCompletionEvent({
            type: 'tabata',
            blockId: l.activeTimerBlockId,
            roundsCompleted: Math.floor(l.totalRounds / tabataExerciseCountRef.current),
            holdTimes: holdTimesRef.current,
          });
        }
        return;
      }
      if (pos.index !== run.lastIndex) {
        // One cue per switch, even if several passed in the background.
        if (pos.index % 2 === 0) SoundServiceInstance.playBoxingBell();
        else SoundServiceInstance.playDigitalBuzzer(2);
        run.lastIndex = pos.index;
        setCurrentRound(Math.floor(pos.index / 2) + 1);
        setTabataPhase(pos.index % 2 === 0 ? 'work' : 'rest');
      }
      setTimeLeft(pos.left);
    }
  };

  // Get-ready countdown, from its end time (prepEndRef). When it ends the
  // timer starts from that moment.
  const syncPrep = () => {
    const end = prepEndRef.current;
    if (end === null || liveRef.current.timerPrepCountdown === null) return;
    const remaining = Math.ceil((end - Date.now()) / 1000);
    if (remaining <= 0) {
      prepEndRef.current = null;
      pendingStartAtRef.current = end;
      SoundServiceInstance.playBoxingBell();
      setTimerPrepCountdown(null);
      setTimerRunning(true);
      return;
    }
    if (remaining !== liveRef.current.timerPrepCountdown) {
      SoundServiceInstance.playTick();
      setTimerPrepCountdown(remaining);
    }
  };

  // Back in the foreground: catch up straight away (the intervals below do
  // the same on their next tick).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState !== 'active') return;
      syncPrep();
      syncRunning();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Alerts for a backgrounded app — finishes only: rest over, AMRAP end,
  // For Time cap, Tabata complete (a get-ready still running delays them).
  useBackgroundTimerAlerts(() => {
    const l = liveRef.current;
    const now = Date.now();
    const alerts: TimerAlert[] = [];
    let offset = 0;
    if (l.timerPrepCountdown !== null && prepEndRef.current !== null) {
      offset = Math.max(0, (prepEndRef.current - now) / 1000);
    } else if (!l.timerRunning) {
      return [];
    }
    if (l.timerType === 'rest') {
      alerts.push({ inSeconds: offset + l.timeLeft, title: t('timerAlerts.restOver'), body: t('timerAlerts.restOverBody') });
    } else if (l.timerType === 'amrap') {
      alerts.push({ inSeconds: offset + l.timeLeft, title: t('timerAlerts.timeUp'), body: t('timerAlerts.amrapDoneBody') });
    } else if (l.timerType === 'fortime' && l.timeCapSecs > 0) {
      alerts.push({ inSeconds: offset + l.timeCapSecs - l.elapsedTime, title: t('timerAlerts.capReached'), body: t('timerAlerts.capReachedBody') });
    } else if (l.timerType === 'tabata') {
      const durations = tabataDurations(l);
      const end = upcomingBoundaries(durations, tabataIndex(l), l.timeLeft, offset, durations.length + 1).pop();
      if (end) alerts.push({ inSeconds: end.inSeconds, title: t('timerAlerts.workoutDone'), body: t('timerAlerts.workoutDoneBody') });
    }
    return alerts;
  });

  // Get-ready countdown.
  const prepActive = timerPrepCountdown !== null;
  useEffect(() => {
    if (!prepActive) return;
    if (prepEndRef.current === null || timerPrepCountdown === 0) {
      // Started without an end time (or skipped to 0): start now.
      prepEndRef.current = null;
      setTimerPrepCountdown(null);
      setTimerRunning(true);
      return;
    }
    SoundServiceInstance.playTick();
    const interval = setInterval(syncPrep, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepActive]);

  // Running timer: (re)based on the clock whenever it starts or resumes.
  useEffect(() => {
    if (!timerRunning) {
      runRef.current = null;
      return;
    }
    const l = liveRef.current;
    const startedAt = pendingStartAtRef.current ?? Date.now();
    pendingStartAtRef.current = null;
    const index = l.timerType === 'tabata' ? tabataIndex(l) : 0;
    runRef.current = { startedAt, timeLeft: l.timeLeft, elapsed: l.elapsedTime, index, lastIndex: index };
    syncRunning();
    const interval = setInterval(syncRunning, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, timerType]);

  // Cleanup when modal closes
  useEffect(() => {
    if (!timerModalVisible) {
      setTimerPrepCountdown(null);
      setTimerRunning(false);
    }
  }, [timerModalVisible]);

  const startTimerForBlock = useCallback((block: ProgramBlockParams) => {
    setActiveTimerBlockId(block.id);
    const metaType = block.metadata?.timing_system || block.metadata?.type;
    const structure = block.metadata?.structure || block.metadata?.type;

    setAmrapRoundsCompleted(0);
    amrapRoundsRef.current = 0;
    setHoldTimes([]);

    let tr = 1;
    if (block.metadata?.rounds) {
      tr = parseInt(String(block.metadata.rounds), 10);
      if (isNaN(tr) || tr < 1) tr = 1;
    }
    setTotalRounds(tr);
    setCurrentRound(0); // Starts at 0, meaning hasn't finished round 1 yet
    
    if (metaType === 'amrap') {
      setTimerType('amrap');
      const min = parseInt(String(block.metadata?.time_cap_min || block.metadata?.timer_seconds || '10'), 10);
      setTimeLeft(min * 60);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      prepEndRef.current = Date.now() + 5000;
      setTimerModalVisible(true);
    } else if (metaType === 'fortime') {
      setTimerType('fortime');
      setElapsedTime(0);
      const capMin = parseInt(String(block.metadata?.time_cap_min || '15'), 10);
      setTimeCapSecs(capMin * 60);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      prepEndRef.current = Date.now() + 5000;
      setTimerModalVisible(true);
    } else if (metaType === 'tabata') {
      setTimerType('tabata');
      const workSec = parseInt(String(block.metadata?.tabata_work_seconds || '20'), 10);
      const restSec = parseInt(String(block.metadata?.tabata_rest_seconds || '10'), 10);
      const tabRounds = parseInt(String(block.metadata?.tabata_rounds || '8'), 10);
      const exerciseCount = Math.max(block.exercises?.length ?? 0, 1);
      setTabataWorkSecs(workSec);
      setTabataRestSecs(restSec);
      setTabataExerciseCount(exerciseCount);
      tabataExerciseCountRef.current = exerciseCount;
      setTotalRounds(tabRounds * exerciseCount);
      setCurrentRound(1);
      setTabataPhase('work');
      setTimeLeft(workSec);
      setTimerRunning(false);
      setTimerPrepCountdown(5);
      prepEndRef.current = Date.now() + 5000;
      setTimerModalVisible(true);
    } else if (structure === 'superset' || structure === 'circuit' || structure === 'ladder' || structure === 'single') {
      setTimerType('rest');
      const restSec = parseInt(String(block.metadata?.rest_after_round || '90'), 10);
      setRestSeconds(restSec);
      setTimeLeft(restSec);
      setTimerRunning(false);
      setTimerPrepCountdown(null); // Wait for user to click START REST
      setTimerModalVisible(true);
    }
  }, []);

  const handleStartRest = useCallback(() => {
    if (timeLeft === restSeconds) {
      setCurrentRound(prev => prev + 1);
    }
    setTimerRunning(true);
  }, [timeLeft, restSeconds]);

  const formatTimerString = useCallback((seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }, []);

  return {
    activeTimerBlockId,
    timerType,
    timeLeft,
    timerRunning,
    setTimerRunning,
    elapsedTime,
    timerModalVisible,
    setTimerModalVisible,
    timerPrepCountdown,
    startTimerForBlock,
    formatTimerString,
    currentRound,
    totalRounds,
    handleStartRest,
    restSeconds,
    tabataPhase,
    tabataWorkSecs,
    tabataRestSecs,
    tabataExerciseCount,
    amrapRoundsCompleted,
    logRound,
    holdTimes,
    logHoldTime
  };
}
