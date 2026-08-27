 // Quick Workout — live timer. Reuses the app's existing timer primitives
// rather than inventing new ones: useTimer (src/hooks/useTimer.ts, the
// Date.now()-anchored countdown every other timed feature already uses —
// its 'up' mode is the same primitive WeeklyChallengeScreen.tsx's For Time
// challenges already use) for the actual countdown/stopwatch, and
// TrialScreen.tsx's elapsed-time-based "3...2...1" lead-in pattern
// (background-safe for the same reason) ahead of it.
//
// AMRAP / EMOM / Tabata are all "an array of countdown intervals to walk
// through in order" and share one engine (buildIntervalPlan). For Time
// doesn't fit that shape — real "For Time" is a stopwatch counting UP
// until a target round count is hit (athlete-paced, the app can't detect
// reps done), with an optional time cap — so it gets its own running-phase
// branch entirely. See docs/features/quick-workout-timing-patterns.md for
// the full reasoning behind every default below (interval_seconds/rounds
// being NULL preserves the exact behavior this engine shipped with before
// those columns existed, so no existing content needs migrating).
//
// UI layer matches the For-Time Runner design handoff
// (assets/design_handoff_workout_runner) — a dial, round pips, a tappable
// "THIS ROUND" log, a SPLITS lap history, and a terminal summary card —
// adapted across all 4 patterns per the synthesis in the Phase 3 plan:
// For Time (athlete-paced, closest fit to the design as-is), AMRAP (a new
// manual LOG ROUND self-report, same real-world pattern as
// WarriorTimerModal's existing AMRAP "+1 round" tap — no round pips since
// there's no fixed total), and EMOM/Tabata (timer-paced — dial + pips fit
// since they have a real fixed round count, but no SPLITS/tappable log
// since the interval auto-advances on schedule, not on athlete input, so
// a lap delta would always read ~0).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Vibration, Alert, AccessibilityInfo, Animated, Easing } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { useTimer } from '../../hooks/useTimer';
import { formatTime } from '../../lib/trials';
import { StandaloneWorkoutDetail, StandaloneWorkoutExercise } from '../../lib/workoutLibrary';

const PREP_SECONDS = 3;
const CORAL = '#FC5454';

interface Interval {
  seconds: number;
  label: string;
  isRest: boolean;
  exercise: StandaloneWorkoutExercise | null;
  roundNumber: number;
  totalRounds: number;
}

function exerciseSubtitle(ex: StandaloneWorkoutExercise): string {
  if (ex.sets && ex.reps) return `${ex.sets} × ${ex.reps}`;
  if (ex.reps) return `${ex.reps} REPS`;
  if (ex.work_seconds) return `${ex.work_seconds}S WORK`;
  if (ex.hold_seconds) return `${ex.hold_seconds}S HOLD`;
  return '';
}

// Pure function, computed once per workout via useMemo — covers AMRAP,
// EMOM, and Tabata. For Time is handled entirely separately (see the
// component below), it never reaches this function.
function buildIntervalPlan(workout: StandaloneWorkoutDetail): Interval[] {
  const totalSeconds = Math.max((workout.duration_minutes ?? 0) * 60, 60);
  const exercises = workout.blocks.flatMap((b) => b.exercises);

  if (workout.format === 'emom') {
    // Rotates one exercise per round, in order, wrapping around — a
    // single-exercise block degenerates to "same exercise every round"
    // automatically (today's original behavior), not a special case.
    // Real content already encodes this rotation via free-text notes
    // ("Minutes 1, 4, 7...") because this engine had no structural
    // support for it before — see the timing-patterns doc.
    const intervalSeconds = workout.interval_seconds ?? 60;
    const totalRounds = Math.max(Math.round(totalSeconds / intervalSeconds), 1);
    if (exercises.length === 0) {
      return Array.from({ length: totalRounds }, (_, i) => ({
        seconds: intervalSeconds, label: `ROUND ${i + 1} OF ${totalRounds}`, isRest: false, exercise: null,
        roundNumber: i + 1, totalRounds,
      }));
    }
    const totalCycles = Math.ceil(totalRounds / exercises.length);
    return Array.from({ length: totalRounds }, (_, i) => ({
      seconds: intervalSeconds,
      label: `ROUND ${Math.floor(i / exercises.length) + 1} OF ${totalCycles}`,
      isRest: false,
      exercise: exercises[i % exercises.length],
      roundNumber: Math.floor(i / exercises.length) + 1,
      totalRounds: totalCycles,
    }));
  }

  if (workout.format === 'tabata') {
    // Each of `rounds` cycles runs every exercise in the block once
    // (work then rest), using that exercise's own work_seconds/
    // rest_seconds — falls back to the real, universal 20s/10s Tabata
    // convention only when an exercise doesn't specify its own (or there
    // are no exercises at all).
    const rounds = workout.rounds ?? Math.max(Math.floor(totalSeconds / 30), 1);
    const list = exercises.length > 0 ? exercises : [null];
    const plan: Interval[] = [];
    for (let r = 1; r <= rounds; r++) {
      for (const ex of list) {
        const label = `ROUND ${r} OF ${rounds}`;
        plan.push({ seconds: ex?.work_seconds ?? 20, label, isRest: false, exercise: ex, roundNumber: r, totalRounds: rounds });
        plan.push({ seconds: ex?.rest_seconds ?? 10, label, isRest: true, exercise: ex, roundNumber: r, totalRounds: rounds });
      }
    }
    return plan;
  }

  // amrap: one single countdown from the cap, every exercise shown as the
  // round to repeat throughout. No fixed round count (open-ended, athlete
  // self-reports via LOG ROUND — see roundSplits below), so roundNumber/
  // totalRounds here are placeholders, unused by the AMRAP UI branch.
  return [{ seconds: totalSeconds, label: 'AMRAP', isRest: false, exercise: null, roundNumber: 1, totalRounds: 1 }];
}

// 246pt SVG dial per the design — hairline outer bound + track + animated
// coral progress ring, round cap, tabular clock + eyebrow + round line in
// the center. `fraction` is 0-1, already computed per-format by the caller
// (partial-round progress included where that concept applies).
function TimerDial({
  fraction,
  paused,
  eyebrow,
  clockText,
  roundLine,
  roundOf,
}: {
  fraction: number;
  paused: boolean;
  eyebrow: string;
  clockText: string;
  roundLine: string;
  roundOf: string | null;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const anim = useRef(new Animated.Value(0)).current;
  const size = 246;
  const strokeWidth = 7;
  const r = 103;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      anim.setValue(fraction);
      return;
    }
    Animated.timing(anim, {
      toValue: fraction,
      duration: 600,
      easing: Easing.bezier(0.2, 0.9, 0.3, 1),
      useNativeDriver: false,
    }).start();
  }, [fraction, reduceMotion, anim]);

  const strokeDashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={112} stroke="#141010" strokeWidth={2} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#120e0e" strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r} stroke={CORAL} strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={strokeDashoffset}
        />
      </Svg>
      <Text style={dialStyles.eyebrow}>{eyebrow}</Text>
      <Animated.Text
        style={[dialStyles.clock, paused && { opacity: reduceMotion ? 1 : anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1] }) }]}
      >
        {clockText}
      </Animated.Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Text style={[dialStyles.roundLine, roundLine === 'COMPLETE' && { color: CORAL }]}>{roundLine}</Text>
        {!!roundOf && (
          <>
            <View style={dialStyles.roundDivider} />
            <Text style={dialStyles.roundOf}>{roundOf}</Text>
          </>
        )}
      </View>
    </View>
  );
}
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const dialStyles = StyleSheet.create({
  eyebrow: { color: '#4a4a4a', fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.6, marginTop: -4 },
  clock: { color: '#EDEDED', fontFamily: 'BarlowCondensed-Light', fontSize: 58, fontVariant: ['tabular-nums'], letterSpacing: -1, marginTop: 4 },
  roundLine: { color: '#fff', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.2 },
  roundDivider: { width: 1, height: 10, backgroundColor: '#221c1c' },
  roundOf: { color: '#6d6d6d', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.2 },
});

// One 3pt tick per round — done = coral, current = wide dim-coral, pending
// = dark. Only rendered for formats with a real fixed round count (EMOM,
// Tabata, For Time when a target round count is set).
function RoundPips({ total, completed }: { total: number; completed: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, marginTop: 14, marginBottom: 4 }}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === completed ? 24 : 9, height: 3, borderRadius: 2,
            backgroundColor: i < completed ? CORAL : i === completed ? '#5a2626' : '#191515',
          }}
        />
      ))}
    </View>
  );
}

// Splits — For Time and AMRAP only (per the synthesis: EMOM/Tabata's
// interval durations are fixed by the format itself, so a lap delta would
// always read ~0, not a meaningful signal). `splitsAt` is elapsed-seconds-
// at-lap, oldest first; deltas compare each round's duration against the
// one before it.
function SplitsSection({ splitsAt }: { splitsAt: number[] }) {
  if (splitsAt.length === 0) {
    return (
      <View style={qwStyles.noSplitsBox}>
        <Text style={qwStyles.noSplitsText}>Finish a round to bank your first split.</Text>
      </View>
    );
  }
  const rows = splitsAt.map((at, i) => {
    const prevAt = i > 0 ? splitsAt[i - 1] : 0;
    const dur = at - prevAt;
    const prevDur = i > 1 ? splitsAt[i - 1] - splitsAt[i - 2] : null;
    const delta = prevDur == null ? '' : (dur - prevDur >= 0 ? '+' : '−') + formatTime(Math.abs(dur - prevDur));
    return { num: i + 1, dur, delta };
  }).reverse();

  return (
    <View style={{ gap: 8 }}>
      {rows.map((row) => (
        <View key={row.num} style={qwStyles.splitRow}>
          <Text style={qwStyles.splitNum}>R{row.num}</Text>
          <View style={qwStyles.splitRule} />
          <Text style={[qwStyles.splitDelta, { color: row.delta.startsWith('+') ? '#8a6a6a' : '#6a8a6a' }]}>{row.delta}</Text>
          <Text style={qwStyles.splitTime}>{formatTime(row.dur)}</Text>
        </View>
      ))}
    </View>
  );
}

export function QuickWorkoutTimerModal({
  visible,
  workout,
  theme,
  onClose,
}: {
  visible: boolean;
  workout: StandaloneWorkoutDetail | null;
  theme: any;
  onClose: () => void;
}) {
  const isForTime = workout?.format === 'fortime';
  const isAmrap = workout?.format === 'amrap';
  const isEmomOrTabata = workout?.format === 'emom' || workout?.format === 'tabata';

  const [phase, setPhase] = useState<'prep' | 'running' | 'done'>('prep');
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const [intervalIndex, setIntervalIndex] = useState(0);
  const [forTimeRound, setForTimeRound] = useState(1); // 1-indexed, only meaningful when workout.rounds is set
  const [forTimeCapped, setForTimeCapped] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  // For-Time-Runner additions: lap history (For Time + AMRAP only, see
  // module comment) and For Time's per-movement "THIS ROUND" checklist.
  const [roundSplits, setRoundSplits] = useState<number[]>([]);
  const [forTimeLogged, setForTimeLogged] = useState<boolean[]>([]);
  const [committed, setCommitted] = useState(false); // terminal "SAVED ✓" state

  const prepStartTimeRef = useRef<number | null>(null);
  const prepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards the "advance/complete" effect below against a false-positive on
  // the very first interval of a run. QuickWorkoutTimerModal is created
  // once and toggled visible (never remounted), so on its actual first
  // mount `workout` is still null — useTimer(0, 'down') is called, and
  // useState's initializer only applies once, permanently seeding
  // timer.seconds at 0 until the first real reset()/start(). When 'running'
  // starts for the first time, both this effect and the "start the
  // interval" effect fire in the same commit; this one runs with the
  // pre-update closure (timer.seconds still 0, timer.isRunning still
  // false) because the other effect's setSeconds/setIsRunning calls
  // haven't been applied to a new render yet. Every early-return condition
  // below reads as "already finished," so without this guard the workout
  // completes instantly after prep. Only trust seconds===0 as "finished"
  // once isRunning has genuinely flipped true at least once for this
  // interval.
  const intervalStartedRef = useRef(false);

  const plan = useMemo(
    () => (workout && !isForTime ? buildIntervalPlan(workout) : []),
    [workout, isForTime]
  );
  const currentInterval = plan[intervalIndex] ?? null;
  const flatExercises = useMemo(() => workout?.blocks.flatMap((b) => b.exercises) ?? [], [workout]);

  // One shared timer for every format — 'up' (stopwatch) for For Time,
  // 'down' (countdown) for everything else. Safe to vary the hook's
  // arguments by format since the hook itself is still called
  // unconditionally every render; only what's passed to it changes.
  const timer = useTimer(isForTime ? 0 : (currentInterval?.seconds ?? 0), isForTime ? 'up' : 'down');

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
  }, []);

  // Reset everything fresh every time this modal opens for a (possibly
  // different) workout — it's created once and toggled visible, not
  // remounted, so state from a previous run must not leak into the next.
  useEffect(() => {
    if (!visible) return;
    setPhase('prep');
    setIntervalIndex(0);
    setForTimeRound(1);
    setForTimeCapped(false);
    setPrepCountdown(PREP_SECONDS);
    prepStartTimeRef.current = Date.now();
    intervalStartedRef.current = false;
    setRoundSplits([]);
    setForTimeLogged(new Array(flatExercises.length).fill(false));
    setCommitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, workout?.id]);

  // Prep lead-in — same elapsed-time-anchored, background-safe pattern as
  // TrialScreen.tsx's startTrial/prepCountdown (not a naive setInterval
  // count, so a backgrounded app doesn't lose time).
  useEffect(() => {
    if (prepTimerRef.current) {
      clearInterval(prepTimerRef.current);
      prepTimerRef.current = null;
    }
    if (phase !== 'prep' || prepCountdown === null) return;

    SoundService.playTick();

    const finishPrep = () => {
      setPrepCountdown(null);
      prepStartTimeRef.current = null;
      SoundService.playBoxingBell();
      Vibration.vibrate(100);
      setPhase('running');
      if (prepTimerRef.current) {
        clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
      }
    };

    prepTimerRef.current = setInterval(() => {
      if (!prepStartTimeRef.current) return;
      const elapsed = Math.floor((Date.now() - prepStartTimeRef.current) / 1000);
      const remaining = PREP_SECONDS - elapsed;
      if (remaining <= 0) {
        finishPrep();
      } else {
        setPrepCountdown((prev) => {
          if (prev !== null && prev !== remaining) SoundService.playTick();
          return remaining;
        });
      }
    }, 250);

    return () => {
      if (prepTimerRef.current) {
        clearInterval(prepTimerRef.current);
        prepTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, prepCountdown === null]);

  // Enter the running phase. For Time: start the stopwatch once, nothing
  // else drives it — round advancement is a manual tap (see
  // handleForTimeAdvance), not a timer event. Everything else: start (or
  // restart, on an interval change) the countdown.
  useEffect(() => {
    if (phase !== 'running') return;
    intervalStartedRef.current = false;
    if (isForTime) {
      timer.reset();
      timer.start();
      return;
    }
    if (!currentInterval) return;
    // Goes through reset() first — useTimer.start() schedules a local
    // notification every call, and reset() is what cancels the previous
    // one (via its own stop()) before a fresh one is scheduled, so a
    // multi-interval Tabata/EMOM run never piles up stale "time's up"
    // notifications from earlier intervals.
    //
    // start() is called with an explicit offsetSeconds (the new
    // interval's full duration), not bare start() — useTimer.start()'s
    // own math is `baseSeconds = offsetSeconds > 0 ? offsetSeconds :
    // seconds`, and `seconds` here is a stale closure value left over
    // from the interval that JUST finished (0, since that's what
    // triggered this transition). A bare start() would compute `elapsed
    // = initialSeconds - 0 = initialSeconds`, making the new interval
    // think it was already fully elapsed and complete on the very next
    // 500ms tick. Passing the full duration explicitly makes elapsed
    // correctly resolve to 0. Verified with a real Jest regression test
    // (QuickWorkoutTimerModal.test.tsx) that forces exactly this
    // transition, not just reasoned through.
    timer.reset();
    timer.start(currentInterval.seconds);
    if (intervalIndex > 0) {
      Vibration.vibrate(100);
      SoundService.playTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, intervalIndex, isForTime]);

  // Detect one interval finishing naturally (not a manual pause) and
  // advance to the next, or finish the whole workout. Never fires for For
  // Time — that format has no interval plan to walk.
  useEffect(() => {
    if (timer.isRunning) intervalStartedRef.current = true;
  }, [timer.isRunning]);

  useEffect(() => {
    if (isForTime || phase !== 'running' || !intervalStartedRef.current || timer.isRunning || timer.seconds !== 0) return;
    if (intervalIndex + 1 < plan.length) {
      const next = plan[intervalIndex + 1];
      if (next.isRest) SoundService.playDigitalBuzzer(1);
      else if (intervalIndex > 0) SoundService.playTick();
      setIntervalIndex((i) => i + 1);
    } else {
      SoundService.playBoxingBell();
      Vibration.vibrate([0, 100, 100, 100]);
      setPhase('done');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.seconds, timer.isRunning, phase, isForTime]);

  // For Time's optional hard cap — duration_minutes, when set, is a
  // ceiling, not the primary display (that's the stopwatch). Hitting it
  // force-finishes with a "TIME CAP" label instead of "COMPLETE", so the
  // athlete can tell a real finish from a capped one.
  useEffect(() => {
    if (!isForTime || phase !== 'running' || !workout?.duration_minutes) return;
    if (timer.seconds >= workout.duration_minutes * 60) {
      timer.stop();
      setForTimeCapped(true);
      SoundService.playBoxingBell();
      Vibration.vibrate([0, 100, 100, 100]);
      setPhase('done');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isForTime, phase, timer.seconds, workout?.duration_minutes]);

  useEffect(() => {
    if (reduceMotion) {
      pulseAnim.setValue(1);
      return;
    }
    if (phase === 'running' && timer.isRunning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    pulseAnim.setValue(1);
  }, [phase, timer.isRunning, reduceMotion]);

  const handleRequestClose = () => {
    if (phase === 'running') {
      Alert.alert(
        'END WORKOUT?',
        "YOUR PROGRESS IN THIS SESSION WON'T BE SAVED.",
        [
          { text: 'KEEP GOING', style: 'cancel' },
          { text: 'END WORKOUT', style: 'destructive', onPress: onClose },
        ]
      );
      return;
    }
    onClose();
  };

  // For Time's athlete-paced round advance — the app has no way to detect
  // reps done, so the athlete taps through each round themselves. Now also
  // banks a split and resets the per-movement checklist for the new round.
  const handleForTimeAdvance = () => {
    const targetRounds = workout?.rounds ?? null;
    setRoundSplits((prev) => [...prev, timer.seconds]);
    if (targetRounds !== null && forTimeRound < targetRounds) {
      Vibration.vibrate(100);
      SoundService.playTick();
      setForTimeRound((r) => r + 1);
      setForTimeLogged(new Array(flatExercises.length).fill(false));
      return;
    }
    timer.stop();
    SoundService.playBoxingBell();
    Vibration.vibrate([0, 100, 100, 100]);
    setPhase('done');
  };

  // THIS ROUND tappable log rows (For Time only) — checking every movement
  // auto-advances the round exactly like tapping the advance button
  // itself, same mechanic as the design's toggleMove.
  const handleToggleForTimeMove = (i: number) => {
    if (phase !== 'running') return;
    setForTimeLogged((prev) => {
      const next = prev.slice();
      next[i] = !next[i];
      if (next.every(Boolean) && next.length > 0) {
        setTimeout(handleForTimeAdvance, 0);
      }
      return next;
    });
  };

  // AMRAP's new manual round log — no fixed total, so this just banks a
  // split and bumps a visible round counter (derived from roundSplits
  // below). Same self-report pattern as WarriorTimerModal's existing AMRAP
  // "+1 round" tap for coaching-program blocks.
  const handleAmrapLogRound = () => {
    if (phase !== 'running') return;
    Vibration.vibrate(100);
    SoundService.playTick();
    setRoundSplits((prev) => [...prev, isForTime ? timer.seconds : (currentInterval?.seconds ?? 0) - timer.seconds]);
  };

  const handleCommit = () => {
    setCommitted(true);
  };

  if (!workout) return null;

  const forTimeTargetRounds = workout.rounds ?? null;
  const amrapCapSeconds = currentInterval?.seconds ?? 0;
  const amrapElapsed = amrapCapSeconds - timer.seconds;

  // Dial inputs, computed per format.
  let dialFraction = 0;
  let dialEyebrow = phase === 'done' ? 'FINAL TIME' : 'ELAPSED';
  let dialClockText = '0:00';
  let dialRoundLine = '';
  let dialRoundOf: string | null = null;
  let showPips = false;
  let pipsTotal = 0;
  let pipsCompleted = 0;

  if (isForTime) {
    dialClockText = formatTime(timer.seconds);
    if (forTimeTargetRounds !== null) {
      const finished = phase === 'done';
      const completedRounds = Math.min(forTimeRound - 1, forTimeTargetRounds);
      const loggedCount = forTimeLogged.filter(Boolean).length;
      dialFraction = Math.min((completedRounds + (flatExercises.length ? loggedCount / flatExercises.length : 0)) / forTimeTargetRounds, 1);
      dialRoundLine = finished ? 'COMPLETE' : `ROUND ${Math.min(forTimeRound, forTimeTargetRounds)}`;
      dialRoundOf = finished ? `${forTimeTargetRounds} OF ${forTimeTargetRounds}` : `OF ${forTimeTargetRounds}`;
      showPips = true;
      pipsTotal = forTimeTargetRounds;
      pipsCompleted = completedRounds;
    } else {
      dialRoundLine = phase === 'done' ? 'COMPLETE' : 'FOR TIME';
      dialFraction = phase === 'done' ? 1 : 0;
    }
  } else if (isAmrap) {
    dialClockText = formatTime(timer.seconds);
    dialEyebrow = phase === 'done' ? 'FINAL TIME' : 'TIME LEFT';
    dialFraction = amrapCapSeconds > 0 ? Math.min(amrapElapsed / amrapCapSeconds, 1) : 0;
    dialRoundLine = phase === 'done' ? 'COMPLETE' : `${roundSplits.length} ROUND${roundSplits.length === 1 ? '' : 'S'}`;
  } else if (isEmomOrTabata && currentInterval) {
    dialClockText = formatTime(timer.seconds);
    const withinInterval = currentInterval.seconds > 0 ? (currentInterval.seconds - timer.seconds) / currentInterval.seconds : 0;
    const completedIntervals = intervalIndex;
    dialFraction = phase === 'done' ? 1 : Math.min((completedIntervals + withinInterval) / Math.max(plan.length, 1), 1);
    const finished = phase === 'done';
    dialRoundLine = finished ? 'COMPLETE' : `ROUND ${currentInterval.roundNumber}`;
    dialRoundOf = finished ? `${currentInterval.totalRounds} OF ${currentInterval.totalRounds}` : `OF ${currentInterval.totalRounds}`;
    showPips = true;
    pipsTotal = currentInterval.totalRounds;
    pipsCompleted = currentInterval.roundNumber - 1;
  }

  const primaryLabel = committed
    ? 'SAVED ✓'
    : isForTime
      ? (forTimeTargetRounds !== null && forTimeRound < forTimeTargetRounds ? `LAP ROUND ${forTimeRound}` : phase === 'done' ? 'FINISH WORKOUT' : 'FINISH')
      : isAmrap
        ? (phase === 'done' ? 'FINISH WORKOUT' : 'LOG ROUND')
        : '';

  const handlePrimaryPress = () => {
    if (committed) return;
    if (phase === 'done') { handleCommit(); return; }
    if (isForTime) { handleForTimeAdvance(); return; }
    if (isAmrap) { handleAmrapLogRound(); return; }
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleRequestClose}>
      <View style={[qwStyles.container, { backgroundColor: '#000000' }]}>
        <View style={qwStyles.header}>
          <TouchableOpacity onPress={handleRequestClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={qwStyles.headerBtn}>
            <MaterialCommunityIcons name="close" size={18} color="#EDEDED" />
          </TouchableOpacity>
          <View style={qwStyles.schemeChip}>
            <Text style={qwStyles.schemeChipText}>{workout.format ? workout.format.toUpperCase() : 'WORKOUT'}</Text>
          </View>
          <View style={{ width: 34 }} />
        </View>
        <Text style={qwStyles.headerMeta} numberOfLines={1}>
          {workout.title.toUpperCase()}
          {isForTime && forTimeTargetRounds !== null ? ` · ${forTimeTargetRounds} ROUNDS` : ''}
          {flatExercises.length > 0 ? ` · ${flatExercises.length} MOVES` : ''}
        </Text>

        {phase === 'prep' && (
          <View style={qwStyles.centerFill}>
            <Text style={qwStyles.prepLabel}>GET READY</Text>
            <Text style={[qwStyles.prepNumber, { color: CORAL }]}>{prepCountdown}</Text>
          </View>
        )}

        {phase !== 'prep' && (
          <ScrollView contentContainerStyle={{ paddingBottom: 128, paddingHorizontal: 20 }}>
            <View style={{ alignItems: 'center', marginTop: 8 }}>
              <TimerDial
                fraction={dialFraction}
                paused={!timer.isRunning}
                eyebrow={dialEyebrow}
                clockText={dialClockText}
                roundLine={dialRoundLine}
                roundOf={dialRoundOf}
              />
              {/* EMOM/Tabata's sole timer control — inline pause/resume, no
                  footer (they have no LAP/splits concept, see module
                  comment). For Time/AMRAP use the footer's pause/play icon
                  button instead, so this doesn't double up with that. */}
              {isEmomOrTabata && (
                <TouchableOpacity
                  style={qwStyles.pauseBtn}
                  onPress={() => (timer.isRunning ? timer.stop() : timer.start())}
                  disabled={phase === 'done'}
                >
                  <MaterialCommunityIcons name={timer.isRunning ? 'pause' : 'play'} size={18} color="#EDEDED" />
                  <Text style={qwStyles.pauseBtnText}>{timer.isRunning ? 'PAUSE' : 'RESUME'}</Text>
                </TouchableOpacity>
              )}
              {showPips && phase !== 'done' && <RoundPips total={pipsTotal} completed={pipsCompleted} />}
            </View>

            {phase === 'done' ? (
              <View style={qwStyles.summaryCard}>
                <View style={qwStyles.summaryCol}>
                  <Text style={qwStyles.summaryVal}>{formatTime(timer.seconds)}</Text>
                  <Text style={qwStyles.summaryLabel}>TOTAL TIME</Text>
                </View>
                <View style={qwStyles.summaryCol}>
                  <Text style={[qwStyles.summaryVal, { color: CORAL }]}>
                    {roundSplits.length > 0 ? formatTime(Math.round(timer.seconds / roundSplits.length)) : '0:00'}
                  </Text>
                  <Text style={qwStyles.summaryLabel}>AVG ROUND</Text>
                </View>
                <View style={qwStyles.summaryCol}>
                  <Text style={qwStyles.summaryVal}>{isForTime && forTimeTargetRounds ? forTimeTargetRounds : roundSplits.length}</Text>
                  <Text style={qwStyles.summaryLabel}>ROUNDS</Text>
                </View>
              </View>
            ) : (
              <>
                {isForTime && (
                  <View style={{ marginTop: 22 }}>
                    <View style={qwStyles.sectionRule}>
                      <Text style={qwStyles.sectionEyebrow}>THIS ROUND</Text>
                      <Text style={qwStyles.sectionCount}>{`${forTimeLogged.filter(Boolean).length} OF ${flatExercises.length} LOGGED`}</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                      {flatExercises.map((ex, i) => {
                        const on = !!forTimeLogged[i];
                        const next = !on && forTimeLogged.slice(0, i).every(Boolean);
                        return (
                          <TouchableOpacity
                            key={ex.exercise_id + String(ex.order_index)}
                            style={[qwStyles.logRow, on ? qwStyles.logRowDone : next ? qwStyles.logRowNext : qwStyles.logRowIdle]}
                            onPress={() => handleToggleForTimeMove(i)}
                            activeOpacity={0.8}
                          >
                            <View style={[qwStyles.logCheck, on && { backgroundColor: CORAL, borderColor: CORAL }]}>
                              {on && <MaterialCommunityIcons name="check" size={14} color="#000" />}
                            </View>
                            <Text style={[qwStyles.logName, on && qwStyles.logNameDone]} numberOfLines={1}>{ex.name}</Text>
                            <View style={[qwStyles.logTargetPill, next && { borderColor: '#3a1d1d', backgroundColor: 'rgba(252,84,84,.08)' }]}>
                              <Text style={[qwStyles.logTargetText, next && { color: CORAL }]}>× {ex.reps ?? ex.hold_seconds ?? '—'}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                {isAmrap && (
                  <View style={{ marginTop: 22 }}>
                    <View style={qwStyles.sectionRule}>
                      <Text style={qwStyles.sectionEyebrow}>THE CIRCUIT</Text>
                    </View>
                    <View style={{ gap: 8 }}>
                      {flatExercises.map((ex) => (
                        <View key={ex.exercise_id + String(ex.order_index)} style={[qwStyles.logRow, qwStyles.logRowIdle]}>
                          <View style={qwStyles.logDot} />
                          <Text style={qwStyles.logName} numberOfLines={1}>{ex.name}</Text>
                          <Text style={qwStyles.logMetaText}>{exerciseSubtitle(ex)}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {isEmomOrTabata && currentInterval?.exercise && (
                  <View style={{ marginTop: 22 }}>
                    <View style={qwStyles.sectionRule}>
                      <Text style={qwStyles.sectionEyebrow}>{currentInterval.isRest ? 'REST' : 'THIS ROUND'}</Text>
                    </View>
                    <View style={[qwStyles.logRow, qwStyles.logRowNext]}>
                      <View style={[qwStyles.logDot, { backgroundColor: CORAL }]} />
                      <Text style={qwStyles.logName} numberOfLines={1}>{currentInterval.exercise.name}</Text>
                      <Text style={[qwStyles.logMetaText, { color: CORAL }]}>{exerciseSubtitle(currentInterval.exercise)}</Text>
                    </View>
                  </View>
                )}

                {(isForTime || isAmrap) && (
                  <View style={{ marginTop: 22 }}>
                    <View style={qwStyles.sectionRule}>
                      <Text style={qwStyles.sectionEyebrow}>SPLITS</Text>
                    </View>
                    <SplitsSection splitsAt={roundSplits} />
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}

        {phase !== 'prep' && (isForTime || isAmrap) && (
          <View style={qwStyles.footer}>
            <TouchableOpacity
              style={qwStyles.footerIconBtn}
              onPress={() => (timer.isRunning ? timer.stop() : timer.start())}
              disabled={phase === 'done'}
            >
              <MaterialCommunityIcons name={timer.isRunning ? 'pause' : 'play'} size={20} color="#EDEDED" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[qwStyles.footerPrimaryBtn, committed && qwStyles.footerPrimaryBtnDone]}
              onPress={handlePrimaryPress}
              disabled={committed}
            >
              <Text style={[qwStyles.footerPrimaryText, committed && { color: '#8a8a8a' }]}>{primaryLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={qwStyles.footerIconBtn} onPress={handleRequestClose}>
              <MaterialCommunityIcons name="stop" size={20} color={CORAL} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const qwStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16 },
  headerBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  schemeChip: { backgroundColor: 'rgba(252,84,84,.12)', borderWidth: 1, borderColor: '#3a1d1d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  schemeChipText: { color: CORAL, fontFamily: 'BarlowCondensed-Bold', fontSize: 9, letterSpacing: 2 },
  headerMeta: { color: '#5a5a5a', fontFamily: 'Barlow-Regular', fontSize: 9.5, textAlign: 'center', marginTop: 6, paddingHorizontal: 20 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  prepLabel: { color: '#8a8a8a', fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 2 },
  prepNumber: { fontFamily: 'BarlowCondensed-Bold', fontSize: 96 },

  pauseBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#241f1f',
    borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginTop: 10,
  },
  pauseBtnText: { color: '#EDEDED', fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1 },

  summaryCard: {
    flexDirection: 'row', borderRadius: 18, borderWidth: 1, borderColor: '#3a1d1d',
    backgroundColor: '#0c0707', padding: 18, marginTop: 24,
  },
  summaryCol: { flex: 1, alignItems: 'center' },
  summaryVal: { color: '#fff', fontFamily: 'BarlowCondensed-Bold', fontSize: 20, fontVariant: ['tabular-nums'] },
  summaryLabel: { color: '#6d6d6d', fontFamily: 'Barlow-Regular', fontSize: 8.5, letterSpacing: 0.6, marginTop: 4 },

  sectionRule: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: '#161212', paddingBottom: 8, marginBottom: 10 },
  sectionEyebrow: { color: '#3f3f3f', fontFamily: 'BarlowCondensed-Bold', fontSize: 8.5, letterSpacing: 2.6 },
  sectionCount: { color: '#5a5a5a', fontFamily: 'Barlow-Regular', fontSize: 9.5 },

  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 15, borderWidth: 1, padding: 13 },
  logRowIdle: { borderColor: '#191515', backgroundColor: '#0a0808' },
  logRowNext: { borderColor: '#3a1d1d', backgroundColor: 'rgba(252,84,84,.05)' },
  logRowDone: { borderColor: '#2a1d1d', backgroundColor: 'rgba(255,255,255,.015)', opacity: 0.58 },
  logCheck: { width: 26, height: 26, borderRadius: 9, borderWidth: 1, borderColor: '#241f1f', alignItems: 'center', justifyContent: 'center' },
  logDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#6d6d6d' },
  logName: { flex: 1, color: '#fff', fontFamily: 'Barlow-Regular', fontSize: 14.5 },
  logNameDone: { color: '#8a8a8a', textDecorationLine: 'line-through' },
  logMetaText: { color: '#8a8a8a', fontFamily: 'BarlowCondensed-Bold', fontSize: 11 },
  logTargetPill: { borderWidth: 1, borderColor: '#1d1919', backgroundColor: 'rgba(255,255,255,.02)', borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  logTargetText: { color: '#8a8a8a', fontFamily: 'BarlowCondensed-Bold', fontSize: 11.5 },

  noSplitsBox: { borderWidth: 1, borderColor: '#1d1919', borderStyle: 'dashed', borderRadius: 13, padding: 15, alignItems: 'center' },
  noSplitsText: { color: '#4a4444', fontFamily: 'Barlow-Regular', fontSize: 10.5, letterSpacing: 0.6, textAlign: 'center' },
  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 12, backgroundColor: 'rgba(255,255,255,.016)' },
  splitNum: { color: '#6d6d6d', fontFamily: 'BarlowCondensed-Bold', fontSize: 10, letterSpacing: 1.4, minWidth: 20 },
  splitRule: { flex: 1 },
  splitDelta: { fontFamily: 'Barlow-Regular', fontSize: 10, minWidth: 40, textAlign: 'right' },
  splitTime: { color: '#EDEDED', fontFamily: 'BarlowCondensed-Bold', fontSize: 12.5, minWidth: 52, textAlign: 'right', fontVariant: ['tabular-nums'] },

  footer: {
    position: 'absolute', left: 16, right: 16, bottom: 26,
    flexDirection: 'row', gap: 10, alignItems: 'center',
  },
  footerIconBtn: {
    width: 52, height: 52, borderRadius: 15, borderWidth: 1, borderColor: '#241f1f',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.4)',
  },
  footerPrimaryBtn: {
    flex: 1, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CORAL,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 30, elevation: 8,
  },
  footerPrimaryBtnDone: { backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: '#241f1f', shadowOpacity: 0 },
  footerPrimaryText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13.5, letterSpacing: 1.9 },
});
