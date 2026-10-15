import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { PRCelebration } from '../PRCelebration';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../../../lib/SoundService', () => ({ SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playLand: jest.fn(), preload: jest.fn() } }));
jest.mock('../../../lib/shareCard', () => ({ shareCardImage: jest.fn() }));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: {} }) }));
jest.mock('../../LeapLogo', () => ({ LeapLogo: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

describe('PRCelebration · strength', () => {
  let r: ReactTestRenderer | undefined;
  afterEach(() => { act(() => r?.unmount()); r = undefined; });

  it('shows the new best time, the old one and the time saved', () => {
    act(() => { r = create(<PRCelebration visible world="strength" movement="Hoplite Trial" value={192} previous={220} handle="omar" onDismiss={jest.fn()} />); });
    const s = JSON.stringify(r!.toJSON());
    expect(s).toContain('NEW BEST TIME');
    expect(s).toContain('3:40');
    expect(s).toContain('−0:28');
    expect(s).toContain('TIME SAVED');
  });

  it('shows the leaderboard rank the new best earned', () => {
    act(() => { r = create(<PRCelebration visible world="strength" movement="Hoplite Trial" value={192} previous={220} handle="omar" rank={{ from: 10, to: 5, of: 48 }} onDismiss={jest.fn()} />); });
    const s = JSON.stringify(r!.toJSON());
    expect(s).toContain('LEADERBOARD RANK');
    expect(s).toContain('#48'); // the count starts from the board's size
    expect(s).toContain('OF 48');
  });
});
