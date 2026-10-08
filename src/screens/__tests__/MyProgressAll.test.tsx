import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { router: { push: jest.fn(), back: jest.fn() }, useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const mockPerformance = {
  weighted: [],
  bodyweight: [],
  worlds: [],
  completion: [{ program_id: 'p1', name: 'Plan', status: 'active', assigned_at: '2026-09-01T00:00:00Z', current_week: 2, weeks: [{ week: 1, total: 4, completed: 4, missed: 0, avg_rpe: null, feel: {} }] }],
  movements: [
    { family: 'pull_up', weeks: [{ program_id: 'p1', week: 1, reps: 30, assumed: 0, best: 10, sets: 3, variations: { '': 30 } }, { program_id: 'p1', week: 2, reps: 40, assumed: 10, best: 12, sets: 4, variations: { '': 30 } }] },
    { family: 'dip', weeks: [{ program_id: 'p1', week: 2, reps: 60, assumed: 0, best: 15, sets: 5, variations: { '': 60 } }] },
    { family: 'squat', weeks: [{ program_id: 'p1', week: 1, reps: 100, assumed: 0, best: 25, sets: 4, variations: { '': 100 } }] },
  ],
  holds: [],
};
jest.mock('../../lib/performance', () => ({
  ...jest.requireActual('../../lib/performance'),
  getMyPerformance: jest.fn(() => Promise.resolve(mockPerformance)),
}));

import { MyProgressScreen } from '../MyProgressScreen';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const tap = async (r: ReactTestRenderer, label: string) => {
  const n = r.root.findAll(x => x.props.accessibilityRole === 'button' && typeof x.props.onPress === 'function' && texts(x.children as any).join('') === label)[0];
  if (!n) throw new Error(`no button "${label}"`);
  await act(async () => { n.props.onPress(); });
};

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));

it('Main movements → All: latest week by default, ranked, week picks, tap opens a movement', async () => {
  await act(async () => { r = create(<MyProgressScreen />); });
  await act(async () => {});
  await tap(r, 'All');
  let text = allText(r);
  expect(text).toContain('Every movement, summed over the weeks you pick');
  // Default: latest week (W2): dips 60, pull-ups 40 → 100 reps, 9 sets, 10 assumed.
  expect(text).toContain('100');
  expect(text).toContain('reps in W2 · 9 sets · 10 assumed');
  const rowLabels = () => r.root.findAll(x => typeof x.props.accessibilityLabel === 'string' && x.props.accessibilityLabel.includes('Open its weekly chart') && x.props.onPress).map(x => x.props.accessibilityLabel.split(':')[0]);
  expect(rowLabels()).toEqual(['Dips', 'Pull-ups']); // biggest first, squats not in W2

  await tap(r, 'All weeks');
  text = allText(r);
  expect(text).toContain('reps in all weeks · 16 sets');
  expect(rowLabels()).toEqual(['Squats', 'Pull-ups', 'Dips']);

  await tap(r, 'W1'); // from All weeks, a tap starts over with that week
  expect(allText(r)).toContain('reps in W1 · 7 sets');
  await tap(r, 'W2'); // and adds weeks
  expect(allText(r)).toContain('reps in W1–W2 · 16 sets');

  const row = r.root.findAll(x => typeof x.props.accessibilityLabel === 'string' && x.props.accessibilityLabel.startsWith('Squats:') && x.props.onPress)[0];
  await act(async () => { row.props.onPress(); });
  expect(allText(r)).toContain('Total reps per week'); // back on the single-movement chart
});

it('Skill holds → All: seconds and hold counts', async () => {
  const perf = require('../../lib/performance');
  perf.getMyPerformance.mockResolvedValueOnce({
    ...mockPerformance,
    movements: [],
    holds: [
      { family: 'planche', weeks: [{ program_id: 'p1', week: 1, seconds: 45, assumed: 0, longest: 15, longest_variation: null, sets: 3, variations: { '': 45 } }] },
      { family: 'handstand', weeks: [{ program_id: 'p1', week: 1, seconds: 90, assumed: 0, longest: 40, longest_variation: null, sets: 2, variations: { '': 90 } }] },
    ],
  });
  await act(async () => { r = create(<MyProgressScreen />); });
  await act(async () => {});
  await tap(r, 'All');
  const text = allText(r);
  expect(text).toContain('Every skill hold, summed over the weeks you pick');
  expect(text).toContain('135');
  expect(text).toContain('held in W1 · 5 holds');
});
