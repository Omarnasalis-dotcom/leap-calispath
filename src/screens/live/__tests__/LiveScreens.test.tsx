import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { LiveRoomState, LiveResult } from '../../../lib/liveTournament';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  return {
    router: { push: (...a: any[]) => mockPush(...a), back: () => mockBack() },
    // Focus = mount in these tests.
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockMode: 'dark' | 'light' = 'dark';
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: mockMode }) }));
jest.mock('../../../contexts/TutorialContext', () => ({ useTutorial: () => ({ requestRemeasure: jest.fn() }) }));
let mockUserId = 'me';
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));
jest.mock('../../../lib/supabase', () => {
  const channel: any = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: jest.fn() } };
});
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
let mockConnected = true;
const mockNetListeners: Array<(s: { isConnected: boolean }) => void> = [];
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: (cb: (s: { isConnected: boolean }) => void) => {
    mockNetListeners.push(cb);
    cb({ isConnected: mockConnected });
    return () => {};
  },
}));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn() }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../../../components/GlobalErrorBoundary', () => ({
  GlobalErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../services/LiveTournamentService', () => {
  class LiveTournamentError extends Error {
    code: string | null;
    constructor(message: string, code: string | null) {
      super(message);
      this.code = code;
    }
  }
  const fn = () => jest.fn();
  return {
    LiveTournamentError,
    LiveTournamentService: {
      getRoomState: fn(), getOpenChallenges: fn(), getMyRoom: fn(), getHistory: fn(), createRoom: fn(), joinRoom: fn(),
      pickSide: fn(), nameSide: fn(), setReady: fn(), getPlayerBoard: fn(), getTeamBoard: fn(), leaveRoom: fn(), startHalf: fn(), sendHalfStartedPush: fn(), submitReps: fn(),
      abandonRoom: fn(),
    },
  };
});
const mockService = jest.requireMock('../../../services/LiveTournamentService').LiveTournamentService as Record<string, jest.Mock>;
const { LiveTournamentError } = jest.requireMock('../../../services/LiveTournamentService');

import i18n from '../../../i18n';
import { LiveRoomScreen } from '../LiveRoomScreen';
import { LiveHub } from '../LiveHub';
import { getWeeklyTokens } from '../../../components/weekly/weeklyTokens';
import { isLiveRoomOpen } from '../../../lib/liveRoomFocus';

// ── Helpers ────────────────────────────────────────────────────────────────

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const button = (r: ReactTestRenderer, label: string, exact = false) =>
  r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && (exact ? texts(n.children as any).join('') === label : texts(n.children as any).join('').includes(label)))[0];

const HALVES = [
  { duration_sec: 240, movements: [{ name: 'Pull-ups', reps: 50, points: 3 }, { name: 'Dips', reps: 50, points: 2 }, { name: 'Squats', reps: 50, points: 1 }] },
  { duration_sec: 240, movements: [{ name: 'Push-ups', reps: 50, points: 1.5 }, { name: 'Toes to bar', reps: 50, points: 3 }, { name: 'Lunges', reps: 50, points: 1 }] },
];

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

type Over = Partial<LiveRoomState['room']>;
function makeState(room: Over = {}, players: LiveRoomState['players'] = [], extra: Partial<LiveRoomState> = {}): LiveRoomState {
  return {
    server_now: new Date().toISOString(),
    room: {
      id: 'r1', code: 'K7PQ2M', status: 'lobby', side_count: 2, host_id: 'me', current_half: 0,
      half_started_at: null, half_ends_at: null, log_closes_at: null, half_closed_at: null, anyone_can_start_at: null,
      created_at: iso(-60_000), started_at: null, finished_at: null, ...room,
    },
    challenge: { id: 'c1', title: 'Halves Week 1', description: '', halves: HALVES, rest_sec: 60, team_size: 2 },
    players,
    side_names: { '1': 'Wolves', '2': 'Lions' },
    logged: [],
    results: [],
    ...extra,
  };
}

const p = (user_id: string, name: string, side: number | null, is_ready = true, online = true) => ({
  user_id, display_name: name, side, is_ready, is_host: user_id === 'me', joined_at: iso(-50_000), online,
});
const FOUR = [p('me', 'Omar', 1), p('u2', 'Sara', 1), p('u3', 'Ali', 2), p('u4', 'Mona', 2)];

const result = (half: number, user_id: string, side: number, points: number, at = -1000): LiveResult => ({
  half, user_id, side, reps: [0, 0, 0], points, entered_by: user_id, entered_at: iso(at),
});

const timed = (data: LiveRoomState) => ({ data, clockOffsetMs: 0, roundTripMs: 40 });

// Unmounted after each test so polling intervals don't keep Jest alive.
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
  i18n.changeLanguage('en');
});

async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); });
  mounted.push(r);
  await act(async () => {}); // let load() resolve
  return r;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockMode = 'dark';
  // Drafts and rep counters live in phone storage; start each test clean.
  await require('@react-native-async-storage/async-storage').clear();
  mockUserId = 'me';
  mockConnected = true;
  mockNetListeners.length = 0;
});

// ── Lobby ──────────────────────────────────────────────────────────────────

describe('LiveRoomScreen · lobby', () => {
  it('host, sides uneven: code, sides, blocker on Start, can remove others', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, [p('me', 'Omar', 1), p('u2', 'Sara', 1), p('u3', 'Ali', 2)])));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('K7PQ2M');
    expect(text).toContain('Wolves');
    expect(text).toContain('Lions');
    expect(text).toContain('Open spot'); // side B has 1 of 2
    expect(text).toContain('Sides need the same number of players');
    expect(button(r, 'START HALF 1')).toBeUndefined();
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Remove Sara' && n.props.onPress)).toHaveLength(1);
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Remove Omar')).toHaveLength(0);
    expect(isLiveRoomOpen('r1')).toBe(true);
  });

  it('host with even, ready sides starts half 1 and sends the push', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, FOUR)));
    mockService.startHalf.mockResolvedValue({ data: { half: 1, halfStartedAt: iso(5000), halfEndsAt: iso(245_000) }, clockOffsetMs: 0, roundTripMs: 40 });
    const r = await render(<LiveRoomScreen roomId="r1" />);
    await act(async () => { button(r, 'START HALF 1').props.onPress(); });
    expect(mockService.startHalf).toHaveBeenCalledWith('r1');
    expect(mockService.sendHalfStartedPush).toHaveBeenCalledWith('r1');
  });

  it('warns the host before starting with an offline player', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, [p('me', 'Omar', 1), p('u2', 'Sara', 1), p('u3', 'Ali', 2), p('u4', 'Mona', 2, true, false)])));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    expect(allText(r)).toContain('OFFLINE');
    await act(async () => { button(r, 'START HALF 1').props.onPress(); });
    expect(alert).toHaveBeenCalledWith('Some players are offline', expect.stringContaining('Mona'), expect.any(Array));
    expect(mockService.startHalf).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('player without a side: join buttons, hint, waits for host', async () => {
    mockUserId = 'u5';
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, [...FOUR.slice(0, 3), p('u5', 'Kareem', null, false)])));
    mockService.pickSide.mockResolvedValue(undefined);
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('NO SIDE YET');
    expect(text).toContain('Pick a side above, then tap Ready.');
    expect(text).toContain('WAITING FOR THE HOST TO START');
    // Side A is full (2/2), side B has room.
    const joins = r.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.onPress && texts(n.children as any).join('') === 'JOIN');
    expect(joins).toHaveLength(1);
    await act(async () => { joins[0].props.onPress(); });
    expect(mockService.pickSide).toHaveBeenCalledWith('r1', 2);
  });

  it('Arabic lobby', async () => {
    i18n.changeLanguage('ar');
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, FOUR)));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('رمز الغرفة');
    expect(text).toContain('Wolves');
    expect(text).toContain('إعادة التسمية');
    expect(text).toContain('بدء الشوط 1');
  });

  it('unnamed side: blocks Start, my side shows NAME YOUR TEAM, saving names it', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, FOUR, { side_names: { '2': 'Lions' } })));
    mockService.nameSide.mockResolvedValue(undefined);
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('SIDE A');
    expect(text).toContain('NO NAME YET');
    expect(text).toContain('Every team needs a name');
    expect(button(r, 'START HALF 1')).toBeUndefined();
    await act(async () => { button(r, 'NAME YOUR TEAM').props.onPress(); });
    const input = r.root.findAll(n => n.props.accessibilityLabel === 'Team name' && n.props.onChangeText)[0];
    await act(async () => { input.props.onChangeText('  Iron Wolves '); });
    await act(async () => { button(r, 'SAVE', true).props.onPress(); });
    expect(mockService.nameSide).toHaveBeenCalledWith('r1', 'Iron Wolves');
  });

  it('naming a taken name shows the server message and keeps the sheet open', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState({}, FOUR, { side_names: { '2': 'Lions' } })));
    mockService.nameSide.mockRejectedValue(new LiveTournamentError('Another team in this room has that name. Try a different one.', 'NAME_TAKEN'));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    await act(async () => { button(r, 'NAME YOUR TEAM').props.onPress(); });
    const input = r.root.findAll(n => n.props.accessibilityLabel === 'Team name' && n.props.onChangeText)[0];
    await act(async () => { input.props.onChangeText('lions'); });
    await act(async () => { button(r, 'SAVE', true).props.onPress(); });
    expect(allText(r)).toContain('Another team in this room has that name');
  });
});

// ── During a match ─────────────────────────────────────────────────────────

const running = (over: Over = {}) => ({
  status: 'playing' as const, current_half: 1, started_at: iso(-20_000),
  half_started_at: iso(-10_000), half_ends_at: iso(230_000), log_closes_at: iso(350_000), ...over,
});
const logging = (over: Over = {}) => running({ half_started_at: iso(-250_000), half_ends_at: iso(-10_000), log_closes_at: iso(110_000), ...over });

describe('LiveRoomScreen · match', () => {
  it('running half: −5/−1/+1/+5 and a typed number, capped at the max, pre-filling the log', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState(running(), FOUR)));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('HALF 1 OF 2');
    expect(text).toContain('TIME LEFT');
    expect(text).toContain('Pull-ups');
    expect(text).not.toContain('Push-ups'); // half 2 isn't shown yet
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Pull-ups +10')).toHaveLength(0);
    const tap = async (label: string, times = 1) => {
      for (let i = 0; i < times; i++) {
        await act(async () => { r.root.findAll(n => n.props.accessibilityLabel === label && n.props.onPress)[0].props.onPress(); });
      }
    };
    const field = (name: string) => r.root.findAll(n => n.props.accessibilityLabel === `${name} reps` && n.props.onChangeText)[0];
    await act(async () => { field('Pull-ups').props.onChangeText('42'); });
    await tap('Pull-ups +5');
    await tap('Pull-ups −1');
    expect(field('Pull-ups').props.value).toBe('46');
    await tap('Pull-ups +5'); // 51 → capped at 50
    expect(field('Pull-ups').props.value).toBe('50');
    await act(async () => { field('Dips').props.onChangeText('999'); }); // typed above the max
    expect(field('Dips').props.value).toBe('50');
    await tap('Dips −5', 9);
    expect(field('Dips').props.value).toBe('5');
    await tap('Dips −5', 2); // never below 0
    expect(field('Dips').props.value).toBe('0');
    await tap('Dips +5');
    expect(allText(r)).toContain('160 PTS'); // 50×3 + 5×2

    // Time's up: the log starts from the counts.
    mockService.getRoomState.mockResolvedValue(timed(makeState(logging(), FOUR)));
    mockService.submitReps.mockResolvedValue({ points: 160, halfClosed: false });
    const r2 = await render(<LiveRoomScreen roomId="r1" />);
    await act(async () => {});
    await act(async () => { button(r2, 'SEND REPS').props.onPress(); });
    expect(mockService.submitReps).toHaveBeenCalledWith('r1', 1, [50, 5, 0], 'me');
  });

  it('logging: sends my reps; the host can log for a missing player', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState(logging(), FOUR, { logged: ['u2'] })));
    mockService.submitReps.mockResolvedValue({ points: 280, halfClosed: false });
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('LOG YOUR REPS');
    expect(text).toContain('LOGGING CLOSES IN');
    // Sara logged; Ali and Mona can be logged by the host.
    expect(r.root.findAll(n => n.props.accessibilityRole === 'button' && n.props.onPress && texts(n.children as any).join('') === 'LOG')).toHaveLength(2);

    const pullUps = r.root.findAll(n => n.props.accessibilityLabel === 'Pull-ups' && n.props.onChangeText)[0];
    await act(async () => { pullUps.props.onChangeText('50'); });
    await act(async () => { button(r, 'SEND REPS').props.onPress(); });
    expect(mockService.submitReps).toHaveBeenCalledWith('r1', 1, [50, 0, 0], 'me');
  });

  it('logging offline: keeps the reps and says they will send on reconnect', async () => {
    mockConnected = false;
    mockService.getRoomState.mockResolvedValue(timed(makeState(logging(), FOUR)));
    mockService.submitReps.mockRejectedValue(new LiveTournamentError('Network request failed', null));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    await act(async () => { button(r, 'SEND REPS').props.onPress(); });
    expect(allText(r)).toContain('Your reps are saved on this phone');

    // Back online: the saved log is sent again automatically.
    mockService.submitReps.mockResolvedValue({ points: 0, halfClosed: false });
    await act(async () => { mockNetListeners.forEach(cb => cb({ isConnected: true })); });
    expect(mockService.submitReps).toHaveBeenCalledTimes(2);
  });

  it('rest: standings after half 1, host starts half 2', async () => {
    const results = [result(1, 'me', 1, 280), result(1, 'u3', 2, 120)];
    mockService.getRoomState.mockResolvedValue(timed(makeState(logging({ half_closed_at: iso(-5000) }), FOUR, { results, logged: ['me', 'u3'] })));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    expect(text).toContain('STANDINGS AFTER HALF 1');
    expect(text).toContain('COOL-DOWN');
    expect(text).toContain('280 PTS');
    expect(text).toContain('NEXT UP · HALF 2');
    expect(text).toContain('Push-ups');
    expect(button(r, 'START HALF 2')).toBeDefined();
  });

  it('rest with 4 sides: podium for the top 3, the 4th as a row', async () => {
    const eight = [
      p('me', 'Omar', 1), p('u2', 'Sara', 1), p('u3', 'Ali', 2), p('u4', 'Mona', 2),
      p('u5', 'Kareem', 3), p('u6', 'Nour', 3), p('u7', 'Yara', 4), p('u8', 'Ziad', 4),
    ];
    const results = [result(1, 'me', 1, 100), result(1, 'u3', 2, 300), result(1, 'u5', 3, 200), result(1, 'u7', 4, 50)];
    mockService.getRoomState.mockResolvedValue(timed(makeState(
      { ...logging({ half_closed_at: iso(-5000) }), side_count: 4 }, eight,
      { results, side_names: { '1': 'Wolves', '2': 'Lions', '3': 'Hawks', '4': 'Bears' } },
    )));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    const text = allText(r);
    // Podium reads 2nd · 1st · 3rd, then the 4th row.
    const order = ['Hawks', 'Lions', 'Wolves', 'Bears'].map(n => text.indexOf(n));
    expect(order.every(i => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toContain('300 PTS');
    expect(text).toContain('50 PTS');
  });

  it('tied sides share the place number on the podium', async () => {
    const results = [result(1, 'me', 1, 120), result(1, 'u3', 2, 120)];
    mockService.getRoomState.mockResolvedValue(timed(makeState(logging({ half_closed_at: iso(-5000) }), FOUR, { results })));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    // Both podium blocks read 1 (place numbers render as text nodes).
    const ones = texts(r.toJSON()).filter(x => x === '1');
    expect(ones.length).toBeGreaterThanOrEqual(2);
  });

  it('rest, not the host: waits until the fallback', async () => {
    mockUserId = 'u2';
    mockService.getRoomState.mockResolvedValue(timed(makeState(logging({ half_closed_at: iso(-5000) }), FOUR)));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    expect(allText(r)).toContain('WAITING FOR THE HOST TO START');
    expect(allText(r)).toContain('If the host is away, anyone can start in');
  });

  it('final: ranked sides, winner and best player', async () => {
    jest.useFakeTimers();
    try {
      const results = [
        result(1, 'me', 1, 280, -9000), result(1, 'u3', 2, 120, -8000),
        result(2, 'me', 1, 55, -3000), result(2, 'u2', 1, 275, -2000), result(2, 'u3', 2, 15, -1000), result(2, 'u4', 2, 0, -500),
      ];
      mockService.getRoomState.mockResolvedValue(timed(makeState(
        { status: 'finished', current_half: 2, half_closed_at: iso(-100), finished_at: iso(-100) }, FOUR, { results },
      )));
      const r = await render(<LiveRoomScreen roomId="r1" />);
      expect(allText(r)).toContain('FINAL RESULT');
      expect(allText(r)).toContain('610 PTS');
      expect(allText(r)).not.toContain('DONE'); // the table waits for the end of the celebration
      await act(async () => { jest.advanceTimersByTime(6000); });
      const text = allText(r);
      expect(text).toContain('WINNER');
      expect(text).toContain('WOLVES');
      expect(text).toContain('BEST PLAYER');
      expect(text).toContain('Omar');
      expect(text).toContain('335 PTS');
      expect(text).toContain('DONE');
    } finally {
      jest.useRealTimers();
    }
  });

  it('final: tapping skips straight to the table', async () => {
    const results = [result(1, 'me', 1, 280), result(1, 'u3', 2, 120)];
    mockService.getRoomState.mockResolvedValue(timed(makeState(
      { status: 'finished', current_half: 2, half_closed_at: iso(-100), finished_at: iso(-100) }, FOUR, { results },
    )));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    expect(allText(r)).not.toContain('DONE');
    const skip = r.root.findAll(n => n.props.accessibilityHint === 'Tap to skip' && n.props.onPress)[0];
    await act(async () => { skip.props.onPress(); });
    expect(allText(r)).toContain('DONE');
  });

  it('abandoned room', async () => {
    mockService.getRoomState.mockResolvedValue(timed(makeState({ status: 'abandoned' }, FOUR)));
    const r = await render(<LiveRoomScreen roomId="r1" />);
    expect(allText(r)).toContain('ROOM ENDED');
  });

  it('removed from the room: goes back', async () => {
    mockService.getRoomState.mockRejectedValue(new LiveTournamentError('You are not in this room.', 'NOT_IN_ROOM'));
    await render(<LiveRoomScreen roomId="r1" />);
    expect(mockBack).toHaveBeenCalled();
  });
});

// ── Hub ────────────────────────────────────────────────────────────────────

const t = getWeeklyTokens('dark');
const CHALLENGE = { id: 'c1', title: 'Halves Week 1', description: '', halves: HALVES, rest_sec: 60, team_size: 2,
  starts_at: '2026-10-20T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', is_active: true };

describe('LiveHub', () => {
  it('no challenge', async () => {
    mockService.getOpenChallenges.mockResolvedValue([]);
    mockService.getMyRoom.mockResolvedValue(null);
    mockService.getHistory.mockResolvedValue([]);
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    expect(allText(r)).toContain('NO LIVE CHALLENGE RIGHT NOW');
  });

  it('open challenge: card, halves, create / join', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyRoom.mockResolvedValue(null);
    mockService.getHistory.mockResolvedValue([]);
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    const text = allText(r);
    expect(text).toContain('HALVES WEEK 1');
    expect(text).toContain('2 HALVES');
    expect(text).toContain('HALF 2 OF 2');
    expect(text).toContain('CREATE ROOM');
    expect(text).toContain('JOIN WITH CODE');
  });

  it('already in a room: shows it instead of create / join', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyRoom.mockResolvedValue('r9');
    mockService.getHistory.mockResolvedValue([]);
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    expect(allText(r)).toContain('YOUR LIVE ROOM');
    expect(button(r, 'CREATE ROOM')).toBeUndefined();
    await act(async () => { button(r, 'YOUR LIVE ROOM').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/live-room', params: { roomId: 'r9' } });
  });

  it('create that comes back ALREADY_IN_ROOM opens the existing room', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyRoom.mockResolvedValueOnce(null).mockResolvedValueOnce('r7');
    mockService.getHistory.mockResolvedValue([]);
    mockService.createRoom.mockRejectedValue(new LiveTournamentError('You are already in a live room.', 'ALREADY_IN_ROOM'));
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    await act(async () => { button(r, 'CREATE ROOM').props.onPress(); });
    await act(async () => { button(r, 'CREATE', true).props.onPress(); });
    expect(mockService.createRoom).toHaveBeenCalledWith('c1', 2);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/live-room', params: { roomId: 'r7' } });
  });

  it('leaderboard: players podium, then the teams tab', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyRoom.mockResolvedValue(null);
    mockService.getHistory.mockResolvedValue([]);
    mockService.getPlayerBoard.mockResolvedValue([
      { rank: 1, user_id: 'u2', display_name: 'Sara', country: null, points: 410, team_name: 'Lions', achieved_at: iso(-1), is_mine: false },
      { rank: 2, user_id: 'me', display_name: 'Omar', country: null, points: 335, team_name: 'Iron Wolves', achieved_at: iso(-1), is_mine: true },
      { rank: 3, user_id: 'u3', display_name: 'Ali', country: null, points: 300, team_name: 'Lions', achieved_at: iso(-1), is_mine: false },
      { rank: 4, user_id: 'u4', display_name: 'Mona', country: null, points: 12.5, team_name: null, achieved_at: iso(-1), is_mine: false },
    ]);
    mockService.getTeamBoard.mockResolvedValue([
      { rank: 1, room_id: 'r1', side: 1, team_name: 'Iron Wolves', members: [{ user_id: 'me', display_name: 'Omar' }, { user_id: 'u2', display_name: 'Sara' }],
        player_count: 2, total: 610, points_per_player: 305, achieved_at: iso(-1), is_mine: true },
    ]);
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    let text = allText(r);
    expect(text).toContain('LEADERBOARD');
    expect(text).toContain('410 PTS');
    expect(text).toContain('Mona'); // 4th, in the list under the podium
    expect(text).toContain('12.5 PTS');
    expect(mockService.getPlayerBoard).toHaveBeenCalledWith('c1');

    const teamsTab = r.root.findAll(n => n.props.accessibilityRole === 'tab' && texts(n.children as any).join('').includes('TEAMS'))[0];
    await act(async () => { teamsTab.props.onPress(); });
    text = allText(r);
    expect(text).toContain('Scored as points per player');
    expect(text).toContain('Iron Wolves');
    expect(text).toContain('305 PTS');
  });

  it('leaderboard: empty', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyRoom.mockResolvedValue(null);
    mockService.getHistory.mockResolvedValue([]);
    mockService.getPlayerBoard.mockResolvedValue([]);
    mockService.getTeamBoard.mockResolvedValue([]);
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    expect(allText(r)).toContain('No finished matches yet');
  });

  it('history row', async () => {
    mockService.getOpenChallenges.mockResolvedValue([]);
    mockService.getMyRoom.mockResolvedValue(null);
    mockService.getHistory.mockResolvedValue([{
      room_id: 'r1', challenge_id: 'c1', challenge_title: 'Halves Week 1', finished_at: '2026-10-22T18:00:00Z', side_count: 2,
      halves_played: 2, my_side: 1, my_points: 335, side_points: 610, side_place: 1, is_best_player: true, player_count: 4,
      my_side_name: 'Iron Wolves',
    }]);
    const r = await render(<LiveHub tokens={t} onBack={() => {}} modeSlot={null} />);
    const text = allText(r);
    expect(text).toContain('LIVE HISTORY');
    expect(text).toContain('Iron Wolves');
    expect(text).toContain('335 PTS');
    expect(text).toContain('#1 OF 2');
    expect(text).toContain('BEST PLAYER');
  });
});

// ── Every screen in EN / AR × dark / light ─────────────────────────────────

describe('LIVE in both languages and both themes', () => {
  const RAW_KEY = /\b(live|team|weekly|common|submit)\.[a-zA-Z_]+/;
  const finished = { status: 'finished' as const, current_half: 2, half_closed_at: iso(-100), finished_at: iso(-100) };
  const fullResults = [result(1, 'me', 1, 280), result(1, 'u3', 2, 120), result(2, 'u2', 1, 275), result(2, 'u4', 2, 15)];
  const stages: [string, () => LiveRoomState][] = [
    ['lobby (unnamed side)', () => makeState({}, FOUR, { side_names: { '2': 'الأسود' } })],
    ['countdown', () => makeState(running({ half_started_at: iso(3000), half_ends_at: iso(63_000), log_closes_at: iso(183_000) }), FOUR)],
    ['running', () => makeState(running(), FOUR)],
    ['logging', () => makeState(logging(), FOUR, { logged: ['u2'] })],
    ['rest', () => makeState(logging({ half_closed_at: iso(-5000) }), FOUR, { results: fullResults.slice(0, 2) })],
    ['final', () => makeState(finished, FOUR, { results: fullResults })],
    ['ended', () => makeState({ status: 'abandoned' }, FOUR)],
  ];

  for (const lang of ['en', 'ar'] as const) {
    for (const theme of ['dark', 'light'] as const) {
      for (const [name, build] of stages) {
        it(`${lang} · ${theme} · ${name}`, async () => {
          i18n.changeLanguage(lang);
          mockMode = theme;
          jest.useFakeTimers();
          try {
            mockService.getRoomState.mockResolvedValue(timed(build()));
            const r = await render(<LiveRoomScreen roomId="r1" />);
            await act(async () => { jest.advanceTimersByTime(8000); }); // let the celebration settle
            const text = allText(r);
            expect(text).not.toMatch(RAW_KEY);
            expect(text).not.toMatch(/undefined|NaN|\[object/);
            if (lang === 'ar') expect(text).toMatch(/[\u0600-\u06FF]/);
          } finally {
            jest.useRealTimers();
          }
        });
      }
      it(`${lang} · ${theme} · hub with boards and history`, async () => {
        i18n.changeLanguage(lang);
        mockMode = theme;
        mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
        mockService.getMyRoom.mockResolvedValue('r9');
        mockService.getHistory.mockResolvedValue([{
          room_id: 'r1', challenge_id: 'c1', challenge_title: 'Halves', finished_at: iso(-1), side_count: 2, halves_played: 2,
          my_side: 1, my_points: 335, side_points: 610, side_place: 1, is_best_player: true, player_count: 4, my_side_name: null,
        }]);
        mockService.getPlayerBoard.mockResolvedValue([
          { rank: 1, user_id: 'me', display_name: 'Omar', country: null, points: 335, team_name: 'الذئاب', achieved_at: iso(-1), is_mine: true },
        ]);
        mockService.getTeamBoard.mockResolvedValue([]);
        const r = await render(<LiveHub tokens={getWeeklyTokens(theme)} onBack={() => {}} modeSlot={null} />);
        const text = allText(r);
        expect(text).not.toMatch(RAW_KEY);
        expect(text).not.toMatch(/undefined|NaN|\[object/);
        if (lang === 'ar') {
          expect(text).toContain('شوطان'); // Arabic dual, not "2 أشواط"
          expect(text).toContain('حتى لاعبَين لكل جانب');
        }
      });
    }
  }
});

