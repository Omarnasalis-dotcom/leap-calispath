// Test week import rules (testBlockError via validateWeekImportPayload),
// exercise order on import, and the export's read-only test_result.
// docs/features/test-day-format.md.
jest.mock('../supabase', () => ({ supabase: {} }));

import { validateWeekImportPayload, buildImportBlocksPayload, testBlockError } from '../ProgramImportParser';
import { buildExportTestResult, ExportTestResultRow } from '../ProgramExportBuilder';

const ex = (name: string) => ({ name });
const testBlock = (metadata: Record<string, unknown>, exercises: unknown[] = [ex('Pull Ups')]) => ({
  day_name: 'TEST DAY',
  block_name: 'Item',
  metadata: { timing_system: 'straight_set', structure: 'single', ...metadata },
  exercises,
});

describe('testBlockError', () => {
  it.each([
    [{ test_kind: 'max_reps', test_movement: 'inverted_row' }],
    [{ test_kind: 'max_reps', test_movement: 'muscle_ups' }],
    [{ test_kind: 'one_rm', test_movement: 'squat', is_weighted: true }],
    [{ test_kind: 'one_rm', test_movement: 'deadlift' }],
    [{ test_kind: 'max_hold', test_movement: 'front_lever' }],
    [{ test_kind: 'max_hold' }],
    [{ test_kind: 'max_hold', test_movement: '' }],
    [{ test_kind: 'form_check' }],
  ])('accepts %j', (metadata) => {
    expect(testBlockError(testBlock(metadata), 'Item')).toBeNull();
  });

  it('ignores blocks that are not tests', () => {
    expect(testBlockError({ metadata: { structure: 'circuit', rounds: '2' }, exercises: [ex('a'), ex('b')] }, 'Warm-Up')).toBeNull();
    expect(testBlockError({ exercises: [] }, 'X')).toBeNull();
  });

  it.each([
    [{ test_kind: 'for_time' }, 'test_kind must be max_reps, one_rm, max_hold or form_check'],
    [{ test_kind: 'max_reps' }, 'test_movement must be one of'],
    [{ test_kind: 'max_reps', test_movement: 'pullups' }, 'test_movement must be one of'],
    [{ test_kind: 'one_rm', test_movement: 'bench' }, 'test_movement must be one of'],
    [{ test_kind: 'max_hold', test_movement: 'tuck_front_lever' }, 'or left out'],
    [{ test_kind: 'form_check', cues: ['a'] }, 'must be a single value'],
    [{ test_kind: 'form_check', extra: { a: 1 } }, 'must be a single value'],
    [{ test_kind: 'form_check', focus: 'see [video]' }, `can't contain "]"`],
    [{ test_kind: 'max_reps', test_movement: 'dips', is_tier_trial: true }, 'both a test item and a tier trial'],
  ])('rejects %j', (metadata, message) => {
    expect(testBlockError(testBlock(metadata), 'Item')).toContain(message);
  });

  it('needs exactly one exercise', () => {
    const m = { test_kind: 'max_reps', test_movement: 'dips' };
    expect(testBlockError(testBlock(m, []), 'Item')).toBe('Test block "Item" needs exactly one exercise: it names the item and gives the demo video.');
    expect(testBlockError(testBlock(m, [ex('Dips'), ex('Bench Dips')]), 'Item')).toContain('exactly one exercise');
  });
});

describe('validateWeekImportPayload with test blocks', () => {
  it('passes a test day with a warm-up and counts the test blocks', () => {
    const file = {
      coach_week_note: 'Test week.',
      blocks: [
        { day_name: 'TEST DAY', block_name: 'Warm-Up', metadata: { structure: 'circuit', rounds: '2', rest_after_round: 60 }, exercises: [ex('Wrist swings'), ex('Air Squat')] },
        testBlock({ test_kind: 'max_reps', test_movement: 'inverted_row' }, [ex('Inverted Row')]),
        testBlock({ test_kind: 'max_hold', test_movement: 'front_lever' }, [ex('Tuck Front Lever Hold')]),
      ],
    };
    expect(validateWeekImportPayload(file)).toEqual({ valid: true, blockCount: 3, testBlockCount: 2 });
  });

  it('stops the whole file on a bad test block, before anything is written', () => {
    const file = { blocks: [testBlock({ test_kind: 'max_reps', test_movement: 'pull_ups' }), testBlock({ test_kind: 'max_reps' })] };
    expect(validateWeekImportPayload(file)).toEqual({ valid: false, error: expect.stringContaining('Test block "Item": test_movement') });
  });
});

describe('buildImportBlocksPayload', () => {
  it('sends each exercise in file order', () => {
    const resolved = new Map([['name:a', 'id-a'], ['name:b', 'id-b'], ['name:c', 'id-c']]);
    const [block] = buildImportBlocksPayload({ blocks: [{ block_name: 'Warm-Up', exercises: [ex('C'), ex('A'), ex('B')] }] }, resolved);
    expect(block.exercises.map((e: any) => [e.exercise_id, e.order_index])).toEqual([['id-c', 0], ['id-a', 1], ['id-b', 2]]);
  });
});

describe('buildExportTestResult', () => {
  const WP = 'wp-now';
  const row = (o: Partial<ExportTestResultRow>): ExportTestResultRow => ({
    id: Math.random().toString(36),
    warrior_program_id: WP,
    block_id: null,
    week_number: 1,
    test_kind: 'max_reps',
    movement_id: 'pull_ups',
    status: 'done',
    value: null,
    unit: 'reps',
    skip_reason: null,
    skip_detail: null,
    note: null,
    is_new_pb: false,
    is_matched_pb: false,
    world_status: 'saved',
    coach_grade: null,
    coach_note: null,
    created_at: '2026-11-01T00:00:00Z',
    ...o,
  });

  it('gives the logged result with the previous one from another program', () => {
    const results = [
      row({ warrior_program_id: 'wp-old', week_number: 6, value: '9', created_at: '2026-08-01T00:00:00Z' }),
      row({ warrior_program_id: 'wp-old', week_number: 8, value: '11', created_at: '2026-09-01T00:00:00Z' }),
      row({ movement_id: 'dips', value: 30, created_at: '2026-10-01T00:00:00Z' }),
      row({ block_id: 'b1', week_number: 4, value: '14', note: 'felt grip go at the end', is_new_pb: true, created_at: '2026-11-18T00:00:00Z' }),
      row({ block_id: 'b-later', week_number: 9, value: 16, created_at: '2026-12-01T00:00:00Z' }),
    ];
    expect(buildExportTestResult(WP, 'b1', { test_kind: 'max_reps', test_movement: 'pull_ups' }, results)).toEqual({
      status: 'done',
      value: 14,
      unit: 'reps',
      movement_id: 'pull_ups',
      skip_reason: null,
      skip_detail: null,
      note: 'felt grip go at the end',
      is_new_pb: true,
      is_matched_pb: false,
      world_status: 'saved',
      coach_grade: null,
      coach_note: null,
      previous: { value: 11, unit: 'reps', week_number: 8, logged_at: '2026-09-01T00:00:00Z', same_program: false },
    });
  });

  it('keeps the raw skip reason and the hold progression', () => {
    const results = [
      row({ test_kind: 'max_hold', movement_id: 'tuck_front_lever', unit: 'seconds', value: 8, created_at: '2026-10-01T00:00:00Z' }),
      row({ block_id: 'b2', test_kind: 'max_hold', movement_id: null, status: 'skipped', unit: null, skip_reason: 'no_equipment', skip_detail: 'No bar', world_status: 'none', created_at: '2026-11-18T00:00:00Z' }),
    ];
    const r = buildExportTestResult(WP, 'b2', { test_kind: 'max_hold', test_movement: 'front_lever' }, results);
    expect(r).toMatchObject({ status: 'skipped', skip_reason: 'no_equipment', skip_detail: 'No bar', value: null, previous: null });
  });

  it('gives nulls for an item not logged yet, with the latest previous result', () => {
    const results = [
      row({ week_number: 2, value: 10, created_at: '2026-09-01T00:00:00Z' }),
      row({ week_number: 4, value: 12, created_at: '2026-10-01T00:00:00Z' }),
    ];
    expect(buildExportTestResult(WP, 'b9', { test_kind: 'max_reps', test_movement: 'pull_ups' }, results)).toEqual({
      status: null, value: null, unit: null, movement_id: null, skip_reason: null, skip_detail: null, note: null,
      is_new_pb: false, is_matched_pb: false, world_status: null, coach_grade: null, coach_note: null,
      previous: { value: 12, unit: 'reps', week_number: 4, logged_at: '2026-10-01T00:00:00Z', same_program: true },
    });
  });

  it('works on rows from before the note / matched columns', () => {
    const old: any = row({ block_id: 'b1', value: 14 });
    delete old.note;
    delete old.is_matched_pb;
    expect(buildExportTestResult(WP, 'b1', { test_kind: 'max_reps', test_movement: 'pull_ups' }, [old])).toMatchObject({ note: null, is_matched_pb: false, value: 14 });
  });
});
