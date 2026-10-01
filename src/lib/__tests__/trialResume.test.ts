jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { resumedElapsedSeconds, SavedTrial } from '../trialResume';

const base: SavedTrial = { tier: 3, mode: 'progression', elapsedSeconds: 200, savedAt: 1_000_000, stepIdx: 4 };

describe('resumedElapsedSeconds', () => {
  it('counts the whole gap when the app was closed under a minute', () => {
    expect(resumedElapsedSeconds(base, 1_000_000 + 25_000)).toBe(225);
  });

  it('counts at most one minute of a longer gap', () => {
    expect(resumedElapsedSeconds(base, 1_000_000 + 10 * 60_000)).toBe(260);
  });

  it('never goes backwards if the phone clock moved back', () => {
    expect(resumedElapsedSeconds(base, 1_000_000 - 30_000)).toBe(200);
  });
});
