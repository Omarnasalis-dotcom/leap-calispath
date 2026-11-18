import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

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
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
const mockFetch = jest.fn();
const mockClaims = jest.fn();
jest.mock('../../services/InboxService', () => ({
  InboxService: {
    fetchInbox: () => mockFetch(),
    fetchGiftClaims: () => mockClaims(),
    markAllSeen: jest.fn(),
    claimGift: jest.fn(),
  },
}));

import { InboxScreen } from '../InboxScreen';
import { MessageCard } from '../../components/inbox/MessageCard';
import { MessageRow } from '../../components/inbox/MessageRow';
import { showsFullCard, type InboxItem } from '../../lib/inbox';

const base: InboxItem = {
  id: 'n1', type: 'admin_message', kind: 'news', title: 'New feature', body: 'Try it today', createdAt: '2026-11-17T10:00:00Z',
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

describe('showsFullCard', () => {
  const claim = { id: 'c1', tier: 'pro', days: 7, claim_by: later, claimed_at: null };
  it('is a full card when new, or a gift still to claim', () => {
    expect(showsFullCard({ ...base, unread: true }, undefined, Date.now())).toBe(true);
    expect(showsFullCard(base, undefined, Date.now())).toBe(false);
    const gift = { ...base, kind: 'gift' as const, claimId: 'c1' };
    expect(showsFullCard(gift, claim, Date.now())).toBe(true);
    expect(showsFullCard(gift, undefined, Date.now())).toBe(true);
    expect(showsFullCard(gift, { ...claim, claimed_at: '2026-11-17T11:00:00Z' }, Date.now())).toBe(false);
    expect(showsFullCard(gift, { ...claim, claim_by: '2020-01-01T00:00:00Z' }, Date.now())).toBe(false);
  });
});

describe('Notifications screen', () => {
  let r: ReactTestRenderer;
  afterEach(() => act(() => r?.unmount()));

  it('shows new ones as cards and opened ones as one-line rows under EARLIER', async () => {
    mockFetch.mockResolvedValue([
      { ...base, id: 'new', unread: true, title: 'New Program Assigned!', type: 'client_program_update' },
      { ...base, id: 'g1', kind: 'gift', title: 'gifttt', claimId: 'c1', giftTier: 'pro', giftDays: 7 },
      { ...base, id: 'old', title: 'Old news' },
    ]);
    mockClaims.mockResolvedValue({ c1: { id: 'c1', tier: 'pro', days: 7, claim_by: later, claimed_at: '2026-11-17T11:00:00Z' } });
    await act(async () => { r = create(<InboxScreen />); });

    expect(r.root.findAllByType(MessageCard).map((n) => n.props.item.id)).toEqual(['new']);
    expect(r.root.findAllByType(MessageRow).map((n) => n.props.item.id)).toEqual(['g1', 'old']);
    const text = allText(r);
    expect(text).toContain('EARLIER');
    expect(text).toContain('PRO · 7 days free · Claimed');
  });

  it('opens a row as the full card in place, and folds it back', async () => {
    mockFetch.mockResolvedValue([
      { ...base, id: 'a', title: 'First' },
      { ...base, id: 'b', title: 'Second', screen: 'weekly-challenge' },
      { ...base, id: 'c', title: 'Third' },
    ]);
    mockClaims.mockResolvedValue({});
    await act(async () => { r = create(<InboxScreen />); });
    expect(allText(r)).not.toContain('EARLIER');

    const second = r.root.findAllByType(MessageRow).find((n) => n.props.item.id === 'b')!;
    await act(async () => { second.props.onPress(); });
    expect(r.root.findAllByType(MessageCard).map((n) => n.props.item.id)).toEqual(['b']);
    expect(r.root.findAllByType(MessageRow).map((n) => n.props.item.id)).toEqual(['a', 'c']);

    await act(async () => { r.root.findByType(MessageCard).props.onCollapse(); });
    expect(r.root.findAllByType(MessageCard)).toHaveLength(0);
    expect(r.root.findAllByType(MessageRow)).toHaveLength(3);
  });

  it('keeps a gift that is still waiting to be claimed as a full card', async () => {
    mockFetch.mockResolvedValue([{ ...base, id: 'g', kind: 'gift', title: 'A gift', claimId: 'c1', giftTier: 'pro', giftDays: 7 }]);
    mockClaims.mockResolvedValue({ c1: { id: 'c1', tier: 'pro', days: 7, claim_by: later, claimed_at: null } });
    await act(async () => { r = create(<InboxScreen />); });
    expect(r.root.findAllByType(MessageCard).map((n) => n.props.item.id)).toEqual(['g']);
    expect(allText(r)).toContain('CLAIM GIFT');
  });
});
