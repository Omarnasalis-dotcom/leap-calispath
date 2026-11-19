import React from 'react';
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
const mockTrack = jest.fn();
jest.mock('../../lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('expo-notifications', () => ({ addNotificationReceivedListener: () => ({ remove: jest.fn() }) }));
const mockSetString = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (...a: unknown[]) => mockSetString(...a) }));
const mockFetch = jest.fn();
const mockClaims = jest.fn();
const mockStatus = jest.fn();
const mockClaimGift = jest.fn();
const mockMarkAllSeen = jest.fn();
const mockMarkActed = jest.fn();
jest.mock('../../services/InboxService', () => ({
  InboxService: {
    // Same steps as the real one, over the mocks below.
    fetchFeedData: async () => {
      const { STATUS_TYPES } = jest.requireActual('../../lib/inboxFeed');
      const items = (await mockFetch()) as InboxItem[];
      const claims = await mockClaims();
      const status = await mockStatus(items.filter((i) => STATUS_TYPES.has(i.type)).map((i) => i.id));
      return { items, claims, status };
    },
    fetchGiftClaims: () => mockClaims(),
    fetchStatus: (...a: unknown[]) => mockStatus(...a),
    markAllSeen: (...a: unknown[]) => mockMarkAllSeen(...a),
    markActed: (...a: unknown[]) => mockMarkActed(...a),
    claimGift: (...a: unknown[]) => mockClaimGift(...a),
  },
}));

import { InboxScreen } from '../InboxScreen';
import { ActionCard, ChallengeGroupRow, HeroCoachCard, TimelineRow } from '../../components/inbox/feed/FeedParts';
import type { InboxItem, NotificationFields } from '../../lib/inbox';

const noFields: NotificationFields = { challengeName: null, byName: null, overtakenKind: null, boardName: null, tier: null, week: null, programName: null };
const recent = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
let seq = 0;
type Over = Omit<Partial<InboxItem>, 'fields'> & { fields?: Partial<NotificationFields> };
function item(over: Over = {}): InboxItem {
  seq += 1;
  const { fields, ...rest } = over;
  return {
    id: `n${seq}`, type: 'admin_message', kind: 'news', title: 'T', body: 'B', createdAt: recent(2),
    unread: false, screen: null, params: {}, url: null, buttonLabel: null, imageUrl: null, popup: false, expiresAt: null,
    giftText: null, code: null, claimId: null, giftTier: null, giftDays: null, actedAt: null,
    ...rest,
    fields: { ...noFields, ...fields },
  };
}

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const button = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function'
    && (texts(n.children as any).join('').includes(label) || n.props.accessibilityLabel === label)).pop();

let r: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockClaims.mockResolvedValue({});
  mockStatus.mockResolvedValue({});
});
afterEach(() => act(() => r?.unmount()));

it('puts what needs the person first, then the activity by month', async () => {
  const w7 = item({ type: 'week_complete_nudge', screen: 'coach', fields: { week: 7 } });
  const loop = item({ type: 'weekly_challenge_started', screen: 'weekly-challenge', fields: { challengeName: 'Loop B2' } });
  const passed = item({ type: 'leaderboard_overtaken', screen: 'profile', params: { activeTab: 'profile', board: 'wra' },
    fields: { overtakenKind: 'score', boardName: 'Well-Rounded', byName: 'yahia_shinnawy' } });
  const old = item({ type: 'weekly_challenge_started', fields: { challengeName: 'Beasts' }, createdAt: '2026-10-07T10:00:00Z' });
  mockFetch.mockResolvedValue([w7, loop, passed, old]);
  mockStatus.mockResolvedValue({ [w7.id]: false, [loop.id]: false, [old.id]: true });
  await act(async () => { r = create(<InboxScreen />); });

  expect(r.root.findAllByType(HeroCoachCard)).toHaveLength(1);
  expect(r.root.findAllByType(ActionCard).map((n) => n.props.entry.item.id)).toEqual([loop.id, passed.id]);
  expect(r.root.findAllByType(TimelineRow).map((n) => n.props.item.id)).toEqual([old.id]);
  const text = allText(r);
  expect(text).toContain('NEEDS YOU · 3');
  expect(text).toContain('WEEK 7 DONE.\nWEEK 8 IS NEXT.');
  expect(text).toContain('Loop B2 is live');
  expect(text).toContain('yahia_shinnawy passed you');
  expect(text).toContain('On Well-Rounded');
  expect(text).toContain('ACTIVITY');
  // Things are waiting: no "caught up", the list just ends.
  expect(text).not.toContain("You're all caught up");
  expect(text).toContain("That's everything from the last 60 days");
  expect(mockStatus).toHaveBeenCalledWith([w7.id, loop.id, passed.id, old.id]);
  expect(mockTrack).toHaveBeenCalledWith('inbox_needs_shown', { count: 3, kinds: 'coach,challenge,overtaken' });
});

it('Build week opens the AI Coach with the week review, and the card leaves Needs you', async () => {
  const w7 = item({ type: 'week_complete_nudge', fields: { week: 7 } });
  mockFetch.mockResolvedValue([w7]);
  mockStatus.mockResolvedValue({ [w7.id]: false });
  await act(async () => { r = create(<InboxScreen />); });
  await act(async () => { button(r, 'Build Week 8')!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith({ pathname: '/coach', params: { firstPrompt: "I finished this week. Let's review it and build next week." } });
  expect(mockMarkActed).toHaveBeenCalledWith(w7.id);
  expect(r.root.findAllByType(HeroCoachCard)).toHaveLength(0);
  expect(r.root.findAllByType(TimelineRow)).toHaveLength(1);
});

it('Join and Defend go where the push goes', async () => {
  const loop = item({ type: 'weekly_challenge_started', screen: 'weekly-challenge', fields: { challengeName: 'Loop B2' } });
  const passed = item({ type: 'leaderboard_overtaken', screen: 'profile', params: { activeTab: 'strength', boardTier: '3' },
    fields: { overtakenKind: 'time', tier: 3, byName: 'Abdo2009' } });
  mockFetch.mockResolvedValue([loop, passed]);
  await act(async () => { r = create(<InboxScreen />); });
  expect(allText(r)).toContain('In Hoplite');
  await act(async () => { button(r, 'Join')!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith('/weekly-challenge');
  await act(async () => { button(r, 'Defend')!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith('/profile?activeTab=strength&boardTier=3');
});

it('claims a gift from its card', async () => {
  const gift = item({ kind: 'gift', claimId: 'c1', giftTier: 'pro', giftDays: 7, title: 'A gift' });
  mockFetch.mockResolvedValue([gift]);
  mockClaims.mockResolvedValue({ c1: { id: 'c1', tier: 'pro', days: 7, claim_by: '2099-01-01T00:00:00Z', claimed_at: null } });
  mockClaimGift.mockResolvedValue({ ok: true, tier: 'pro', days: 7, accessExpiresAt: '2026-12-01T10:00:00Z' });
  await act(async () => { r = create(<InboxScreen />); });
  expect(allText(r)).toContain('PRO · 7 days free');
  await act(async () => { button(r, 'Claim')!.props.onPress(); });
  expect(mockClaimGift).toHaveBeenCalledWith('c1');
  expect(allText(r)).toContain('Claimed');
  expect(button(r, 'Claim')).toBeUndefined();
});

it('a code can be copied or used', async () => {
  const code = item({ kind: 'discount', code: 'MAX50', title: '50% off Max' });
  mockFetch.mockResolvedValue([code]);
  await act(async () => { r = create(<InboxScreen />); });
  await act(async () => { button(r, 'Copy')!.props.onPress(); });
  expect(mockSetString).toHaveBeenCalledWith('MAX50');
  await act(async () => { button(r, 'Use code')!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith('/redeem-code?code=MAX50');
});

it('says all caught up first when nothing is waiting, and opens settings from the header', async () => {
  mockFetch.mockResolvedValue([item({ title: 'Old news', createdAt: '2026-10-01T10:00:00Z' })]);
  await act(async () => { r = create(<InboxScreen />); });
  const text = allText(r);
  expect(text).not.toContain('NEEDS YOU');
  expect(text.indexOf("You're all caught up")).toBeLessThan(text.indexOf('ACTIVITY'));
  expect(text).toContain('Nothing needs you right now.');
  await act(async () => { button(r, 'Notification settings')!.props.onPress(); });
  expect(router.push).toHaveBeenCalledWith('/notification-settings');
});

it('shows the empty message when there is nothing', async () => {
  mockFetch.mockResolvedValue([]);
  await act(async () => { r = create(<InboxScreen />); });
  expect(allText(r)).toContain('Nothing here yet');
  expect(allText(r)).not.toContain("You're all caught up");
});

it('a Defend card leaves once the server says the person is back ahead', async () => {
  const passed = item({ type: 'leaderboard_overtaken', screen: 'profile', params: { activeTab: 'profile', board: 'wra' },
    fields: { overtakenKind: 'score', boardName: 'Well-Rounded', byName: 'yahia_shinnawy' } });
  mockFetch.mockResolvedValue([passed]);
  mockStatus.mockResolvedValue({ [passed.id]: true });
  await act(async () => { r = create(<InboxScreen />); });
  expect(r.root.findAllByType(ActionCard)).toHaveLength(0);
  expect(r.root.findAllByType(TimelineRow).map((n) => n.props.item.id)).toEqual([passed.id]);
});

it('lists what arrived since the last visit under New, before the months', async () => {
  const fresh = item({ title: 'Fresh news', unread: true });
  const older = item({ title: 'Older news', createdAt: '2026-10-01T10:00:00Z' });
  mockFetch.mockResolvedValue([fresh, older]);
  await act(async () => { r = create(<InboxScreen />); });
  const text = allText(r);
  expect(text.indexOf('New')).toBeLessThan(text.indexOf('Fresh news'));
  expect(text.indexOf('Fresh news')).toBeLessThan(text.indexOf('October'));
  expect(mockMarkAllSeen).toHaveBeenCalledWith([fresh.id]);
});

it("folds a month's weekly challenges into one row that opens to show them", async () => {
  const days = (n: number) => new Date(Date.now() - n * 86400000);
  // Three starts in one month, all over a week old.
  const month = days(40);
  const at = (d: number) => new Date(month.getFullYear(), month.getMonth(), d, 12).toISOString();
  const a = item({ type: 'weekly_challenge_started', screen: 'weekly-challenge', fields: { challengeName: 'Beasts' }, createdAt: at(20) });
  const b = item({ type: 'weekly_challenge_started', screen: 'weekly-challenge', fields: { challengeName: 'Fresh start' }, createdAt: at(13) });
  const c = item({ type: 'weekly_challenge_started', screen: 'weekly-challenge', fields: { challengeName: 'Loop' }, createdAt: at(6) });
  mockFetch.mockResolvedValue([a, b, c]);
  mockStatus.mockResolvedValue({ [a.id]: true, [b.id]: true, [c.id]: true });
  await act(async () => { r = create(<InboxScreen />); });
  expect(r.root.findAllByType(ChallengeGroupRow)).toHaveLength(1);
  expect(r.root.findAllByType(TimelineRow)).toHaveLength(0);
  expect(allText(r)).toContain('3 weekly challenges started');
  expect(allText(r)).toContain('Beasts, Fresh start, Loop');
  await act(async () => { button(r, '3 weekly challenges started')!.props.onPress(); });
  expect(r.root.findAllByType(TimelineRow)).toHaveLength(3);
  // An old challenge's row opens nothing: the challenge screen shows this week's.
  await act(async () => { r.root.findAllByType(TimelineRow)[0].findByProps({ accessibilityRole: 'button' }).props.onPress(); });
  expect(router.push).not.toHaveBeenCalled();
});
