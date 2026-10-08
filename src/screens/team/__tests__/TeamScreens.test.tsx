import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TeamMember, TeamState } from '../../../lib/teamChallenge';

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

jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
jest.mock('../../../contexts/TutorialContext', () => ({ useTutorial: () => ({ requestRemeasure: jest.fn() }) }));

let mockUserId = 'me';
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mockUserId } }) }));

jest.mock('../../../lib/supabase', () => {
  const channel: any = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: jest.fn() } };
});

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn() }));
jest.mock('../../../components/GlobalErrorBoundary', () => ({
  GlobalErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../../services/TeamChallengeService', () => {
  class TeamChallengeError extends Error {
    code: string | null = null;
  }
  const fn = () => jest.fn();
  return {
    TeamChallengeError,
    TeamChallengeService: {
      getTeamState: fn(), getOpenChallenges: fn(), getMyTeams: fn(), getBoard: fn(),
      createTeam: fn(), joinTeam: fn(), leaveTeam: fn(), startAttempt: fn(),
    },
  };
});
const mockService = jest.requireMock('../../../services/TeamChallengeService').TeamChallengeService as Record<string, jest.Mock>;

import { TeamLobbyScreen } from '../TeamLobbyScreen';
import { TeamHub } from '../TeamHub';
import { getWeeklyTokens } from '../../../components/weekly/weeklyTokens';

// ── Helpers ────────────────────────────────────────────────────────────────

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) {
    node.forEach(n => texts(n, acc));
    return acc;
  }
  if (typeof node === 'string') {
    acc.push(node);
    return acc;
  }
  if (node.children) texts(node.children, acc);
  return acc;
}

const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');

const CHALLENGE = {
  id: 'c1',
  title: 'Engine Room',
  description: 'Chest to deck on push-ups.',
  format: 'collect' as const,
  scoring_type: 'reps' as const,
  movements: [
    { name: 'Pull-ups', reps: 5, points: 10 },
    { name: 'Push-ups', reps: 10, points: 5 },
  ],
  rounds: 1,
  time_limit_sec: 600,
  team_size: 3,
  starts_at: '2026-10-10T00:00:00Z',
  ends_at: '2099-10-17T00:00:00Z',
  is_active: true,
};

function state(over: Partial<TeamState['team']> = {}, members: TeamMember[] = [
  { user_id: 'me', display_name: 'Omar', is_leader: true },
  { user_id: 'u2', display_name: 'Sara', is_leader: false },
]): TeamState {
  return {
    server_now: new Date().toISOString(),
    team: {
      id: 't1', name: 'Iron Wolves', invite_code: 'V53QLK', leader_id: 'me',
      locked_at: null, best_score: null, best_attempt_id: null, attempts_count: 0, ...over,
    },
    challenge: CHALLENGE,
    members,
    attempt: null,
  };
}

// Unmounted after each test so polling intervals don't keep Jest alive.
const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
});

async function render(el: React.ReactElement): Promise<ReactTestRenderer> {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(el); });
  mounted.push(r);
  await act(async () => {}); // let load() resolve
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUserId = 'me';
});

// ── Lobby ──────────────────────────────────────────────────────────────────

describe('TeamLobbyScreen', () => {
  it('leader with a free spot: invite code, empty slot, players-needed CTA, remove button', async () => {
    mockService.getTeamState.mockResolvedValue({ data: state(), clockOffsetMs: 0, roundTripMs: 50 });
    const r = await render(<TeamLobbyScreen teamId="t1" />);
    const text = allText(r);

    expect(text).toContain('Iron Wolves');
    expect(text).toContain('V53QLK');
    expect(text).toContain('SHARE CODE');
    expect(text).toContain('PLAYERS 2/3');
    expect(text).toContain('Waiting for a player…');
    expect(text).toContain('PLAYERS NEEDED: 1');
    expect(text).toContain('LEADER');
    expect(text).toContain('LEAVE TEAM');
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Remove Sara' && n.props.onPress)).toHaveLength(1);
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Remove Omar')).toHaveLength(0);
  });

  it('member on a full team: no invite code, waits for the leader, cannot remove anyone', async () => {
    mockUserId = 'u2';
    mockService.getTeamState.mockResolvedValue({
      data: state({}, [
        { user_id: 'me', display_name: 'Omar', is_leader: true },
        { user_id: 'u2', display_name: 'Sara', is_leader: false },
        { user_id: 'u3', display_name: 'Ali', is_leader: false },
      ]),
      clockOffsetMs: 0,
      roundTripMs: 50,
    });
    const r = await render(<TeamLobbyScreen teamId="t1" />);
    const text = allText(r);

    expect(text).not.toContain('V53QLK');
    expect(text).toContain('PLAYERS 3/3');
    expect(text).toContain('WAITING FOR THE LEADER TO START');
    expect(text).not.toContain('PLAYERS NEEDED');
    expect(r.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && n.props.accessibilityLabel.startsWith('Remove'))).toHaveLength(0);
  });

  it('leader on a full team can start', async () => {
    mockService.getTeamState.mockResolvedValue({
      data: state({}, [
        { user_id: 'me', display_name: 'Omar', is_leader: true },
        { user_id: 'u2', display_name: 'Sara', is_leader: false },
        { user_id: 'u3', display_name: 'Ali', is_leader: false },
      ]),
      clockOffsetMs: 0,
      roundTripMs: 50,
    });
    mockService.startAttempt.mockResolvedValue({ data: {}, clockOffsetMs: 0, roundTripMs: 50 });
    const r = await render(<TeamLobbyScreen teamId="t1" />);
    expect(allText(r)).toContain('START ATTEMPT');

    const startBtn = r.root.findAll(n => n.props.accessibilityRole === 'button' && texts(n.children as any).includes('START ATTEMPT') && n.props.onPress)[0];
    await act(async () => { startBtn.props.onPress(); });
    expect(mockService.startAttempt).toHaveBeenCalledWith('t1');
  });

  it('ended challenge: read-only, no start / invite / leave / remove', async () => {
    const ended = state();
    ended.challenge = { ...CHALLENGE, ends_at: '2020-01-01T00:00:00Z' };
    mockService.getTeamState.mockResolvedValue({ data: ended, clockOffsetMs: 0, roundTripMs: 50 });
    const r = await render(<TeamLobbyScreen teamId="t1" />);
    const text = allText(r);

    expect(text).toContain('CHALLENGE ENDED');
    expect(text).not.toContain('START ATTEMPT');
    expect(text).not.toContain('PLAYERS NEEDED');
    expect(text).not.toContain('V53QLK');
    expect(text).not.toContain('LEAVE TEAM');
    expect(text).not.toContain('Waiting for a player…');
    expect(r.root.findAll(n => n.props.accessibilityLabel === 'Remove Sara')).toHaveLength(0);
  });

  it('unlocked team: a deleted account frees its slot instead of showing', async () => {
    mockService.getTeamState.mockResolvedValue({
      data: state({}, [
        { user_id: 'me', display_name: 'Omar', is_leader: true },
        { user_id: null, display_name: null, is_leader: false },
      ]),
      clockOffsetMs: 0,
      roundTripMs: 50,
    });
    const r = await render(<TeamLobbyScreen teamId="t1" />);
    const text = allText(r);
    expect(text).not.toContain('Deleted user');
    expect(text).toContain('PLAYERS 1/3');
    expect(text.split('Waiting for a player…').length - 1).toBe(2);
  });

  it('locked roster: final roster, best score, no leave, deleted member shown', async () => {
    mockService.getTeamState.mockResolvedValue({
      data: state({ locked_at: '2026-10-11T10:00:00Z', best_score: 430, attempts_count: 2 }, [
        { user_id: 'me', display_name: 'Omar', is_leader: true },
        { user_id: null, display_name: null, is_leader: false },
      ]),
      clockOffsetMs: 0,
      roundTripMs: 50,
    });
    const r = await render(<TeamLobbyScreen teamId="t1" />);
    const text = allText(r);

    expect(text).toContain('ROSTER LOCKED');
    expect(text).toContain('Deleted user');
    expect(text).toContain('430 PTS');
    expect(text).not.toContain('LEAVE TEAM');
    expect(text).not.toContain('V53QLK');
    expect(text).not.toContain('Waiting for a player…');
  });
});

// ── Hub ────────────────────────────────────────────────────────────────────

describe('TeamHub', () => {
  const t = getWeeklyTokens('dark');

  it('shows the challenge, actions, my teams and the board', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyTeams.mockResolvedValue([
      { team_id: 't1', team_name: 'Iron Wolves', challenge_id: 'c1', challenge_title: 'Engine Room', format: 'collect', scoring_type: 'reps', team_size: 3, starts_at: CHALLENGE.starts_at, ends_at: CHALLENGE.ends_at, members: [{ user_id: 'me', display_name: 'Omar' }], is_leader: true, locked_at: null, best_score: null, attempts_count: 0, rank: null },
      { team_id: 'old', team_name: 'Last Week Crew', challenge_id: 'c0', challenge_title: 'Old Sprint', format: 'sync', scoring_type: 'time', team_size: 2, starts_at: '2020-01-04T00:00:00Z', ends_at: '2020-01-11T00:00:00Z', members: [{ user_id: 'me', display_name: 'Omar' }, { user_id: null, display_name: null }], is_leader: false, locked_at: '2020-01-05T00:00:00Z', best_score: 99, attempts_count: 1, rank: 1 },
    ]);
    mockService.getBoard.mockResolvedValue([
      { rank: 1, team_id: 't9', team_name: 'Gamma', members: [{ user_id: 'x', display_name: 'Dan' }], best_score: 430, attempts_count: 1, best_submitted_at: '2026-10-11T00:00:00Z', is_mine: false },
    ]);
    const r = await render(<TeamHub tokens={t} onBack={() => {}} modeSlot={null} />);
    const text = allText(r);

    expect(text).toContain('ENGINE ROOM');
    expect(text).toContain('COLLECT');
    expect(text).toContain('AMRAP · 10 MIN');
    expect(text).toContain('TEAMS OF 3');
    expect(text).toContain("everyone's points added up");
    expect(text).toContain('CREATE TEAM');
    expect(text).toContain('JOIN WITH CODE');
    expect(text).toContain('Iron Wolves');
    expect(text).toContain('NO SCORE YET');
    // Ended challenges' teams go to history, with their final result and rank.
    expect(text).toContain('TEAM HISTORY');
    expect(text).toContain('Last Week Crew');
    expect(text).toContain('OLD SPRINT');
    expect(text).toContain('1:39.0');
    expect(text).toContain('FINAL #1');
    expect(text).toContain('Omar · Deleted user');
    expect(text).toContain('Gamma');
    expect(text).toContain('430 PTS');
  });

  it('two challenges at once: a picker switches card, teams and board', async () => {
    const second = { ...CHALLENGE, id: 'c2', title: 'Relay Sprint', format: 'switch' as const, scoring_type: 'time' as const, team_size: 2 };
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE, second]);
    mockService.getMyTeams.mockResolvedValue([
      { team_id: 't2', team_name: 'Relay Crew', challenge_id: 'c2', challenge_title: 'Relay Sprint', format: 'switch', scoring_type: 'time', team_size: 2, starts_at: CHALLENGE.starts_at, ends_at: CHALLENGE.ends_at, members: [], is_leader: true, locked_at: null, best_score: null, attempts_count: 0, rank: null },
    ]);
    mockService.getBoard.mockImplementation(async (id: string) => id === 'c2'
      ? [{ rank: 1, team_id: 'x', team_name: 'Fast Pair', members: [], best_score: 95.5, attempts_count: 1, best_submitted_at: '2026-10-11T00:00:00Z', is_mine: false }]
      : []);
    const r = await render(<TeamHub tokens={t} onBack={() => {}} modeSlot={null} />);

    let text = allText(r);
    expect(text).toContain('TEAM SWITCH · FOR TIME · TEAMS OF 2'); // picker chip for the second challenge
    expect(text).toContain('ENGINE ROOM');
    expect(text).not.toContain('Relay Crew');
    expect(mockService.getBoard).toHaveBeenCalledWith('c1');
    expect(mockService.getBoard).toHaveBeenCalledWith('c2');

    const chip = r.root.findAll(n => n.props.accessibilityRole === 'button' && texts(n.children as any).includes('RELAY SPRINT') && n.props.onPress)[0];
    await act(async () => { chip.props.onPress(); });
    text = allText(r);
    expect(text).toContain('Relay Crew');
    expect(text).toContain('Fast Pair');
    expect(text).toContain('1:35.5');
  });

  it('empty week', async () => {
    mockService.getOpenChallenges.mockResolvedValue([]);
    mockService.getMyTeams.mockResolvedValue([]);
    const r = await render(<TeamHub tokens={t} onBack={() => {}} modeSlot={null} />);
    expect(allText(r)).toContain('NO TEAM CHALLENGE THIS WEEK');
    expect(mockService.getBoard).not.toHaveBeenCalled();
  });

  it('join opens the lobby of the joined team', async () => {
    mockService.getOpenChallenges.mockResolvedValue([CHALLENGE]);
    mockService.getMyTeams.mockResolvedValue([]);
    mockService.getBoard.mockResolvedValue([]);
    mockService.joinTeam.mockResolvedValue('t7');
    const r = await render(<TeamHub tokens={t} onBack={() => {}} modeSlot={null} />);

    const joinBtn = r.root.findAll(n => n.props.accessibilityRole === 'button' && texts(n.children as any).includes('JOIN WITH CODE') && n.props.onPress)[0];
    await act(async () => { joinBtn.props.onPress(); });
    const input = r.root.findAll(n => n.props.placeholder === 'Invite code' && n.props.onChangeText)[0];
    await act(async () => { input.props.onChangeText('v53qlk'); });
    await act(async () => { input.props.onSubmitEditing(); });

    expect(mockService.joinTeam).toHaveBeenCalledWith('v53qlk');
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/team-lobby', params: { teamId: 't7' } });
  });
});
