import { asksExerciseRpe, averageRpe, ratingsFor } from '../exerciseRpe';
import { indexLastTimeLogs } from '../lastTimeLog';

describe('asksExerciseRpe', () => {
  it('straight sets with 2+ exercises only', () => {
    expect(asksExerciseRpe('sets', false, 2)).toBe(true);
    expect(asksExerciseRpe('sets', false, 1)).toBe(false);
    expect(asksExerciseRpe('sets', true, 3)).toBe(false); // superset / circuit
    expect(asksExerciseRpe('amrap', false, 2)).toBe(false);
    expect(asksExerciseRpe('timer', false, 2)).toBe(false);
    expect(asksExerciseRpe('ladder', false, 2)).toBe(false);
  });
});

describe('averageRpe', () => {
  it('rounds like the server', () => {
    expect(averageRpe({ a: 8, b: 7 })).toBe(8);
    expect(averageRpe({ a: 8, b: 6 })).toBe(7);
    expect(averageRpe({ a: 9 })).toBe(9);
    expect(averageRpe({})).toBeNull();
  });
});

describe('ratingsFor', () => {
  it('drops exercises that were not done or not rated', () => {
    expect(ratingsFor({ a: 8, b: 6 }, ['a'])).toEqual({ a: 8 });
    expect(ratingsFor({ a: 8 }, ['a', 'c'])).toEqual({ a: 8 });
  });
});

describe('Last Time with per-exercise RPE', () => {
  const blockInfo = new Map([['b1', { weekNumber: 1, dayName: 'Day 1' }]]);
  const exIds = new Map([['be1', 'dips'], ['be2', 'rows']]);
  const sets = [
    { block_exercise_id: 'be1', exercise_id: 'dips', set_index: 1, reps_completed: 10, weight_used: null, hold_seconds: null },
    { block_exercise_id: 'be2', exercise_id: 'rows', set_index: 1, reps_completed: 8, weight_used: null, hold_seconds: null },
  ];
  const log = { block_id: 'b1', notes: '', feel: 'good', rpe: 7, completed_at: '2026-11-01T10:00:00Z', workout_set_logs: sets };

  it('shows each exercise its own rating', () => {
    const index = indexLastTimeLogs([{ ...log, exercise_rpe: { be1: 8, be2: 6 } }], blockInfo, exIds);
    expect(index.get('dips')![0].rpe).toBe(8);
    expect(index.get('rows')![0].rpe).toBe(6);
  });

  it('an exercise left unrated shows none, not the average', () => {
    const index = indexLastTimeLogs([{ ...log, exercise_rpe: { be1: 8 } }], blockInfo, exIds);
    expect(index.get('rows')![0].rpe).toBeNull();
  });

  it('older logs keep showing the block RPE', () => {
    const index = indexLastTimeLogs([log], blockInfo, exIds);
    expect(index.get('dips')![0].rpe).toBe(7);
    expect(index.get('rows')![0].rpe).toBe(7);
  });
});
