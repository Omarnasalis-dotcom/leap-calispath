import { buildLibraryTemplateBlocksPayload } from '../TemplateLibraryImport';

describe('buildLibraryTemplateBlocksPayload', () => {
  it('combines day_name and block_name into "DAY | BLOCK", defaults week_number to 1, and keeps only resolved exercises', () => {
    const data = {
      blocks: [
        {
          day_name: 'Monday',
          block_name: 'Push',
          order_index: 0,
          exercises: [
            { exercise_id: 'existing-id', sets: 3, reps: 10, rest_seconds: 60 },
            { name: 'Unresolved Move', sets: 3, reps: 8 },
          ],
        },
      ],
    };
    const resolved = new Map([['id:existing-id', 'existing-id']]);

    const result = buildLibraryTemplateBlocksPayload(data, resolved);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Monday | Push');
    expect(result[0].week_number).toBe(1);
    expect(result[0].exercises).toHaveLength(1);
    expect(result[0].exercises[0].exercise_id).toBe('existing-id');
    expect(result[0].exercises[0].sets).toBe(3);
  });

  it('passes through an explicit week_number for multi-week templates', () => {
    const data = {
      blocks: [
        { day_name: 'Monday', block_name: 'Push', week_number: 1, exercises: [] },
        { day_name: 'Monday', block_name: 'Push', week_number: 3, exercises: [] },
        { day_name: 'Monday', block_name: 'Push', week_number: '4', exercises: [] },
      ],
    };
    const result = buildLibraryTemplateBlocksPayload(data, new Map());
    expect(result.map(b => b.week_number)).toEqual([1, 3, 4]);
  });

  it('falls back to a generated block name when day_name/block_name are absent', () => {
    const data = { blocks: [{ exercises: [] }] };
    const result = buildLibraryTemplateBlocksPayload(data, new Map());
    expect(result[0].name).toBe('IMPORTED BLOCK 1');
  });

  it('parses numeric fields from string input and nulls out unparseable ones', () => {
    const data = {
      blocks: [
        {
          day_name: 'Monday',
          block_name: 'Push',
          exercises: [{ exercise_id: 'e1', sets: '4', reps: 'not-a-number', rest_seconds: '90' }],
        },
      ],
    };
    const resolved = new Map([['id:e1', 'e1']]);
    const result = buildLibraryTemplateBlocksPayload(data, resolved);
    expect(result[0].exercises[0].sets).toBe(4);
    expect(result[0].exercises[0].reps).toBeNull();
    expect(result[0].exercises[0].rest_seconds).toBe(90);
  });
});
