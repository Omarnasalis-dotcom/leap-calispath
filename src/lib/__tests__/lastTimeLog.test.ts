import { indexLastTimeLogs, lastTimeFor, splitLogNote, LastTimeSourceLog } from '../lastTimeLog';

const blocks = new Map([
  ['w4-pull', { weekNumber: 4, dayName: 'PULL DAY' }],
  ['w5-pull', { weekNumber: 5, dayName: 'PULL DAY' }],
  ['w5-weighted', { weekNumber: 5, dayName: 'WEIGHTED STRENGTH DAY' }],
  ['w6-pull', { weekNumber: 6, dayName: 'PULL DAY' }],
]);
const beToEx = new Map([['be-old', 'ex-pullups']]);

const set = (i: number, reps: number | null, weight: number | null = null, extra: Record<string, unknown> = {}) => ({
  block_exercise_id: 'be-x', exercise_id: 'ex-pullups', set_index: i, reps_completed: reps, weight_used: weight, hold_seconds: null, ...extra,
});

const logs: LastTimeSourceLog[] = [
  { block_id: 'w4-pull', notes: null, feel: 'ok', rpe: 7, completed_at: '2026-10-17T10:00:00Z', workout_set_logs: [set(1, 8, 15), set(2, 8, 15)] },
  { block_id: 'w5-weighted', notes: '[LOG] Weight Used: 22.5 KG\ngrip slipped on last set', feel: 'strong', rpe: 8, completed_at: '2026-10-24T10:00:00Z', workout_set_logs: [set(2, 6, 22.5), set(1, 8, 20)] },
  { block_id: 'w6-pull', notes: null, feel: 'good', rpe: 6, completed_at: '2026-10-29T10:00:00Z', workout_set_logs: [set(1, 10, 20)] },
];

describe('last time for an exercise (2026-10-30)', () => {
  const index = indexLastTimeLogs(logs, blocks, beToEx);

  it('picks the newest log from an earlier week, on any day', () => {
    const last = lastTimeFor(index, 'ex-pullups', 6)!;
    expect(last.dayName).toBe('WEIGHTED STRENGTH DAY');
    expect(last.weekNumber).toBe(5);
    expect(last.sets.map(s => [s.reps, s.weight])).toEqual([[8, 20], [6, 22.5]]);
    expect(last.rpe).toBe(8);
    expect(last.feel).toBe('strong');
    expect(last.note).toBe('grip slipped on last set');
  });

  it('never shows the same week, and nothing before the first logged week', () => {
    expect(lastTimeFor(index, 'ex-pullups', 5)!.weekNumber).toBe(4);
    expect(lastTimeFor(index, 'ex-pullups', 4)).toBeUndefined();
    expect(lastTimeFor(index, 'ex-other', 6)).toBeUndefined();
  });

  it('drops the Weight Used line when the sets carry the weight', () => {
    expect(lastTimeFor(index, 'ex-pullups', 6)!.results).toEqual([]);
  });

  it('matches old set rows through their block exercise, marks planned sets, skips missed blocks', () => {
    const idx = indexLastTimeLogs([
      { block_id: 'w4-pull', notes: null, feel: null, rpe: null, completed_at: '2026-10-17T10:00:00Z',
        workout_set_logs: [set(1, 8, null, { exercise_id: null, block_exercise_id: 'be-old', source: 'planned' })] },
      { block_id: 'w5-pull', notes: '[STATUS:MISSED]', feel: null, rpe: null, completed_at: '2026-10-24T10:00:00Z', workout_set_logs: [] },
    ], blocks, beToEx);
    const last = lastTimeFor(idx, 'ex-pullups', 6)!;
    expect(last.weekNumber).toBe(4);
    expect(last.sets[0].planned).toBe(true);
  });

  it('an exercise logged as 0 reps shows as not done', () => {
    const idx = indexLastTimeLogs([
      { block_id: 'w5-pull', notes: null, feel: null, rpe: 7, completed_at: '2026-10-24T10:00:00Z', workout_set_logs: [set(1, 0)] },
    ], blocks, beToEx);
    expect(lastTimeFor(idx, 'ex-pullups', 6)).toMatchObject({ notDone: true, sets: [] });
  });
});

describe('splitLogNote', () => {
  it('separates result lines from the athlete note', () => {
    expect(splitLogNote('[LOG] Finished in: 6:45\n[LOG] Completed: 5 + 4 Rounds/Reps\n[LOG] Ladder Progress: reached 8\nfelt heavy')).toEqual({
      results: [
        { kind: 'finished', value: '6:45' },
        { kind: 'completed', value: '5 + 4' },
        { kind: 'ladder', value: 'reached 8' },
      ],
      note: 'felt heavy',
    });
  });
});
