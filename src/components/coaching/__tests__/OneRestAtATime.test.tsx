import React, { useEffect, useState } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
const mockSchedule = jest.fn().mockResolvedValue('reminder-id');
const mockCancel = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancel(...a),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
const mockThemeValue = { card: { background: '#111', border: '#333' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' }, background: { primary: '#000' } };
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: mockThemeValue }) }));

import i18n from '../../../i18n';
import { SoundServiceInstance } from '../../../lib/SoundService';
import { workTimerRunning } from '../../../hooks/useBlockTimer';
import { stopActiveRest, takeRestForSide } from '../../../hooks/useExclusiveRest';
import { restOverRoute, setSideRestEndedHandler, startSideRest, stopSideRest } from '../../../lib/sideRest';
import { WarriorBlockCard } from '../WarriorBlockCard';
import { BlockRestPill, SideRestHost } from '../BlockRestTimer';
import { BlockTimerChip } from '../BlockTimerChip';
import { SetRow } from '../SetRow';
import { CircuitRoundCard } from '../CircuitRoundCard';

const theme = mockThemeValue;
function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const buzzes = () => (SoundServiceInstance.playDigitalBuzzer as jest.Mock).mock.calls.length;
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

const exercise = { id: 'e1', name: 'Dips', sets: '4', reps: '10', rest_seconds: '60', hold_seconds: '', is_weighted: false };
const blockOf = (id: string, metadata: any, name = 'Strength'): any => ({
  id, name, notes: '', completedStatus: 'none', week_number: 1, metadata, exercises: [exercise],
});
const straight = { structure: 'single', timing_system: 'straight_set' };

function Card({ block, isExpanded = true, onClosedTimerEnded }: { block: any; isExpanded?: boolean; onClosedTimerEnded?: any }) {
  const [progress, setProgress] = useState<any>({});
  return (
    <WarriorBlockCard
      block={block} index={0} isExpanded={isExpanded} theme={theme} mode="dark" solidCardBg="#111" bronzeGold="#C9A227" strengthTier={3}
      toggleBlockExpanded={jest.fn()} handleToggleBlockStatus={jest.fn()} handleOpenLogging={jest.fn()} startTimerForBlock={jest.fn()}
      onToggleVideo={jest.fn()} loggedSetsByExercise={progress} onClosedTimerEnded={onClosedTimerEnded}
      onSetLogged={(_b: any, ex: any, e: any) => setProgress((x: any) => ({ ...x, [ex]: [...(x[ex] || []).filter((s: any) => s.setIndex !== e.setIndex), e] }))}
      {...({} as any)}
    />
  );
}

const mounted: ReactTestRenderer[] = [];
const mount = (el: React.ReactElement) => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };
const rows = (r: ReactTestRenderer) => r.root.findAllByType(SetRow).map(x => texts(x.children as any).join(' '));
const tapSet = (r: ReactTestRenderer, i: number) => act(() => {
  r.root.findAllByType(SetRow)[i].findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes('START'))[0].props.onPress();
});
const tapRestStart = (r: ReactTestRenderer) => act(() => {
  r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes('START REST'))[0].props.onPress();
});

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
  jest.useRealTimers();
});

describe('a rest outlives the block list', () => {
  it('going back moves a set rest to the side with its time left, and no alarm', () => {
    const r = mount(<Card block={blockOf('a', straight)} />);
    tapSet(r, 0);
    advance(20_000);
    let left: unknown = null;
    act(() => { left = takeRestForSide(); });
    expect(left).toEqual({ seconds: 40, blockId: 'a' });
    expect(rows(r)[0]).toContain('✓');
    advance(61_000);
    expect(buzzes()).toBe(0);
  });

  it('nothing to move: no rest, or the rest is already at the side', () => {
    expect(takeRestForSide()).toBeNull();
    const pill = mount(<BlockRestPill seconds={90} onStop={jest.fn()} onEnded={jest.fn()} />);
    expect(takeRestForSide()).toBeNull();
    expect(pill.root.findAllByType(BlockRestPill).length).toBe(1);
  });

  describe('at the app root', () => {
    afterEach(() => {
      act(() => stopSideRest());
      setSideRestEndedHandler(null);
    });
    const hostShown = (r: ReactTestRenderer) => r.root.findAllByType(BlockRestPill).length > 0;

    it('a rest keeps counting after the workout screen closes', () => {
      const host = mount(<SideRestHost />);
      function Workout() {
        useEffect(() => () => {
          const left = takeRestForSide();
          if (left) startSideRest(left.seconds, left.blockId);
        }, []);
        return <Card block={blockOf('a', straight)} />;
      }
      const workout = mount(<Workout />);
      tapSet(workout, 0);
      advance(20_000);
      act(() => { workout.unmount(); mounted.splice(mounted.indexOf(workout), 1); });

      expect(hostShown(host)).toBe(true);
      advance(1_000);
      expect(texts(host.toJSON()).join(' ')).toContain('0:39');
      advance(40_000);
      expect(hostShown(host)).toBe(false);
      expect(buzzes()).toBe(1);
    });

    it('ending away from the workout screen shows an ordinary notification', () => {
      const host = mount(<SideRestHost />);
      act(() => startSideRest(30, 'block-1'));
      advance(31_000);
      expect(hostShown(host)).toBe(false);
      expect(mockSchedule).toHaveBeenCalledTimes(1);
      const [{ content, trigger }] = mockSchedule.mock.calls[0];
      expect(content.title).toBe('Rest over');
      // Goes back to the block, and isn't a timer alert (those are silent while the app is open).
      expect(content.data).toMatchObject({ screen: 'warrior-program', openBlock: 'block-1' });
      expect(content.data.timerAlert).toBeUndefined();
      expect(trigger).toBeNull();
    });

    it('with no block to go to, it just tells them', () => {
      expect(restOverRoute({ endsAt: 1 })).toBeUndefined();
      expect(restOverRoute({ endsAt: 1, blockId: 7 })).toEqual({ screen: 'warrior-program', openBlock: '7', at: '1' });
    });

    it('with the workout screen open, the screen handles the end', () => {
      const ended = jest.fn();
      mount(<SideRestHost />);
      setSideRestEndedHandler(ended);
      act(() => startSideRest(30));
      advance(31_000);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('a late ending on return adds no second notification', () => {
      mount(<SideRestHost />);
      act(() => startSideRest(30));
      // The app was away: the clock jumps with no ticks, then it catches up.
      jest.setSystemTime(Date.now() + 120_000);
      advance(300);
      expect(buzzes()).toBe(1);
      expect(mockSchedule).not.toHaveBeenCalled();
    });

    it('the ✕ and a new rest both work from the root', () => {
      const host = mount(<SideRestHost />);
      act(() => startSideRest(30));
      act(() => { host.root.findAll(n => n.props.accessibilityLabel === 'Stop rest' && typeof n.props.onPress === 'function')[0].props.onPress(); });
      expect(hostShown(host)).toBe(false);
      act(() => startSideRest(60));
      const r = mount(<Card block={blockOf('a', straight)} />);
      tapSet(r, 0);
      expect(hostShown(host)).toBe(false);
    });
  });
});

describe('leaving during timed work', () => {
  const tapStart = (r: ReactTestRenderer) => act(() => {
    r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).some(x => x.startsWith('START')))[0].props.onPress();
  });

  it.each([
    ['AMRAP', { timing_system: 'amrap', time_cap_min: 2 }],
    ['For Time', { timing_system: 'fortime', time_cap_min: 2 }],
    ['For Time ladder', { structure: 'ladder', timing_system: 'fortime', time_cap_min: 1, rounds: 3, ladder_start: 5, ladder_sub: 1 }],
  ])('%s running: counts as work, until it ends', (_name, metadata) => {
    const r = mount(<Card block={blockOf('m', metadata)} />);
    expect(workTimerRunning()).toBe(false);
    tapStart(r);
    expect(workTimerRunning()).toBe(true);
    advance(125_000);
    expect(workTimerRunning()).toBe(false);
  });

  it('a block closed while it runs still counts; its screen going away clears it', () => {
    const r = mount(<Card block={blockOf('m', { timing_system: 'amrap', time_cap_min: 2 })} />);
    tapStart(r);
    act(() => { r.update(<Card block={blockOf('m', { timing_system: 'amrap', time_cap_min: 2 })} isExpanded={false} />); });
    expect(workTimerRunning()).toBe(true);
    act(() => { mounted.splice(0).forEach(x => x.unmount()); });
    expect(workTimerRunning()).toBe(false);
  });

  it('a rest is not work: it moves to the side instead of asking', () => {
    const r = mount(<Card block={blockOf('a', straight)} />);
    tapSet(r, 0);
    expect(workTimerRunning()).toBe(false);
  });

  it('the warning reads in both languages', () => {
    i18n.changeLanguage('ar');
    expect(i18n.t('workout.leaveTimerTitle')).toBe('سيتوقف المؤقت');
    i18n.changeLanguage('en');
    expect(i18n.t('workout.leaveTimerTitle')).toBe('Your timer will stop');
  });
});

describe('one rest at a time', () => {
  it('the next set stops the old rest: one timer, one alarm, and it keeps running', () => {
    const r = mount(<Card block={blockOf('a', straight)} />);
    tapSet(r, 0);
    advance(10_000);
    tapSet(r, 1);
    advance(5_000);
    expect(rows(r)[0]).toContain('✓');
    expect(rows(r)[1]).toContain('0:55');
    advance(46_000); // when the old rest would have ended
    expect(buzzes()).toBe(0);
    expect(rows(r)[1]).toContain('0:09');
    advance(10_000);
    expect(buzzes()).toBe(1);
  });

  it('a rest in another block stops the one on a closed card, with no banner', () => {
    const onClosedTimerEnded = jest.fn();
    const closed = mount(<Card block={blockOf('a', straight)} onClosedTimerEnded={onClosedTimerEnded} />);
    tapSet(closed, 0);
    act(() => { closed.update(<Card block={blockOf('a', straight)} isExpanded={false} onClosedTimerEnded={onClosedTimerEnded} />); });
    expect(closed.root.findAllByType(BlockTimerChip).length).toBe(1);

    const open = mount(<Card block={blockOf('b', straight)} />);
    tapSet(open, 0);
    expect(closed.root.findAllByType(BlockTimerChip).length).toBe(0);
    advance(61_000);
    expect(onClosedTimerEnded).not.toHaveBeenCalled();
    expect(buzzes()).toBe(1);
  });

  it('logging a block stops a running rest', () => {
    const r = mount(<Card block={blockOf('a', straight)} />);
    tapSet(r, 0);
    act(() => stopActiveRest());
    expect(rows(r)[0]).toContain('✓');
    advance(61_000);
    expect(buzzes()).toBe(0);
  });

  function Pill({ onEnded = jest.fn() }: { onEnded?: () => void }) {
    const [rest, setRest] = useState<{ id: number; seconds: number } | null>(null);
    return (
      <>
        <TouchableOpacity accessibilityLabel="go" onPress={() => setRest(p => ({ id: (p?.id ?? 0) + 1, seconds: 90 }))} />
        {rest && <BlockRestPill key={rest.id} seconds={rest.seconds} onStop={() => setRest(null)} onEnded={() => { setRest(null); onEnded(); }} />}
      </>
    );
  }
  const go = (r: ReactTestRenderer) => act(() => { r.root.findAll(n => n.props.accessibilityLabel === 'go' && typeof n.props.onPress === 'function')[0].props.onPress(); });
  const pillShown = (r: ReactTestRenderer) => r.root.findAll(n => n.props.accessibilityLabel === 'Stop rest').length > 0;

  it('a set rest stops the rest between blocks, and the other way round', () => {
    const pill = mount(<Pill />);
    go(pill);
    expect(pillShown(pill)).toBe(true);

    const r = mount(<Card block={blockOf('a', straight)} />);
    tapSet(r, 0);
    expect(pillShown(pill)).toBe(false);
    expect(rows(r)[0]).toContain('1:00');

    go(pill);
    expect(pillShown(pill)).toBe(true);
    expect(rows(r)[0]).toContain('✓');
  });

  it('restarting the rest between blocks gives one clean countdown', () => {
    const onEnded = jest.fn();
    const pill = mount(<Pill onEnded={onEnded} />);
    go(pill);
    advance(30_000);
    go(pill);
    advance(1_000);
    expect(texts(pill.toJSON()).join(' ')).toContain('1:29');
    advance(90_000);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(pillShown(pill)).toBe(false);
  });

  it('circuit rest stops too', () => {
    const r = mount(<Card block={blockOf('c', { structure: 'circuit', timing_system: 'straight_set', rounds: 3, rest_after_round: 30 })} />);
    act(() => {
      r.root.findAllByType(CircuitRoundCard)[0].findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).some(x => x.includes('COMPLETE ROUND')))[0].props.onPress();
    });
    act(() => stopActiveRest());
    advance(31_000);
    expect(buzzes()).toBe(0);
  });

  it('a running AMRAP is not a rest: a rest elsewhere leaves it running', () => {
    const amrap = mount(<Card block={blockOf('m', { timing_system: 'amrap', time_cap_min: 2 })} />);
    act(() => { amrap.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes('START'))[0].props.onPress(); });
    const r = mount(<Card block={blockOf('a', straight)} />);
    tapSet(r, 0);
    advance(121_000);
    expect(buzzes()).toBe(2); // the rest, then the AMRAP
  });
});
