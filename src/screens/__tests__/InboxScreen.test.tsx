import React from 'react';
import { Linking } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { router } from 'expo-router';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'u1' }, refreshProfile: jest.fn() }) }));
jest.mock('expo-router', () => {
  const R = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
    useFocusEffect: (cb: () => void) => R.useEffect(cb, [cb]),
  };
});
jest.mock('../../lib/analytics', () => ({ track: jest.fn() }));
const mockSetString = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }));
const mockFetch = jest.fn();
const mockClaims = jest.fn();
const mockClaimGift = jest.fn();
const mockMarkAllSeen = jest.fn();
jest.mock('../../services/InboxService', () => ({
  InboxService: {
    fetchInbox: () => mockFetch(),
    fetchGiftClaims: () => mockClaims(),
    markAllSeen: (...a: unknown[]) => mockMarkAllSeen(...a),
    claimGift: (...a: unknown[]) => mockClaimGift(...a),
  },
}));

import { InboxScreen } from '../InboxScreen';
import { InboxRow, rowTarget } from '../../components/inbox/InboxRow';
import { dayGroup, groupByDay, timeLabel, type InboxItem } from '../../lib/inbox';

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600000).toISOString();
const daysAgo = (d: number) => {
  const x = new Date(now);
  x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - d);
  return x.toISOString();
};

const base: InboxItem = {
  id: 'n1', type: 'admin_message', kind: 'news', title: 'New feature', body: 'Try it today', createdAt: hoursAgo(0),
  unread: false, screen: null, params: {}, url: null, buttonLabel: null, imageUrl: null, popup: true, expiresAt: null,
  code: null, claimId: null, giftTier: null, giftDays: null, giftText: null,
};
const later = '2099-01-01T00:00:00Z';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const rowOf = (r: ReactTestRenderer, id: string) => r.root.findAllByType(InboxRow).find((n) => n.props.item.id === id)!;
const pressRow = (r: ReactTestRenderer, id: string) =>
  rowOf(r, id).findAll((n) => typeof n.props.onPress === 'function')[0].props.onPress();
// The innermost match: a row without a screen is itself a button around its Claim button.
const button = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && (texts(n.children as any).join('').includes(label) || n.props.accessibilityLabel === label)).pop();

describe('day groups and times', () => {
  it('puts each notification under Today, This week or Earlier', () => {
    expect(dayGroup(hoursAgo(0), now)).toBe('today');
    expect(dayGroup(daysAgo(1), now)).toBe('week');
    expect(dayGroup(daysAgo(6), now)).toBe('week');
    expect(dayGroup(daysAgo(7), now)).toBe('earlier');
    const groups = groupByDay([
      { ...base, id: 'a', createdAt: hoursAgo(0) },
      { ...base, id: 'b', createdAt: daysAgo(10) },
      { ...base, id: 'c', createdAt: daysAgo(2) },
    ], now);
    expect(groups.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([['today', ['a']], ['week', ['c']], ['earlier', ['b']]]);
  });

  it('shows minutes or hours today, then a weekday, then a date', () => {
    expect(timeLabel(new Date(now - 20000).toISOString(), now)).toBe('now');
    expect(timeLabel(new Date(now - 25 * 60000).toISOString(), now)).toMatch(/^25m$/);
    expect(timeLabel(daysAgo(10), now, 'en-US')).toMatch(/[A-Z][a-z]{2} \d{1,2}/);
  });
});

describe('where a row goes', () => {
  it('a link, a screen, the code screen, or nowhere', () => {
    expect(rowTarget({ ...base, url: 'https://x.y' })).toEqual({ url: 'https://x.y' });
    expect(rowTarget({ ...base, screen: 'weekly-challenge' })).toEqual({ route: '/weekly-challenge' });
    expect(rowTarget({ ...base, kind: 'discount', code: 'MAX50' })).toEqual({ route: '/redeem-code?code=MAX50' });
    expect(rowTarget(base)).toBeNull();
  });
});

describe('Notifications screen', () => {
  let r: ReactTestRenderer;
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => r?.unmount()));

  it('groups the feed by day, counts what is new and clears the badge', async () => {
    mockFetch.mockResolvedValue([
      { ...base, id: 'new', unread: true, title: 'New Program Assigned!', type: 'client_program_update', screen: 'warrior-program' },
      { ...base, id: 'old', title: 'Old news', createdAt: daysAgo(12) },
    ]);
    mockClaims.mockResolvedValue({});
    await act(async () => { r = create(<InboxScreen />); });
    const text = allText(r);
    expect(text).toContain('TODAY');
    expect(text).toContain('EARLIER');
    expect(text).not.toContain('THIS WEEK');
    expect(text).toContain('1 new');
    expect(mockMarkAllSeen).toHaveBeenCalledWith(['new']);
  });

  it('tapping a row goes straight to its screen; one without a screen opens its text', async () => {
    mockFetch.mockResolvedValue([
      { ...base, id: 'go', screen: 'weekly-challenge', params: { tab: 'team' } },
      { ...base, id: 'web', url: 'https://example.com' },
      { ...base, id: 'text', body: 'A long message' },
    ]);
    mockClaims.mockResolvedValue({});
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => { r = create(<InboxScreen />); });
    await act(async () => { pressRow(r, 'go'); });
    expect(router.push).toHaveBeenCalledWith('/weekly-challenge?tab=team');
    await act(async () => { pressRow(r, 'web'); });
    expect(openURL).toHaveBeenCalledWith('https://example.com');
    const body = () => rowOf(r, 'text').findAll((n) => n.props.numberOfLines !== undefined || n.props.children === 'A long message')
      .find((n) => n.props.children === 'A long message')!;
    expect(body().props.numberOfLines).toBe(2);
    await act(async () => { pressRow(r, 'text'); });
    expect(body().props.numberOfLines).toBeUndefined();
    openURL.mockRestore();
  });

  it('claims a gift from inside its row', async () => {
    mockFetch.mockResolvedValue([{ ...base, id: 'g', kind: 'gift', title: 'A gift', claimId: 'c1', giftTier: 'pro', giftDays: 7, unread: true }]);
    mockClaims.mockResolvedValue({ c1: { id: 'c1', tier: 'pro', days: 7, claim_by: later, claimed_at: null } });
    mockClaimGift.mockResolvedValue({ ok: true, tier: 'pro', days: 7, accessExpiresAt: '2026-12-01T10:00:00Z' });
    await act(async () => { r = create(<InboxScreen />); });
    expect(allText(r)).toContain('PRO · 7 days free');
    await act(async () => { button(r, 'CLAIM GIFT')!.props.onPress(); });
    expect(mockClaimGift).toHaveBeenCalledWith('c1');
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(allText(r)).toContain('Your plan is active until');
  });

  it('a claimed gift says so, with no button', async () => {
    mockFetch.mockResolvedValue([{ ...base, id: 'g', kind: 'gift', title: 'A gift', claimId: 'c1', giftTier: 'max', giftDays: 7 }]);
    mockClaims.mockResolvedValue({ c1: { id: 'c1', tier: 'max', days: 7, claim_by: later, claimed_at: '2026-11-17T11:00:00Z' } });
    await act(async () => { r = create(<InboxScreen />); });
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(allText(r)).toContain('MAX · 7 days free · Gift claimed.');
  });

  it('a code can be copied or used from its row', async () => {
    mockFetch.mockResolvedValue([{ ...base, id: 'd', kind: 'discount', title: '50% off', code: 'MAX50' }]);
    mockClaims.mockResolvedValue({});
    await act(async () => { r = create(<InboxScreen />); });
    await act(async () => { button(r, 'Copy')!.props.onPress(); });
    expect(mockSetString).toHaveBeenCalledWith('MAX50');
    await act(async () => { button(r, 'USE CODE')!.props.onPress(); });
    expect(router.push).toHaveBeenCalledWith('/redeem-code?code=MAX50');
  });

  it('shows the empty message when there is nothing', async () => {
    mockFetch.mockResolvedValue([]);
    mockClaims.mockResolvedValue({});
    await act(async () => { r = create(<InboxScreen />); });
    expect(allText(r)).toContain('Nothing here yet');
  });
});
