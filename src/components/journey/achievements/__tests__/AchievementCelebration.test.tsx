import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AchievementCelebration } from '../AchievementCelebration';
import { ACHIEVEMENTS } from '../../../../lib/journeyAchievements';
import { CelebrationData } from '../../../../lib/journeyCelebration';

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  // The library mock has no frame callback (used by useFxClock's jank monitor).
  useFrameCallback: () => ({ setActive: jest.fn(), isActive: false, callbackId: 0 }),
}));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../../../../lib/SoundService', () => ({ SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn() } }));
jest.mock('../../../../lib/shareCard', () => ({ shareCardImage: jest.fn() }));
jest.mock('../../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));
jest.mock('../../../LeapLogo', () => ({ LeapLogo: () => null }));
jest.mock('../../../GlobalErrorBoundary', () => ({ GlobalErrorBoundary: ({ children }: { children: React.ReactNode }) => children }), { virtual: true });

function data(level: number, double = false): CelebrationData {
  const a = ACHIEVEMENTS[level - 1];
  return {
    level,
    previousLevel: double ? Math.max(0, level - 2) : level - 1,
    skipped: double && level > 1 ? [level - 1] : [],
    fromPoints: Math.round(a.threshold * 0.9),
    toPoints: a.threshold + 120,
    nextThreshold: ACHIEVEMENTS[level]?.threshold ?? null,
  };
}

describe('AchievementCelebration', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => { act(() => r?.unmount()); r = undefined; });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('mounts the full celebration for level %i', (level) => {
    act(() => { r = create(<AchievementCelebration data={data(level)} onDone={jest.fn()} />); });
    expect(r!.toJSON()).toBeTruthy();
  });

  it('mounts a double jump with the skipped line', () => {
    act(() => { r = create(<AchievementCelebration data={data(6, true)} onDone={jest.fn()} />); });
    expect(JSON.stringify(r!.toJSON())).toContain('WARRIOR');
  });

  it('renders nothing without data', () => {
    act(() => { r = create(<AchievementCelebration data={null} onDone={jest.fn()} />); });
    expect(r!.toJSON()).toBeNull();
  });
});
