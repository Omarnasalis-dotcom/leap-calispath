import { computeSessionStats } from '../sessionStats';

const blocks = [
  { id: 'a', exercises: [{ sets: 3, reps: 10 }] },
  { id: 'b', exercises: [{ sets: 2, reps: 5 }, { sets: 2, reps: 5 }] },
];
const at = (h: number, m: number) => new Date(2026, 9, 12, h, m).toISOString();
const ms = (h: number, m: number) => new Date(2026, 9, 12, h, m).getTime();

describe('computeSessionStats', () => {
  it('sums saved set reps, falling back to the plan when none were saved', () => {
    const s = computeSessionStats(blocks, [
      { block_id: 'a', notes: '', completed_at: at(10, 10), workout_set_logs: [{ reps_completed: 8 }, { reps_completed: 7 }] },
      { block_id: 'b', notes: '', completed_at: at(10, 30), workout_set_logs: [] },
    ], ms(11, 0));
    expect(s.totalReps).toBe(15 + 20);
    expect(s.exercisesDone).toBe(3);
  });

  it('counts only the latest log of a re-logged block', () => {
    const s = computeSessionStats([blocks[0]], [
      { block_id: 'a', notes: '', completed_at: at(10, 30), workout_set_logs: [{ reps_completed: 30 }] },
      { block_id: 'a', notes: '', completed_at: at(10, 10), workout_set_logs: [{ reps_completed: 12 }] },
    ], ms(11, 0));
    expect(s.totalReps).toBe(30);
  });

  it('gives a missed block no reps and no exercises', () => {
    const s = computeSessionStats(blocks, [
      { block_id: 'a', notes: '', completed_at: at(10, 10), workout_set_logs: [{ reps_completed: 30 }] },
      { block_id: 'b', notes: '[STATUS:MISSED] tired', completed_at: at(10, 20), workout_set_logs: [] },
    ], ms(11, 0));
    expect(s.totalReps).toBe(30);
    expect(s.exercisesDone).toBe(1);
  });

  it('times from screen open (same day) to the last log', () => {
    const logs = [
      { block_id: 'a', notes: '', completed_at: at(10, 10) },
      { block_id: 'b', notes: '', completed_at: at(10, 40) },
    ];
    expect(computeSessionStats(blocks, logs, ms(10, 0)).sessionSeconds).toBe(40 * 60);
    // Reopened later: screen open time is after the logs, so first→last log.
    expect(computeSessionStats(blocks, logs, ms(18, 0)).sessionSeconds).toBe(30 * 60);
  });

  it('times only the last day when a day was logged across days', () => {
    const s = computeSessionStats(blocks, [
      { block_id: 'a', notes: '', completed_at: new Date(2026, 9, 11, 9, 0).toISOString() },
      { block_id: 'b', notes: '', completed_at: at(10, 0) },
    ], ms(18, 0));
    expect(s.sessionSeconds).toBe(0);
  });
});
