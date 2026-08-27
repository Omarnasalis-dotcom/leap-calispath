import React from 'react';
import { act, create } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';
import { QuickWorkoutTimerModal } from '../QuickWorkoutTimerModal';

jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: {
    playTick: jest.fn(),
    playBoxingBell: jest.fn(),
    playDigitalBuzzer: jest.fn(),
  },
}));

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('fake-id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

const theme = {
  background: { primary: '#000' },
  text: { primary: '#fff', secondary: '#aaa', tertiary: '#888' },
  card: { border: '#333' },
  accent: '#ff0000',
};

const baseWorkout = {
  id: 'w1',
  kind: 'quick_workout' as const,
  title: 'TEST WORKOUT',
  description: null,
  category: 'PUSH',
  difficulty: 'intermediate' as const,
  is_free: false,
  cover_image_url: null,
  goal_tags: [],
  tier_min: null,
  tier_max: null,
  interval_seconds: null,
  rounds: null,
};

const ex = (name: string, order_index: number, overrides: Record<string, any> = {}) => ({
  exercise_id: `ex-${order_index}`,
  name,
  sets: null,
  reps: null,
  rest_seconds: null,
  hold_seconds: null,
  work_seconds: null,
  is_weighted: false,
  notes: null,
  order_index,
  ...overrides,
});

// Depth-first find, since react-test-renderer's toJSON() tree nests Text
// children as arrays/strings rather than exposing a queryable DOM.
function findAllText(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => findAllText(n, acc));
    return acc;
  }
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (node.children) findAllText(node.children, acc);
  return acc;
}

// Text extraction for a TestInstance subtree (findAllByType returns these,
// not the toJSON() tree shape — different node shape, same idea).
function findAllTextInInstance(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((c: any) => findAllTextInInstance(c, acc));
  }
  return acc;
}

// findByProps({children: text}) matches the Text instance, not the
// TouchableOpacity wrapping it (which has its own nested layers) — find
// every TouchableOpacity instead and pick the one whose rendered subtree
// contains the target text.
function findButtonByText(root: ReturnType<typeof create>, text: string) {
  const candidates = root.root.findAllByType(TouchableOpacity);
  const match = candidates.find((c) => findAllTextInInstance(c).includes(text));
  if (!match) throw new Error(`No TouchableOpacity found containing text ${JSON.stringify(text)}`);
  return match;
}

function mountAndClearPrep(props: any) {
  let root: ReturnType<typeof create>;
  act(() => {
    root = create(<QuickWorkoutTimerModal {...props} />);
  });
  act(() => { jest.advanceTimersByTime(3500); }); // clear the 3s prep lead-in
  return root!;
}

describe('QuickWorkoutTimerModal — real regression coverage for the interval engine', () => {
  // Real bug found and fixed while building this: useTimer.start() with no
  // argument reads a stale `seconds` closure left over from whatever
  // interval just finished (0), not the new interval's duration — a bare
  // start() on a multi-interval transition made every interval after the
  // first complete on the very next tick instead of running its full
  // length. These tests exercise exactly that transition.

  test('AMRAP: counts down normally after prep, does not jump to done', () => {
    jest.useFakeTimers();
    const workout = { ...baseWorkout, format: 'amrap' as const, duration_minutes: 20, blocks: [] };
    const root = mountAndClearPrep({ visible: true, workout, theme, onClose: () => {} });

    let texts = findAllText(root.toJSON());
    expect(texts).toContain('AMRAP');
    expect(texts).toContain('20:00');
    expect(texts).not.toContain('WORKOUT COMPLETE');

    act(() => { jest.advanceTimersByTime(2000); });
    texts = findAllText(root.toJSON());
    expect(texts).toContain('19:58');
    expect(texts).not.toContain('WORKOUT COMPLETE');

    jest.useRealTimers();
  });

  test('EMOM, same exercise every round (no interval_seconds, 1 exercise): backward-compatible default', () => {
    jest.useFakeTimers();
    const workout = {
      ...baseWorkout, format: 'emom' as const, duration_minutes: 15,
      blocks: [{ id: 'b1', name: 'Circuit', order_index: 0, exercises: [ex('Burpees', 0, { reps: 10 })] }],
    };
    const root = mountAndClearPrep({ visible: true, workout, theme, onClose: () => {} });

    let texts = findAllText(root.toJSON());
    expect(texts).toContain('ROUND 1 OF 15');
    expect(texts).toContain('1:00');
    expect(texts.some((t) => t.includes('Burpees'))).toBe(true);

    act(() => { jest.advanceTimersByTime(2000); });
    texts = findAllText(root.toJSON());
    expect(texts).toContain('0:58');
    expect(texts).not.toContain('WORKOUT COMPLETE');

    jest.useRealTimers();
  });

  test('EMOM rotation: a different exercise each round, cycling — the real gap this session found', () => {
    jest.useFakeTimers();
    const workout = {
      ...baseWorkout, format: 'emom' as const, duration_minutes: 9,
      blocks: [{
        id: 'b1', name: 'Circuit', order_index: 0,
        exercises: [ex('Pull Ups', 0, { reps: 15 }), ex('Dips', 1, { reps: 15 }), ex('Air Squat', 2, { reps: 20 })],
      }],
    };
    const root = mountAndClearPrep({ visible: true, workout, theme, onClose: () => {} });

    // Round 1 of cycle 1 -> Pull Ups
    let texts = findAllText(root.toJSON());
    expect(texts).toContain('ROUND 1 OF 3');
    expect(texts.some((t) => t.includes('Pull Ups'))).toBe(true);

    // Run out round 1, land on round 2 -> Dips
    act(() => { jest.advanceTimersByTime(60500); });
    texts = findAllText(root.toJSON());
    expect(texts.some((t) => t.includes('Dips'))).toBe(true);
    expect(texts).toContain('1:00'); // fresh full duration, not a jump to done
    expect(texts).not.toContain('WORKOUT COMPLETE');

    // Run out round 2, land on round 3 -> Air Squat
    act(() => { jest.advanceTimersByTime(60500); });
    texts = findAllText(root.toJSON());
    expect(texts.some((t) => t.includes('Air Squat'))).toBe(true);
    expect(texts).not.toContain('WORKOUT COMPLETE');

    // Run out round 3 (minute 4 of 9 = start of cycle 2) -> back to Pull Ups
    act(() => { jest.advanceTimersByTime(60500); });
    texts = findAllText(root.toJSON());
    expect(texts).toContain('ROUND 2 OF 3');
    expect(texts.some((t) => t.includes('Pull Ups'))).toBe(true);

    jest.useRealTimers();
  });

  test('EMOM custom interval_seconds: "every 2 min for 10 min" runs 2:00 per round, not 1:00', () => {
    jest.useFakeTimers();
    const workout = {
      ...baseWorkout, format: 'emom' as const, duration_minutes: 10, interval_seconds: 120,
      blocks: [{ id: 'b1', name: 'Circuit', order_index: 0, exercises: [ex('Dips', 0, { reps: 10 }), ex('Pull Ups', 1, { reps: 5 })] }],
    };
    const root = mountAndClearPrep({ visible: true, workout, theme, onClose: () => {} });

    const texts = findAllText(root.toJSON());
    expect(texts).toContain('2:00'); // not 1:00 -- the custom interval_seconds must be respected
    // 10 min / 2 min = 5 raw intervals, cycling through 2 exercises = ceil(5/2) = 3 cycles
    expect(texts).toContain('ROUND 1 OF 3');

    jest.useRealTimers();
  });

  test('Tabata: reads authored work/rest seconds and rounds, not the old hardcoded 20/10', () => {
    jest.useFakeTimers();
    const workout = {
      ...baseWorkout, format: 'tabata' as const, duration_minutes: 6, rounds: 3,
      blocks: [{
        id: 'b1', name: 'Circuit', order_index: 0,
        exercises: [ex('High Plank', 0, { work_seconds: 40, rest_seconds: 20 }), ex('Air Squat', 1, { work_seconds: 40, rest_seconds: 20 })],
      }],
    };
    const root = mountAndClearPrep({ visible: true, workout, theme, onClose: () => {} });

    // First interval: WORK, High Plank, 40s (not the old hardcoded 20s)
    let texts = findAllText(root.toJSON());
    expect(texts).toContain('0:40');
    expect(texts.some((t) => t.includes('High Plank'))).toBe(true);
    expect(texts).not.toContain('REST');

    // Run out the 40s work -> REST, still High Plank's own rest_seconds (20s, not the old hardcoded 10s)
    act(() => { jest.advanceTimersByTime(40500); });
    texts = findAllText(root.toJSON());
    expect(texts).toContain('REST');
    expect(texts).toContain('0:20');

    // Run out the 20s rest -> next exercise, Air Squat, WORK 40s
    act(() => { jest.advanceTimersByTime(20500); });
    texts = findAllText(root.toJSON());
    expect(texts.some((t) => t.includes('Air Squat'))).toBe(true);
    expect(texts).toContain('0:40');
    expect(texts).not.toContain('WORKOUT COMPLETE');

    jest.useRealTimers();
  });

  test('For Time, round-capped: stopwatch counts up, COMPLETE ROUND advances, lands on done with a real elapsed time', () => {
    jest.useFakeTimers();
    const workout = {
      ...baseWorkout, format: 'fortime' as const, duration_minutes: null, rounds: 3,
      blocks: [{ id: 'b1', name: 'Circuit', order_index: 0, exercises: [ex('Push Ups', 0, { reps: 10 }), ex('Leg Raises', 1, { reps: 20 })] }],
    };
    let root: ReturnType<typeof create>;
    act(() => {
      root = create(<QuickWorkoutTimerModal visible workout={workout as any} theme={theme} onClose={() => {}} />);
    });
    act(() => { jest.advanceTimersByTime(3500); });

    let texts = findAllText(root!.toJSON());
    expect(texts).toContain('ROUND 1 OF 3');
    expect(texts).toContain('0:00');
    expect(texts).toContain('COMPLETE ROUND');

    act(() => { jest.advanceTimersByTime(30000); }); // 30s elapsed, stopwatch counts UP
    texts = findAllText(root!.toJSON());
    expect(texts).toContain('0:30');

    // Tap COMPLETE ROUND
    act(() => { findButtonByText(root!, 'COMPLETE ROUND').props.onPress(); });
    texts = findAllText(root!.toJSON());
    expect(texts).toContain('ROUND 2 OF 3');
    expect(texts).not.toContain('WORKOUT COMPLETE');

    act(() => { jest.advanceTimersByTime(30000); }); // 60s total elapsed now
    act(() => { findButtonByText(root!, 'COMPLETE ROUND').props.onPress(); });
    texts = findAllText(root!.toJSON());
    expect(texts).toContain('ROUND 3 OF 3');
    expect(texts).toContain('FINISH'); // last round shows FINISH, not COMPLETE ROUND

    act(() => { findButtonByText(root!, 'FINISH').props.onPress(); });
    texts = findAllText(root!.toJSON());
    expect(texts).toContain('WORKOUT COMPLETE');
    expect(texts).toContain('1:00'); // real elapsed time shown on the done screen

    jest.useRealTimers();
  });

  // Real bug reported from the live app: AMRAP (and every other format)
  // completed instantly after the 3-2-1 prep, every time, on a real device
  // — while every test above kept passing. Root cause: the parent screen
  // (WorkoutLibraryScreen) always renders <QuickWorkoutTimerModal
  // workout={workoutDetail} .../> in the tree with workout starting out
  // null, later updated once the athlete taps a card — the modal itself is
  // never remounted, just toggled visible/given a workout. Every test above
  // mounted `create()` with a real workout already in props on the very
  // first render, which never exercises useTimer's useState(initialSeconds)
  // trap: since useState's initializer only applies on the *first* mount,
  // mounting with workout=null seeds timer.seconds at a permanent 0 until
  // the first real reset()/start(). This test mounts null-first and updates
  // second, matching the real app's actual lifecycle.
  test('mounts with workout=null first (matches the real app), then updates to a real workout: AMRAP still counts down, does not complete instantly', () => {
    jest.useFakeTimers();
    const workout = { ...baseWorkout, format: 'amrap' as const, duration_minutes: 8, blocks: [] };
    let root: ReturnType<typeof create>;
    act(() => {
      root = create(<QuickWorkoutTimerModal visible={false} workout={null} theme={theme} onClose={() => {}} />);
    });
    act(() => {
      root!.update(<QuickWorkoutTimerModal visible workout={workout as any} theme={theme} onClose={() => {}} />);
    });
    act(() => { jest.advanceTimersByTime(3500); }); // clear the 3s prep lead-in

    const texts = findAllText(root!.toJSON());
    expect(texts).toContain('AMRAP');
    expect(texts).toContain('8:00');
    expect(texts).not.toContain('WORKOUT COMPLETE');

    jest.useRealTimers();
  });

  test('For Time, uncapped (no rounds set): plain stopwatch, no round counter, FINISH ends directly', () => {
    jest.useFakeTimers();
    const workout = { ...baseWorkout, format: 'fortime' as const, duration_minutes: null, rounds: null, blocks: [] };
    let root: ReturnType<typeof create>;
    act(() => {
      root = create(<QuickWorkoutTimerModal visible workout={workout as any} theme={theme} onClose={() => {}} />);
    });
    act(() => { jest.advanceTimersByTime(3500); });

    let texts = findAllText(root!.toJSON());
    expect(texts).toContain('FOR TIME');
    expect(texts).toContain('FINISH');
    expect(texts.some((t) => t.startsWith('ROUND'))).toBe(false);

    jest.useRealTimers();
  });
});
