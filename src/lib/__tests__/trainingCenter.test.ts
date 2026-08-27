import {
  computeDisplayWeeks,
  computeWeekStats,
  computeAllTimeStats,
  isMissedLog,
  formatSessionsLeftSubline,
  formatWeekMeta,
  formatQuickWorkoutSub,
  formatActiveProgramSub,
  HubBlock,
} from '../trainingCenter';

const block = (id: string, name: string, order_index: number, week_number: number): HubBlock => ({
  id,
  name,
  order_index,
  week_number,
});

describe('isMissedLog', () => {
  test('recognizes the [STATUS:MISSED] prefix convention', () => {
    expect(isMissedLog('[STATUS:MISSED] felt sick')).toBe(true);
    expect(isMissedLog('great session')).toBe(false);
    expect(isMissedLog(null)).toBe(false);
  });
});

describe('computeDisplayWeeks', () => {
  test('no active program: hero empty state derivation has nothing to compute from — 0 blocks', () => {
    const result = computeDisplayWeeks([], [], 1);
    expect(result.totalWeeks).toBe(0);
    expect(result.filteredBlocks).toEqual([]);
  });

  test('renumbers sequentially after an archived week, matching WarriorProgramScreen', () => {
    const blocks = [
      block('b1', 'Push', 0, 1),
      block('b2', 'Pull', 1, 2),
      block('b3', 'Legs', 2, 3),
    ];
    // Week 1 archived — remaining weeks 2,3 should renumber to display 1,2.
    const result = computeDisplayWeeks(blocks, [1], 2);
    expect(result.totalWeeks).toBe(2);
    expect(result.filteredBlocks.map((b) => b.id)).toEqual(['b2', 'b3']);
    expect(result.currentDisplayWeek).toBe(1); // raw week 2 -> display week 1
  });

  test('clamps currentDisplayWeek into range if current_week points past the end', () => {
    const blocks = [block('b1', 'Push', 0, 1)];
    const result = computeDisplayWeeks(blocks, [], 99);
    expect(result.currentDisplayWeek).toBe(1);
  });
});

describe('computeWeekStats', () => {
  test('active program with N weeks/M single-block days this week: correct frequency/percent/sessions-left math', () => {
    const blocks = [
      block('b1', 'Push Day', 0, 1),
      block('b2', 'Pull Day', 1, 1),
      block('b3', 'Legs Day', 2, 1),
      block('b4', 'Push Day', 0, 2),
    ];
    // Week 1 has 3 single-block days; b1 completed, b2 missed, b3 not yet logged.
    const logsThisWeek = [
      { block_id: 'b1', notes: 'felt great' },
      { block_id: 'b2', notes: '[STATUS:MISSED] no time' },
    ];
    const stats = computeWeekStats(blocks, 1, logsThisWeek);
    expect(stats.frequencyThisWeek).toBe(3);
    expect(stats.completedThisWeek).toBe(1);
    expect(stats.missedThisWeek).toBe(1);
    expect(stats.percentCompleteThisWeek).toBe(33); // 1/3 rounded
    expect(stats.sessionsLeftThisWeek).toBe(1); // 3 - 1 completed - 1 missed
    expect(stats.nextUpDayName).toBe('Legs Day');
  });

  // The Phase 1 bug: a day authored as multiple program_blocks rows sharing
  // a "{Day} | {Block}" name prefix (e.g. Warm-Up/Strength/Cool-Down all
  // under "Day 1") used to be counted as 3 separate sessions instead of 1.
  test('a day composed of multiple blocks counts as ONE session, not one per block', () => {
    const blocks = [
      block('b1', 'Day 1 | Warm-Up', 0, 1),
      block('b2', 'Day 1 | Strength', 1, 1),
      block('b3', 'Day 1 | Cool-Down', 2, 1),
      block('b4', 'Day 2 | Skills', 0, 1),
    ];
    // Day 1 fully logged (all 3 of its blocks); Day 2 not yet.
    const logsThisWeek = [
      { block_id: 'b1', notes: 'done' },
      { block_id: 'b2', notes: 'done' },
      { block_id: 'b3', notes: 'done' },
    ];
    const stats = computeWeekStats(blocks, 1, logsThisWeek);
    expect(stats.frequencyThisWeek).toBe(2); // 2 days, not 4 blocks
    expect(stats.completedThisWeek).toBe(1);
    expect(stats.nextUpDayName).toBe('Day 2');
  });

  test('nothing scheduled this week: frequency 0, percent 0, no next-up, no crash', () => {
    const stats = computeWeekStats([], 1, []);
    expect(stats.frequencyThisWeek).toBe(0);
    expect(stats.percentCompleteThisWeek).toBe(0);
    expect(stats.sessionsLeftThisWeek).toBe(0);
    expect(stats.nextUpDayName).toBeNull();
  });

  test('every scheduled day already logged: sessions-left never goes negative', () => {
    const blocks = [block('b1', 'Push Day', 0, 1)];
    const stats = computeWeekStats(blocks, 1, [{ block_id: 'b1', notes: 'done' }]);
    expect(stats.sessionsLeftThisWeek).toBe(0);
    expect(stats.nextUpDayName).toBeNull();
  });
});

describe('computeAllTimeStats', () => {
  test('zero workout history: hasHistory false, adherence null — drives hiding the stat strip', () => {
    const stats = computeAllTimeStats([], []);
    expect(stats.hasHistory).toBe(false);
    expect(stats.adherencePct).toBeNull();
    expect(stats.sessionsDone).toBe(0);
  });

  test('mixed completed/missed history computes real adherence % — day level, not row count', () => {
    const blocks = [
      block('b1', 'Push Day', 0, 1),
      block('b2', 'Pull Day', 1, 1),
      block('b3', 'Legs Day', 2, 1),
    ];
    const logs = [
      { block_id: 'b1', notes: 'done' },
      { block_id: 'b2', notes: 'done' },
      { block_id: 'b3', notes: '[STATUS:MISSED] sick' },
    ];
    const stats = computeAllTimeStats(blocks, logs);
    expect(stats.hasHistory).toBe(true);
    expect(stats.sessionsDone).toBe(2);
    expect(stats.adherencePct).toBe(67); // 2/3 rounded
  });

  test('a multi-block day only counts once it is fully logged — the Phase 1 row-count bug', () => {
    const blocks = [
      block('b1', 'Day 1 | Warm-Up', 0, 1),
      block('b2', 'Day 1 | Strength', 1, 1),
      block('b3', 'Day 1 | Cool-Down', 2, 1),
    ];
    // Old bug: 3 logged rows would read as "3 sessions done." Correct: 1 day, 1 session.
    const logs = [
      { block_id: 'b1', notes: 'done' },
      { block_id: 'b2', notes: 'done' },
      { block_id: 'b3', notes: 'done' },
    ];
    const stats = computeAllTimeStats(blocks, logs);
    expect(stats.sessionsDone).toBe(1);
  });

  test('a partially-logged day (not every block done yet) is not counted either way', () => {
    const blocks = [
      block('b1', 'Day 1 | Warm-Up', 0, 1),
      block('b2', 'Day 1 | Strength', 1, 1),
    ];
    const logs = [{ block_id: 'b1', notes: 'done' }]; // b2 not logged yet
    const stats = computeAllTimeStats(blocks, logs);
    expect(stats.hasHistory).toBe(false);
    expect(stats.sessionsDone).toBe(0);
  });
});

describe('subline/meta formatters', () => {
  test('no active program -> "NOTHING SCHEDULED YET"', () => {
    expect(formatSessionsLeftSubline(false, 0, 1)).toBe('NOTHING SCHEDULED YET');
  });

  test('active program -> "WEEK n · m SESSIONS LEFT", singular/plural correct', () => {
    expect(formatSessionsLeftSubline(true, 2, 3)).toBe('WEEK 3 · 2 SESSIONS LEFT');
    expect(formatSessionsLeftSubline(true, 1, 3)).toBe('WEEK 3 · 1 SESSION LEFT');
  });

  test('formatWeekMeta includes real week count and frequency, never hardcoded', () => {
    expect(formatWeekMeta(2, 6, 4)).toBe('WEEK 2 OF 6 · 4×/WEEK');
  });

  test('formatActiveProgramSub reflects gating state', () => {
    expect(formatActiveProgramSub(false, 1, 1)).toBe('NO PROGRAM ASSIGNED');
    expect(formatActiveProgramSub(true, 2, 5)).toBe('WEEK 2 OF 5');
  });

  test('formatQuickWorkoutSub ranges and single-value collapse', () => {
    expect(formatQuickWorkoutSub(8, 20)).toBe('8–20 MIN');
    expect(formatQuickWorkoutSub(10, 10)).toBe('10 MIN');
    expect(formatQuickWorkoutSub(null, null)).toBe('READY SESSIONS');
  });
});
