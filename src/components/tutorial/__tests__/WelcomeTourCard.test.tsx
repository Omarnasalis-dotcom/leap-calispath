import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { WelcomeTourCard } from '../WelcomeTourCard';

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
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));

describe('WelcomeTourCard', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => { act(() => r?.unmount()); r = undefined; });

  it.each([0, 4, 9])('mounts for tier %i', (tier) => {
    act(() => { r = create(<WelcomeTourCard visible tier={tier} name="Omar Nasser" onStart={jest.fn()} onSkip={jest.fn()} />); });
    const json = JSON.stringify(r!.toJSON());
    expect(json).toContain('OMAR');
    expect(json).toContain('DISCOVER THE APP');
    expect(json).toContain('COMMUNITY');
  });

  it('greets without a name', () => {
    act(() => { r = create(<WelcomeTourCard visible tier={2} name={null} onStart={jest.fn()} onSkip={jest.fn()} />); });
    expect(JSON.stringify(r!.toJSON())).toContain('WELCOME');
  });

  it('renders nothing while hidden', () => {
    act(() => { r = create(<WelcomeTourCard visible={false} tier={2} onStart={jest.fn()} onSkip={jest.fn()} />); });
    expect(JSON.stringify(r!.toJSON() ?? '')).not.toContain('DISCOVER');
  });
});
