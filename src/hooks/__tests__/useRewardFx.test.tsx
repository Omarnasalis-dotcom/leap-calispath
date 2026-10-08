import React from 'react';
import { act, create } from 'react-test-renderer';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('../../components/journey/RewardFx', () => ({ BURST_LAND_MS: 1150 }));

import { useRewardFx } from '../useRewardFx';
import { JourneyPointsSummary, PointsEntry } from '../../lib/journeyPoints';

type Fx = ReturnType<typeof useRewardFx>;

function setup() {
  const ref: { current: Fx | null } = { current: null };
  function Probe() {
    ref.current = useRewardFx();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return ref as { current: Fx };
}

const summary = (total: number): JourneyPointsSummary => ({
  today: '2026-10-04',
  total,
  streak: 1,
  best_streak: 1,
  trained_today: true,
  values: {},
  tasks_today: [],
  week: [],
  recent: [],
  new_awards: [],
});
const e = (source: PointsEntry['source'], points: number, label: string | null = null, date = '2026-10-04'): PointsEntry => ({
  date,
  source,
  label,
  points,
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('an extra: counter holds the old total until the burst lands', () => {
  const fx = setup();
  act(() => fx.current.play([e('task_run', 20, '5')], summary(120), { x: 10, y: 300 }, { x: 40, y: 20 }));
  expect(fx.current.displayOverride).toBe(100);
  expect(fx.current.bursts).toHaveLength(1);
  expect(fx.current.bursts[0]).toMatchObject({ amount: 20, dx: 30, dy: -280, label: 'RUN · 5 KM' });
  act(() => jest.advanceTimersByTime(1150));
  expect(fx.current.displayOverride).toBe(120);
  act(() => jest.advanceTimersByTime(400));
  expect(fx.current.displayOverride).toBeNull();
  expect(fx.current.toasts).toHaveLength(0);
});

test('workout + bonuses: one burst labelled with the day, then toasts for streak and perfect day', () => {
  const fx = setup();
  const awards = [e('task_book', 10, '3'), e('program_day', 50, 'Pull Day'), e('streak', 15, '3'), e('perfect_day', 20)];
  act(() => fx.current.play(awards, summary(195), { x: 0, y: 0 }, null));
  expect(fx.current.displayOverride).toBe(100);
  expect(fx.current.bursts[0]).toMatchObject({ amount: 60, label: 'PULL DAY' });
  act(() => jest.advanceTimersByTime(1150));
  expect(fx.current.displayOverride).toBe(160); // earned landed, bonuses not yet
  act(() => jest.advanceTimersByTime(350));
  expect(fx.current.displayOverride).toBeNull();
  expect(fx.current.toasts.map((t) => t.title)).toEqual(['3-day streak', 'Perfect day']);
  act(() => fx.current.dismissToast());
  expect(fx.current.toasts.map((t) => t.title)).toEqual(['Perfect day']);
});

test('catch-up of older progress plays as one "progress so far" burst', () => {
  const fx = setup();
  const awards = [e('program_day', 50, 'Day 1', '2026-09-28'), e('program_day', 50, 'Day 2', '2026-10-01')];
  act(() => fx.current.play(awards, summary(100), { x: 0, y: 0 }, null));
  expect(fx.current.bursts).toHaveLength(1);
  expect(fx.current.bursts[0]).toMatchObject({ amount: 100, label: 'YOUR PROGRESS SO FAR' });
});

test('sparkle: rings and sparks only, no number', () => {
  const fx = setup();
  act(() => fx.current.sparkle({ x: 5, y: 6 }));
  expect(fx.current.bursts[0]).toMatchObject({ amount: 0, label: '', x: 5, y: 6 });
  act(() => fx.current.removeBurst(fx.current.bursts[0].id));
  expect(fx.current.bursts).toHaveLength(0);
});
