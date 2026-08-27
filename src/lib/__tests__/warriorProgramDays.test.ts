import {
  parseBlockName,
  groupRawBlocksIntoDays,
  deriveDayStates,
  estimateSessionMinutes,
  countMovements,
  isWarmUpBlock,
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
  test('completed / today / upcoming: first not-fully-logged day is today, rest locked', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'completed'), block('Strength', [], 'completed')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'completed'), block('Strength', [], 'none')] },
      { name: 'Day 3', blocks: [block('Warm-Up', [], 'none')] },
    ];
    const states = deriveDayStates(days);
    expect(states[0].status).toBe('completed'); // every block logged
    expect(states[1].status).toBe('today'); // one block still unlogged -> first "today"
    expect(states[2].status).toBe('upcoming'); // after today, locked
  });

  test('a day where every block is missed still reads as completed, not a 4th state', () => {
    const days: ProgramDay[] = [{ name: 'Day 1', blocks: [block('Warm-Up', [], 'missed')] }];
    expect(deriveDayStates(days)[0].status).toBe('completed');
  });

  test('everything already logged: no day is "today"', () => {
    const days: ProgramDay[] = [
      { name: 'Day 1', blocks: [block('Warm-Up', [], 'completed')] },
      { name: 'Day 2', blocks: [block('Warm-Up', [], 'missed')] },
    ];
    const states = deriveDayStates(days);
    expect(states.every((s) => s.status === 'completed')).toBe(true);
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
