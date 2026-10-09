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

import { SetRow } from '../SetRow';
import { CircuitRoundCard } from '../CircuitRoundCard';
import { WeightStepper } from '../WeightStepper';

const theme = { card: { border: '#333', background: '#111' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } };

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const byLabel = (r: ReactTestRenderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = (r: ReactTestRenderer, label: string) => act(() => { byLabel(r, label).props.onPress(); });
const startBtn = (r: ReactTestRenderer) =>
  r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes('START'))[0];

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { mounted.splice(0).forEach(r => r.unmount()); }));
const mount = (el: React.ReactElement) => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };

describe('SetRow (straight sets)', () => {
  const base = { setIndex: 3, targetReps: 8, restSeconds: 90, theme, bronzeGold: '#C9A227', onSetDraft: jest.fn() };

  it('the last set starts no rest; other sets do', () => {
    const last = mount(<SetRow {...base} isLastSet completed={false} onSetComplete={jest.fn()} />);
    act(() => startBtn(last).props.onPress());
    expect(allText(last)).not.toContain('1:30');

    const middle = mount(<SetRow {...base} setIndex={2} completed={false} onSetComplete={jest.fn()} />);
    act(() => startBtn(middle).props.onPress());
    expect(allText(middle)).toContain('1:30');
  });

  it('weighted: − / + kg, starting from the previous set, saved as a draft before ✓', () => {
    const onSetDraft = jest.fn();
    const r = mount(<SetRow {...base} isWeighted suggestedWeight={20} completed={false} onSetComplete={jest.fn()} onSetDraft={onSetDraft} />);
    expect(allText(r)).toContain('WEIGHT');
    press(r, 'WEIGHT +');
    expect(onSetDraft).toHaveBeenLastCalledWith({ setIndex: 3, reps: 8, weight: 20 });
    press(r, 'WEIGHT +');
    expect(onSetDraft).toHaveBeenLastCalledWith({ setIndex: 3, reps: 8, weight: 22.5 });
    press(r, 'WEIGHT −');
    expect(onSetDraft).toHaveBeenLastCalledWith({ setIndex: 3, reps: 8, weight: 20 });
  });

  it('a done set (rest over) can still change reps and kg: each edit re-saves it', () => {
    const onSetComplete = jest.fn();
    const r = mount(<SetRow {...base} isWeighted isLastSet completed onSetComplete={onSetComplete} />);
    press(r, 'REPS −');
    expect(onSetComplete).toHaveBeenLastCalledWith({ setIndex: 3, reps: 7, weight: undefined });
    press(r, 'WEIGHT +');
    expect(onSetComplete).toHaveBeenLastCalledWith({ setIndex: 3, reps: 7, weight: 2.5 });
  });
});

describe('CircuitRoundCard (supersets / circuits)', () => {
  const exercises = [
    { id: 'a', name: 'Weighted Dip', targetReps: 8, isWeighted: true, suggestedWeight: 10 },
    { id: 'b', name: 'Pull-up', targetReps: 6 },
  ];

  it('weighted exercises get a kg entry, saved with the round', () => {
    const onRoundComplete = jest.fn();
    const r = mount(
      <CircuitRoundCard roundNumber={2} totalRounds={3} exercises={exercises} restSeconds={60} theme={theme} bronzeGold="#C9A227"
        isLocked={false} completed={false} onRoundComplete={onRoundComplete} />,
    );
    expect(r.root.findAllByType(WeightStepper)).toHaveLength(1); // the dip only
    press(r, 'WEIGHT +'); // empty → previous round's 10 kg
    press(r, 'WEIGHT +'); // → 12.5
    const complete = r.root.findAll(n => typeof n.props.onPress === 'function' && n.props.style && texts(n.children as any).some(x => /ROUND/i.test(x)))[0]
      ?? r.root.findAll(n => typeof n.props.onPress === 'function').pop()!;
    act(() => complete.props.onPress());
    expect(onRoundComplete).toHaveBeenLastCalledWith([
      { exerciseId: 'a', reps: 8, weight: 12.5 },
      { exerciseId: 'b', reps: 6, weight: undefined },
    ]);
  });

  it('a completed round stays editable and re-saves', () => {
    const onRoundComplete = jest.fn();
    const r = mount(
      <CircuitRoundCard roundNumber={1} totalRounds={3} exercises={exercises} restSeconds={0} theme={theme} bronzeGold="#C9A227"
        isLocked={false} completed onRoundComplete={onRoundComplete} />,
    );
    press(r, 'Pull-up REPS +');
    expect(onRoundComplete).toHaveBeenLastCalledWith([
      { exerciseId: 'a', reps: 8, weight: undefined },
      { exerciseId: 'b', reps: 7, weight: undefined },
    ]);
  });
});
