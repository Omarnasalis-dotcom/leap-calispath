import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TeamAttempt, TeamChallenge, TeamState } from '../../../lib/teamChallenge';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
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

import { TeamAttemptView, TeamResultView } from '../TeamAttempt';
import { getWeeklyTokens } from '../../../components/weekly/weeklyTokens';
import { SoundServiceInstance } from '../../../lib/SoundService';

const t = getWeeklyTokens('dark');

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const button = (r: ReactTestRenderer, label: string) =>
  r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && texts(n.children as any).join('').includes(label))[0];

const START = Date.parse('2026-10-10T10:00:03Z');
const CAP = Date.parse('2026-10-10T10:10:03Z'); // 10-minute cap / duration

const challenge = (over: Partial<TeamChallenge>): TeamChallenge => ({
  id: 'c1', title: 'Engine', description: '', format: 'sync', scoring_type: 'time',
  movements: [{ name: 'Pull-ups', reps: 10, points: 10 }, { name: 'Push-ups', reps: 20, points: 5 }],
  rounds: 3, time_limit_sec: 600, team_size: 3,
  starts_at: '2026-10-10T00:00:00Z', ends_at: '2099-01-01T00:00:00Z', is_active: true, ...over,
});

const MEMBERS = [
  { user_id: 'me', display_name: 'Omar', is_leader: true },
  { user_id: 'u2', display_name: 'Sara', is_leader: false },
  { user_id: 'u3', display_name: 'Ali', is_leader: false },
];

function makeState(c: TeamChallenge, results: TeamAttempt['results'] = [], over: Partial<TeamAttempt> = {}): TeamState & { attempt: TeamAttempt } {
  return {
    server_now: '2026-10-10T10:00:00Z',
    team: { id: 't1', name: 'Iron Wolves', invite_code: 'X', leader_id: 'me', locked_at: null, best_score: null, best_attempt_id: null, attempts_count: 0 },
    challenge: c,
    members: MEMBERS,
    attempt: {
      id: 'a1', status: 'running', started_at: new Date(START).toISOString(), cap_at: new Date(CAP).toISOString(),
      score: null, capped: null, submitted_at: null, results, ...over,
    },
  };
}

const memberRow = (user_id: string, score: number, capped = false) =>
  ({ user_id, is_team_row: false, time_sec: capped ? null : score, rounds: null, partial: null, capped, score, entered_by: user_id });

function setup(state: ReturnType<typeof makeState>, now: number, myId = 'me') {
  const handlers = { onFinish: jest.fn(), onSubmitProgress: jest.fn(), onCancel: jest.fn() };
  let r!: ReactTestRenderer;
  act(() => {
    r = create(<TeamAttemptView tokens={t} state={state} now={now} myId={myId} busy={false} {...handlers} />);
  });
  return { r, ...handlers };
}

const mounted: ReactTestRenderer[] = [];
afterEach(() => act(() => { mounted.splice(0).forEach(r => r.unmount()); }));
const track = <T extends { r: ReactTestRenderer }>(x: T) => { mounted.push(x.r); return x; };

describe('countdown and clock', () => {
  it('shows 3-2-1 with GET READY, then the running clock, with sounds on the shared clock', () => {
    const state = makeState(challenge({}));
    const { r } = track(setup(state, START - 2500));
    expect(allText(r)).toContain('GET READY');
    expect(allText(r)).toContain('3');

    act(() => r.update(<TeamAttemptView tokens={t} state={state} now={START - 900} myId="me" busy={false} onFinish={jest.fn()} onSubmitProgress={jest.fn()} onCancel={jest.fn()} />));
    expect(SoundServiceInstance.playTick).toHaveBeenCalled();

    act(() => r.update(<TeamAttemptView tokens={t} state={state} now={START + 65_000} myId="me" busy={false} onFinish={jest.fn()} onSubmitProgress={jest.fn()} onCancel={jest.fn()} />));
    expect(SoundServiceInstance.playBoxingBell).toHaveBeenCalled();
    expect(allText(r)).toContain('ELAPSED');
    expect(allText(r)).toContain('1:05');
    expect(allText(r)).toContain('CAP 10:00');
  });

  it('AMRAP counts down', () => {
    const { r } = track(setup(makeState(challenge({ scoring_type: 'reps', rounds: 1 })), START + 65_000));
    expect(allText(r)).toContain('TIME LEFT');
    expect(allText(r)).toContain('8:55');
  });
});

describe('Sync / Switch For Time', () => {
  it('leader finishes for the team; members are told the leader does it', () => {
    const state = makeState(challenge({ format: 'switch' }));
    const leader = track(setup(state, START + 120_000));
    act(() => button(leader.r, 'FINISH: TEAM DONE').props.onPress());
    expect(leader.onFinish).toHaveBeenCalledWith();

    const member = track(setup(state, START + 120_000, 'u2'));
    expect(allText(member.r)).toContain('The leader taps Finish');
    expect(button(member.r, 'FINISH')).toBeUndefined();
    expect(member.r.root.findAll(n => n.props.accessibilityLabel === 'Cancel attempt')).toHaveLength(0);
  });

  it('cap reached: leader enters team progress with the cap + penalty preview', () => {
    const { r, onSubmitProgress } = track(setup(makeState(challenge({ format: 'sync' })), CAP + 1000));
    const text = allText(r);
    expect(text).toContain('TIME CAP REACHED');
    expect(text).toContain('HOW FAR DID THE TEAM GET?');
    // 0 rounds, nothing in the next round: 90 reps missing → 10:00 + 90 s
    expect(text).toContain('TIME 11:30.0 · CAP + 90 S');

    act(() => r.root.findAll(n => n.props.accessibilityLabel === 'FULL ROUNDS +')[0].props.onPress());
    act(() => r.root.findAll(n => n.props.accessibilityLabel === 'FULL ROUNDS +')[0].props.onPress());
    act(() => r.root.findAll(n => n.props.accessibilityLabel === 'Pull-ups +')[0].props.onPress());
    // 2 rounds (60) + 1 pull-up = 61 done → 29 missing
    expect(allText(r)).toContain('TIME 10:29.0 · CAP + 29 S');
    act(() => button(r, 'SUBMIT').props.onPress());
    expect(onSubmitProgress).toHaveBeenCalledWith(null, 2, [1, 0]);
  });
});

describe('Collect For Time', () => {
  it('each player finishes; leader can finish for someone; finished players see who is still going', () => {
    const state = makeState(challenge({ format: 'collect' }), [memberRow('u3', 312.4)]);
    const { r, onFinish } = track(setup(state, START + 200_000));
    const text = allText(r);
    expect(text).toContain("FINISH: I'M DONE");
    expect(text).toContain('5:12.4'); // Ali done
    expect(text).toContain('FINISH FOR Sara');
    act(() => button(r, "FINISH: I'M DONE").props.onPress());
    expect(onFinish).toHaveBeenCalledWith('me');
    act(() => button(r, 'FINISH FOR Sara').props.onPress());
    expect(onFinish).toHaveBeenCalledWith('u2');

    const done = track(setup(makeState(challenge({ format: 'collect' }), [memberRow('u2', 290)]), START + 300_000, 'u2'));
    expect(allText(done.r)).toContain('DONE · 4:50.0');
    expect(allText(done.r)).toContain('STILL GOING');
    expect(allText(done.r)).not.toContain('FINISH FOR'); // only the leader acts for others
  });
});

describe('AMRAP', () => {
  const amrap = (format: TeamChallenge['format']) => challenge({ format, scoring_type: 'reps', rounds: 1 });

  it('sync: leader keeps a round tally that pre-fills the score; members wait', () => {
    const state = makeState(amrap('sync'));
    const { r } = track(setup(state, START + 60_000));
    expect(allText(r)).toContain('FULL ROUNDS');
    act(() => r.root.findAll(n => n.props.accessibilityLabel === 'FULL ROUNDS +')[0].props.onPress());
    act(() => r.root.findAll(n => n.props.accessibilityLabel === 'FULL ROUNDS +')[0].props.onPress());

    // Time's up: the entry starts from the tally (2 rounds × 200 = 400 pts).
    act(() => r.update(<TeamAttemptView tokens={t} state={state} now={CAP + 500} myId="me" busy={false} onFinish={jest.fn()} onSubmitProgress={jest.fn()} onCancel={jest.fn()} />));
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalled();
    expect(allText(r)).toContain("TIME'S UP");
    expect(allText(r)).toContain('ENTER THE TEAM SCORE');
    expect(allText(r)).toContain('SCORE 400 PTS');

    const member = track(setup(state, CAP + 500, 'u2'));
    expect(allText(member.r)).toContain('The leader is entering the team score.');
  });

  it('collect: player logs own score, then the leader can enter for a missing player', () => {
    const state = makeState(amrap('collect'), [memberRow('me', 430)]);
    const { r, onSubmitProgress } = track(setup(state, CAP + 2000));
    expect(allText(r)).toContain('YOUR SCORE IS IN · Waiting for: Sara, Ali');
    act(() => button(r, 'ENTER FOR Sara').props.onPress());
    expect(allText(r)).toContain('ENTERING FOR Sara');
    act(() => button(r, 'SUBMIT').props.onPress());
    expect(onSubmitProgress).toHaveBeenCalledWith('u2', 0, [0, 0]);

    const sara = track(setup(makeState(amrap('collect')), CAP + 2000, 'u2'));
    expect(allText(sara.r)).toContain('ENTER YOUR SCORE');
  });
});

describe('result', () => {
  it('shows team time, new best, rank and the per-player breakdown for collect', () => {
    const base = makeState(challenge({ format: 'collect' }), [memberRow('me', 300), memberRow('u2', 310.5), memberRow('u3', 612, true)], {
      status: 'submitted', score: 1222.5, capped: true, submitted_at: '2026-10-10T10:12:00Z',
    });
    const state = { ...base, team: { ...base.team, best_attempt_id: 'a1', best_score: 1222.5 } };
    let r!: ReactTestRenderer;
    act(() => { r = create(<TeamResultView tokens={t} state={state} attempt={state.attempt} rank={{ rank: 2, count: 7 }} onDone={jest.fn()} />); });
    mounted.push(r);
    const text = allText(r);
    expect(text).toContain('TEAM TIME');
    expect(text).toContain('20:22.5');
    expect(text).toContain('NEW TEAM BEST');
    expect(text).toContain('TIME CAPPED');
    expect(text).toContain('RANK #2 OF 7');
    expect(text).toContain('BY PLAYER');
    expect(text).toContain('10:12.0');
  });
});
