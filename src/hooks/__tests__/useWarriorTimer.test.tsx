import React from 'react';
import { act, create } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useWarriorTimer } from '../useWarriorTimer';

jest.mock('../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));

let appStateListeners: Array<(s: string) => void> = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
  appStateListeners.push(cb);
  return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
}) as never);

const suspend = (ms: number) => { jest.setSystemTime(Date.now() + ms); };
const run = (ms: number) => { act(() => { jest.advanceTimersByTime(ms); }); };
const backToForeground = () => act(() => { appStateListeners.forEach(l => l('active')); });

type Timer = ReturnType<typeof useWarriorTimer>;
let timer: Timer;
const onTabataComplete = jest.fn();
function Harness() {
  timer = useWarriorTimer({ onAmrapComplete: jest.fn(), onForTimeComplete: jest.fn(), onTabataComplete });
  return null;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(1_000_000);
  appStateListeners = [];
  onTabataComplete.mockClear();
  act(() => { create(<Harness />); });
});
afterEach(() => jest.useRealTimers());

// Tabata: 20s work / 10s rest, 2 rounds × 1 exercise = 2 work intervals.
const TABATA = {
  id: 'b1',
  metadata: { timing_system: 'tabata', tabata_work_seconds: 20, tabata_rest_seconds: 10, tabata_rounds: 2 },
  exercises: [{ name: 'Squat Jumps' }],
};

describe('useWarriorTimer — background', () => {
  test('Tabata runs in the foreground: get-ready, work, rest', () => {
    act(() => { timer.startTimerForBlock(TABATA); });
    run(5_000); // get-ready
    expect(timer.timerRunning).toBe(true);
    run(25_000); // 20s work + 5s into rest
    expect(timer.tabataPhase).toBe('rest');
    expect(timer.timeLeft).toBe(5);
  });

  test('Tabata keeps going while the app is in the background (tick fires before AppState)', () => {
    act(() => { timer.startTimerForBlock(TABATA); });
    run(5_000);
    run(3_000); // 17s of work 1 left
    suspend(40_000); // → 17 work, 10 rest, 13 into work 2 (7s left)
    run(250); // overdue tick first
    backToForeground();
    expect(timer.currentRound).toBe(2);
    expect(timer.tabataPhase).toBe('work');
    expect(timer.timeLeft).toBe(7);
  });

  test('a get-ready that ends in the background starts the timer when it ended', () => {
    act(() => { timer.startTimerForBlock(TABATA); });
    run(2_000);
    suspend(13_000); // get-ready ended 10s ago
    backToForeground();
    run(250);
    expect(timer.timerRunning).toBe(true);
    expect(timer.tabataPhase).toBe('work');
    expect(timer.timeLeft).toBe(10);
  });

  test('Tabata that finishes in the background completes once', () => {
    act(() => { timer.startTimerForBlock(TABATA); });
    run(5_000);
    suspend(120_000);
    backToForeground();
    run(1_000);
    expect(timer.timerRunning).toBe(false);
    expect(onTabataComplete).toHaveBeenCalledTimes(1);
  });

  test('Tabata ends on the last work: no rest after it', () => {
    act(() => { timer.startTimerForBlock(TABATA); });
    run(5_000); // get-ready
    run(20_000 + 10_000 + 19_000); // work 1, rest, 19s into the last work
    expect(timer.tabataPhase).toBe('work');
    expect(onTabataComplete).not.toHaveBeenCalled();
    run(1_500); // last work ends -> complete at once (old: a 10s rest first)
    expect(timer.timerRunning).toBe(false);
    expect(onTabataComplete).toHaveBeenCalledTimes(1);
  });

  test('circuit rest keeps going in the background', () => {
    act(() => {
      timer.startTimerForBlock({ id: 'c1', metadata: { structure: 'circuit', rounds: 3, rest_after_round: 90 } });
    });
    act(() => { timer.handleStartRest(); });
    run(10_000);
    suspend(30_000);
    run(250);
    backToForeground();
    expect(timer.timeLeft).toBe(50);
  });
});
