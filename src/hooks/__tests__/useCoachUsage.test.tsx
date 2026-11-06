import React from 'react';
import { AppState } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useCoachUsage } from '../useCoachUsage';
import { CoachUsage } from '../../lib/coachUsage';

const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a) } }));

const answer = (over: Record<string, unknown> = {}) => ({
  data: { tier: 'pro', window: 'day', messages_left: 7, messages_limit: 10, resets_at: null, budget_left_pct: 72, budget_until: null, ...over },
  error: null,
});

let seen: Array<CoachUsage | null> = [];
function Probe({ enabled, busy }: { enabled: boolean; busy: boolean }) {
  seen.push(useCoachUsage(enabled, busy));
  return null;
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
const last = () => seen[seen.length - 1];

let tree: ReactTestRenderer | undefined;
const mount = async (enabled = true, busy = false) => {
  await act(async () => { tree = create(<Probe enabled={enabled} busy={busy} />); });
  await flush();
};
const update = async (enabled: boolean, busy: boolean) => {
  await act(async () => { tree!.update(<Probe enabled={enabled} busy={busy} />); });
  await flush();
};

beforeEach(() => {
  seen = [];
  mockRpc.mockReset();
  mockRpc.mockResolvedValue(answer());
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.useRealTimers();
});

describe('useCoachUsage', () => {
  it('reads once on opening', async () => {
    await mount();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc.mock.calls[0][0]).toBe('get_ai_coach_usage');
    expect(last()?.messagesLeft).toBe(7);
  });

  it('stays off behind setup and the paywall', async () => {
    await mount(false);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(last()).toBeNull();
  });

  it('does not read while a reply is running, then reads once it ends', async () => {
    await mount(true, true);
    expect(mockRpc).not.toHaveBeenCalled();
    mockRpc.mockResolvedValue(answer({ messages_left: 6 }));
    await update(true, false);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(last()?.messagesLeft).toBe(6);
  });

  it('hides on a failed read, a refused read or a crash', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    await mount();
    expect(last()).toBeNull();
    await update(true, true);
    mockRpc.mockRejectedValue(new Error('offline'));
    await update(true, false);
    expect(last()).toBeNull();
  });

  it('keeps the same object when the numbers did not change', async () => {
    await mount();
    const first = last();
    await update(true, true);
    await update(true, false);
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(last()).toBe(first);
  });

  it('ignores a slow answer that a newer read has replaced', async () => {
    let finishOld: (v: unknown) => void = () => {};
    mockRpc.mockReturnValueOnce(new Promise(r => { finishOld = r; }));
    await mount();
    await update(true, true);
    mockRpc.mockResolvedValue(answer({ messages_left: 2 }));
    await update(true, false);
    await act(async () => { finishOld(answer({ messages_left: 9 })); });
    await flush();
    expect(last()?.messagesLeft).toBe(2);
  });

  it('reads on returning to the app, but not during a reply', async () => {
    let onChange: (s: string) => void = () => {};
    const remove = jest.fn();
    (AppState.addEventListener as jest.Mock).mockImplementationOnce((_: string, cb: (s: string) => void) => {
      onChange = cb;
      return { remove };
    });
    await mount();
    await act(async () => { onChange('active'); });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(2);
    await update(true, true);
    await act(async () => { onChange('active'); });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(2);
    act(() => tree?.unmount());
    tree = undefined;
    expect(remove).toHaveBeenCalled();
  });

  it('reads again just after the reset', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-06T23:59:00Z'));
    mockRpc.mockResolvedValue(answer({ resets_at: '2026-11-07T00:00:00+00:00' }));
    await mount();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    mockRpc.mockResolvedValue(answer({ resets_at: '2026-11-08T00:00:00+00:00', messages_left: 10 }));
    await act(async () => { jest.advanceTimersByTime(61_000); });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    await act(async () => { jest.advanceTimersByTime(2_000); });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(last()?.messagesLeft).toBe(10);
  });

  it('never loops on a reset already passed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-06T12:00:00Z'));
    mockRpc.mockResolvedValue(answer({ resets_at: '2026-11-01T00:00:00+00:00' }));
    await mount();
    await act(async () => { jest.advanceTimersByTime(3_600_000); });
    await flush();
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('stops after closing the chat', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-06T23:59:00Z'));
    mockRpc.mockResolvedValue(answer({ resets_at: '2026-11-07T00:00:00+00:00' }));
    await mount();
    act(() => tree?.unmount());
    tree = undefined;
    await act(async () => { jest.advanceTimersByTime(120_000); });
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });
});
