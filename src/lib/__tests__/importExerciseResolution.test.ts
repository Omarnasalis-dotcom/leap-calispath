// The library JSON import used to look an exercise up by its file id only;
// a stale id with a matching name resolved (by name) but was then dropped,
// leaving blocks with a note and no exercise. These pin the fix.
jest.mock('../supabase', () => ({ supabase: {} }));

import { buildImportBlocksPayload, resolvedExerciseId } from '../ProgramImportParser';
import { buildLibraryTemplateBlocksPayload } from '../TemplateLibraryImport';
import { buildMasterTemplateBlocksPayload } from '../MasterTemplateTransfer';

// What resolveImportedExercises produces: a valid id keeps its id key; a
// stale id falls through to the name lookup.
const resolved = new Map<string, string>([
  ['id:valid-1', 'valid-1'],
  ['name:free handstand', 'lib-handstand'],
]);

const file = {
  blocks: [
    {
      day_name: 'PUSH DAY 1',
      block_name: 'Skills - 1',
      exercises: [
        { exercise_id: 'valid-1', name: 'Dips', sets: 3, reps: 8 },
        { exercise_id: 'stale-id', name: 'Free Handstand', sets: 3, hold_seconds: 30 },
      ],
    },
  ],
};

describe('imported exercise resolution', () => {
  it('uses the id when it exists, else the name', () => {
    expect(resolvedExerciseId(resolved, { exercise_id: 'valid-1', name: 'Dips' })).toBe('valid-1');
    expect(resolvedExerciseId(resolved, { exercise_id: 'stale-id', name: 'Free Handstand' })).toBe('lib-handstand');
    expect(resolvedExerciseId(resolved, { name: 'free handstand ' })).toBe('lib-handstand');
    expect(resolvedExerciseId(resolved, { exercise_id: 'stale-id' })).toBeUndefined();
  });

  it.each([
    ['client week import', buildImportBlocksPayload],
    ['library template import', buildLibraryTemplateBlocksPayload],
    ['master template import', buildMasterTemplateBlocksPayload],
  ])('%s keeps an exercise whose id is stale but whose name matched', (_label, build) => {
    const [block] = build(file, resolved) as Array<{ exercises: Array<{ exercise_id: string }> }>;
    expect(block.exercises.map((e) => e.exercise_id)).toEqual(['valid-1', 'lib-handstand']);
  });

  it.each([
    ['client week import', buildImportBlocksPayload],
    ['library template import', buildLibraryTemplateBlocksPayload],
    ['master template import', buildMasterTemplateBlocksPayload],
  ])('%s stops (naming the exercise) instead of dropping one nothing matched', (_label, build) => {
    const bad = { blocks: [{ block_name: 'Strength - 1', exercises: [{ exercise_id: 'gone', name: 'Mystery Press' }] }] };
    expect(() => build(bad, resolved)).toThrow(/Mystery Press/);
  });
});
