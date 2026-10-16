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
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));

import { WarriorBlockCard } from '../WarriorBlockCard';
import { WeightStepper } from '../WeightStepper';
import { CircuitRoundCard } from '../CircuitRoundCard';

const theme = { card: { border: '#333', background: '#111' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' }, background: { primary: '#000' } };

const render = (metadata: any) => {
  const block: any = {
    id: 'b1', name: 'Strength A', notes: '', completedStatus: 'none', week_number: 1,
    metadata,
    exercises: [
      { id: 'e1', name: 'Goblet Squat', sets: '3', reps: '10', rest_seconds: '0', hold_seconds: '', is_weighted: true },
      { id: 'e2', name: 'Push-up', sets: '3', reps: '12', rest_seconds: '0', hold_seconds: '', is_weighted: false },
    ],
  };
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <WarriorBlockCard
        block={block} index={0} isExpanded theme={theme} mode="dark" solidCardBg="#111" bronzeGold="#C9A227" strengthTier={3}
        toggleBlockExpanded={jest.fn()} handleToggleBlockStatus={jest.fn()} handleOpenLogging={jest.fn()} startTimerForBlock={jest.fn()}
        onToggleVideo={jest.fn()} loggedSetsByExercise={{}} onSetLogged={jest.fn()}
        {...({} as any)}
      />,
    );
  });
  const out = { rounds: r.root.findAllByType(CircuitRoundCard).length, kg: r.root.findAllByType(WeightStepper).length };
  act(() => r.unmount());
  return out;
};

it('straight-set superset with a weighted exercise: round cards with a kg entry (round 1; later rounds unlock in turn)', () => {
  expect(render({ structure: 'superset', timing_system: 'straight_set', rounds: 3, rest_after_round: 60 })).toEqual({ rounds: 3, kg: 1 });
});

it('a circuit saved with a legacy timing_system "circuit" still gets round cards and kg (it showed read-only rows)', () => {
  expect(render({ structure: 'circuit', timing_system: 'circuit', rounds: '2', is_weighted: true })).toEqual({ rounds: 2, kg: 1 });
});

it('timed formats keep their own loggers (no round cards)', () => {
  expect(render({ structure: 'circuit', timing_system: 'amrap', time_cap_min: 10 }).rounds).toBe(0);
  expect(render({ structure: 'circuit', timing_system: 'tabata' }).rounds).toBe(0);
});

// 2026-10-16: the AI Coach's Skills superset (Muscle Up 3 reps + Straddle
// Front Lever Hold 8s) showed the hold as "0" reps in every round.
it('a hold inside a superset reaches the round cards as seconds, a rep exercise as reps', () => {
  const block: any = {
    id: 'b2', name: 'Skills', notes: '', completedStatus: 'none', week_number: 4,
    metadata: { structure: 'superset', timing_system: 'straight_set', rounds: '3', rest_after_round: 90 },
    exercises: [
      { id: 'mu', name: 'Muscle Up', sets: '1', reps: '3', rest_seconds: '', hold_seconds: '', is_weighted: false },
      { id: 'fl', name: 'Straddle Front Lever Hold', sets: '1', reps: '', rest_seconds: '', hold_seconds: '8', is_weighted: false },
    ],
  };
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <WarriorBlockCard
        block={block} index={1} isExpanded theme={theme} mode="dark" solidCardBg="#111" bronzeGold="#C9A227" strengthTier={7}
        toggleBlockExpanded={jest.fn()} handleToggleBlockStatus={jest.fn()} handleOpenLogging={jest.fn()} startTimerForBlock={jest.fn()}
        onToggleVideo={jest.fn()} loggedSetsByExercise={{}} onSetLogged={jest.fn()}
        {...({} as any)}
      />,
    );
  });
  const rounds = r.root.findAllByType(CircuitRoundCard);
  expect(rounds).toHaveLength(3);
  expect(rounds[0].props.exercises).toEqual([
    expect.objectContaining({ id: 'mu', targetReps: 3, holdSeconds: 0 }),
    expect.objectContaining({ id: 'fl', targetReps: 0, holdSeconds: 8 }),
  ]);
  act(() => r.unmount());
});
