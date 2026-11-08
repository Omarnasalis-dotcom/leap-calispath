import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', theme: { card: { background: '#111', border: '#333' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));

import i18n from '../../../i18n';
import { SoundServiceInstance } from '../../../lib/SoundService';
import { WarriorBlockCard } from '../WarriorBlockCard';
import { SetRow, SetLogEntry } from '../SetRow';
import { CircuitRoundCard } from '../CircuitRoundCard';
import { WeightStepper } from '../WeightStepper';
import { AmrapInlineTimer } from '../AmrapInlineTimer';
import { ForTimeInlineTimer } from '../ForTimeInlineTimer';

// The app closing mid-workout: the block card is thrown away, and a new one
// is built from only what the screen kept (and saved on the device).

const theme = { card: { border: '#333', background: '#111' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' }, background: { primary: '#000' } };

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const tapText = (r: ReactTestRenderer, text: string, nth = 0) => {
  const btn = r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).some(x => x.includes(text)))[nth];
  act(() => { btn.props.onPress(); });
};
const tapLabel = (r: ReactTestRenderer, label: string) => {
  const btn = r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  act(() => { btn.props.onPress(); });
};
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });

/** What WarriorProgramScreen keeps per block (and writes to the device). */
function screenStore() {
  const s = {
    logged: {} as Record<string, SetLogEntry[]>,
    drafts: {} as Record<string, Record<number, SetLogEntry>>,
    inline: {} as Record<string, unknown>,
  };
  return {
    s,
    handlers: {
      onSetLogged: (_b: unknown, ex: string | number, e: SetLogEntry) => {
        s.logged = { ...s.logged, [ex]: [...(s.logged[ex] || []).filter(x => x.setIndex !== e.setIndex), e] };
      },
      onSetDraft: (_b: unknown, ex: string | number, e: SetLogEntry) => {
        s.drafts = { ...s.drafts, [ex]: { ...(s.drafts[ex] || {}), [e.setIndex]: e } };
      },
      onInlineStateChange: (_b: unknown, key: string, v: unknown) => {
        const next = { ...s.inline };
        if (v === null) delete next[key]; else next[key] = v;
        s.inline = next;
      },
    },
    /** Props as the screen passes them from what it kept. */
    kept: () => ({ loggedSetsByExercise: s.logged, setDraftsByExercise: s.drafts, inlineState: s.inline }),
  };
}

const mounted: ReactTestRenderer[] = [];
function card(block: any, props: Record<string, unknown>) {
  const el = (more: Record<string, unknown> = {}) => (
    <WarriorBlockCard
      block={block} index={0} isExpanded theme={theme} mode="dark" solidCardBg="#111" bronzeGold="#C9A227" strengthTier={3}
      toggleBlockExpanded={jest.fn()} handleToggleBlockStatus={jest.fn()} handleOpenLogging={jest.fn()} startTimerForBlock={jest.fn()}
      onToggleVideo={jest.fn()}
      {...props} {...more}
    />
  );
  let r!: ReactTestRenderer;
  act(() => { r = create(el()); });
  mounted.push(r);
  return { r, rerender: (more: Record<string, unknown>) => act(() => { r.update(el(more)); }) };
}
const closeApp = (r: ReactTestRenderer) => act(() => { r.unmount(); mounted.splice(mounted.indexOf(r), 1); });

const blockOf = (metadata: any, exercises: any[]): any => ({
  id: 'b1', name: 'Strength A', notes: '', completedStatus: 'none', week_number: 1, metadata, exercises,
});
const dips = { id: 'e1', name: 'Dips', sets: '3', reps: '10', rest_seconds: '60', hold_seconds: '', is_weighted: false };
const lsit = { id: 'e2', name: 'L-Sit', sets: '3', reps: '', rest_seconds: '60', hold_seconds: '20', is_weighted: false };
const pullups = { id: 'e3', name: 'Pull-up', sets: '', reps: '6', rest_seconds: '0', hold_seconds: '', is_weighted: true };

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

const repsShown = (r: ReactTestRenderer) =>
  r.root.findAllByType(SetRow).map(row => row.findAll(n => n.props.style && [n.props.style].flat().some((st: any) => st?.minWidth === 24))[0].props.children);

describe('straight sets', () => {
  const block = blockOf({ structure: 'single', timing_system: 'straight_set' }, [dips]);

  it('reps changed without ticking come back', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    tapLabel(r, 'REPS −');
    tapLabel(r, 'REPS −');
    expect(repsShown(r)).toEqual([8, 10, 10]);
    closeApp(r);
    const again = card(block, { ...st.handlers, ...st.kept() }).r;
    expect(repsShown(again)).toEqual([8, 10, 10]);
  });

  it('a ticked set comes back with its changed reps, and + carries on from them', () => {
    const st = screenStore();
    const { r, rerender } = card(block, { ...st.handlers, ...st.kept() });
    tapLabel(r, 'REPS −');
    tapLabel(r, 'REPS −');
    tapText(r, 'START');
    rerender(st.kept());
    expect(st.s.logged.e1).toEqual([{ setIndex: 1, reps: 8, weight: undefined }]);
    closeApp(r);
    const again = card(block, { ...st.handlers, ...st.kept() }).r;
    expect(repsShown(again)).toEqual([8, 10, 10]);
    expect(allText(again)).toContain('✓');
    tapLabel(again, 'REPS +');
    expect(st.s.logged.e1).toEqual([{ setIndex: 1, reps: 9, weight: undefined }]);
  });

  it('hold seconds come back', () => {
    const st = screenStore();
    const holdBlock = blockOf({ structure: 'single', timing_system: 'straight_set' }, [lsit]);
    const { r } = card(holdBlock, { ...st.handlers, ...st.kept() });
    const set2Plus = () => r.root.findAllByType(SetRow)[1].findAll(n => n.props.accessibilityLabel === 'REPS +' && typeof n.props.onPress === 'function')[0];
    act(() => { set2Plus().props.onPress(); });
    act(() => { set2Plus().props.onPress(); });
    closeApp(r);
    const again = card(holdBlock, { ...st.handlers, ...st.kept() }).r;
    expect(repsShown(again)).toEqual([20, 22, 20]);
  });

  it('typed kg comes back', () => {
    const st = screenStore();
    const wBlock = blockOf({ structure: 'single', timing_system: 'straight_set' }, [{ ...dips, is_weighted: true }]);
    const { r } = card(wBlock, { ...st.handlers, ...st.kept() });
    tapLabel(r, 'WEIGHT +');
    tapLabel(r, 'WEIGHT +');
    closeApp(r);
    const again = card(wBlock, { ...st.handlers, ...st.kept() }).r;
    expect(again.root.findAllByType(WeightStepper).map(w => w.props.value)).toEqual(['5', '', '']);
  });

  it('untouched sets still open with the plan', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    closeApp(r);
    expect(st.s.inline).toEqual({});
    expect(repsShown(card(block, { ...st.handlers, ...st.kept() }).r)).toEqual([10, 10, 10]);
  });
});

describe('supersets and circuits', () => {
  const roundReps = (r: ReactTestRenderer, round: number) =>
    r.root.findAllByType(CircuitRoundCard)[round - 1]
      .findAll(n => typeof n.type === 'string' && n.props.style && [n.props.style].flat().some((st: any) => st?.minWidth === 24 || st?.minWidth === 28) && typeof n.props.children === 'number')
      .map(n => n.props.children);

  for (const structure of ['superset', 'circuit']) {
    const block = blockOf({ structure, timing_system: 'straight_set', rounds: 2, rest_after_round: 30 }, [dips, pullups]);

    it(`${structure}: a round changed without ticking comes back`, () => {
      const st = screenStore();
      const { r } = card(block, { ...st.handlers, ...st.kept() });
      tapLabel(r, 'Dips REPS −');
      tapLabel(r, 'WEIGHT +');
      closeApp(r);
      const again = card(block, { ...st.handlers, ...st.kept() }).r;
      expect(roundReps(again, 1)).toEqual([9, 6]);
      expect(again.root.findAllByType(WeightStepper)[0].props.value).toBe('2.5');
    });

    it(`${structure}: a ticked round comes back with its changed values`, () => {
      const st = screenStore();
      const { r, rerender } = card(block, { ...st.handlers, ...st.kept() });
      tapLabel(r, 'Pull-up REPS +');
      tapText(r, 'COMPLETE ROUND');
      rerender(st.kept());
      tapLabel(r, 'Pull-up REPS +'); // edited after ticking
      closeApp(r);
      const again = card(block, { ...st.handlers, ...st.kept() }).r;
      expect(roundReps(again, 1)).toEqual([10, 8]);
      expect(roundReps(again, 2)).toEqual([10, 6]);
    });
  }
});

describe('AMRAP', () => {
  const block = blockOf({ timing_system: 'amrap', time_cap_min: 2 }, [dips]);
  const plusRound = (r: ReactTestRenderer) => {
    const btns = r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes('ROUND'));
    act(() => { btns[btns.length - 1].props.onPress(); });
  };

  it('counted rounds and the running clock come back', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    tapText(r, 'START');
    plusRound(r);
    plusRound(r);
    advance(30_000);
    closeApp(r);
    advance(10_000); // app closed for 10 s
    const again = card(block, { ...st.handlers, ...st.kept() }).r;
    const amrap = again.root.findByType(AmrapInlineTimer);
    expect(allText(again)).toContain('1:20');
    expect(texts(again.toJSON()).some(x => x === '2')).toBe(true);
    advance(81_000);
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalledWith(4);
    expect(amrap).toBeTruthy();
  });

  it('time ran out while closed: comes back finished with its rounds, no buzzer', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    tapText(r, 'START');
    plusRound(r);
    closeApp(r);
    advance(300_000);
    const again = card(block, { ...st.handlers, ...st.kept() }).r;
    expect(allText(again)).toContain('0:00');
    expect(SoundServiceInstance.playDigitalBuzzer).not.toHaveBeenCalled();
    expect(st.s.inline.amrap).toMatchObject({ rounds: 1, finished: true, endAt: null });
  });
});

describe('For Time', () => {
  const block = blockOf({ timing_system: 'fortime', time_cap_min: 5, rounds: 3 }, [dips]);

  it('the stopwatch and counted rounds come back', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    tapText(r, 'START');
    advance(30_000);
    tapText(r, '+1');
    closeApp(r);
    advance(10_000);
    const again = card(block, { ...st.handlers, ...st.kept() }).r;
    expect(again.root.findByType(ForTimeInlineTimer)).toBeTruthy();
    expect(allText(again)).toContain('0:40');
    expect(st.s.inline.fortime).toMatchObject({ rounds: 1, hasStarted: true });
  });
});

describe('ladder', () => {
  const block = blockOf({ structure: 'ladder', timing_system: 'straight_set', rounds: 3, ladder_start: 5, ladder_sub: 1 }, [dips]);

  it('rest still running: comes back counting down on the same rung', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    tapText(r, 'START REST');
    advance(20_000);
    closeApp(r);
    advance(10_000);
    const again = card(block, { ...st.handlers, ...st.kept() }).r;
    expect(allText(again)).toContain('0:30');
    expect(st.s.inline.ladder).toMatchObject({ currentRoundIndex: 0, selectedIndex: 0 });
  });

  it('rest ended while closed: comes back on the next rung', () => {
    const st = screenStore();
    const { r } = card(block, { ...st.handlers, ...st.kept() });
    tapText(r, 'START REST');
    closeApp(r);
    advance(120_000);
    card(block, { ...st.handlers, ...st.kept() });
    expect(st.s.inline.ladder).toMatchObject({ currentRoundIndex: 1, selectedIndex: 1, anchorAt: null });
  });
});

describe('waits for saved progress', () => {
  it('the loggers only open once it has been read back', () => {
    const st = screenStore();
    const block = blockOf({ structure: 'single', timing_system: 'straight_set' }, [dips]);
    st.handlers.onSetDraft('b1', 'e1', { setIndex: 2, reps: 7 });
    const { r, rerender } = card(block, { ...st.handlers, loggedSetsByExercise: {}, progressReady: false });
    expect(r.root.findAllByType(SetRow)).toHaveLength(0);
    rerender({ ...st.kept(), progressReady: true });
    expect(repsShown(r)).toEqual([10, 7, 10]);
  });
});
