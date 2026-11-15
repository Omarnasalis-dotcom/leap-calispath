// resolveImportedExercises must never add to the shared exercise library
// without the coach choosing to (until 2026-11 every unmatched name was
// silently inserted, filling the library with near-copies).
const library = [
  { id: 'lib-childe', name: 'Childe Pose' },
  { id: 'lib-high-pull', name: 'High Pull Ups' },
  { id: 'lib-dips', name: 'Dips' },
];
const inserts: any[] = [];

jest.mock('../supabase', () => {
  const chain = (result: () => any) => {
    const q: any = {};
    for (const m of ['select', 'in', 'order']) q[m] = jest.fn(() => q);
    q.range = jest.fn(async () => result());
    q.then = (res: any, rej: any) => Promise.resolve(result()).then(res, rej);
    return q;
  };
  return {
    supabase: {
      from: jest.fn(() => ({
        select: (cols: string) => {
          if (cols === 'id') {
            // the id check: .select('id').in('id', ids)
            return { in: async (_c: string, ids: string[]) => ({ data: library.filter((r) => ids.includes(r.id)), error: null }) };
          }
          return chain(() => ({ data: library, error: null })).select(cols);
        },
        insert: (rows: any[]) => {
          inserts.push(...rows);
          return { select: async () => ({ data: rows.map((r, i) => ({ id: `new-${i}`, name: r.name })), error: null }) };
        },
      })),
    },
  };
});

import { resolveImportedExercises, isImportCancelled, UnmatchedExercise, describeBlockKind } from '../ProgramImportParser';

const blocks = [
  {
    block_name: 'A',
    exercises: [
      { exercise_id: 'lib-dips', name: 'Dips' }, // valid id
      { name: 'high pull up' }, // plural/case only: auto-match
      { name: 'Child Pose' }, // typo: ask
      { name: 'Dragon Flag' }, // nothing close: ask
      { name: 'child pose ' }, // same name again: asked once
    ],
  },
];

beforeEach(() => { inserts.length = 0; });

describe('resolveImportedExercises', () => {
  it('asks only about unmatched names, once each, with suggestions', async () => {
    let asked: UnmatchedExercise[] = [];
    await resolveImportedExercises(blocks, 'coach-1', async (items) => {
      asked = items;
      return items.map((i) => ({ name: i.name, create: true as const }));
    });
    expect(asked.map((i) => i.name)).toEqual(['Child Pose', 'Dragon Flag']);
    expect(asked[0].suggestions[0].id).toBe('lib-childe');
    expect(asked[1].suggestions).toEqual([]);
  });

  it('uses the picked exercise and adds only what the coach chose to add', async () => {
    const { resolved, counts } = await resolveImportedExercises(blocks, 'coach-1', async () => [
      { name: 'Child Pose', exerciseId: 'lib-childe' },
      { name: 'Dragon Flag', create: true },
    ]);
    expect(resolved.get('id:lib-dips')).toBe('lib-dips');
    expect(resolved.get('name:high pull up')).toBe('lib-high-pull');
    expect(resolved.get('name:child pose')).toBe('lib-childe');
    expect(resolved.get('name:dragon flag')).toBe('new-0');
    expect(inserts).toEqual([{ name: 'Dragon Flag', created_by: 'coach-1', difficulty: 'beginner', category: '' }]);
    expect(counts).toEqual({ by_id: 1, by_name: 2, newly_created: 1, removed: 0 });
  });

  it('adds nothing and stops when the coach cancels', async () => {
    const err = await resolveImportedExercises(blocks, 'coach-1', async () => null).catch((e) => e);
    expect(isImportCancelled(err)).toBe(true);
    expect(inserts).toEqual([]);
  });

  it('never asks when every name matches', async () => {
    const choose = jest.fn();
    const { resolved } = await resolveImportedExercises(
      [{ exercises: [{ name: 'Childe Pose' }, { name: 'High-Pull Ups' }] }],
      'coach-1',
      choose
    );
    expect(choose).not.toHaveBeenCalled();
    expect(resolved.size).toBe(2);
  });

  it('shows the whole block each unmatched name sits in, marking it', async () => {
    let asked: UnmatchedExercise[] = [];
    await resolveImportedExercises(circuitFile.blocks, 'coach-1', async (items) => {
      asked = items;
      return items.map((i) => ({ name: i.name, create: true as const }));
    });
    expect(asked.map((i) => i.name)).toEqual(['Chide Pose']);
    const [preview] = asked[0].blocks;
    expect(preview.label).toBe('PULL DAY | Finisher');
    expect(preview.kind).toBe('Circuit · 3 rounds');
    expect(preview.exercises.map((e) => [e.name, e.isThis, e.detail])).toEqual([
      ['Dips', false, '3 × 10 · rest 30s'],
      ['Chide Pose', true, '3 × 45s'],
      ['High Pull Ups', false, '3 × 6'],
    ]);
    expect(asked[0].emptiesBlocks).toBe(0);
  });

  it('removes only the chosen exercise and leaves the rest of the block and the input intact', async () => {
    const before = JSON.stringify(circuitFile);
    const { blocks: kept, counts } = await resolveImportedExercises(circuitFile.blocks, 'coach-1', async () => [
      { name: 'Chide Pose', remove: true },
    ]);
    expect(kept[0].exercises.map((e: any) => e.name)).toEqual(['Dips', 'High Pull Ups']);
    expect(kept[0].metadata).toEqual(circuitFile.blocks[0].metadata);
    expect(kept[1]).toBe(circuitFile.blocks[1]); // untouched block passes through
    expect(counts.removed).toBe(1);
    expect(inserts).toEqual([]);
    expect(JSON.stringify(circuitFile)).toBe(before);
  });

  it('warns when removing would empty a block', async () => {
    let asked: UnmatchedExercise[] = [];
    await resolveImportedExercises([{ block_name: 'Solo', exercises: [{ name: 'Dragon Flag' }] }], 'coach-1', async (items) => {
      asked = items;
      return [{ name: 'Dragon Flag', remove: true }];
    });
    expect(asked[0].emptiesBlocks).toBe(1);
  });
});

const circuitFile = {
  blocks: [
    {
      day_name: 'PULL DAY',
      block_name: 'Finisher',
      metadata: { structure: 'circuit', rounds: 3 },
      exercises: [
        { exercise_id: 'lib-dips', name: 'Dips', sets: 3, reps: 10, rest_seconds: 30 },
        { name: 'Chide Pose', sets: 3, reps: '', hold_seconds: 45 },
        { name: 'High Pull Ups', sets: '3', reps: '6' },
      ],
    },
    { day_name: 'PULL DAY', block_name: 'Main', exercises: [{ name: 'High Pull Ups', sets: 4, reps: 5 }] },
  ],
};

describe('describeBlockKind', () => {
  it.each([
    [{ metadata: { structure: 'superset', rounds: 4 } }, 'Superset · 4 rounds'],
    [{ metadata: { timing_system: 'amrap', time_cap_min: 12 } }, 'AMRAP 12 min'],
    [{ coach_notes: '[CONCEPT:{"timing_system":"fortime","time_cap_min":20}]go fast' }, 'For time · 20 min cap'],
    [{}, 'Straight sets'],
  ])('%j -> %s', (block, label) => expect(describeBlockKind(block)).toBe(label));
});

