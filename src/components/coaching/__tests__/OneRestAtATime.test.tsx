import React, { useState } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { TouchableOpacity } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
const mockThemeValue = { card: { background: '#111', border: '#333' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' }, background: { primary: '#000' } };
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: mockThemeValue }) }));

import { SoundServiceInstance } from '../../../lib/SoundService';
import { stopActiveRest } from '../../../hooks/useExclusiveRest';
import { WarriorBlockCard } from '../WarriorBlockCard';
import { BlockRestPill } from '../BlockRestTimer';
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
