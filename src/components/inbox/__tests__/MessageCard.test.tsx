import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

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
  id: 'n1', kind: 'news', title: 'New feature', body: 'Try it today', createdAt: '2026-11-17T10:00:00Z',
  unread: true, screen: null, code: null, claimId: null, giftTier: null, giftDays: null,
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

describe('discount code', () => {
  it('shows the code and opens Redeem a Code with it', async () => {
    await act(async () => { r = create(<MessageCard item={{ ...base, kind: 'discount', code: 'LEAP30' }} source="inbox" />); });
    expect(allText(r)).toContain('LEAP30');
    await act(async () => { button(r, 'USE CODE').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/redeem-code?code=LEAP30');
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

  it('has no claim button while the claim could not be loaded', async () => {
    await act(async () => { r = create(<MessageCard item={gift} source="inbox" />); });
    expect(button(r, 'CLAIM GIFT')).toBeUndefined();
  });
});
