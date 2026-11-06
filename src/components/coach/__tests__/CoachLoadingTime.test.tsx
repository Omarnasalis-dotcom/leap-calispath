import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { CoachLoadingLabel, formatElapsed } from '../CoachLoadingTime';

const START = new Date('2026-11-06T12:00:00Z').getTime();
let tree: ReactTestRenderer | undefined;
const text = () => JSON.stringify(tree!.toJSON());
const tick = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(START);
});
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
  jest.useRealTimers();
});
const mount = (since = START) => act(async () => { tree = create(<CoachLoadingLabel since={since} color="#888" />); });

describe('formatElapsed', () => {
  it('shows seconds, then minutes', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(59)).toBe('59s');
    expect(formatElapsed(60)).toBe('1:00');
    expect(formatElapsed(125)).toBe('2:05');
  });
});

describe('CoachLoadingLabel', () => {
  it('swaps the word every 3 seconds, in a loop', async () => {
    await mount();
    expect(text()).toContain('THINKING');
    await tick(2900);
    expect(text()).toContain('THINKING');
    await tick(200);
    expect(text()).toContain('BUILDING');
    await tick(3000);
    expect(text()).toContain('THINKING');
    await tick(3000);
    expect(text()).toContain('BUILDING');
  });

  it('counts the seconds', async () => {
    await mount();
    expect(text()).toContain('0s');
    await tick(12100);
    expect(text()).toContain('12s');
  });

  it('counts from the send, so it carries on when shown again', async () => {
    await mount(START - 40000);
    expect(text()).toContain('40s');
  });

  it('skips nothing after the app was in the background', async () => {
    await mount();
    jest.setSystemTime(START + 90000);
    await tick(500);
    expect(text()).toContain('1:30');
  });

  it('stops ticking when the reply arrives', async () => {
    await mount();
    const running = jest.getTimerCount();
    act(() => tree?.unmount());
    tree = undefined;
    // One ticker only, and it's gone. React's own scheduler may remain.
    expect(running - jest.getTimerCount()).toBe(1);
  });
});
