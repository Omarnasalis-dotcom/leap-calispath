import { hasFinishedWeek } from '../coachStart';

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
