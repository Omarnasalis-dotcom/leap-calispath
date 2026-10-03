import { advanceIntervals, upcomingBoundaries } from '../intervalClock';

// Tabata 20s work / 10s rest × 2 work intervals.
const TABATA = [20, 10, 20, 10];

describe('advanceIntervals', () => {
  test('stays inside the current interval', () => {
    expect(advanceIntervals(TABATA, 0, 20, 5)).toEqual({ index: 0, left: 15, done: false });
  });

  test('crosses into the next interval at its full length', () => {
    // 20s work left, 25s pass → 5s into the 10s rest.
    expect(advanceIntervals(TABATA, 0, 20, 25)).toEqual({ index: 1, left: 5, done: false });
  });

  test('lands exactly on a boundary: the next interval starts full', () => {
    expect(advanceIntervals(TABATA, 0, 20, 20)).toEqual({ index: 1, left: 10, done: false });
  });

  test('skips several intervals', () => {
    // 3s left of work 1, then rest 10, work 20 → 33s lands at the start of rest 2.
    expect(advanceIntervals(TABATA, 0, 3, 33)).toEqual({ index: 3, left: 10, done: false });
  });

  test('runs past the end → done', () => {
    expect(advanceIntervals(TABATA, 2, 4, 60)).toEqual({ index: 4, left: 0, done: true });
    expect(advanceIntervals(TABATA, 3, 10, 10)).toEqual({ index: 4, left: 0, done: true });
  });

  test('zero / negative delta leaves the position alone', () => {
    expect(advanceIntervals(TABATA, 1, 7, 0)).toEqual({ index: 1, left: 7, done: false });
    expect(advanceIntervals(TABATA, 1, 7, -3)).toEqual({ index: 1, left: 7, done: false });
  });
});

describe('upcomingBoundaries', () => {
  test('lists each next interval start and the end of the run', () => {
    expect(upcomingBoundaries(TABATA, 0, 15)).toEqual([
      { index: 1, inSeconds: 15 },
      { index: 2, inSeconds: 25 },
      { index: 3, inSeconds: 45 },
      { index: 4, inSeconds: 55 },
    ]);
  });

  test('a get-ready offset delays everything', () => {
    expect(upcomingBoundaries([30], 0, 30, 5)).toEqual([{ index: 1, inSeconds: 35 }]);
  });

  test('caps the number of entries', () => {
    expect(upcomingBoundaries(new Array(100).fill(10), 0, 10, 0, 3)).toHaveLength(3);
  });
});
