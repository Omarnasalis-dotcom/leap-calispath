import { TIER_LOOKUP, deriveTrainingDaysPerWeek } from '../templateLibrary';

describe('TIER_LOOKUP', () => {
  it('has an entry for every strength tier 0-9', () => {
    for (let tier = 0; tier <= 9; tier++) {
      expect(TIER_LOOKUP[tier]).toBeDefined();
    }
  });

  it('gives tier 0 exactly 2 ranges with no bracket below 0-1', () => {
    expect(TIER_LOOKUP[0]).toEqual([{ min: 0, max: 1 }, { min: 1, max: 2 }]);
  });

  it('gives tiers 8 and 9 exactly 2 ranges with no third alternate above 7-9', () => {
    expect(TIER_LOOKUP[8]).toEqual([{ min: 7, max: 9 }, { min: 6, max: 7 }]);
    expect(TIER_LOOKUP[9]).toEqual([{ min: 7, max: 9 }, { min: 6, max: 7 }]);
  });

  it('gives tiers 1-7 exactly 3 ranges', () => {
    for (let tier = 1; tier <= 7; tier++) {
      expect(TIER_LOOKUP[tier]).toHaveLength(3);
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
