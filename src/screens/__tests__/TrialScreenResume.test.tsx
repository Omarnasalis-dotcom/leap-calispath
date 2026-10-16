import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }), router: { push: jest.fn() } }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: jest.fn(() => Promise.resolve()), deactivateKeepAwake: jest.fn() }));
jest.mock('../../components/GlobalErrorBoundary', () => ({ GlobalErrorBoundary: ({ children }: any) => children }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../../lib/SoundService', () => ({ SoundServiceInstance: new Proxy({}, { get: () => jest.fn(() => Promise.resolve()) }) }));
jest.mock('../../services/NotificationService', () => ({ NotificationService: { notify: jest.fn() } }));
jest.mock('../../services/StepService', () => ({
  getStepProgress: jest.fn(() => Promise.resolve({ cleared: [], best: {} })),
  submitStep: jest.fn(),
  stepErrorCode: jest.fn(),
}));
jest.mock('../../contexts/ThemeContext', () => {
  const { StealthTheme } = require('../../../constants/Theme');
  return { useTheme: () => ({ mode: 'dark', theme: StealthTheme.dark }) };
});
// Stable objects, like the real context: a new `user` per render re-runs every effect.
const mockAuth = { user: { id: 'u1' }, profile: { id: 'u1', strength_tier: 4, display_name: 'A' }, refreshProfile: jest.fn() };
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
const mockSaved: { current: any } = { current: null };
jest.mock('../../lib/trialResume', () => ({
  ...jest.requireActual('../../lib/trialResume'),
  loadSavedTrial: jest.fn(() => Promise.resolve(mockSaved.current)),
  saveTrialProgress: jest.fn(),
  clearSavedTrial: jest.fn(),
}));

import { TrialScreen } from '../TrialScreen';
import { clearSavedTrial } from '../../lib/trialResume';

jest.setTimeout(20000);

let r: ReactTestRenderer;
let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  (clearSavedTrial as jest.Mock).mockClear();
});
afterEach(() => {
  act(() => r?.unmount());
  alertSpy.mockRestore();
});

const saved = (over: object) => ({ elapsedSeconds: 60, savedAt: Date.now(), stepIdx: 2, ...over });
const open = async (props: object) => {
  await act(async () => { r = create(<TrialScreen {...props} />); });
  await act(async () => {});
};
const buttons = () => (alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[]);

// Strength Trials audit M2 (owner decision 2026-10-16): from the Journey a
// saved trial is never resumed or saved, only closed for a start over.
describe('TrialScreen resume from the Journey checkpoint', () => {
  it('warns that a running trial will be closed, then starts over', async () => {
    // A practice run of the Ephebe trial (tier 2) was cut off; the checkpoint opens Step 1.
    mockSaved.current = saved({ tier: 2, mode: 'practice' });
    const onBack = jest.fn();
    await open({ mode: 'step', stepNumber: 1, fromJourney: true, onBack, onComplete: jest.fn() });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('A Trial Is Still Open');
    expect(alertSpy.mock.calls[0][1]).toContain('will close it, and you start over');
    expect(buttons().map(b => b.text)).toEqual(['Cancel', 'Start Over']);
    act(() => buttons()[1].onPress!());
    expect(clearSavedTrial).toHaveBeenCalledWith('u1');
    act(() => buttons()[0].onPress!());
    expect(onBack).toHaveBeenCalled();
  });

  it("an unsaved finished result can't be saved from the Journey", async () => {
    mockSaved.current = saved({ tier: 2, mode: 'practice', finishedSeconds: 300, attemptId: 'attempt-123' });
    await open({ mode: 'step', stepNumber: 1, fromJourney: true, onBack: jest.fn(), onComplete: jest.fn() });
    expect(alertSpy.mock.calls[0][0]).toBe('A Trial Is Still Open');
    expect(alertSpy.mock.calls[0][1]).toContain('close it without saving');
    expect(buttons().map(b => b.text)).toEqual(['Cancel', 'Start Over']);
  });

  it('the same item is not resumed either', async () => {
    // Step 1 of a Spartan (tier 4) athlete is saved under its base trial, tier 3.
    mockSaved.current = saved({ tier: 3, mode: 'step', step: 1 });
    await open({ mode: 'step', stepNumber: 1, fromJourney: true, onBack: jest.fn(), onComplete: jest.fn() });
    expect(alertSpy.mock.calls[0][0]).toBe('A Trial Is Still Open');
    expect(buttons().map(b => b.text)).toEqual(['Cancel', 'Start Over']);
  });

  it('outside the Journey, a saved trial is offered back as before', async () => {
    mockSaved.current = saved({ tier: 2, mode: 'practice' });
    await open({ mode: 'progression', onBack: jest.fn(), onComplete: jest.fn() });
    expect(alertSpy.mock.calls[0][0]).toBe('Trial Interrupted');
    expect(buttons().map(b => b.text)).toEqual(['Start Over', 'Continue Trial']);
  });
});

// Strength Trials audit L5: a bad tier in the link used to leave "Loading" up forever.
describe('TrialScreen with a bad link', () => {
  it.each(['abc', '-1'])('tier=%s shows "not available" and goes back', async (tier) => {
    mockSaved.current = null;
    const onBack = jest.fn();
    await open({ mode: 'practice', practiceTier: parseInt(tier, 10), onBack, onComplete: jest.fn() });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][1]).toBe("This trial isn't available. The link may be old.");
    act(() => buttons()[0].onPress!());
    expect(onBack).toHaveBeenCalled();
  });
});
