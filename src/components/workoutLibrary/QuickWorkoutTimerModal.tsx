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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Vibration, Alert, AccessibilityInfo, Animated, Easing } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SoundServiceInstance as SoundService } from '../../lib/SoundService';
import { useTimer } from '../../hooks/useTimer';
import { formatTime } from '../../lib/trials';
import { StandaloneWorkoutDetail, StandaloneWorkoutExercise } from '../../lib/workoutLibrary';

const PREP_SECONDS = 3;

interface Interval {
  seconds: number;
  label: string;
  isRest: boolean;
  exercise: StandaloneWorkoutExercise | null;
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
      }));
    }
    const totalCycles = Math.ceil(totalRounds / exercises.length);
    return Array.from({ length: totalRounds }, (_, i) => ({
      seconds: intervalSeconds,
      label: `ROUND ${Math.floor(i / exercises.length) + 1} OF ${totalCycles}`,
      isRest: false,
      exercise: exercises[i % exercises.length],
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
        plan.push({ seconds: ex?.work_seconds ?? 20, label, isRest: false, exercise: ex });
        plan.push({ seconds: ex?.rest_seconds ?? 10, label, isRest: true, exercise: ex });
      }
    }
    return plan;
  }

  // amrap: one single countdown from the cap, every exercise shown as the
  // round to repeat throughout.
  return [{ seconds: totalSeconds, label: 'AMRAP', isRest: false, exercise: null }];
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

  const [phase, setPhase] = useState<'prep' | 'running' | 'done'>('prep');
  const [prepCountdown, setPrepCountdown] = useState<number | null>(null);
  const [intervalIndex, setIntervalIndex] = useState(0);
  const [forTimeRound, setForTimeRound] = useState(1); // 1-indexed, only meaningful when workout.rounds is set
  const [forTimeCapped, setForTimeCapped] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

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
  // reps done, so the athlete taps through each round themselves.
  const handleForTimeAdvance = () => {
    const targetRounds = workout?.rounds ?? null;
    if (targetRounds !== null && forTimeRound < targetRounds) {
      Vibration.vibrate(100);
      SoundService.playTick();
      setForTimeRound((r) => r + 1);
      return;
    }
    timer.stop();
    SoundService.playBoxingBell();
    Vibration.vibrate([0, 100, 100, 100]);
    setPhase('done');
  };

  if (!workout) return null;

  const forTimeTargetRounds = workout.rounds ?? null;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleRequestClose}>
      <View style={[qwStyles.container, { backgroundColor: theme.background.primary }]}>
        <View style={qwStyles.header}>
          <TouchableOpacity onPress={handleRequestClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialCommunityIcons name="close" size={22} color={theme.text.secondary} />
          </TouchableOpacity>
          <Text style={[qwStyles.headerTitle, { color: theme.text.primary }]} numberOfLines={1}>
            {workout.title.toUpperCase()}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {phase === 'prep' && (
          <View style={qwStyles.centerFill}>
            <Text style={[qwStyles.prepLabel, { color: theme.text.secondary }]}>GET READY</Text>
            <Text style={[qwStyles.prepNumber, { color: theme.accent }]}>{prepCountdown}</Text>
          </View>
        )}

        {phase === 'running' && isForTime && (
          <>
            <View style={qwStyles.timerBlock}>
              <Text style={[qwStyles.intervalLabel, { color: theme.accent }]}>
                {forTimeTargetRounds !== null ? `ROUND ${forTimeRound} OF ${forTimeTargetRounds}` : 'FOR TIME'}
              </Text>
              <Animated.Text style={[qwStyles.clock, { color: theme.text.primary, transform: [{ scale: pulseAnim }] }]}>
                {formatTime(timer.seconds)}
              </Animated.Text>
              <TouchableOpacity style={[qwStyles.advanceBtn, { backgroundColor: theme.accent }]} onPress={handleForTimeAdvance}>
                <Text style={qwStyles.advanceBtnText}>
                  {forTimeTargetRounds !== null && forTimeRound < forTimeTargetRounds ? 'COMPLETE ROUND' : 'FINISH'}
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={qwStyles.body} contentContainerStyle={{ paddingBottom: 24 }}>
              {workout.blocks.map((block) => (
                <View key={block.id} style={{ marginBottom: 14 }}>
                  <Text style={[qwStyles.blockName, { color: theme.text.tertiary }]}>{block.name.toUpperCase()}</Text>
                  {block.exercises.map((ex) => (
                    <View key={ex.exercise_id + String(ex.order_index)} style={[qwStyles.exRow, { borderColor: theme.card.border }]}>
                      <Text style={[qwStyles.exName, { color: theme.text.primary }]}>{ex.name}</Text>
                      <Text style={[qwStyles.exMeta, { color: theme.text.tertiary }]}>{exerciseSubtitle(ex)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {phase === 'running' && !isForTime && currentInterval && (
          <>
            <View style={qwStyles.timerBlock}>
              <Text style={[qwStyles.intervalLabel, { color: currentInterval.isRest ? theme.text.secondary : theme.accent }]}>
                {currentInterval.isRest ? 'REST' : currentInterval.label}
              </Text>
              {currentInterval.exercise && (
                <Text style={[qwStyles.activeExercise, { color: theme.text.primary }]}>
                  {currentInterval.exercise.name}
                  {exerciseSubtitle(currentInterval.exercise) ? ` — ${exerciseSubtitle(currentInterval.exercise)}` : ''}
                </Text>
              )}
              <Animated.Text style={[qwStyles.clock, { color: theme.text.primary, transform: [{ scale: pulseAnim }] }]}>
                {formatTime(timer.seconds)}
              </Animated.Text>
              <TouchableOpacity
                style={[qwStyles.pauseBtn, { borderColor: theme.card.border }]}
                onPress={() => (timer.isRunning ? timer.stop() : timer.start())}
              >
                <MaterialCommunityIcons name={timer.isRunning ? 'pause' : 'play'} size={20} color={theme.text.primary} />
                <Text style={[qwStyles.pauseBtnText, { color: theme.text.primary }]}>{timer.isRunning ? 'PAUSE' : 'RESUME'}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={qwStyles.body} contentContainerStyle={{ paddingBottom: 24 }}>
              {workout.blocks.map((block) => (
                <View key={block.id} style={{ marginBottom: 14 }}>
                  <Text style={[qwStyles.blockName, { color: theme.text.tertiary }]}>{block.name.toUpperCase()}</Text>
                  {block.exercises.map((ex) => (
                    <View
                      key={ex.exercise_id + String(ex.order_index)}
                      style={[
                        qwStyles.exRow,
                        { borderColor: theme.card.border },
                        currentInterval.exercise?.exercise_id === ex.exercise_id && currentInterval.exercise?.order_index === ex.order_index
                          ? { borderColor: theme.accent }
                          : null,
                      ]}
                    >
                      <Text style={[qwStyles.exName, { color: theme.text.primary }]}>{ex.name}</Text>
                      <Text style={[qwStyles.exMeta, { color: theme.text.tertiary }]}>
                        {exerciseSubtitle(ex)}
                        {ex.rest_seconds ? ` · ${ex.rest_seconds}S REST` : ''}
                        {ex.is_weighted ? ' · WEIGHTED' : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {phase === 'done' && (
          <View style={qwStyles.centerFill}>
            <MaterialCommunityIcons name="check-circle" size={56} color={theme.accent} />
            <Text style={[qwStyles.doneTitle, { color: theme.text.primary }]}>
              {isForTime && forTimeCapped ? 'TIME CAP' : 'WORKOUT COMPLETE'}
            </Text>
            {isForTime && (
              <Text style={[qwStyles.doneSub, { color: theme.text.secondary }]}>{formatTime(timer.seconds)}</Text>
            )}
            <Text style={[qwStyles.doneSub, { color: theme.text.secondary }]}>{workout.title}</Text>
            <TouchableOpacity style={[qwStyles.doneBtn, { backgroundColor: theme.accent }]} onPress={onClose}>
              <Text style={qwStyles.doneBtnText}>DONE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const qwStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 1.5, marginHorizontal: 12 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  prepLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 16, letterSpacing: 2 },
  prepNumber: { fontFamily: 'BarlowCondensed-Bold', fontSize: 96 },
  timerBlock: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  intervalLabel: { fontFamily: 'BarlowCondensed-Bold', fontSize: 15, letterSpacing: 2 },
  activeExercise: { fontFamily: 'BarlowCondensed-Bold', fontSize: 18, textAlign: 'center', paddingHorizontal: 20 },
  clock: { fontFamily: 'BarlowCondensed-Bold', fontSize: 72 },
  pauseBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, marginTop: 4 },
  pauseBtnText: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1 },
  advanceBtn: { borderRadius: 20, paddingHorizontal: 24, paddingVertical: 10, marginTop: 4 },
  advanceBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 13, letterSpacing: 1 },
  body: { flex: 1, paddingHorizontal: 20 },
  blockName: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12, letterSpacing: 1.5, marginBottom: 6 },
  exRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  exName: { fontFamily: 'Barlow-Regular', fontSize: 14, flex: 1 },
  exMeta: { fontFamily: 'BarlowCondensed-Bold', fontSize: 12 },
  doneTitle: { fontFamily: 'BarlowCondensed-Bold', fontSize: 22, letterSpacing: 1.5, marginTop: 8 },
  doneSub: { fontFamily: 'Barlow-Regular', fontSize: 14 },
  doneBtn: { marginTop: 20, borderRadius: 24, paddingHorizontal: 32, paddingVertical: 12 },
  doneBtnText: { color: '#000', fontFamily: 'BarlowCondensed-Bold', fontSize: 14, letterSpacing: 1 },
});
