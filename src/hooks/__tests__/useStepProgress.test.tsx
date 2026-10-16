import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return { useFocusEffect: (cb: () => void) => useEffect(cb, [cb]) };
});
jest.mock('../../services/StepService', () => ({
  getStepProgress: jest.fn(),
  getAllStepProgress: jest.fn(),
  onStepSaved: () => () => {},
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAllStepProgress, useStepProgress } from '../useStepProgress';
import { getAllStepProgress, getStepProgress } from '../../services/StepService';

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

// The Strength path card hides its step rows until progress is known: the
// copy saved on the phone shows at once while the server is still answering.
it('shows the saved copy while the server is slow, then the server copy', async () => {
  let answer: (v: unknown) => void = () => {};
  (getStepProgress as jest.Mock).mockReturnValueOnce(new Promise(res => { answer = res; }));
  await AsyncStorage.setItem('step_progress:v1:u-saved:4', JSON.stringify({ cleared: [1], best: { 1: 280 } }));
  await act(async () => { r = create(<Probe userId="u-saved" tier={4} />); });
  expect(latest.progress).toEqual({ cleared: [1], best: { 1: 280 } });

  await act(async () => { answer({ cleared: [1, 2], best: { 1: 270, 2: 300 } }); });
  expect(latest.progress).toEqual({ cleared: [1, 2], best: { 1: 270, 2: 300 } });
  expect(JSON.parse((await AsyncStorage.getItem('step_progress:v1:u-saved:4'))!)).toEqual({ cleared: [1, 2], best: { 1: 270, 2: 300 } });
});

let latestAll: ReturnType<typeof useAllStepProgress>;
function AllProbe({ userId }: { userId: string }) {
  latestAll = useAllStepProgress(userId);
  return null;
}

it('every tier: the saved copy shows at once too', async () => {
  (getAllStepProgress as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
  await AsyncStorage.setItem('step_progress:v1:all:u-all', JSON.stringify({ 4: { cleared: [1], best: { 1: 280 } } }));
  await act(async () => { r = create(<AllProbe userId="u-all" />); });
  expect(latestAll.all).toEqual({ 4: { cleared: [1], best: { 1: 280 } } });
});
