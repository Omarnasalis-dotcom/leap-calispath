import React from 'react';
import { Modal } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', theme: { background: { primary: '#000' }, card: { border: '#333' }, text: { primary: '#fff', secondary: '#aaa' } } }),
}));
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ loading: false, profileLoading: false, profile: { id: 'u1' }, profileLoadFailed: false, user: { id: 'u1' } }),
}));
jest.mock('../LeapLogo', () => ({ LeapLogo: () => null }));
const mockTrack = jest.fn();
jest.mock('../../lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));

import { SoftUpdatePrompt } from '../SoftUpdatePrompt';

// iOS shows one modal at a time: if another is up, this one never appears,
// and the day must not be used up — only a real show (onShow) counts.
describe('SoftUpdatePrompt', () => {
  let r: ReactTestRenderer;
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    mockTrack.mockClear();
  });
  afterEach(() => {
    act(() => r.unmount());
    jest.useRealTimers();
  });

  it('only marks today as shown once the modal is really on screen', async () => {
    await act(async () => { r = create(<SoftUpdatePrompt storeUrl="https://apps.apple.com/app/id1" />); });
    await act(async () => { jest.advanceTimersByTime(1500); });
    const modal = r.root.findByType(Modal);
    expect(modal.props.visible).toBe(true);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalledWith('soft_update_shown');

    await act(async () => { modal.props.onShow(); });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('soft_update_prompt_day_v1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(mockTrack).toHaveBeenCalledWith('soft_update_shown');
  });
});
