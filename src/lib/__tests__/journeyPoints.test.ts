jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('expo-localization', () => ({ getCalendars: () => [{ timeZone: 'Africa/Cairo' }] }));

import { JourneyPointsSummary, deviceTimeZone, medallionStage, programDayPointsToday, todaySegments } from '../journeyPoints';

const summary = (overrides: Partial<JourneyPointsSummary> = {}): JourneyPointsSummary => ({
  today: '2026-10-04',
  total: 0,
  streak: 0,
  best_streak: 0,
  trained_today: false,
  values: {},
  tasks_today: [],
  week: [],
  recent: [],
  new_awards: [],
  ...overrides,
});

describe('todaySegments', () => {
  test('nothing done: 5 open segments when the card has a side quest', () => {
    expect(todaySegments(summary(), 'w2_s1')).toEqual([false, false, false, false, false]);
  });

  test('no side quest on today\'s card: 4 segments', () => {
    expect(todaySegments(summary({ trained_today: true }), null)).toEqual([true, false, false, false]);
  });

  test('ticked extras count; the quest counts only if this exact slot was paid today', () => {
    const s = summary({
      tasks_today: [
        { task: 'run', amount: 5, paid: true },
        { task: 'meal', amount: null, paid: true },
      ],
      recent: [
        { date: '2026-10-03', source: 'side_quest', label: 'w2_s1', points: 30 },
        // An old quest caught up today is not today's quest.
        { date: '2026-10-04', source: 'side_quest', label: 'w1_s0', points: 30 },
      ],
    });
    expect(todaySegments(s, 'w2_s1')).toEqual([false, false, false, true, true]);
    s.recent.push({ date: '2026-10-04', source: 'side_quest', label: 'w2_s1', points: 30 });
    expect(todaySegments(s, 'w2_s1')).toEqual([false, true, false, true, true]);
  });
});

describe('programDayPointsToday', () => {
  test('only the day that actually earned today', () => {
    const s = summary({
      recent: [
        { date: '2026-10-04', source: 'program_day', label: 'PULL DAY 1', points: 50 },
        { date: '2026-10-03', source: 'program_day', label: 'Push Day', points: 50 },
      ],
    });
    expect(programDayPointsToday(s, 'Pull Day 1')).toBe(50);
    expect(programDayPointsToday(s, 'Push Day')).toBeNull(); // yesterday
    expect(programDayPointsToday(s, 'Legs Day')).toBeNull(); // finished but earned nothing
  });
});

describe('medallionStage', () => {
  test.each([
    [0, 5, 'cold'],
    [1, 5, 'spark'],
    [3, 5, 'blaze'],
    [5, 5, 'inferno'],
    [2, 4, 'blaze'], // round(0.5 × 5) = 3
    [0, 0, 'cold'],
  ])('%i/%i → %s', (done, total, stage) => {
    expect(medallionStage(done, total)).toBe(stage);
  });
});

test('deviceTimeZone uses the device calendar time zone', () => {
  expect(deviceTimeZone()).toBe('Africa/Cairo');
});

test('dayLetterKey follows the real weekday', () => {
  const { dayLetterKey } = require('../journeyPoints');
  expect(dayLetterKey('2026-10-05')).toBe('mon');
  expect(dayLetterKey('2026-10-04')).toBe('sun');
});
