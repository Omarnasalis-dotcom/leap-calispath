import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockProfile: Record<string, unknown> = { id: 'u1', onboarding_completed_at: null };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ profile: mockProfile }) }));
jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]) };
});

import { TutorialProvider, useTutorial } from '../../contexts/TutorialContext';
import { useScreenTour } from '../useScreenTour';

let seen: ReturnType<typeof useTutorial> | null = null;
function Screen({ anyTime, captions }: { anyTime?: boolean; captions?: Record<string, string> }) {
  useScreenTour('coach', true, { anyTime, captions });
  seen = useTutorial();
  return null;
}

let r: ReactTestRenderer;
beforeEach(async () => { seen = null; await AsyncStorage.clear(); });
afterEach(() => act(() => r?.unmount()));

it('starts the AI Coach tour on the first open even long after onboarding, with the screen\'s own caption', async () => {
  mockProfile = { id: 'u1', onboarding_completed_at: '2025-01-01T00:00:00Z' };
  await act(async () => {
    r = create(<TutorialProvider><Screen anyTime captions={{ 'coach.starters': 'Pick one' }} /></TutorialProvider>);
  });
  expect(seen!.active).toBe(true);
  expect(seen!.tourId).toBe('coach');
  expect(seen!.currentStep.caption).toBe('Pick one');
  expect(await AsyncStorage.getItem('seen_tour_coach_u1')).toBe('true');
});

it('shows only once', async () => {
  await AsyncStorage.setItem('seen_tour_coach_u1', 'true');
  await act(async () => { r = create(<TutorialProvider><Screen anyTime /></TutorialProvider>); });
  expect(seen!.active).toBe(false);
});

it('other screens still only start for the recently onboarded', async () => {
  mockProfile = { id: 'u1', onboarding_completed_at: '2025-01-01T00:00:00Z' };
  await act(async () => { r = create(<TutorialProvider><Screen /></TutorialProvider>); });
  expect(seen!.active).toBe(false);
});
