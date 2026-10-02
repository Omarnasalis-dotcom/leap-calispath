import { defaultProgram, movementWeeks, signed, weightedView, worldSeries, type WeightedMovement } from '../performance';

jest.mock('../supabase', () => ({ supabase: { rpc: jest.fn() } }));

const pt = (week: number, weight: number, block: string, program_id = 'p1', reps = 5) => ({
  date: `2026-09-${String(week).padStart(2, '0')}T10:00:00Z`,
  week,
  weight,
  reps,
  block,
  program_id,
  program: program_id === 'p1' ? 'Active A' : 'Old B',
});

describe('weightedView', () => {
  const dips: WeightedMovement = {
    exercise: 'Dips',
    points: [
      pt(1, 50, 'PUSH | Heavy'),
      pt(1, 52.5, 'PUSH | Heavy'), // same slot + week: heaviest wins
      pt(2, 55, 'PUSH | Heavy'),
      pt(4, 60, 'PUSH | Heavy'), // week 3 unlogged
      pt(1, 30, 'PULL | Light'),
      pt(9, 99, 'OLD | Slot', 'p2'),
    ],
  };

  it('defaults to the active program and keeps each slot separate', () => {
    const v = weightedView(dips, 'p1', null);
    expect(v.programId).toBe('p1');
    expect(v.weeks).toEqual([1, 2, 3, 4]);
    expect(v.slots.map((s) => s.label)).toEqual(['PUSH · Heavy', 'PULL · Light']);
    expect(v.slots[0].values).toEqual([52.5, 55, null, 60]);
    expect(v.slots[0].first).toEqual({ value: 52.5, week: 1 });
    expect(v.slots[0].last).toEqual({ value: 60, week: 4 });
    expect(v.slots[1].values).toEqual([30, null, null, null]);
  });

  it('honours a picked program over the active one', () => {
    const v = weightedView(dips, 'p1', 'p2');
    expect(v.programId).toBe('p2');
    expect(v.slots[0].values).toEqual([99]);
  });

  it('falls back to the latest program when the active one has no sets', () => {
    expect(weightedView(dips, 'missing', null).programId).toBe('p2');
  });

  it('caps the drawn slots at three and counts the rest', () => {
    const many: WeightedMovement = {
      exercise: 'X',
      points: ['A', 'A', 'B', 'B', 'C', 'C', 'D'].map((b, i) => pt(1 + (i % 2), 10, b)),
    };
    const v = weightedView(many, 'p1', null);
    expect(v.slots).toHaveLength(3);
    expect(v.extraSlots).toBe(1);
  });
});

describe('worldSeries', () => {
  it('starts at the first result and drops worlds never played', () => {
    const worlds = [
      { week_start: 'w1', static: 0, onemm: 10, power: 0 },
      { week_start: 'w2', static: 5, onemm: 12, power: 0 },
    ];
    expect(worldSeries(worlds, 'static')).toEqual([{ weekStart: 'w2', value: 5 }]);
    expect(worldSeries(worlds, 'onemm')).toHaveLength(2);
    expect(worldSeries(worlds, 'power')).toEqual([]);
  });
});

describe('helpers', () => {
  it('prefers the active program', () => {
    expect(defaultProgram([{ status: 'completed', id: 1 }, { status: 'active', id: 2 }])?.id).toBe(2);
    expect(defaultProgram([{ status: 'completed', id: 1 }])?.id).toBe(1);
  });

  it('formats signed deltas with a real minus', () => {
    expect(signed(15)).toBe('+15');
    expect(signed(-3.64)).toBe('−3.6');
    expect(signed(0)).toBe('±0');
  });
});

describe('movementWeeks', () => {
  const w = (week: number) => ({ program_id: 'p1', week, reps: 1, assumed: 0, best: 1, variations: {} });
  it('runs from W1 to the current program week, gaps included', () => {
    expect(movementWeeks([w(1), w(3)], 4)).toEqual([1, 2, 3, 4]);
  });
  it('extends to a logged week past the current one', () => {
    expect(movementWeeks([w(2), w(6)], 3)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it('keeps only the latest weeks and handles no data', () => {
    expect(movementWeeks([w(12)], 12, 8)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(movementWeeks([])).toEqual([]);
  });
});
