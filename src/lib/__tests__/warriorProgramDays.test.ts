import {
  parseBlockName,
  groupRawBlocksIntoDays,
  deriveDayStates,
  estimateSessionMinutes,
  countMovements,
  isWarmUpBlock,
  inferBlockAccent,
  deriveNextDayIndex,
  summarizeWeekSessions,
} from '../warriorProgramDays';
import { ProgramBlock, ProgramDay, ExerciseDetail } from '../../types/warriorProgram';

const ex = (overrides: Partial<ExerciseDetail> = {}): ExerciseDetail => ({
  id: 'e1',
  name: 'Push Ups',
  youtube_url: '',
  sets: 3,
  reps: '10',
  rest_seconds: 60,
  notes: '',
  ...overrides,
});

const block = (name: string, exercises: ExerciseDetail[], completedStatus: ProgramBlock['completedStatus'] = 'none'): ProgramBlock => ({
  id: name,
  name,
  notes: '',
  exercises,
  completedStatus,
});

describe('parseBlockName', () => {
  test('splits "{Day} | {Block}" into day/block names', () => {
    expect(parseBlockName('Day 1 | Warm-Up')).toEqual({ dayName: 'Day 1', blockName: 'Warm-Up' });
  });

  test('a name with no separator becomes the whole day, generic block name', () => {
    expect(parseBlockName('Push Day')).toEqual({ dayName: 'Push Day', blockName: 'Workout Routine' });
  });

  test('handles a literal " | " inside the block name itself', () => {
    expect(parseBlockName('Day 2 | Strength | Accessory')).toEqual({ dayName: 'Day 2', blockName: 'Strength | Accessory' });
  });
});

describe('groupRawBlocksIntoDays — the Phase 1 hub bug fix', () => {
  test('multiple blocks sharing a day-name prefix collapse into ONE day, not several', () => {
    const rows = [
      { id: 'b1', name: 'Day 1 | Warm-Up', week_number: 1 },
      { id: 'b2', name: 'Day 1 | Strength', week_number: 1 },
      { id: 'b3', name: 'Day 1 | Cool-Down', week_number: 1 },
      { id: 'b4', name: 'Day 2 | Skills', week_number: 1 },
    ];
    const days = groupRawBlocksIntoDays(rows);
    expect(days).toHaveLength(2); // NOT 4 — this is exactly what Phase 1's hub got wrong
    expect(days[0].dayName).toBe('Day 1');
    expect(days[0].blockIds).toEqual(['b1', 'b2', 'b3']);
    expect(days[1].dayName).toBe('Day 2');
    expect(days[1].blockIds).toEqual(['b4']);
  });

  test('single-block days (no " | ") still work — the simple, pre-existing case', () => {
    const rows = [
      { id: 'b1', name: 'Push Day', week_number: 1 },
      { id: 'b2', name: 'Pull Day', week_number: 1 },
    ];
    const days = groupRawBlocksIntoDays(rows);
    expect(days).toHaveLength(2);
  });

  test('groups separately per week even with the same day name', () => {
    const rows = [
      { id: 'b1', name: 'Day 1 | Warm-Up', week_number: 1 },
      { id: 'b2', name: 'Day 1 | Warm-Up', week_number: 2 },
    ];
    const days = groupRawBlocksIntoDays(rows);
    expect(days).toHaveLength(2);
  });
});

describe('deriveDayStates', () => {
  test('clean / in_progress / done reflect real logging progress, not order — every day is tappable', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'completed'), block('Strength', [], 'completed')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'completed'), block('Strength', [], 'none')] },
      { name: 'Day 3', blocks: [block('Warm-Up', [], 'none')] },
    ];
    const states = deriveDayStates(days);
    expect(states[0].status).toBe('done');
    expect(states[0].progressPct).toBe(100);
    expect(states[1].status).toBe('in_progress');
    expect(states[1].progressPct).toBe(50); // 1 of 2 blocks logged
    expect(states[2].status).toBe('clean'); // nothing logged yet, but still a normal, tappable day
    expect(states[2].progressPct).toBe(0);
  });

  test('a day where every block is missed still reads as done, not a 4th state', () => {
    const days: ProgramDay[] = [{ name: 'Day 1', blocks: [block('Warm-Up', [], 'missed')] }];
    expect(deriveDayStates(days)[0].status).toBe('done');
  });

  test('a day out of order can already be done while an earlier day is still clean — no gating', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'none')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'completed')] },
    ];
    const states = deriveDayStates(days);
    expect(states[0].status).toBe('clean');
    expect(states[1].status).toBe('done');
  });
});

describe('estimateSessionMinutes / countMovements', () => {
  test('movement count sums exercises across every block in the day', () => {
    const day: ProgramDay = { name: 'Day 1', blocks: [block('Warm-Up', [ex(), ex()]), block('Strength', [ex(), ex(), ex()])] };
    expect(countMovements(day)).toBe(5);
  });

  test('duration estimate is a positive number derived from real sets/rest, never zero', () => {
    const day: ProgramDay = { name: 'Day 1', blocks: [block('Strength', [ex({ sets: 4, rest_seconds: 90 })])] };
    // 4 sets * (40s assumed + 90s rest) = 520s -> ~9 min
    expect(estimateSessionMinutes(day)).toBe(9);
  });

  test('a day with no exercises at all still returns a sane minimum, not 0 or NaN', () => {
    const day: ProgramDay = { name: 'Day 1', blocks: [] };
    expect(estimateSessionMinutes(day)).toBe(1);
  });
});

describe('isWarmUpBlock', () => {
  test('matches the canonical "Warm-Up" name, case-insensitively', () => {
    expect(isWarmUpBlock(block('Warm-Up', []))).toBe(true);
    expect(isWarmUpBlock(block('warm-up', []))).toBe(true);
    expect(isWarmUpBlock(block(' Warm-Up ', []))).toBe(true);
  });

  test('does not match other block names', () => {
    expect(isWarmUpBlock(block('Strength', []))).toBe(false);
    expect(isWarmUpBlock(block('Cool-Down', []))).toBe(false);
  });
});

describe('inferBlockAccent', () => {
  test('maps the 5 real block-name conventions to their design-spec accent colors', () => {
    expect(inferBlockAccent('Warm-Up').color).toBe('#C9A227');
    expect(inferBlockAccent('Skills').color).toBe('#8b5cf6');
    expect(inferBlockAccent('Strength').color).toBe('#FC5454');
    expect(inferBlockAccent('Accessories').color).toBe('#f97316');
    expect(inferBlockAccent('Cool-Down').color).toBe('#5b8def');
  });

  test('is case-insensitive and works on partial/compound names', () => {
    expect(inferBlockAccent('cool down').color).toBe('#5b8def');
    expect(inferBlockAccent('COOLDOWN STRETCH').color).toBe('#5b8def');
    expect(inferBlockAccent('Strength - 1').color).toBe('#FC5454');
  });

  test('unrecognized block names fall back to coral, per the design spec', () => {
    expect(inferBlockAccent('Mobility Flow').color).toBe('#FC5454');
    expect(inferBlockAccent('').color).toBe('#FC5454');
  });
});

describe('deriveNextDayIndex', () => {
  test('fresh program: day 0 is next', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'none')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'none')] },
    ];
    expect(deriveNextDayIndex(days)).toBe(0);
  });

  test('mid-week: first not-done day is next, including one already in progress', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'completed')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'completed'), block('Strength', [], 'none')] },
      { name: 'Day 3', blocks: [block('Warm-Up', [], 'none')] },
    ];
    expect(deriveNextDayIndex(days)).toBe(1); // in_progress, not day 3
  });

  test('all done: no fake next day', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'completed')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'missed')] },
    ];
    expect(deriveNextDayIndex(days)).toBeNull();
  });
});

describe('summarizeWeekSessions', () => {
  test('counts real totals, never hardcoded', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'completed')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'none')] },
      { name: 'Day 3', blocks: [block('Warm-Up', [], 'missed')] },
    ];
    expect(summarizeWeekSessions(days)).toEqual({ sessionsTotal: 3, sessionsDoneThisWeek: 2 });
  });

  test('empty week: zero, zero', () => {
    expect(summarizeWeekSessions([])).toEqual({ sessionsTotal: 0, sessionsDoneThisWeek: 0 });
  });
});
