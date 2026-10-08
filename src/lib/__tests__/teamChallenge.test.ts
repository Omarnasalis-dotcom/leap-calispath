import {
  attemptPhase,
  betterClockSample,
  cappedTimeScore,
  clockSeconds,
  collectTotal,
  countdownLeft,
  isBetterTeamScore,
  leaderSubmits,
  maxAmrapScore,
  membersWithoutResult,
  minFinishSec,
  normalizeInviteCode,
  progressScore,
  repsDone,
  requiredReps,
  serverClockOffset,
  sortTeamBoard,
  TeamChallenge,
  teamErrorCode,
} from '../teamChallenge';

// Same fixtures as the migration smoke test, so client and server agree on numbers.
const challenge = (over: Partial<TeamChallenge>): TeamChallenge => ({
  id: 'c',
  title: 't',
  description: '',
  format: 'collect',
  scoring_type: 'reps',
  movements: [],
  rounds: 1,
  time_limit_sec: 60,
  team_size: 2,
  starts_at: '2026-10-10T00:00:00Z',
  ends_at: '2026-10-17T00:00:00Z',
  is_active: true,
  ...over,
});

// "Collect AMRAP": one round = 5×10 + 10×5 = 100 pts, 2 minutes.
const AMRAP = challenge({
  scoring_type: 'reps',
  time_limit_sec: 120,
  team_size: 3,
  movements: [
    { name: 'Pull-ups', reps: 5, points: 10 },
    { name: 'Push-ups', reps: 10, points: 5 },
  ],
});

// "Sync sprint": 1 round of 2 push-ups, 60 s cap.
const SPRINT = challenge({ format: 'sync', scoring_type: 'time', movements: [{ name: 'Push-ups', reps: 2, points: 5 }] });

// 3 rounds of 10 pull-ups + 20 push-ups (90 reps), 10-minute cap.
const CHIPPER = challenge({
  scoring_type: 'time',
  rounds: 3,
  time_limit_sec: 600,
  movements: [
    { name: 'Pull-ups', reps: 10, points: 10 },
    { name: 'Push-ups', reps: 20, points: 5 },
  ],
});

describe('who submits', () => {
  it('leader for sync and switch, everyone for collect', () => {
    expect(leaderSubmits('sync')).toBe(true);
    expect(leaderSubmits('switch')).toBe(true);
    expect(leaderSubmits('collect')).toBe(false);
  });
});

describe('AMRAP scoring', () => {
  it('matches the server: 2 rounds + 3 pull-ups = 230', () => {
    expect(progressScore(AMRAP, 2, [3, 0])).toBe(230);
  });

  it('clamps partial reps to each movement (99 push-ups count as 10)', () => {
    expect(progressScore(AMRAP, 0, [5, 99])).toBe(100);
  });

  it('collect total sums member rows only', () => {
    expect(
      collectTotal([
        { score: 230, is_team_row: false },
        { score: 100, is_team_row: false },
        { score: 100, is_team_row: false },
      ]),
    ).toBe(430);
    expect(collectTotal([{ score: 50, is_team_row: true }])).toBe(0);
  });

  it('ceiling is 3 rounds a minute plus one (2 min → 7 rounds = 700)', () => {
    expect(maxAmrapScore(AMRAP)).toBe(700);
  });
});

describe('For Time scoring', () => {
  it('required reps = rounds × one pass', () => {
    expect(requiredReps(SPRINT)).toBe(2);
    expect(requiredReps(CHIPPER)).toBe(90);
    expect(minFinishSec(CHIPPER)).toBe(90);
  });

  it('matches the server: 60 s cap with 1 rep missing = 61', () => {
    expect(cappedTimeScore(SPRINT, 0, [1])).toBe(61);
  });

  it('adds 1 s per missing rep across rounds', () => {
    // 2 full rounds (60) + 10 pull-ups + 8 push-ups = 78 done → 12 missing
    expect(repsDone(CHIPPER, 2, [10, 8])).toBe(78);
    expect(cappedTimeScore(CHIPPER, 2, [10, 8])).toBe(612);
  });

  it('never counts more reps than the workout has', () => {
    expect(repsDone(CHIPPER, 5, [10, 20])).toBe(90);
    expect(cappedTimeScore(CHIPPER, 5, [0, 0])).toBe(600);
  });

  it('a capped team never beats a finished one', () => {
    const finishedAtCap = 599.9;
    expect(isBetterTeamScore('time', finishedAtCap, cappedTimeScore(CHIPPER, 3, [0, 0]))).toBe(true);
  });
});

describe('ranking', () => {
  it('time: lower wins; reps: higher wins; missing best is always beaten', () => {
    expect(isBetterTeamScore('time', 16, 61)).toBe(true);
    expect(isBetterTeamScore('time', 61, 16)).toBe(false);
    expect(isBetterTeamScore('reps', 430, 300)).toBe(true);
    expect(isBetterTeamScore('reps', 1, null)).toBe(true);
  });

  it('ties go to the earlier submission', () => {
    const rows = [
      { id: 'late', best_score: 100, best_submitted_at: '2026-10-10T12:00:00Z' },
      { id: 'early', best_score: 100, best_submitted_at: '2026-10-10T09:00:00Z' },
      { id: 'best', best_score: 200, best_submitted_at: '2026-10-11T09:00:00Z' },
    ];
    expect(sortTeamBoard('reps', rows).map(r => r.id)).toEqual(['best', 'early', 'late']);
    expect(sortTeamBoard('time', rows).map(r => r.id)).toEqual(['early', 'late', 'best']);
  });
});

describe('attempt phase and clock', () => {
  const start = Date.parse('2026-10-10T10:00:03Z');
  const attempt = { status: 'running' as const, started_at: '2026-10-10T10:00:03Z', cap_at: '2026-10-10T10:01:03Z' };

  it('walks countdown → running → scoring → expired', () => {
    expect(attemptPhase(attempt, start - 2500)).toBe('countdown');
    expect(attemptPhase(attempt, start)).toBe('running');
    expect(attemptPhase(attempt, start + 60_000)).toBe('scoring');
    expect(attemptPhase(attempt, start + 60_000 + 15 * 60_000)).toBe('scoring');
    expect(attemptPhase(attempt, start + 60_000 + 15 * 60_000 + 1)).toBe('expired');
    expect(attemptPhase({ ...attempt, status: 'submitted' }, start)).toBe('submitted');
  });

  it('countdown shows 3-2-1 and then 0', () => {
    expect(countdownLeft(attempt, start - 3000)).toBe(3);
    expect(countdownLeft(attempt, start - 2500)).toBe(3);
    expect(countdownLeft(attempt, start - 900)).toBe(1);
    expect(countdownLeft(attempt, start + 10)).toBe(0);
  });

  it('For Time counts up, AMRAP counts down, both stop at the cap', () => {
    expect(clockSeconds('time', attempt, start + 12_500)).toBe(12.5);
    expect(clockSeconds('reps', attempt, start + 12_500)).toBe(47.5);
    expect(clockSeconds('time', attempt, start + 90_000)).toBe(60);
    expect(clockSeconds('reps', attempt, start + 90_000)).toBe(0);
    expect(clockSeconds('time', attempt, start - 2000)).toBe(0);
  });

  it('keeps the clock sample with the shortest round trip', () => {
    const fast = { offsetMs: 120, roundTripMs: 80 };
    const slow = { offsetMs: 400, roundTripMs: 900 };
    expect(betterClockSample(null, slow)).toBe(slow);
    expect(betterClockSample(slow, fast)).toBe(fast);
    expect(betterClockSample(fast, slow)).toBe(fast);
  });

  it('server offset uses the round-trip midpoint', () => {
    // Request 1000 → 1400 locally; server said 10:00:00.700 at the midpoint (1200).
    const serverMs = Date.parse('2026-10-10T10:00:00.700Z');
    expect(serverClockOffset('2026-10-10T10:00:00.700Z', 1000, 1400)).toBe(serverMs - 1200);
  });
});

describe('collect: who still owes a result', () => {
  it('lists members without a row and ignores deleted accounts', () => {
    const members = [
      { user_id: 'a', display_name: 'A' },
      { user_id: 'b', display_name: 'B' },
      { user_id: null, display_name: null },
    ];
    const results = [{ user_id: 'a', is_team_row: false, time_sec: 3, rounds: null, partial: null, capped: false, score: 3, entered_by: 'a' }];
    expect(membersWithoutResult(members, { results }).map(m => m.user_id)).toEqual(['b']);
  });
});

describe('errors and codes', () => {
  it('reads bare server codes and ignores other errors', () => {
    expect(teamErrorCode({ message: 'TEAM_FULL', code: 'P0001' })).toBe('TEAM_FULL');
    expect(teamErrorCode({ message: 'Network request failed' })).toBeNull();
    expect(teamErrorCode(null)).toBeNull();
  });

  it('normalizes pasted invite codes', () => {
    expect(normalizeInviteCode(' v53q-lk ')).toBe('V53QLK');
  });
});
