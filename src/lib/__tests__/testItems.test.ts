import {
  getTestItem,
  holdOptions,
  isBarWeight,
  isCoachAssigned,
  isTestDay,
  isSupportBlock,
  blocksThatCount,
  withoutTestTag,
  testMovementChoices,
  testMovementIds,
  parseTestNumber,
  testErrorKey,
  testItemTitle,
  testMovementName,
  validateTestValue,
  whatsAppLink,
  formatTestValue,
  demoLookupFor,
  pickDemo,
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

  it('allows Warm-Up / Cool-Down blocks around the test items (any spelling)', () => {
    const warm = block({ structure: 'circuit' }, { name: 'TEST DAY | Warm-Up' });
    const cool = block({}, { name: 'Cool down' });
    expect(isTestDay({ blocks: [warm, block({ test_kind: 'max_reps' }), cool] })).toBe(true);
    for (const name of ['Warm Up', 'warmup', 'WARM-UP', 'Cooldown', 'Cool-Down', 'Day 2 | cool down']) {
      expect(isSupportBlock(block({}, { name }))).toBe(true);
    }
    for (const name of ['Warm-Up 2', 'Strength', 'Mobility', 'Cool-Down finisher']) {
      expect(isSupportBlock(block({}, { name }))).toBe(false);
    }
  });

  it('a day of only Warm-Up / Cool-Down, or with any other block, is not a test day', () => {
    expect(isTestDay({ blocks: [block({}, { name: 'Warm-Up' }), block({}, { name: 'Cool-Down' })] })).toBe(false);
    expect(isTestDay({ blocks: [block({}, { name: 'Warm-Up' }), block({ test_kind: 'one_rm' }), block({}, { name: 'Strength - 1' })] })).toBe(false);
  });

  it('a test item named Warm-Up is still a test item', () => {
    expect(isSupportBlock(block({ test_kind: 'max_reps' }, { name: 'Warm-Up' }))).toBe(false);
  });
});

describe('blocksThatCount', () => {
  it('on a test day only the test items count; otherwise every block', () => {
    const warm = block({}, { id: 'w', name: 'Warm-Up' });
    const t1 = block({ test_kind: 'max_reps' }, { id: 't1' });
    const t2 = block({ test_kind: 'max_hold' }, { id: 't2' });
    expect(blocksThatCount({ blocks: [warm, t1, t2] }).map((b) => b.id)).toEqual(['t1', 't2']);
    const strength = block({}, { id: 's', name: 'Strength' });
    expect(blocksThatCount({ blocks: [warm, strength] }).map((b) => b.id)).toEqual(['w', 's']);
  });
});

describe('withoutTestTag', () => {
  it('drops only the test keys', () => {
    expect(withoutTestTag({ structure: 'single', test_kind: 'max_reps', test_movement: 'dips' })).toEqual({ structure: 'single' });
    const plain = { structure: 'circuit' as const };
    expect(withoutTestTag(plain)).toBe(plain);
    expect(withoutTestTag(undefined)).toBeUndefined();
  });
});

describe('testMovementChoices', () => {
  it('offers exactly the ids the server accepts, for every kind', () => {
    for (const kind of ['max_reps', 'one_rm', 'max_hold', 'form_check'] as const) {
      expect(testMovementChoices(kind).map((m) => m.id).sort()).toEqual([...testMovementIds(kind)].sort());
    }
    expect(testMovementChoices('one_rm').find((m) => m.id === 'pull_up')?.label).toBe('Weighted Pull-up (added kg)');
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

describe('demo video lookup', () => {
  it('maps world movements and hold progressions to library tags', () => {
    expect(demoLookupFor({ kind: 'one_rm', movement: 'squat' })).toEqual({ family: 'squat', variations: ['Back'] });
    expect(demoLookupFor({ kind: 'max_hold', movement: 'handstand' })).toEqual({ family: 'handstand', variations: ['Wall', 'Belly to wall'] });
    expect(demoLookupFor({ kind: 'max_hold', movement: 'front_lever' }, 'full_front_lever')).toEqual({ family: 'front_lever', variations: ['Full'] });
    expect(demoLookupFor({ kind: 'max_reps', movement: 'fl_pull_ups' })).toEqual({ namePattern: 'front lever pull%' });
    expect(demoLookupFor({ kind: 'form_check' })).toBeNull();
  });

  it('picks the first variation in order, else any row of the family', () => {
    const rows = [
      { movement_variation: 'Advanced tuck', id: 1 },
      { movement_variation: 'Full', id: 2 },
    ];
    expect(pickDemo(rows, ['Tuck', 'Advanced tuck'])?.id).toBe(1);
    expect(pickDemo(rows, ['full'])?.id).toBe(2);
    expect(pickDemo(rows, ['Straddle'])?.id).toBe(1);
    expect(pickDemo([], ['Full'])).toBeNull();
  });
});

describe('goesToWorld (same unlocks as submit_program_test_item)', () => {
  const { goesToWorld } = require('../testItems');
  it('max reps follows the movement category tier', () => {
    expect(goesToWorld({ kind: 'max_reps', movement: 'air_squats' }, 0)).toBe(true);
    expect(goesToWorld({ kind: 'max_reps', movement: 'pull_ups' }, 2)).toBe(false);
    expect(goesToWorld({ kind: 'max_reps', movement: 'pull_ups' }, 3)).toBe(true);
    expect(goesToWorld({ kind: 'max_reps', movement: 'nope' }, 9)).toBe(false);
  });
  it('1RM needs Strength tier 6 and never sends the deadlift', () => {
    expect(goesToWorld({ kind: 'one_rm', movement: 'squat' }, 5)).toBe(false);
    expect(goesToWorld({ kind: 'one_rm', movement: 'squat' }, 6)).toBe(true);
    expect(goesToWorld({ kind: 'one_rm', movement: 'deadlift' }, 9)).toBe(false);
  });
  it('holds need tier 1; form checks never', () => {
    expect(goesToWorld({ kind: 'max_hold', movement: 'planche' }, 0)).toBe(false);
    expect(goesToWorld({ kind: 'max_hold', movement: 'planche' }, 1)).toBe(true);
    expect(goesToWorld({ kind: 'form_check' }, 9)).toBe(false);
  });
});
