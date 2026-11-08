import { restoreAmrap, restoreForTime, restoreLadder } from '../workoutInlineState';

const NOW = 1_000_000_000_000;

describe('restoreAmrap', () => {
  it('nothing saved: a fresh timer', () => {
    expect(restoreAmrap(undefined, 600, NOW)).toEqual({ rounds: 0, finished: false, running: false, timeLeft: 600 });
  });
  it('still running: keeps going from the real clock', () => {
    expect(restoreAmrap({ rounds: 3, finished: false, endAt: NOW + 90_000, timeLeft: 0 }, 600, NOW))
      .toEqual({ rounds: 3, finished: false, running: true, timeLeft: 90 });
  });
  it('ran out while closed: finished, rounds kept', () => {
    expect(restoreAmrap({ rounds: 3, finished: false, endAt: NOW - 5_000, timeLeft: 0 }, 600, NOW))
      .toEqual({ rounds: 3, finished: true, running: false, timeLeft: 0 });
  });
  it('not running: exactly as left', () => {
    expect(restoreAmrap({ rounds: 2, finished: true, endAt: null, timeLeft: 0 }, 600, NOW))
      .toEqual({ rounds: 2, finished: true, running: false, timeLeft: 0 });
  });
});

describe('restoreForTime', () => {
  const base = { rounds: 1, capped: false, hasStarted: true, startAt: null, elapsed: 0, manualMode: false, manualMins: '', manualSecs: '' };
  it('running: elapsed from the start time', () => {
    const r = restoreForTime({ ...base, startAt: NOW - 125_000 }, 900, NOW);
    expect(r).toMatchObject({ running: true, elapsed: 125, rounds: 1, hasStarted: true, capped: false });
  });
  it('hit the cap while closed: capped at the cap', () => {
    const r = restoreForTime({ ...base, startAt: NOW - 1_000_000 }, 900, NOW);
    expect(r).toMatchObject({ running: false, elapsed: 900, capped: true });
  });
  it('a typed manual time comes back', () => {
    const r = restoreForTime({ ...base, hasStarted: false, manualMode: true, manualMins: '12', manualSecs: '30' }, 900, NOW);
    expect(r).toMatchObject({ running: false, manualMode: true, manualMins: '12', manualSecs: '30' });
  });
});

describe('restoreLadder', () => {
  const rest = { countUp: false, isRestMode: true, restSeconds: 60, rungCount: 5 };
  const saved = { selectedIndex: 1, extraReps: 0, currentRoundIndex: 1, anchorAt: null as number | null, timeLeft: 0 };
  it('rung and extra reps come back', () => {
    expect(restoreLadder({ ...saved, extraReps: 2 }, rest, NOW)).toMatchObject({ selectedIndex: 1, extraReps: 2, currentRoundIndex: 1, active: false });
  });
  it('rest still running keeps counting down', () => {
    expect(restoreLadder({ ...saved, anchorAt: NOW + 20_000 }, rest, NOW)).toMatchObject({ active: true, timeLeft: 20, currentRoundIndex: 1 });
  });
  it('rest ended while closed: on to the next rung, like on screen', () => {
    expect(restoreLadder({ ...saved, anchorAt: NOW - 1_000 }, rest, NOW))
      .toMatchObject({ active: false, currentRoundIndex: 2, selectedIndex: 2, extraReps: 0 });
  });
  it('never moves past the last rung', () => {
    expect(restoreLadder({ ...saved, currentRoundIndex: 4, anchorAt: NOW - 1_000 }, rest, NOW)).toMatchObject({ currentRoundIndex: 4 });
  });
  it('AMRAP ladder that ran out stays on its rung', () => {
    expect(restoreLadder({ ...saved, anchorAt: NOW - 1_000 }, { ...rest, isRestMode: false }, NOW))
      .toMatchObject({ active: false, currentRoundIndex: 1, timeLeft: 0 });
  });
  it('For Time ladder counts up from its start, stopping at the cap', () => {
    const ft = { countUp: true, isRestMode: false, restSeconds: 60, rungCount: 5 };
    expect(restoreLadder({ ...saved, anchorAt: NOW - 20_000 }, ft, NOW)).toMatchObject({ active: true, timeLeft: 20 });
    expect(restoreLadder({ ...saved, anchorAt: NOW - 90_000 }, ft, NOW)).toMatchObject({ active: false, timeLeft: 60 });
  });
});
