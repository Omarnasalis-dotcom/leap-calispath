import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('../../services/StepService', () => ({
  getStepProgress: jest.fn(),
  getAllStepProgress: jest.fn(),
  onStepSaved: () => () => {},
}));

import { useStepProgress } from '../useStepProgress';
import { getStepProgress } from '../../services/StepService';

let latest: ReturnType<typeof useStepProgress>;
function Probe({ userId, tier }: { userId: string; tier: number }) {
  latest = useStepProgress(userId, tier);
  return null;
}

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));

// Strength Trials audit M4: the Journey checkpoint waits for this, so a
// failed load must be told apart from "still loading".
it('reports a failed load, then clears it on a successful retry', async () => {
  (getStepProgress as jest.Mock)
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValueOnce({ cleared: [1], best: { 1: 300 } });
  await act(async () => { r = create(<Probe userId="u-m4" tier={4} />); });
  expect(latest.progress).toBeNull();
  expect(latest.failed).toBe(true);

  await act(async () => { await latest.refresh(); });
  expect(latest.failed).toBe(false);
  expect(latest.progress).toEqual({ cleared: [1], best: { 1: 300 } });
});

it('never loads, and never fails, for a tier without steps', async () => {
  (getStepProgress as jest.Mock).mockClear();
  await act(async () => { r = create(<Probe userId="u-helot" tier={0} />); });
  expect(getStepProgress).not.toHaveBeenCalled();
  expect(latest.failed).toBe(false);
});
