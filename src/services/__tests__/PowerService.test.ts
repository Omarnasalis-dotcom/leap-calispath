import { PowerService } from '../PowerService';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

// Chainable stand-in for the supabase-js query builder used by
// PowerService.getLeaderboard's glory branch: .select().gt()[.eq()].order().limit()
function makeQuery(rows: any[]) {
  const builder: any = {
    select: jest.fn(() => builder),
    gt: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return builder;
}

describe('PowerService.getLeaderboard community scope', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('filters the glory board by community_id when a communityId is given', async () => {
    const q = makeQuery([{ id: 'u1', display_name: 'A', power_points: 100, country: 'US', gender: 'Male' }]);
    (supabase.from as jest.Mock).mockReturnValue(q);

    await PowerService.getLeaderboard('glory', 'comm-1');

    expect(q.eq).toHaveBeenCalledWith('community_id', 'comm-1');
  });

  it('leaves the glory board global (no community_id filter) when none is given', async () => {
    const q = makeQuery([]);
    (supabase.from as jest.Mock).mockReturnValue(q);

    await PowerService.getLeaderboard('glory');

    expect(q.eq).not.toHaveBeenCalledWith('community_id', expect.anything());
  });
});
