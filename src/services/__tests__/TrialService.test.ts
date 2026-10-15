jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'tok' } } })) } },
}));
jest.mock('../../lib/leaderboard', () => ({ invalidateStrengthLeaderboardCache: jest.fn() }));

import { TrialService, newTrialAttemptId } from '../TrialService';
import { TIER_HARD_FLOORS } from '../../constants/Progression';

describe('TrialService', () => {
  describe('isTimeValid', () => {
    it('should return false if tier does not exist in TIER_HARD_FLOORS', () => {
      expect(TrialService.isTimeValid(99, 100)).toBe(false);
    });

    it('should return false if time is exactly at the floor but slightly lower due to decimals', () => {
      const tier = 0;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor - 0.1)).toBe(false);
    });

    it('should return false if time is significantly below the floor', () => {
      const tier = 4;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor - 10)).toBe(false);
    });

    it('should return true if time is exactly at the floor', () => {
      const tier = 2;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor)).toBe(true);
    });

    it('should return true if time is above the floor', () => {
      const tier = 8;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor + 50)).toBe(true);
    });
  });

  describe('submitResult attempt id', () => {
    const ok = { success: true, is_first_completion: false, is_new_best: false, tier_advanced: true, previous_best_time_seconds: null, overtaken_notification_id: null };
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; });
    const bodies = (f: jest.Mock) => f.mock.calls.map(c => JSON.parse(c[1].body));

    it('sends the attempt id, and the same one again when a lost reply is resent', async () => {
      const fetchMock = jest.fn()
        .mockRejectedValueOnce(new TypeError('Network request failed'))
        .mockResolvedValueOnce({ ok: true, json: async () => ({ ...ok, replayed: true }) });
      global.fetch = fetchMock as any;
      const res = await TrialService.submitResult({ userId: 'u', tier: 3, timeSeconds: 200, isProgression: true, attemptId: 'abc12345-x' });
      expect(res.tier_advanced).toBe(true);
      expect(bodies(fetchMock).map(b => b.attempt_id)).toEqual(['abc12345-x', 'abc12345-x']);
    });

    it('sends no attempt id when none is given (older behaviour)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ok });
      global.fetch = fetchMock as any;
      await TrialService.submitResult({ userId: 'u', tier: 3, timeSeconds: 200, isProgression: false });
      expect(bodies(fetchMock)[0]).toEqual({ tier: 3, time_seconds: 200, mode: 'practice' });
    });
  });

  it('makes attempt ids the server accepts (8-64 chars), different each time', () => {
    const ids = Array.from({ length: 200 }, newTrialAttemptId);
    expect(new Set(ids).size).toBe(200);
    ids.forEach(id => expect(id.length >= 8 && id.length <= 64).toBe(true));
  });
});
