import { TIER_LOOKUP, deriveTrainingDaysPerWeek } from '../templateLibrary';

describe('TIER_LOOKUP', () => {
  it('has an entry for every strength tier 0-9', () => {
    for (let tier = 0; tier <= 9; tier++) {
      expect(TIER_LOOKUP[tier]).toBeDefined();
    }
  });

  it('gives every tier 3 ranges, so Recommended is always a full row', () => {
    for (let tier = 0; tier <= 9; tier++) {
      expect(TIER_LOOKUP[tier]).toHaveLength(3);
    }
  });

  it('keeps the edge tiers inside the real brackets', () => {
    expect(TIER_LOOKUP[0]).toEqual([{ min: 0, max: 1 }, { min: 1, max: 2 }, { min: 2, max: 3 }]);
    expect(TIER_LOOKUP[8]).toEqual([{ min: 7, max: 9 }, { min: 6, max: 7 }, { min: 5, max: 6 }]);
    expect(TIER_LOOKUP[9]).toEqual([{ min: 7, max: 9 }, { min: 6, max: 7 }, { min: 5, max: 6 }]);
  });

  // select_library_template's free pick uses the first range with a
  // template; these first two must stay in step with its own copy.
  it('keeps the first two ranges the server matches the free pick against', () => {
    const server: Record<number, string> = {
      0: '[{"min":0,"max":1},{"min":1,"max":2}]',
      1: '[{"min":0,"max":1},{"min":1,"max":2},{"min":2,"max":3}]',
      2: '[{"min":1,"max":2},{"min":2,"max":3},{"min":0,"max":1}]',
      3: '[{"min":2,"max":3},{"min":3,"max":4},{"min":1,"max":2}]',
      4: '[{"min":3,"max":4},{"min":4,"max":5},{"min":2,"max":3}]',
      5: '[{"min":4,"max":5},{"min":5,"max":6},{"min":3,"max":4}]',
      6: '[{"min":5,"max":6},{"min":6,"max":7},{"min":4,"max":5}]',
      7: '[{"min":6,"max":7},{"min":7,"max":9},{"min":5,"max":6}]',
      8: '[{"min":7,"max":9},{"min":6,"max":7}]',
      9: '[{"min":7,"max":9},{"min":6,"max":7}]',
    };
    for (let tier = 0; tier <= 9; tier++) {
      const ranges = JSON.parse(server[tier]);
      expect(TIER_LOOKUP[tier].slice(0, ranges.length)).toEqual(ranges);
    }
  });

  it('tier 4 recommended pick matches its own bracket', () => {
    expect(TIER_LOOKUP[4][0]).toEqual({ min: 3, max: 4 });
  });
});

describe('deriveTrainingDaysPerWeek', () => {
  it('counts distinct days from "DAY | BLOCK" formatted names', () => {
    const names = ['Monday | Push', 'Monday | Pull', 'Wednesday | Legs', 'Friday | Push'];
    expect(deriveTrainingDaysPerWeek(names)).toBe(3);
  });

  it('falls back to treating the whole name as the day when there is no separator', () => {
    const names = ['Full Body A', 'Full Body B'];
    expect(deriveTrainingDaysPerWeek(names)).toBe(2);
  });

  it('trims whitespace around the day segment', () => {
    const names = ['Monday   | Push', 'Monday | Pull'];
    expect(deriveTrainingDaysPerWeek(names)).toBe(1);
  });

  it('returns 0 for an empty block list', () => {
    expect(deriveTrainingDaysPerWeek([])).toBe(0);
  });
});
