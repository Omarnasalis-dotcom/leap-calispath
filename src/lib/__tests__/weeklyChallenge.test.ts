import {
  amrapScore,
  BoardEntry,
  clampPartial,
  formatClock,
  gapToLeader,
  isBetterScore,
  isoWeekNumber,
  partialPoints,
  projectedRank,
  roundPoints,
  sortBoard,
  timeUntilClose,
  totalReps,
  weekClosesAt,
  weekEndDate,
} from '../weeklyChallenge';

// The handoff's mock AMRAP "ENGINE 12": one round = 70 pts.
const ENGINE = [
  { name: 'Pull ups', reps: 5, points: 3 },
  { name: 'Dips', reps: 10, points: 2 },
  { name: 'Push ups', reps: 15, points: 1 },
  { name: 'Squats', reps: 20, points: 1 },
];

const entry = (user_id: string, score: number, submitted_at = '2026-09-27T10:00:00Z'): BoardEntry => ({ user_id, score, submitted_at });

describe('AMRAP scoring', () => {
  it('sums one round', () => {
    expect(roundPoints(ENGINE)).toBe(70);
    expect(totalReps(ENGINE)).toBe(50);
  });

  it('scores full rounds plus the unfinished round', () => {
    // 5 × 70 + (5×3 + 10×2 + 1×1) = 350 + 36
    expect(amrapScore(ENGINE, 5, [5, 10, 1, 0])).toBe(386);
  });

  it('clamps partial reps to 0…movement reps', () => {
    expect(clampPartial(ENGINE, [9, -2, 3.7])).toEqual([5, 0, 3, 0]);
    expect(partialPoints(ENGINE, [99, 99, 99, 99])).toBe(70);
  });

  it('never goes negative', () => {
    expect(amrapScore(ENGINE, -3, [])).toBe(0);
  });
});

describe('ranking', () => {
  it('compares by format', () => {
    expect(isBetterScore('time', 300, 320)).toBe(true);
    expect(isBetterScore('time', 320, 300)).toBe(false);
    expect(isBetterScore('reps', 320, 300)).toBe(true);
    expect(isBetterScore('reps', 300, null)).toBe(true);
  });

  it('sorts best first with earlier submissions winning ties', () => {
    const rows = [entry('a', 400), entry('b', 300, '2026-09-28T00:00:00Z'), entry('c', 300, '2026-09-27T00:00:00Z')];
    expect(sortBoard('time', rows).map(r => r.user_id)).toEqual(['c', 'b', 'a']);
    expect(sortBoard('reps', rows).map(r => r.user_id)).toEqual(['a', 'c', 'b']);
  });

  it('projects rank with the user entry replaced', () => {
    const board = [entry('a', 280), entry('b', 300), entry('me', 400), entry('c', 350)];
    expect(projectedRank('time', board, 'me', 290)).toEqual({ rank: 2, count: 4, leader: 280 });
    expect(projectedRank('time', board, 'me', 200)).toEqual({ rank: 1, count: 4, leader: 200 });
  });

  it('places a new score behind an equal existing one', () => {
    expect(projectedRank('reps', [entry('a', 100)], 'me', 100).rank).toBe(2);
  });

  it('adds a first-time user to the count', () => {
    expect(projectedRank('reps', [entry('a', 100)], 'me', 50)).toEqual({ rank: 2, count: 2, leader: 100 });
    expect(projectedRank('reps', [], 'me', 50)).toEqual({ rank: 1, count: 1, leader: 50 });
  });

  it('measures the gap to #1 as a positive distance', () => {
    expect(gapToLeader('time', 280, 305)).toBe(25);
    expect(gapToLeader('reps', 420, 386)).toBe(34);
    expect(gapToLeader('reps', 386, 420)).toBe(0);
  });
});

describe('formatting and weeks', () => {
  it('formats M:SS', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65.9)).toBe('1:05');
    expect(formatClock(725)).toBe('12:05');
  });

  it('computes the week range and close time (Saturday start, UTC)', () => {
    expect(weekEndDate('2026-09-26').toISOString().slice(0, 10)).toBe('2026-10-02');
    expect(weekClosesAt('2026-09-26').toISOString()).toBe('2026-10-03T00:00:00.000Z');
  });

  it('counts down to the close', () => {
    expect(timeUntilClose('2026-09-26', new Date('2026-09-29T09:40:00Z'))).toEqual({ days: 3, hours: 14, minutes: 20 });
    expect(timeUntilClose('2026-09-26', new Date('2026-10-05T00:00:00Z'))).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it('uses the ISO week of the Saturday', () => {
    expect(isoWeekNumber('2026-09-26')).toBe(39);
    expect(isoWeekNumber('2027-01-02')).toBe(53);
  });
});
