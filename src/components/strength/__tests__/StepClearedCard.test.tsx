import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { StepClearedCard, StepClearedData } from '../StepClearedCard';

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  // The library mock has no frame callback (used by useFxClock's jank monitor).
  useFrameCallback: () => ({ setActive: jest.fn(), isActive: false, callbackId: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));

const base: StepClearedData = { tier: 4, step: 1, timeSeconds: 212, previousBest: null, clearedBefore: [], fromJourney: false, practice: false };
const text = (r: ReactTestRenderer) => JSON.stringify(r.toJSON());

describe('StepClearedCard', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => { act(() => r?.unmount()); r = undefined; });

  it('first clear: step cleared, next hint to Step 2', () => {
    act(() => { r = create(<StepClearedCard data={base} onDone={jest.fn()} />); });
    const s = text(r!);
    expect(s).toContain('STEP CLEARED');
    expect(s).toContain('SPARTAN');
    expect(s).toContain('Next: ');
    expect(s).toContain('3:32');
  });

  it('new best: old and new time with the delta, +100 from Journey', () => {
    act(() => { r = create(<StepClearedCard data={{ ...base, previousBest: 240, clearedBefore: [1], fromJourney: true }} onDone={jest.fn()} />); });
    const s = text(r!);
    expect(s).toContain('NEW BEST');
    expect(s).toContain('4:00');
    expect(s).toContain('−0:28');
    expect(s).toContain('POINTS');
  });

  it('slower: your best, no points without Journey', () => {
    act(() => { r = create(<StepClearedCard data={{ ...base, previousBest: 190, clearedBefore: [1] }} onDone={jest.fn()} />); });
    const s = text(r!);
    expect(s).toContain('THIS RUN');
    expect(s).toContain('Your best');
    expect(s).not.toContain('POINTS');
  });

  it('last step cleared: ready for the trial', () => {
    act(() => { r = create(<StepClearedCard data={{ ...base, step: 2, clearedBefore: [1] }} onDone={jest.fn()} />); });
    expect(text(r!)).toContain("You're ready for the ");
  });

  it('practice: no next guidance', () => {
    act(() => { r = create(<StepClearedCard data={{ ...base, tier: 2, practice: true }} onDone={jest.fn()} />); });
    expect(text(r!)).not.toContain('Next: ');
  });

  it('renders nothing without data', () => {
    act(() => { r = create(<StepClearedCard data={null} onDone={jest.fn()} />); });
    expect(text(r!)).not.toContain('STEP');
  });
});
