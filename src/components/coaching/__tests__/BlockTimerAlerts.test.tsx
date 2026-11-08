import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
const mockSchedule = jest.fn();
const mockCancel = jest.fn();
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  cancelScheduledNotificationAsync: (...a: unknown[]) => mockCancel(...a),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', theme: { card: { background: '#111', border: '#333' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } } }),
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));

import i18n from '../../../i18n';
import { WarriorBlockCard } from '../WarriorBlockCard';
import { cancelBlockTimerAlerts } from '../../../hooks/useBackgroundTimerAlerts';

// A killed app can't cancel the alerts it scheduled. The block timers that
// come back after reopening (AMRAP, For Time, ladder) use a fixed id per
// block, so the reopened timer replaces its old alert instead of adding one.

let appStateListeners: ((s: string) => void)[] = [];
let appState = 'active';
jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
  appStateListeners.push(cb);
  return { remove: () => { appStateListeners = appStateListeners.filter(l => l !== cb); } };
}) as never);
Object.defineProperty(AppState, 'currentState', { get: () => appState, configurable: true });
const leaveApp = async () => {
  appState = 'background';
  await act(async () => { appStateListeners.forEach(l => l('background')); });
};

const theme = { card: { border: '#333', background: '#111' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' }, background: { primary: '#000' } };
function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const tapText = (r: ReactTestRenderer, text: string) => {
  const btn = r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).some(x => x.includes(text)))[0];
  act(() => { btn.props.onPress(); });
};

const dips = { id: 'e1', name: 'Dips', sets: '3', reps: '10', rest_seconds: '60', hold_seconds: '', is_weighted: false };
const blockOf = (metadata: any): any => ({ id: 'b1', name: 'Strength A', notes: '', completedStatus: 'none', week_number: 1, metadata, exercises: [dips] });

const mounted: ReactTestRenderer[] = [];
function card(block: any, extra: Record<string, unknown> = {}) {
  let r!: ReactTestRenderer;
  act(() => {
    r = create(
      <WarriorBlockCard
        block={block} index={0} isExpanded theme={theme} mode="dark" solidCardBg="#111" bronzeGold="#C9A227" strengthTier={3}
        toggleBlockExpanded={jest.fn()} handleToggleBlockStatus={jest.fn()} handleOpenLogging={jest.fn()} startTimerForBlock={jest.fn()}
        onToggleVideo={jest.fn()} loggedSetsByExercise={{}} onSetLogged={jest.fn()} {...extra}
      />,
    );
  });
  mounted.push(r);
  return r;
}

beforeEach(() => {
  jest.useFakeTimers();
  appState = 'active';
  mockSchedule.mockReset().mockImplementation(async (req: { identifier?: string }) => req.identifier ?? 'random-id');
  mockCancel.mockReset().mockResolvedValue(undefined);
  i18n.changeLanguage('en');
});
afterEach(() => {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
  appStateListeners = [];
  jest.useRealTimers();
});

describe('block timer alerts after the app is reopened', () => {
  it.each([
    ['AMRAP', { timing_system: 'amrap', time_cap_min: 2 }, 'START', 'block-timer:b1:amrap'],
    ['For Time', { timing_system: 'fortime', time_cap_min: 5 }, 'START', 'block-timer:b1:fortime'],
    ['ladder', { structure: 'ladder', timing_system: 'straight_set', rounds: 3, ladder_start: 5, ladder_sub: 1 }, 'START REST', 'block-timer:b1:ladder'],
  ])('%s: schedules under its block\'s fixed id', async (_name, metadata, start, id) => {
    const r = card(blockOf(metadata));
    tapText(r, start);
    await leaveApp();
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule.mock.calls[0][0]).toMatchObject({ identifier: id });
  });

  it('the reopened timer cancels the old alert by its id when it comes back on screen', () => {
    card(blockOf({ timing_system: 'amrap', time_cap_min: 2 }));
    expect(mockCancel).toHaveBeenCalledWith('block-timer:b1:amrap');
  });

  it('leaving again schedules one alert under the same id, so it replaces rather than adds', async () => {
    const r = card(blockOf({ timing_system: 'amrap', time_cap_min: 2 }));
    tapText(r, 'START');
    await leaveApp();
    appState = 'active';
    act(() => { appStateListeners.forEach(l => l('active')); });
    await leaveApp();
    const ids = mockSchedule.mock.calls.map(c => (c[0] as { identifier?: string }).identifier);
    expect(ids).toEqual(['block-timer:b1:amrap', 'block-timer:b1:amrap']);
  });

  it('logging a block cancels its AMRAP / For Time / ladder alerts', () => {
    cancelBlockTimerAlerts('b9');
    expect(mockCancel.mock.calls.map(c => c[0])).toEqual(['block-timer:b9:amrap', 'block-timer:b9:fortime', 'block-timer:b9:ladder']);
  });

  it('rests between sets keep their own random ids (unchanged)', async () => {
    const r = card(blockOf({ structure: 'single', timing_system: 'straight_set' }));
    tapText(r, 'START');
    await leaveApp();
    expect(mockSchedule).toHaveBeenCalled();
    mockSchedule.mock.calls.forEach(c => expect((c[0] as { identifier?: string }).identifier).toBeUndefined());
  });
});
