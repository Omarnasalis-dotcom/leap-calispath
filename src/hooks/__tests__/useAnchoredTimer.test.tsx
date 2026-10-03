import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useAnchoredCountdown, useAnchoredStopwatch } from '../useAnchoredTimer';

// Captures AppState listeners so a test can play "back in the foreground".
let appStateListeners: Array<(s: string) => void> = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
  appStateListeners.push(cb);
  return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
}) as never);

/** JS suspended (app in the background): the clock moves, no timer runs. */
const suspend = (ms: number) => { jest.setSystemTime(Date.now() + ms); };
/** Foreground running: clock and intervals move together. */
const run = (ms: number) => {
  act(() => { jest.advanceTimersByTime(ms); });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);
  appStateListeners = [];
});
afterEach(() => jest.useRealTimers());

function Countdown({ start, onDone, out }: { start: number; onDone: () => void; out: { left: number } }) {
  const [left, setLeft] = useState(start);
  out.left = left;
  useAnchoredCountdown(true, left, setLeft, onDone);
  return null;
}

function Stopwatch({ cap, onCap, out }: { cap: number; onCap: () => void; out: { elapsed: number } }) {
  const [elapsed, setElapsed] = useState(0);
  out.elapsed = elapsed;
  useAnchoredStopwatch(true, elapsed, setElapsed, cap, onCap);
  return null;
}

describe('useAnchoredCountdown', () => {
  test('counts down in the foreground', () => {
    const out = { left: 0 };
    act(() => { create(<Countdown start={60} onDone={jest.fn()} out={out} />); });
    run(10_000);
    expect(out.left).toBe(50);
  });

  test('keeps the time spent in the background (AppState event first)', () => {
    const out = { left: 0 };
    act(() => { create(<Countdown start={60} onDone={jest.fn()} out={out} />); });
    run(5_000);
    suspend(30_000);
    act(() => { appStateListeners.forEach(l => l('active')); });
    expect(out.left).toBe(25);
  });

  test('keeps it when the overdue tick fires before the AppState event (iOS)', () => {
    const out = { left: 0 };
    act(() => { create(<Countdown start={60} onDone={jest.fn()} out={out} />); });
    suspend(30_000);
    act(() => { jest.advanceTimersByTime(250); }); // overdue tick first
    act(() => { appStateListeners.forEach(l => l('active')); });
    expect(out.left).toBe(30);
  });

  test('finishing in the background fires onDone once on return', () => {
    const out = { left: 0 };
    const onDone = jest.fn();
    act(() => { create(<Countdown start={20} onDone={onDone} out={out} />); });
    suspend(90_000);
    act(() => { jest.advanceTimersByTime(250); });
    act(() => { appStateListeners.forEach(l => l('active')); });
    run(1_000);
    expect(out.left).toBe(0);
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('useAnchoredStopwatch', () => {
  test('keeps the time spent in the background and stops at the cap once', () => {
    const out = { elapsed: 0 };
    const onCap = jest.fn();
    act(() => { create(<Stopwatch cap={120} onCap={onCap} out={out} />); });
    run(10_000);
    suspend(40_000);
    act(() => { jest.advanceTimersByTime(250); });
    expect(out.elapsed).toBe(50);
    suspend(100_000);
    act(() => { appStateListeners.forEach(l => l('active')); });
    run(1_000);
    expect(out.elapsed).toBe(120);
    expect(onCap).toHaveBeenCalledTimes(1);
  });
});
