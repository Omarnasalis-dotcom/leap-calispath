import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
let mockTheme = { card: { background: '#111', border: '#333' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } };
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: mockTheme }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));

import i18n from '../../../i18n';
import { SoundServiceInstance } from '../../../lib/SoundService';
import { WarriorBlockCard } from '../WarriorBlockCard';
import { SetRow } from '../SetRow';
import { BlockTimerChip } from '../BlockTimerChip';
import { BlockTimerBanner, BLOCK_TIMER_BANNER_MS } from '../BlockTimerBanner';
import { blockTimerSeconds, nextBlockTimer } from '../../../hooks/useBlockTimer';

const theme = { card: { border: '#333', background: '#111' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' }, background: { primary: '#000' } };

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
/** What the athlete sees: skips anything under display none. */
function visible(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => visible(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  const style = [node.props?.style].flat(Infinity).filter(Boolean);
  if (style.some((s: any) => s.display === 'none')) return acc;
  if (node.children) visible(node.children, acc);
  return acc;
}
const seen = (r: ReactTestRenderer) => visible(r.toJSON()).join(' | ');
const tapText = (r: ReactTestRenderer, text: string) => {
  const btn = r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).some(x => x.includes(text)))[0];
  act(() => { btn.props.onPress(); });
};
const tapLabel = (r: ReactTestRenderer, label: string) => {
  const btn = r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  act(() => { btn.props.onPress(); });
};
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

const exercise = { id: 'e1', name: 'Dips', sets: '3', reps: '10', rest_seconds: '60', hold_seconds: '', is_weighted: false };

const blockOf = (metadata: any, exercises: any[] = [exercise]): any => ({
  id: 'b1', name: 'Strength A', notes: '', completedStatus: 'none', week_number: 1, metadata, exercises,
});

const mounted: ReactTestRenderer[] = [];
function card(block: any, isExpanded: boolean, extra: Record<string, unknown> = {}) {
  const el = (open: boolean, more: Record<string, unknown> = {}) => (
    <WarriorBlockCard
      block={block} index={0} isExpanded={open} theme={theme} mode="dark" solidCardBg="#111" bronzeGold="#C9A227" strengthTier={3}
      toggleBlockExpanded={jest.fn()} handleToggleBlockStatus={jest.fn()} handleOpenLogging={jest.fn()} startTimerForBlock={jest.fn()}
      onToggleVideo={jest.fn()} loggedSetsByExercise={{}} onSetLogged={jest.fn()}
      {...extra} {...more}
    />
  );
  let r!: ReactTestRenderer;
  act(() => { r = create(el(isExpanded)); });
  mounted.push(r);
  return { r, setOpen: (open: boolean, more?: Record<string, unknown>) => act(() => { r.update(el(open, more)); }) };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  i18n.changeLanguage('en');
});
afterEach(() => {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
  jest.useRealTimers();
  i18n.changeLanguage('en');
});

describe('a timer keeps going after its block is closed', () => {
  const startRest = (r: ReactTestRenderer) => {
    // ✓ on set 1 of a straight-set block starts its rest.
    tapText(r, 'START');
  };

  it('straight-set rest: counts down on the closed card, buzzes, and reports the end', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'single', timing_system: 'straight_set' });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    startRest(r);
    setOpen(false);

    expect(r.root.findAllByType(SetRow).length).toBe(3);
    expect(r.root.findAllByType(BlockTimerChip).length).toBe(1);
    expect(seen(r)).toContain('RESTING');
    expect(seen(r)).toContain('1:00');
    expect(seen(r)).not.toContain('SET ');

    advance(10_000);
    expect(seen(r)).toContain('0:50');

    advance(51_000);
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalledTimes(1);
    expect(onClosedTimerEnded).toHaveBeenCalledTimes(1);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'rest');
    expect(r.root.findAllByType(BlockTimerChip).length).toBe(0);
  });

  it('reopening shows the same timer, with nothing reset', () => {
    const { r, setOpen } = card(blockOf({ structure: 'single', timing_system: 'straight_set' }), true);
    startRest(r);
    advance(5_000);
    setOpen(false);
    advance(5_000);
    setOpen(true);
    expect(seen(r)).toContain('0:50');
    expect(seen(r)).toContain('SET ');
    expect(r.root.findAllByType(BlockTimerChip).length).toBe(0);
  });

  it('a timer that ends on the open card gives no banner (the card itself shows it)', () => {
    const onClosedTimerEnded = jest.fn();
    const { r } = card(blockOf({ structure: 'single', timing_system: 'straight_set' }), true, { onClosedTimerEnded });
    startRest(r);
    advance(61_000);
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalledTimes(1);
    expect(onClosedTimerEnded).not.toHaveBeenCalled();
  });

  it('a block never opened runs nothing', () => {
    const { r } = card(blockOf({ structure: 'single', timing_system: 'straight_set' }), false);
    expect(r.root.findAllByType(SetRow).length).toBe(0);
  });

  it('logging the block stops its timer and clears the chip', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'single', timing_system: 'straight_set' });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    startRest(r);
    setOpen(false);
    setOpen(false, { block: { ...block, completedStatus: 'completed' } });
    expect(r.root.findAllByType(BlockTimerChip).length).toBe(0);
    advance(61_000);
    expect(onClosedTimerEnded).not.toHaveBeenCalled();
  });

  it('AMRAP: keeps running closed and ends as "amrap"', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ timing_system: 'amrap', time_cap_min: 2 });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapText(r, 'START');
    setOpen(false);
    expect(seen(r)).toContain('AMRAP');
    expect(seen(r)).toContain('2:00');
    advance(121_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'amrap');
  });

  it('For Time: counts up closed and ends at the cap as "fortime"', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ timing_system: 'fortime', time_cap_min: 2 });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapText(r, 'START');
    setOpen(false);
    advance(30_000);
    expect(seen(r)).toContain('FOR TIME');
    expect(seen(r)).toContain('0:30');
    advance(91_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'fortime');
  });

  it('circuit rest between rounds keeps going closed', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'circuit', timing_system: 'straight_set', rounds: 2, rest_after_round: 30 });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapText(r, 'COMPLETE ROUND');
    setOpen(false);
    expect(seen(r)).toContain('RESTING');
    advance(31_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'rest');
  });

  it('ladder rest keeps going closed', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'ladder', timing_system: 'straight_set', rounds: 3, ladder_start: 5, ladder_sub: 1 });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapText(r, 'START REST');
    setOpen(false);
    expect(seen(r)).toContain('RESTING');
    expect(seen(r)).toContain('1:00');
    advance(61_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'rest');
  });

  it('For Time ladder counts up closed', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'ladder', timing_system: 'fortime', time_cap_min: 1, rounds: 3, ladder_start: 5, ladder_sub: 1 });
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapText(r, 'START');
    setOpen(false);
    advance(20_000);
    expect(seen(r)).toContain('FOR TIME');
    expect(seen(r)).toContain('0:20');
    advance(41_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'fortime');
  });

  it('a hold keeps going closed, get-ready included', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'single', timing_system: 'straight_set' }, [{ ...exercise, sets: '0', reps: '', rest_seconds: '0', hold_seconds: '20' }]);
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapLabel(r, 'HOLD 20S');
    setOpen(false);
    expect(seen(r)).toContain('HOLDING');
    expect(seen(r)).toContain('0:25');
    advance(26_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'hold');
  });

  it('a hold inside a superset round keeps going closed', () => {
    const onClosedTimerEnded = jest.fn();
    const block = blockOf({ structure: 'superset', timing_system: 'straight_set', rounds: 2 }, [{ ...exercise, reps: '', hold_seconds: '8' }]);
    const { r, setOpen } = card(block, true, { onClosedTimerEnded });
    tapLabel(r, 'Dips HOLD 8S');
    setOpen(false);
    expect(seen(r)).toContain('HOLDING');
    advance(14_000);
    expect(onClosedTimerEnded).toHaveBeenCalledWith(block, 'hold');
  });

  it('Complete on a closed AMRAP hands over its counted rounds', () => {
    const onAmrapFinalize = jest.fn();
    const handleOpenLogging = jest.fn();
    const block = blockOf({ timing_system: 'amrap', time_cap_min: 2 });
    const { r, setOpen } = card(block, true, { onAmrapFinalize, handleOpenLogging });
    tapText(r, 'START');
    const plusRound = r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes('ROUND'));
    act(() => { plusRound[plusRound.length - 1].props.onPress(); });
    setOpen(false);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const slide = r.root.findAll(n => typeof n.props.onComplete === 'function')[0];
    act(() => { slide.props.onComplete(); });
    // Same as on the open card: a running AMRAP asks first, then logs the rounds.
    expect(handleOpenLogging).not.toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2]!;
    act(() => { buttons[buttons.length - 1].onPress!(); });
    expect(onAmrapFinalize).toHaveBeenCalledWith('b1', 1);
    alert.mockRestore();
  });

  it('shows Arabic labels on the chip', () => {
    i18n.changeLanguage('ar');
    const { r, setOpen } = card(blockOf({ structure: 'single', timing_system: 'straight_set' }), true);
    tapText(r, i18n.t('blocks.start'));
    setOpen(false);
    expect(seen(r)).toContain('استراحة');
    expect(seen(r)).toContain('1:00');
  });
});

describe('closed card timer choice', () => {
  it('shows the one ending first, else the one counting up', () => {
    const rest = { kind: 'rest' as const, at: 5000, countUp: false };
    const hold = { kind: 'hold' as const, at: 3000, countUp: false };
    const forTime = { kind: 'fortime' as const, at: 0, countUp: true };
    expect(nextBlockTimer([forTime, rest, hold])).toBe(hold);
    expect(nextBlockTimer([forTime])).toBe(forTime);
    expect(nextBlockTimer([])).toBeNull();
  });

  it('never shows below 0', () => {
    expect(blockTimerSeconds({ kind: 'rest', at: 1000, countUp: false }, 5000)).toBe(0);
    expect(blockTimerSeconds({ kind: 'rest', at: 5000, countUp: false }, 1500)).toBe(4);
    expect(blockTimerSeconds({ kind: 'fortime', at: 1000, countUp: true }, 6500)).toBe(5);
  });
});

describe('BlockTimerBanner', () => {
  const banner = { blockId: 'b1', blockName: 'Strength A', kind: 'rest' as const, id: 1 };
  const mount = (el: React.ReactElement) => { let r!: ReactTestRenderer; act(() => { r = create(el); }); mounted.push(r); return r; };

  it.each([['rest', 'Rest over'], ['hold', 'Hold done'], ['amrap', "Time's up"], ['fortime', 'Time cap reached']] as const)(
    '%s says "%s" with the block name', (kind, title) => {
      const r = mount(<BlockTimerBanner banner={{ ...banner, kind }} onOpen={jest.fn()} onDismiss={jest.fn()} />);
      expect(allText(r)).toContain(title);
      expect(allText(r)).toContain('Strength A');
    });

  it('tapping opens that block and hides it; otherwise it hides by itself', () => {
    const onOpen = jest.fn();
    const onDismiss = jest.fn();
    const r = mount(<BlockTimerBanner banner={banner} onOpen={onOpen} onDismiss={onDismiss} />);
    act(() => { r.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0].props.onPress(); });
    expect(onOpen).toHaveBeenCalledWith('b1');
    expect(onDismiss).toHaveBeenCalledTimes(1);

    const other = jest.fn();
    mount(<BlockTimerBanner banner={banner} onOpen={jest.fn()} onDismiss={other} />);
    advance(BLOCK_TIMER_BANNER_MS);
    expect(other).toHaveBeenCalledTimes(1);
  });

  it('shows the Arabic title', () => {
    i18n.changeLanguage('ar');
    const r = mount(<BlockTimerBanner banner={banner} onOpen={jest.fn()} onDismiss={jest.fn()} />);
    expect(allText(r)).toContain('انتهت الراحة');
  });

  it('follows the theme, so it is light in light mode', () => {
    const dark = mockTheme;
    mockTheme = { card: { background: '#FFFFFF', border: '#E5E5E5' }, text: { primary: '#111111', secondary: '#555555', tertiary: '#777' } };
    const r = mount(<BlockTimerBanner banner={banner} onOpen={jest.fn()} onDismiss={jest.fn()} />);
    const json = JSON.stringify(r.toJSON());
    mockTheme = dark;
    expect(json).toContain('#FFFFFF');
    expect(json).toContain('#111111');
    expect(json).not.toContain('#1E1E1E');
  });

  it('nothing to show: renders nothing', () => {
    const r = mount(<BlockTimerBanner banner={null} onOpen={jest.fn()} onDismiss={jest.fn()} />);
    expect(r.toJSON()).toBeNull();
  });
});
