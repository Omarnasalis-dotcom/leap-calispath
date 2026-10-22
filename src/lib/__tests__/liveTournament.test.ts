import * as fs from 'fs';
import * as path from 'path';
import ar from '../../i18n/locales/ar';
import en from '../../i18n/locales/en';
import {
  bestPlayer,
  canStartNextHalf,
  clampReps,
  countdownLeft,
  halfPoints,
  halfSecondsLeft,
  LIVE_ERROR_CODES,
  liveErrorCode,
  LiveHalf,
  livePhase,
  LivePlayer,
  LiveResult,
  LiveRoom,
  lobbyStatus,
  logSecondsLeft,
  maxHalfPoints,
  bumpTally,
  celebrationTimes,
  sideNameOf,
  offlinePlayers,
  playersNotLogged,
  playerTotals,
  restSecondsLeft,
  sideHasRoom,
  sideLetter,
  sideStandings,
} from '../liveTournament';

// Same challenge as the migration smoke test, so client and server agree on numbers.
const HALVES: LiveHalf[] = [
  {
    duration_sec: 240,
    movements: [
      { name: 'Pull-ups', reps: 50, points: 3 },
      { name: 'Dips', reps: 50, points: 2 },
      { name: 'Squats', reps: 50, points: 1 },
    ],
  },
  {
    duration_sec: 240,
    movements: [
      { name: 'Push-ups', reps: 50, points: 1.5 },
      { name: 'Toes to bar', reps: 50, points: 3 },
      { name: 'Lunges', reps: 50, points: 1 },
    ],
  },
];

const T0 = Date.parse('2026-10-22T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const room = (over: Partial<LiveRoom> = {}): LiveRoom => ({
  id: 'r',
  code: 'ABCDEF',
  status: 'playing',
  side_count: 2,
  host_id: 'p1',
  current_half: 1,
  // 3-2-1 until T0, timer until T0 + 240 s, logging until T0 + 360 s
  half_started_at: iso(T0),
  half_ends_at: iso(T0 + 240_000),
  log_closes_at: iso(T0 + 360_000),
  half_closed_at: null,
  anyone_can_start_at: null,
  created_at: iso(T0 - 600_000),
  started_at: iso(T0 - 3_000),
  finished_at: null,
  ...over,
});

const player = (user_id: string | null, side: number | null, is_ready = true): LivePlayer => ({
  user_id,
  display_name: user_id,
  side,
  is_ready,
  is_host: user_id === 'p1',
  joined_at: iso(T0),
});

const result = (half: number, user_id: string, side: number, reps: number[], minute: number): LiveResult => ({
  half,
  user_id,
  side,
  reps,
  points: halfPoints(HALVES[half - 1].movements, reps),
  entered_by: user_id,
  entered_at: iso(T0 + minute * 60_000),
});

// The smoke test's full 2 v 2 match: P1 + P2 on side 1, P3 + P4 on side 2.
// Half 1: P1 logged 50/50/30, the host logged P3, P2 and P4 missed the window.
// Half 2: everyone logged.
const MATCH: LiveResult[] = [
  result(1, 'p1', 1, [50, 50, 30], 5),
  result(1, 'p3', 2, [20, 20, 20], 6),
  result(2, 'p1', 1, [10, 10, 10], 20),
  result(2, 'p2', 1, [50, 50, 50], 21),
  result(2, 'p3', 2, [10, 0, 0], 22),
  result(2, 'p4', 2, [0, 0, 0], 23),
];

describe('scoring', () => {
  it('matches the server: reps × points', () => {
    expect(halfPoints(HALVES[0].movements, [50, 40, 30])).toBe(260);
    expect(halfPoints(HALVES[0].movements, [50, 50, 30])).toBe(280);
    expect(halfPoints(HALVES[1].movements, [10, 10, 10])).toBe(55);
    expect(halfPoints(HALVES[1].movements, [50, 50, 50])).toBe(275);
  });

  it('clamps each value to 0..max as whole numbers', () => {
    expect(clampReps(HALVES[0].movements, [51, -3, 7.9])).toEqual([50, 0, 7]);
    expect(clampReps(HALVES[0].movements, [5])).toEqual([5, 0, 0]);
    expect(clampReps(HALVES[0].movements, [NaN, 2, 3])).toEqual([0, 2, 3]);
  });

  it('max points for a half', () => {
    expect(maxHalfPoints(HALVES[0].movements)).toBe(300);
    expect(maxHalfPoints(HALVES[1].movements)).toBe(275);
  });
});

describe('livePhase', () => {
  it('walks countdown → running → logging → rest', () => {
    const r = room();
    expect(livePhase(r, 2, T0 - 1_000)).toBe('countdown');
    expect(livePhase(r, 2, T0)).toBe('running');
    expect(livePhase(r, 2, T0 + 239_999)).toBe('running');
    expect(livePhase(r, 2, T0 + 240_000)).toBe('logging');
    expect(livePhase(r, 2, T0 + 359_999)).toBe('logging');
    // deadline passed before the server recorded it
    expect(livePhase(r, 2, T0 + 360_000)).toBe('rest');
    // everyone logged early
    expect(livePhase(room({ half_closed_at: iso(T0 + 250_000) }), 2, T0 + 251_000)).toBe('rest');
  });

  it('the last half closing means finished', () => {
    expect(livePhase(room({ current_half: 2 }), 2, T0 + 360_000)).toBe('finished');
    expect(livePhase(room({ current_half: 2, half_closed_at: iso(T0 + 250_000) }), 2, T0 + 251_000)).toBe('finished');
  });

  it('passes lobby / finished / abandoned through', () => {
    expect(livePhase(room({ status: 'lobby', current_half: 0, half_started_at: null }), 2, T0)).toBe('lobby');
    expect(livePhase(room({ status: 'finished' }), 2, T0)).toBe('finished');
    expect(livePhase(room({ status: 'abandoned' }), 2, T0)).toBe('abandoned');
  });
});

describe('clocks', () => {
  it('countdown, half timer and logging window', () => {
    const r = room();
    expect(countdownLeft(r, T0 - 2_500)).toBe(3);
    expect(countdownLeft(r, T0 + 1)).toBe(0);
    expect(halfSecondsLeft(r, T0 - 2_000)).toBe(240); // clamped to the duration during 3-2-1
    expect(halfSecondsLeft(r, T0 + 60_000)).toBe(180);
    expect(halfSecondsLeft(r, T0 + 300_000)).toBe(0);
    expect(logSecondsLeft(r, T0 + 300_000)).toBe(60);
    expect(logSecondsLeft(room({ half_closed_at: iso(T0 + 250_000) }), T0 + 300_000)).toBe(0);
  });

  it('cool-down counts from when logging closed', () => {
    expect(restSecondsLeft(room({ half_closed_at: iso(T0 + 250_000) }), 60, T0 + 260_000)).toBe(50);
    expect(restSecondsLeft(room(), 60, T0 + 370_000)).toBe(50); // closed at the deadline
    expect(restSecondsLeft(room(), 60, T0 + 300_000)).toBe(60); // still logging
    expect(restSecondsLeft(room({ half_closed_at: iso(T0 + 250_000) }), 60, T0 + 999_000)).toBe(0);
  });
});

describe('canStartNextHalf', () => {
  const closed = room({ half_closed_at: iso(T0 + 250_000) });

  it('the host can start as soon as logging closed', () => {
    expect(canStartNextHalf(closed, 2, 'p1', T0 + 251_000)).toBe(true);
    expect(canStartNextHalf(room(), 2, 'p1', T0 + 300_000)).toBe(false); // still logging
  });

  it('anyone else only 3 minutes after logging closed', () => {
    expect(canStartNextHalf(closed, 2, 'p2', T0 + 250_000 + 179_000)).toBe(false);
    expect(canStartNextHalf(closed, 2, 'p2', T0 + 250_000 + 180_000)).toBe(true);
  });

  it('never after the last half or without a user', () => {
    expect(canStartNextHalf(room({ current_half: 2, half_closed_at: iso(T0) }), 2, 'p1', T0 + 1_000)).toBe(false);
    expect(canStartNextHalf(closed, 2, null, T0 + 999_000)).toBe(false);
  });
});

describe('lobby', () => {
  const NAMES = { '1': 'Wolves', '2': 'Lions', '3': 'Hawks' };

  it('mirrors the start checks in order (same order as start_live_half)', () => {
    expect(lobbyStatus([player('p1', 1)], 2, NAMES).blocker).toBe('need_two_players');
    expect(lobbyStatus([player('p1', 1), player('p2', null, false)], 2, NAMES).blocker).toBe('no_side');
    expect(lobbyStatus([player('p1', 1), player('p2', 2, false)], 2, NAMES).blocker).toBe('not_ready');
    expect(lobbyStatus([player('p1', 1), player('p2', 1), player('p3', 2)], 2, NAMES).blocker).toBe('uneven');
    expect(lobbyStatus([player('p1', 1), player('p2', 1)], 2, NAMES).blocker).toBe('uneven'); // side B empty
    expect(lobbyStatus([player('p1', 1), player('p3', 2)], 2, NAMES).blocker).toBeNull();
    // 2 v 2 in a 3-a-side challenge is fine; a 3rd empty side isn't
    const four = [player('p1', 1), player('p2', 1), player('p3', 2), player('p4', 2)];
    expect(lobbyStatus(four, 2, NAMES)).toEqual({ sideCounts: [2, 2], blocker: null });
    expect(lobbyStatus(four, 3, NAMES).blocker).toBe('uneven');
  });

  it('every side needs a team name (checked after uneven)', () => {
    const two = [player('p1', 1), player('p3', 2)];
    expect(lobbyStatus(two, 2).blocker).toBe('unnamed');
    expect(lobbyStatus(two, 2, { '1': 'Wolves' }).blocker).toBe('unnamed');
    expect(lobbyStatus(two, 2, { '1': 'Wolves', '2': '   ' }).blocker).toBe('unnamed');
    expect(lobbyStatus([player('p1', 1), player('p2', 1), player('p3', 2)], 2).blocker).toBe('uneven');
  });

  it('ignores deleted accounts', () => {
    expect(lobbyStatus([player('p1', 1), player('p3', 2), player(null, null, false)], 2, NAMES).blocker).toBeNull();
  });

  it('side room excludes yourself', () => {
    const ps = [player('p1', 1), player('p2', 1)];
    expect(sideHasRoom(ps, 1, 2)).toBe(false);
    expect(sideHasRoom(ps, 1, 2, 'p2')).toBe(true); // re-picking your own side
    expect(sideHasRoom(ps, 2, 2)).toBe(true);
  });

  it('side letters and names', () => {
    expect([1, 2, 3, 4].map(sideLetter)).toEqual(['A', 'B', 'C', 'D']);
    expect(sideNameOf({ '2': ' Lions ' }, 2)).toBe('Lions');
    expect(sideNameOf({ '2': 'Lions' }, 1)).toBeNull();
    expect(sideNameOf(undefined, 1)).toBeNull();
  });

  it('rep counter: steps up and down, kept within 0..max', () => {
    const ms = HALVES[0].movements;
    let tally = [0, 0, 0];
    tally = bumpTally(ms, tally, 0, 10);
    tally = bumpTally(ms, tally, 0, 5);
    tally = bumpTally(ms, tally, 1, 1);
    expect(tally).toEqual([15, 1, 0]);
    expect(bumpTally(ms, tally, 1, -1)).toEqual([15, 0, 0]);
    expect(bumpTally(ms, tally, 2, -1)).toEqual([15, 1, 0]); // never below 0
    expect(bumpTally(ms, [48, 0, 0], 0, 10)).toEqual([50, 0, 0]); // never above the max
  });

  it('celebration: last place first, then winner, then best player', () => {
    const c = celebrationTimes(3);
    expect(c.rowAt(2)).toBeLessThan(c.rowAt(1));
    expect(c.rowAt(1)).toBeLessThan(c.rowAt(0));
    expect(c.rowAt(0)).toBeLessThan(c.win);
    expect(c.win).toBeLessThan(c.best);
    expect(c.best).toBeLessThan(c.end);
    expect(celebrationTimes(2).end).toBeLessThan(6);
  });
});

describe('standings', () => {
  it('matches the server: side 1 610 beats side 2 135', () => {
    const s = sideStandings(MATCH, 2, 2);
    expect(s.map(r => [r.side, r.perHalf, r.total, r.place])).toEqual([
      [1, [280, 330], 610, 1],
      [2, [120, 15], 135, 2],
    ]);
  });

  it('standings after half 1 only use visible logs', () => {
    const s = sideStandings(MATCH.filter(r => r.half === 1), 2, 2);
    expect(s.map(r => [r.side, r.total])).toEqual([
      [1, 280],
      [2, 120],
    ]);
  });

  it('tied sides share a place', () => {
    const tie = [result(1, 'a', 1, [10, 0, 0], 1), result(1, 'b', 2, [10, 0, 0], 2), result(1, 'c', 3, [0, 0, 0], 3)];
    expect(sideStandings(tie, 3, 2).map(r => [r.side, r.place])).toEqual([
      [1, 1],
      [2, 1],
      [3, 3],
    ]);
  });

  it('best player = most points (P1 335 over P2 275)', () => {
    expect(playerTotals(MATCH).map(p => [p.user_id, p.total])).toEqual([
      ['p1', 335],
      ['p2', 275],
      ['p3', 135],
      ['p4', 0],
    ]);
    expect(bestPlayer(MATCH)?.user_id).toBe('p1');
    expect(bestPlayer([])).toBeNull();
  });

  it('best player tie goes to whoever logged last earliest', () => {
    const tie = [result(1, 'late', 1, [10, 0, 0], 9), result(1, 'early', 2, [10, 0, 0], 2)];
    expect(bestPlayer(tie)?.user_id).toBe('early');
  });

  it('offline players with a side', () => {
    const ps = [
      { ...player('p1', 1), online: true },
      { ...player('p2', 1), online: false },
      { ...player('p3', null), online: false }, // no side yet: not counted
      { ...player(null, 2), online: false }, // deleted account
    ];
    expect(offlinePlayers(ps).map(p => p.user_id)).toEqual(['p2']);
  });

  it('who still has to log', () => {
    const ps = [player('p1', 1), player('p2', 1), player('p3', 2), player(null, null)];
    expect(playersNotLogged(ps, ['p1', null]).map(p => p.user_id)).toEqual(['p2', 'p3']);
  });
});

describe('errors', () => {
  it('recognizes server codes only', () => {
    expect(liveErrorCode({ message: 'ROOM_FULL' })).toBe('ROOM_FULL');
    expect(liveErrorCode({ message: ' SIDE_FULL ' })).toBe('SIDE_FULL');
    expect(liveErrorCode({ message: 'TypeError: Network request failed' })).toBeNull();
    expect(liveErrorCode(null)).toBeNull();
  });

  it('every code the migration raises is listed and translated in EN and AR', () => {
    const sql = ['20261022120000_add_live_tournament.sql', '20261023120000_live_side_names.sql']
      .map(f => fs.readFileSync(path.join(__dirname, '../../../supabase/migrations', f), 'utf8'))
      .join('\n');
    const raised = [...new Set([...sql.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map(m => m[1]))].sort();
    expect([...LIVE_ERROR_CODES].sort()).toEqual(raised);
    for (const code of LIVE_ERROR_CODES) {
      expect((en as any).live.errors[code]).toEqual(expect.any(String));
      expect((ar as any).live.errors[code]).toEqual(expect.any(String));
    }
  });
});
