import React from 'react';
import { Image, Linking } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
const mockRefreshProfile = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ refreshProfile: mockRefreshProfile }) }));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
const mockClaimGift = jest.fn();
jest.mock('../../../services/InboxService', () => ({
  InboxService: { claimGift: (...args: unknown[]) => mockClaimGift(...args) },
}));
jest.mock('../../../lib/analytics', () => ({ track: jest.fn() }));
const mockSetString = jest.fn().mockResolvedValue(true);
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockSetString(...args) }));

import { MessageCard } from '../MessageCard';
import type { GiftClaim, InboxItem } from '../../../lib/inbox';

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}
const allText = (r: ReactTestRenderer) => texts(r.toJSON()).join(' | ');
const button = (r: ReactTestRenderer, label: string) =>
  r.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && texts(n.children as any).join('').includes(label))[0];

const base: InboxItem = {
  id: 'n1', type: 'admin_message', kind: 'news', title: 'New feature', body: 'Try it today', createdAt: '2026-11-17T10:00:00Z',
  unread: true, screen: null, params: {}, url: null, buttonLabel: null, imageUrl: null, popup: true, expiresAt: null,
  code: null, claimId: null, giftTier: null, giftDays: null, giftText: null,
};
const gift: InboxItem = { ...base, kind: 'gift', claimId: 'c1', giftTier: 'pro', giftDays: 14 };
const openClaim: GiftClaim = { id: 'c1', tier: 'pro', days: 14, claim_by: '2099-01-01T00:00:00Z', claimed_at: null };

let r: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => act(() => r?.unmount()));

describe('news', () => {
  it('shows the text and no button when it opens nothing', async () => {
    await act(async () => { r = create(<MessageCard item={base} source="inbox" />); });
    expect(allText(r)).toContain('New feature');
    expect(allText(r)).toContain('Try it today');
    expect(button(r, 'OPEN')).toBeUndefined();
  });

  it('opens its screen and closes the pop-up first', async () => {
    const onNavigate = jest.fn();
    await act(async () => { r = create(<MessageCard item={{ ...base, screen: 'weekly-challenge' }} source="prompt" onNavigate={onNavigate} />); });
    await act(async () => { button(r, 'OPEN').props.onPress(); });
    expect(onNavigate).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/weekly-challenge');
  });
});

describe('news extras', () => {
  it('passes params to the screen and uses its own button text', async () => {
    const item = { ...base, screen: 'weekly-challenge', params: { tab: 'team' }, buttonLabel: 'JOIN A TEAM' };
    await act(async () => { r = create(<MessageCard item={item} source="inbox" />); });
    await act(async () => { button(r, 'JOIN A TEAM').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/weekly-challenge?tab=team');
  });

  it('opens a web link outside the app instead of a screen', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => { r = create(<MessageCard item={{ ...base, url: 'https://example.com/post', screen: 'profile' }} source="inbox" />); });
    await act(async () => { button(r, 'OPEN').props.onPress(); });
    expect(openURL).toHaveBeenCalledWith('https://example.com/post');
    expect(mockPush).not.toHaveBeenCalled();
    openURL.mockRestore();
  });

  it('shows a picture when the message has one', async () => {
    await act(async () => { r = create(<MessageCard item={{ ...base, imageUrl: 'https://example.com/a.jpg' }} source="inbox" />); });
    expect(r.root.findAllByType(Image).map((i) => i.props.source.uri)).toEqual(['https://example.com/a.jpg']);
  });
});

describe("the app's own notifications", () => {
  it('opens the screen the notification points to, with its params', async () => {
    const item: InboxItem = { ...base, type: 'program_review_ready', title: 'Your program review is ready', screen: 'warrior-program', params: { review_id: 'r1' }, popup: false };
    await act(async () => { r = create(<MessageCard item={item} source="inbox" />); });
    await act(async () => { button(r, 'OPEN').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/warrior-program?review_id=r1');
  });
});

describe('discount code', () => {
  it('shows the code and opens Redeem a Code with it', async () => {
    await act(async () => { r = create(<MessageCard item={{ ...base, kind: 'discount', code: 'LEAP30' }} source="inbox" />); });
    expect(allText(r)).toContain('LEAP30');
    await act(async () => { button(r, 'USE CODE').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/redeem-code?code=LEAP30');
  });

  it('copies the code with one tap and says so', async () => {
    await act(async () => { r = create(<MessageCard item={{ ...base, kind: 'discount', code: 'LEAP30' }} source="inbox" />); });
    await act(async () => { button(r, 'Copy').props.onPress(); });
    expect(mockSetString).toHaveBeenCalledWith('LEAP30');
    expect(allText(r)).toContain('Copied');
  });
});

describe('gift', () => {
  it('claims the gift, shows the end date and refreshes the profile', async () => {
    mockClaimGift.mockResolvedValue({ ok: true, tier: 'pro', days: 14, accessExpiresAt: '2026-12-01T10:00:00Z' });
    const onClaimed = jest.fn();
    await act(async () => { r = create(<MessageCard item={gift} claim={openClaim} source="inbox" onClaimed={onClaimed} />); });
    expect(allText(r)).toContain('PRO · 14 days free');
    await act(async () => { button(r, 'CLAIM GIFT').props.onPress(); });
    expect(mockClaimGift).toHaveBeenCalledWith('c1');
    expect(allText(r)).toContain('Your plan is active until');
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(mockRefreshProfile).toHaveBeenCalled();
    expect(onClaimed).toHaveBeenCalledWith('c1');
  });

  it("shows the server's reason and keeps the button when the claim is refused", async () => {
    mockClaimGift.mockResolvedValue({ ok: false, error: 'HAS_ACTIVE_SUBSCRIPTION' });
    await act(async () => { r = create(<MessageCard item={gift} claim={openClaim} source="inbox" />); });
    await act(async () => { button(r, 'CLAIM GIFT').props.onPress(); });
    expect(allText(r)).toContain('You already have a subscription');
    expect(button(r, 'CLAIM GIFT')).toBeDefined();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it('switches to Claimed when the server says it was already claimed (e.g. on another phone)', async () => {
    mockClaimGift.mockResolvedValue({ ok: false, error: 'ALREADY_CLAIMED' });
    await act(async () => { r = create(<MessageCard item={gift} claim={openClaim} source="inbox" />); });
    await act(async () => { button(r, 'CLAIM GIFT').props.onPress(); });
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(allText(r)).toContain('Gift claimed');
  });

  it('switches to Expired when the server says the deadline passed', async () => {
    mockClaimGift.mockResolvedValue({ ok: false, error: 'EXPIRED' });
    await act(async () => { r = create(<MessageCard item={gift} claim={openClaim} source="inbox" />); });
    await act(async () => { button(r, 'CLAIM GIFT').props.onPress(); });
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(allText(r)).toContain('expired');
  });

  it('falls back to the general message for an unknown error', async () => {
    mockClaimGift.mockResolvedValue({ ok: false, error: 'SOMETHING_NEW' });
    await act(async () => { r = create(<MessageCard item={gift} claim={openClaim} source="inbox" />); });
    await act(async () => { button(r, 'CLAIM GIFT').props.onPress(); });
    expect(allText(r)).toContain("Couldn't claim the gift");
  });

  it('has no claim button once claimed or expired', async () => {
    await act(async () => { r = create(<MessageCard item={gift} claim={{ ...openClaim, claimed_at: '2026-11-17T11:00:00Z' }} source="inbox" />); });
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(allText(r)).toContain('Gift claimed.');
    await act(async () => { r.update(<MessageCard item={gift} claim={{ ...openClaim, claim_by: '2020-01-01T00:00:00Z' }} source="inbox" />); });
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
    expect(allText(r)).toContain('This gift has expired.');
  });

  it('a gift that is not a plan shows its own text and a plain claimed line', async () => {
    mockClaimGift.mockResolvedValue({ ok: true, tier: null, days: null, accessExpiresAt: null });
    const item = { ...gift, giftTier: null, giftDays: null, giftText: '50 Journey points' };
    await act(async () => { r = create(<MessageCard item={item} claim={openClaim} source="inbox" />); });
    expect(allText(r)).toContain('50 Journey points');
    await act(async () => { button(r, 'CLAIM GIFT').props.onPress(); });
    expect(allText(r)).toContain('Gift claimed.');
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
  });

  it('still offers the claim button when the claim could not be loaded (the server checks it)', async () => {
    await act(async () => { r = create(<MessageCard item={gift} source="inbox" />); });
    expect(button(r, 'CLAIM GIFT')).toBeDefined();
  });
});
