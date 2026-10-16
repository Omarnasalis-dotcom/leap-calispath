// The hold timer (useExerciseHoldTimer) is shared by a single exercise's HOLD badge
// (WarriorExerciseRow) and a hold inside a superset/circuit round
// (CircuitRoundCard, 2026-10-16). Same run in both: tap → 5 s get-ready →
// the hold counting down → buzzer; tap again to stop.
import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));

import { SoundServiceInstance } from '../../../lib/SoundService';
import { WarriorExerciseRow } from '../WarriorExerciseRow';
import { CircuitRoundCard } from '../CircuitRoundCard';

const theme = { card: { border: '#333', background: '#111' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } };

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const tap = (r: ReactTestRenderer, label: string) =>
  act(() => { r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress(); });
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

const mounted: ReactTestRenderer[] = [];
const mount = (el: React.ReactElement) => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { act(() => { mounted.splice(0).forEach(r => r.unmount()); }); jest.useRealTimers(); });

describe('single exercise HOLD badge (unchanged by the move to useExerciseHoldTimer)', () => {
  const exercise = { id: 'e1', name: 'Tuck Front Lever Hold', youtube_url: '', sets: '3', reps: '', rest_seconds: '90', hold_seconds: '3', notes: '' };

  it('get-ready, hold, buzzer', () => {
    const r = mount(<WarriorExerciseRow exercise={exercise} theme={theme} solidCardBg="#111" bronzeGold="#C9A227" onToggleVideo={jest.fn()} />);
    tap(r, 'HOLD 3S');
    expect(allText(r)).toContain('GET READY');
    advance(5250);
    expect(allText(r)).toContain('HOLDING');
    expect(SoundServiceInstance.playBoxingBell).toHaveBeenCalled();
    advance(3250);
    expect(allText(r)).toContain('HOLD DONE');
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalledWith(3);
  });
});

describe('hold inside a superset round', () => {
  const mixed = [
    { id: 'mu', name: 'Muscle Up', targetReps: 3 },
    { id: 'fl', name: 'Straddle Front Lever Hold', targetReps: 0, holdSeconds: 8 },
  ];
  const card = (props: Partial<React.ComponentProps<typeof CircuitRoundCard>> = {}) => (
    <CircuitRoundCard roundNumber={1} totalRounds={3} exercises={mixed} restSeconds={60} theme={theme} bronzeGold="#C9A227"
      isLocked={false} completed={false} onRoundComplete={jest.fn()} {...props} />
  );

  it('tapping the seconds runs the hold timer: get-ready, 8 s hold, buzzer', () => {
    const r = mount(card());
    tap(r, 'Straddle Front Lever Hold HOLD 8S');
    expect(allText(r)).toContain('GET READY');
    advance(5250);
    expect(allText(r)).toContain('HOLDING');
    advance(4000);
    expect(allText(r)).toMatch(/4 \| HOLDING|5 \| HOLDING/);
    advance(4250);
    expect(allText(r)).toContain('HOLD DONE');
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalledWith(3);
  });

  it('times the value the athlete set, and a second tap stops it', () => {
    const r = mount(card());
    tap(r, 'Straddle Front Lever Hold SEC +'); // 8 → 9
    tap(r, 'Straddle Front Lever Hold HOLD 9S');
    advance(5250);
    expect(allText(r)).toContain('9 | HOLDING');
    tap(r, 'Straddle Front Lever Hold HOLD 9S');
    expect(allText(r)).not.toContain('HOLDING');
    expect(allText(r)).toContain('9 | SEC');
  });

  it('a locked round cannot start the timer', () => {
    const r = mount(card({ isLocked: true, roundNumber: 2 }));
    const btn = r.root.findAll(n => n.props.accessibilityLabel === 'Straddle Front Lever Hold HOLD 8S' && typeof n.props.onPress === 'function')[0];
    expect(btn.props.disabled).toBe(true);
  });
});
