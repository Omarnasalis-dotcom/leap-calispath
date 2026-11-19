import { hasFinishedWeek, weekReviewRoute } from '../coachStart';

const b = (id: string, week: number | null) => ({ id, week_number: week });

describe('hasFinishedWeek', () => {
  it('is true once every workout of a week is logged', () => {
    const blocks = [b('a', 1), b('b', 1), b('c', 2)];
    expect(hasFinishedWeek(blocks, new Set(['a', 'b']), 2)).toBe(true);
  });

  it('is false while a week still has a workout to do', () => {
    const blocks = [b('a', 1), b('b', 1)];
    expect(hasFinishedWeek(blocks, new Set(['a']), 1)).toBe(false);
    expect(hasFinishedWeek(blocks, new Set(), 1)).toBe(false);
  });

  it('ignores weeks after the current one and counts a missing week number as week 1', () => {
    expect(hasFinishedWeek([b('a', null), b('b', 2)], new Set(['a']), 1)).toBe(true);
    expect(hasFinishedWeek([b('a', 1), b('b', 2)], new Set(['b']), 1)).toBe(false);
  });

  it('is false for a program with no workouts', () => {
    expect(hasFinishedWeek([], new Set(), 1)).toBe(false);
  });
});

describe('weekReviewRoute', () => {
  it('opens the AI Coach with the week review typed in, ready to send', () => {
    expect(weekReviewRoute(2)).toEqual({ pathname: '/coach', params: { draft: 'Analyze my Week 2 and build Week 3.' } });
  });
  it('falls back to week 1 for a missing or odd week number', () => {
    expect(weekReviewRoute(0).params.draft).toBe('Analyze my Week 1 and build Week 2.');
    expect(weekReviewRoute(NaN).params.draft).toBe('Analyze my Week 1 and build Week 2.');
  });
});
