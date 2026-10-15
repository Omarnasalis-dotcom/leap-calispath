import {
  formatLeaderboardTime,
  getOrdinalRank,
  getTierLeaderboard,
  getPowerTierLeaderboard,
  invalidateStrengthLeaderboardCache,
  invalidatePowerLeaderboardCache,
  getCompletedTrialTiers,
} from '../leaderboard';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('formatLeaderboardTime', () => {
  it('should return seconds only when under 60', () => {
    expect(formatLeaderboardTime(45)).toBe('45s');
    expect(formatLeaderboardTime(0)).toBe('0s');
    expect(formatLeaderboardTime(59)).toBe('59s');
  });

  it('should return mm:ss format when 60 seconds or more', () => {
    expect(formatLeaderboardTime(60)).toBe('1:00');
    expect(formatLeaderboardTime(90)).toBe('1:30');
    expect(formatLeaderboardTime(3600)).toBe('60:00');
  });

  it('should pad seconds with leading zero', () => {
    expect(formatLeaderboardTime(61)).toBe('1:01');
    expect(formatLeaderboardTime(609)).toBe('10:09');
  });
});

describe('getOrdinalRank', () => {
  it('should return st for 1', () => {
    expect(getOrdinalRank(1)).toBe('1st');
  });

  it('should return nd for 2', () => {
    expect(getOrdinalRank(2)).toBe('2nd');
  });

  it('should return rd for 3', () => {
    expect(getOrdinalRank(3)).toBe('3rd');
  });

  it('should return th for 4 to 20', () => {
    expect(getOrdinalRank(4)).toBe('4th');
    expect(getOrdinalRank(11)).toBe('11th');
    expect(getOrdinalRank(12)).toBe('12th');
    expect(getOrdinalRank(13)).toBe('13th');
  });

  it('should handle 21st, 22nd, 23rd correctly', () => {
    expect(getOrdinalRank(21)).toBe('21st');
    expect(getOrdinalRank(22)).toBe('22nd');
    expect(getOrdinalRank(23)).toBe('23rd');
  });

  it('should handle 100th correctly', () => {
    expect(getOrdinalRank(100)).toBe('100th');
  });
});

describe('getTierLeaderboard caching', () => {
  let now = 1_000_000;
  let nowSpy: jest.SpyInstance;

  const strengthRows = [
    { user_id: 'u1', display_name: 'Alpha', best_time: 120, total_attempts: 4, country: 'US', gender: 'male' },
    { user_id: 'u2', display_name: 'Bravo', best_time: 130, total_attempts: 2, country: 'GB', gender: 'female' },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    invalidateStrengthLeaderboardCache();
    invalidatePowerLeaderboardCache();
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('serves a second call within the TTL from cache (one network fetch)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: strengthRows, error: null });

    const first = await getTierLeaderboard(3, 'u1');
    const second = await getTierLeaderboard(3, 'u1');

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(first.entries).toHaveLength(2);
    expect(second.entries[0].rank).toBe(1);
  });

  it('re-fetches after the TTL expires', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: strengthRows, error: null });

    await getTierLeaderboard(3, 'u1');
    now += 31_000; // past the 30s TTL
    await getTierLeaderboard(3, 'u1');

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after invalidation (e.g. the user just logged a trial)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: strengthRows, error: null });

    await getTierLeaderboard(3, 'u1');
    invalidateStrengthLeaderboardCache();
    await getTierLeaderboard(3, 'u1');

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('caches per user (the payload carries the caller\'s own row) and derives per-user fields', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: strengthRows, error: null });

    const asU1 = await getTierLeaderboard(3, 'u1');
    const asU2 = await getTierLeaderboard(3, 'u2');
    await getTierLeaderboard(3, 'u1');

    expect(supabase.rpc).toHaveBeenCalledTimes(2); // one fetch per user, then cached
    expect(asU1.entries.find(e => e.is_current_user)?.user_id).toBe('u1');
    expect(asU2.entries.find(e => e.is_current_user)?.user_id).toBe('u2');
    expect(asU1.personalBest?.total_attempts).toBe(4);
    expect(asU2.personalBest?.total_attempts).toBe(2);
  });

  it('returns your own row past the top 100 as `outside`, not in the list', async () => {
    const top = Array.from({ length: 100 }, (_, i) => ({ user_id: `x${i}`, display_name: `X${i}`, best_time: 100 + i, total_attempts: 1, rank: i + 1 }));
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [...top, { user_id: 'me', display_name: 'Me', best_time: 400, total_attempts: 3, rank: 250 }], error: null });

    const res = await getTierLeaderboard(3, 'me');

    expect(supabase.rpc).toHaveBeenCalledWith('get_tier_leaderboard', { tier_num: 3, p_community_id: null, p_include_me: true });
    expect(res.entries).toHaveLength(100);
    expect(res.outside?.rank).toBe(250);
    expect(res.personalBest?.rank).toBe(250);
  });

  it('keys the cache by tier (different tiers fetch separately)', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: strengthRows, error: null });

    await getTierLeaderboard(3, 'u1');
    await getTierLeaderboard(4, 'u1');

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('does not cache an errored fetch', async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: null, error: { message: 'boom', code: 'P0001' }, status: 400 })
      .mockResolvedValueOnce({ data: strengthRows, error: null });

    const failed = await getTierLeaderboard(3, 'u1');
    const ok = await getTierLeaderboard(3, 'u1');

    expect(failed.entries).toHaveLength(0);
    expect(ok.entries).toHaveLength(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(2); // error wasn't cached, so retried
  });

  it('retries once on an empty-bodied gateway error', async () => {
    (supabase.rpc as jest.Mock)
      .mockResolvedValueOnce({ data: null, error: { message: '', code: '' }, status: 502 })
      .mockResolvedValueOnce({ data: strengthRows, error: null, status: 200 });

    const result = await getTierLeaderboard(3, 'u1');

    expect(result.entries).toHaveLength(2);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });
});

describe('getPowerTierLeaderboard caching', () => {
  let now = 1_000_000;
  let nowSpy: jest.SpyInstance;

  // get_power_tier_board rows (server-ranked, hidden athletes already out).
  const powerRows = [
    { user_id: 'p1', display_name: 'Alpha', power_points: 300, country: 'US', gender: 'male', rank: 1 },
    { user_id: 'p2', display_name: 'Bravo', power_points: 250, country: 'GB', gender: 'female', rank: 2 },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    invalidateStrengthLeaderboardCache();
    invalidatePowerLeaderboardCache();
    now = 1_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: powerRows, error: null });
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('serves a second call within the TTL from cache (one network fetch)', async () => {
    const first = await getPowerTierLeaderboard(2, 'p1');
    await getPowerTierLeaderboard(2, 'p1');

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('get_power_tier_board', { p_tier: 2, p_community_id: null });
    expect(first.entries).toHaveLength(2);
    expect(first.entries[0].is_current_user).toBe(true);
    expect(first.entries[1].rank).toBe(2);
  });

  it('re-fetches after invalidation (e.g. the user just logged a power PB)', async () => {
    await getPowerTierLeaderboard(2, 'p1');
    invalidatePowerLeaderboardCache();
    await getPowerTierLeaderboard(2, 'p1');

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });
});

describe('getCompletedTrialTiers', () => {
  const chain = (result: { data: any; error: any }) => {
    const q: any = { select: jest.fn(() => q), eq: jest.fn(() => q), then: (res: any, rej: any) => Promise.resolve(result).then(res, rej) };
    return q;
  };

  it('returns the set of completed tiers', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: [{ tier_attempted: 0 }, { tier_attempted: 2 }, { tier_attempted: 2 }], error: null }));
    const tiers = await getCompletedTrialTiers('u1');
    expect(tiers).toEqual(new Set([0, 2]));
  });

  it('returns null on error so callers never treat a failure as "no trials"', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: null, error: { message: 'network' } }));
    expect(await getCompletedTrialTiers('u1')).toBeNull();
  });

  it('returns an empty set when the user has no completed trials', async () => {
    (supabase.from as jest.Mock).mockReturnValueOnce(chain({ data: [], error: null }));
    expect(await getCompletedTrialTiers('u1')).toEqual(new Set());
  });
});
