import {
  getTestItem,
  holdOptions,
  isBarWeight,
  isCoachAssigned,
  isTestDay,
  parseTestNumber,
  testErrorKey,
  testItemTitle,
  testMovementName,
  validateTestValue,
  whatsAppLink,
  formatTestValue,
} from '../testItems';
import { BlockConceptParser } from '../BlockConceptParser';
import type { ProgramBlock } from '../../types/warriorProgram';

const block = (metadata: ProgramBlock['metadata'], extra: Partial<ProgramBlock> = {}): ProgramBlock => ({
  id: 'b',
  name: 'Test Day 1 | Pull-ups',
  notes: '',
  exercises: [],
  completedStatus: 'none',
  metadata,
  ...extra,
});

describe('getTestItem', () => {
  it('reads test_kind and test_movement from concept metadata', () => {
    const { metadata } = BlockConceptParser.parse('[CONCEPT:{"structure":"single","test_kind":"one_rm","test_movement":"squat"}] Go heavy');
    expect(getTestItem(metadata)).toEqual({ kind: 'one_rm', movement: 'squat' });
  });

  it('ignores normal blocks and unknown kinds', () => {
    expect(getTestItem({ structure: 'single' })).toBeNull();
    expect(getTestItem({ test_kind: 'nope' as any })).toBeNull();
    expect(getTestItem(undefined)).toBeNull();
  });

  it('keeps a form check without a movement', () => {
    expect(getTestItem({ test_kind: 'form_check' })).toEqual({ kind: 'form_check', movement: undefined });
  });
});

describe('isTestDay', () => {
  it('is true only when every block is a test item', () => {
    expect(isTestDay({ blocks: [block({ test_kind: 'max_reps' }), block({ test_kind: 'form_check' })] })).toBe(true);
    expect(isTestDay({ blocks: [block({ test_kind: 'max_reps' }), block({ structure: 'single' })] })).toBe(false);
    expect(isTestDay({ blocks: [] })).toBe(false);
  });
});

describe('isCoachAssigned', () => {
  it('refuses the Leap library and AI Coach system profiles', () => {
    expect(isCoachAssigned('00000000-0000-0000-0000-000000000001')).toBe(false);
    expect(isCoachAssigned('00000000-0000-0000-0000-000000000002')).toBe(false);
    expect(isCoachAssigned(null)).toBe(false);
    expect(isCoachAssigned('5d3c7f0e-1111-2222-3333-444455556666')).toBe(true);
  });
});

describe('movements', () => {
  it('names the world movement', () => {
    expect(testMovementName({ kind: 'max_reps', movement: 'pull_ups' })).toBe('Pull-ups');
    expect(testMovementName({ kind: 'one_rm', movement: 'muscle_up' })).toBe('Weighted Muscle-up');
    expect(testMovementName({ kind: 'one_rm', movement: 'deadlift' })).toBe('Deadlift');
    expect(testMovementName({ kind: 'form_check' })).toBeNull();
  });

  it('marks squat and deadlift as bar weight, the rest as added weight', () => {
    expect(isBarWeight({ kind: 'one_rm', movement: 'squat' })).toBe(true);
    expect(isBarWeight({ kind: 'one_rm', movement: 'deadlift' })).toBe(true);
    expect(isBarWeight({ kind: 'one_rm', movement: 'pull_up' })).toBe(false);
  });

  it('offers the progressions of the coach-set category, easiest first', () => {
    expect(holdOptions({ kind: 'max_hold', movement: 'front_lever' }).map((o) => o.id)).toEqual([
      'tuck_front_lever',
      'straddle_front_lever',
      'full_front_lever',
    ]);
    expect(holdOptions({ kind: 'one_rm', movement: 'squat' })).toEqual([]);
  });
});

describe('values', () => {
  it('parses typed numbers, with a comma decimal too', () => {
    expect(parseTestNumber('12')).toBe(12);
    expect(parseTestNumber(' 82,5 ')).toBe(82.5);
    expect(parseTestNumber('')).toBeNull();
    expect(parseTestNumber('1e3')).toBeNull();
    expect(parseTestNumber('-4')).toBeNull();
  });

  it('checks values per kind', () => {
    expect(validateTestValue('max_reps', 15)).toBe('ok');
    expect(validateTestValue('max_reps', 15.5)).toBe('whole');
    expect(validateTestValue('max_reps', 0)).toBe('empty');
    expect(validateTestValue('max_reps', null)).toBe('empty');
    // 0 kg added = a bodyweight 1RM, allowed.
    expect(validateTestValue('one_rm', 0)).toBe('ok');
    expect(validateTestValue('max_hold', 0)).toBe('empty');
    expect(validateTestValue('form_check', null)).toBe('ok');
  });

  it('formats without a trailing .0', () => {
    expect(formatTestValue(20)).toBe('20');
    expect(formatTestValue(102.5)).toBe('102.5');
    expect(formatTestValue(null)).toBe('');
  });
});

describe('testItemTitle', () => {
  it('uses the first exercise, else the block name after the day', () => {
    expect(testItemTitle(block(undefined))).toBe('Pull-ups');
    expect(
      testItemTitle(
        block(undefined, {
          exercises: [{ id: 1, name: 'Wall Walk', youtube_url: '', sets: 1, reps: '', rest_seconds: 0, notes: '' }],
        }),
      ),
    ).toBe('Wall Walk');
  });

  it('names a default-named block by its movement', () => {
    const plain = block(undefined, { name: 'Day 1 | Workout Routine' });
    expect(testItemTitle(plain, { kind: 'max_reps', movement: 'dips' })).toBe('Dips');
    expect(testItemTitle(plain, { kind: 'one_rm', movement: 'squat' })).toBe('Back Squat');
    expect(testItemTitle(plain, { kind: 'max_hold', movement: 'handstand' })).toBe('Handstand hold');
    expect(testItemTitle(plain, { kind: 'form_check' })).toBe('');
    // A name the coach typed wins.
    expect(testItemTitle(block(undefined, { name: 'Day 1 | Strict dips' }), { kind: 'max_reps', movement: 'dips' })).toBe('Strict dips');
  });
});

describe('whatsAppLink', () => {
  it('builds a wa.me link with the message', () => {
    expect(whatsAppLink('201001234567', 'Hi coach')).toBe('https://wa.me/201001234567?text=Hi%20coach');
    expect(whatsAppLink('+20 100 123 4567', 'x')).toBe('https://wa.me/201001234567?text=x');
  });

  it('returns null without a usable number', () => {
    expect(whatsAppLink(null, 'x')).toBeNull();
    expect(whatsAppLink('123', 'x')).toBeNull();
  });
});

describe('testErrorKey', () => {
  it('maps bare server codes', () => {
    expect(testErrorKey({ message: 'VALUE_TOO_HIGH' })).toBe('testWeek.errors.VALUE_TOO_HIGH');
    expect(testErrorKey({ message: 'NOT_COACH_PROGRAM' })).toBe('testWeek.errors.NOT_COACH_PROGRAM');
    expect(testErrorKey(new Error('Network request failed'))).toBe('testWeek.errors.generic');
  });
});
