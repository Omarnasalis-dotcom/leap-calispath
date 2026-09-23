import { wraMilestoneProgress } from '../worldProgress';

describe('wraMilestoneProgress', () => {
  it('new user works toward the first milestone', () => {
    expect(wraMilestoneProgress(0)).toEqual({ target: 10, remaining: 10, maxed: false });
  });

  it('targets the next milestone, not the current one, when exactly on it', () => {
    expect(wraMilestoneProgress(25)).toEqual({ target: 50, remaining: 25, maxed: false });
  });

  it('mid-range score', () => {
    expect(wraMilestoneProgress(11)).toEqual({ target: 25, remaining: 14, maxed: false });
  });

  it('caps at the top milestone', () => {
    expect(wraMilestoneProgress(5000)).toEqual({ target: 5000, remaining: 0, maxed: true });
    expect(wraMilestoneProgress(9999)).toEqual({ target: 5000, remaining: 0, maxed: true });
  });

  it('treats bad input as 0', () => {
    expect(wraMilestoneProgress(NaN).target).toBe(10);
    expect(wraMilestoneProgress(-5).target).toBe(10);
  });
});
