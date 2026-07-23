import { LeaderboardService } from '../LeaderboardService';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    from: jest.fn(),
  },
}));

describe('LeaderboardService.getGlobalWellRoundedLeaderboard', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('reads gender straight off the RPC row and makes no second profiles query', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: [
        { rank: 1, user_id: 'u1', display_name: 'Alpha', country: 'US', gender: 'female', static_pts: 10, power_pts: 5, endurance_pts: 2, total_score: 17 },
        { rank: 2, user_id: 'u2', display_name: 'Bravo', country: 'GB', gender: 'male', static_pts: 8, power_pts: 4, endurance_pts: 1, total_score: 13 },
      ],
      error: null,
    });

    const entries = await LeaderboardService.getGlobalWellRoundedLeaderboard('u1');

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    // The N+1 is gone: no follow-up profiles fetch for gender.
    expect(supabase.from).not.toHaveBeenCalled();
    expect(entries[0].gender).toBe('female');
    expect(entries[1].gender).toBe('male');
    expect(entries[0].is_current_user).toBe(true);
    expect(entries[1].is_current_user).toBe(false);
  });

  it('returns [] on RPC error', async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'boom' } });

    const entries = await LeaderboardService.getGlobalWellRoundedLeaderboard('u1');

    expect(entries).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
