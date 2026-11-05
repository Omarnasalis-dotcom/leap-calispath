import React, { useState } from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../lib/SoundService', () => ({
  SoundServiceInstance: { playTick: jest.fn(), playBoxingBell: jest.fn(), playDigitalBuzzer: jest.fn() },
}));
const mockSchedule = jest.fn().mockResolvedValue('id');
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: (...a: unknown[]) => mockSchedule(...a),
  cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval' },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../../contexts/ThemeContext', () => ({
  useTheme: () => ({ mode: 'dark', theme: { card: { background: '#111', border: '#333' }, text: { primary: '#fff', secondary: '#aaa', tertiary: '#777' } } }),
}));

import i18n from '../../../i18n';
import { SoundServiceInstance } from '../../../lib/SoundService';
import { BlockRestOffer, BlockRestPill, BLOCK_REST_OFFER_MS } from '../BlockRestTimer';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach(n => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const tapLabel = (r: ReactTestRenderer, label: string) =>
  act(() => { r.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0].props.onPress(); });
const tapText = (r: ReactTestRenderer, text: string) =>
  act(() => { r.root.findAll(n => typeof n.props.onPress === 'function' && texts(n.children as any).includes(text))[0].props.onPress(); });
const advance = (ms: number) => act(() => { jest.advanceTimersByTime(ms); });
// Asked of the components: after a native animation the JSON snapshot keeps a
// stale copy of a view that has already gone.
const cardShown = (r: ReactTestRenderer) => r.root.findAllByType(BlockRestOffer).length > 0;
const pillShown = (r: ReactTestRenderer) => r.root.findAllByType(BlockRestPill).length > 0;
/** The card leaves through timers and animations started by Start. */
const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => { jest.advanceTimersByTime(300); await Promise.resolve(); });
  }
};

// The workout screen's part: one offer, and a fresh pill per Start.
let openOffer: () => void;
function Screen({ onEnded }: { onEnded: () => void }) {
  const [offer, setOffer] = useState<number | null>(null);
  const [rest, setRest] = useState<{ id: number; seconds: number } | null>(null);
  openOffer = () => setOffer(n => (n ?? 0) + 1);
  return (
    <>
      {offer !== null && (
        <BlockRestOffer
          key={offer}
          onStart={(seconds) => setRest(prev => ({ id: (prev?.id ?? 0) + 1, seconds }))}
          onClose={() => setOffer(null)}
          onTouchInside={jest.fn()}
        />
      )}
      {rest && (
        <BlockRestPill
          key={rest.id}
          seconds={rest.seconds}
          onStop={() => setRest(null)}
          onEnded={() => { setRest(null); onEnded(); }}
        />
      )}
    </>
  );
}

const mounted: ReactTestRenderer[] = [];
async function mount(onEnded = jest.fn()) {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<Screen onEnded={onEnded} />); });
  mounted.push(r);
  const offer = async (_n = 1) => { await act(async () => { openOffer(); }); };
  return { r, offer, onEnded };
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  i18n.changeLanguage('en');
});
afterEach(() => {
  act(() => { mounted.splice(0).forEach(r => r.unmount()); });
  jest.useRealTimers();
  i18n.changeLanguage('en');
});

describe('rest between blocks', () => {
  it('shows nothing until a block is logged', async () => {
    const { r } = await mount();
    expect(r.toJSON()).toBeNull();
  });

  it('the pop-up vanishes after 5 seconds and no timer runs', async () => {
    const { r, offer } = await mount();
    await offer();
    expect(allText(r)).toContain('REST BEFORE THE NEXT BLOCK');
    expect(allText(r)).toContain('1:30');
    advance(BLOCK_REST_OFFER_MS - 100);
    expect(allText(r)).toContain('1:30');
    advance(500);
    expect(r.toJSON()).toBeNull();
    expect(SoundServiceInstance.playDigitalBuzzer).not.toHaveBeenCalled();
  });

  it('✕ closes it, with no timer', async () => {
    const { r, offer, onEnded } = await mount();
    await offer();
    tapLabel(r, 'Close without resting');
    expect(r.toJSON()).toBeNull();
    advance(120_000);
    expect(onEnded).not.toHaveBeenCalled();
  });

  it('closing a new offer leaves a running rest alone', async () => {
    const { r, offer, onEnded } = await mount();
    await offer(1);
    tapText(r, 'START REST');
    await settle();
    await offer(2);
    expect(cardShown(r)).toBe(true);
    tapLabel(r, 'Close without resting');
    expect(cardShown(r)).toBe(false);
    expect(pillShown(r)).toBe(true);
    advance(95_000);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('touches inside the card are reported, so they do not close it', async () => {
    const onTouchInside = jest.fn();
    let r!: ReactTestRenderer;
    await act(async () => { r = create(<BlockRestOffer onStart={jest.fn()} onClose={jest.fn()} onTouchInside={onTouchInside} />); });
    mounted.push(r);
    act(() => { r.root.findAll(n => typeof n.props.onTouchEnd === 'function')[0].props.onTouchEnd(); });
    expect(onTouchInside).toHaveBeenCalledTimes(1);
  });

  it('−15 / +15 change the time and restart the 5 seconds', async () => {
    const { r, offer } = await mount();
    await offer();
    advance(4000);
    tapLabel(r, 'Add 15 seconds');
    expect(allText(r)).toContain('1:45');
    advance(4000);
    tapLabel(r, 'Remove 15 seconds');
    tapLabel(r, 'Remove 15 seconds');
    expect(allText(r)).toContain('1:15');
    advance(4000);
    expect(allText(r)).toContain('REST BEFORE THE NEXT BLOCK');
  });

  it('stays between 15 seconds and 10 minutes', async () => {
    const { r, offer } = await mount();
    await offer();
    for (let i = 0; i < 8; i++) tapLabel(r, 'Remove 15 seconds');
    expect(allText(r)).toContain('0:15');
    const less = r.root.findAll(n => n.props.accessibilityLabel === 'Remove 15 seconds' && n.props.disabled === true);
    expect(less.length).toBeGreaterThan(0);
  });

  it('Start moves it to the side, counts down, rings and reports the end', async () => {
    const { r, offer, onEnded } = await mount();
    await offer();
    tapLabel(r, 'Remove 15 seconds');
    tapText(r, 'START REST');
    await settle();
    expect(cardShown(r)).toBe(false);
    expect(allText(r)).toContain('1:14');
    advance(10_000);
    expect(allText(r)).toContain('1:04');
    advance(66_000);
    expect(SoundServiceInstance.playDigitalBuzzer).toHaveBeenCalledTimes(1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    expect(pillShown(r)).toBe(false);
  });

  it('Stop ends it with no alarm', async () => {
    const { r, offer, onEnded } = await mount();
    await offer();
    tapText(r, 'START REST');
    await settle();
    tapLabel(r, 'Stop rest');
    advance(120_000);
    expect(onEnded).not.toHaveBeenCalled();
    expect(pillShown(r)).toBe(false);
  });

  it('keeps the chosen length for next time', async () => {
    const first = await mount();
    await first.offer();
    tapLabel(first.r, 'Add 15 seconds');
    tapText(first.r, 'START REST');
    advance(500);
    await act(async () => { await Promise.resolve(); });
    expect(await AsyncStorage.getItem('workout_block_rest_seconds')).toBe('105');

    const second = await mount();
    await second.offer();
    expect(allText(second.r)).toContain('1:45');
  });

  it('a new offer while resting leaves the rest running until Start replaces it', async () => {
    const { r, offer, onEnded } = await mount();
    await offer(1);
    tapText(r, 'START REST');
    advance(500);
    advance(30_000);
    await offer(2);
    expect(allText(r)).toContain('REST BEFORE THE NEXT BLOCK');
    expect(allText(r)).toContain('1:00');
    tapText(r, 'START REST');
    advance(500);
    advance(70_000);
    expect(onEnded).not.toHaveBeenCalled();
    advance(21_000);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('Arabic', async () => {
    i18n.changeLanguage('ar');
    const { r, offer } = await mount();
    await offer();
    expect(allText(r)).toContain('راحة قبل القسم التالي');
    expect(allText(r)).toContain('ابدأ الراحة');
  });
});
