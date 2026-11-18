import React from 'react';
import { TouchableOpacity } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../CommunitySection', () => ({ CommunitySection: () => null }));
jest.mock('../OfferGiftChip', () => ({ OfferGiftChip: () => null }));
jest.mock('../../../services/LeaderboardService', () => ({}));
jest.mock('../../../hooks/useTutorialTarget', () => ({ useTutorialTarget: () => ({ ref: { current: null }, onLayout: () => {} }) }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: () => null }));
jest.mock('expo-linear-gradient', () => ({ LinearGradient: ({ children }: any) => children ?? null }));

import { ProfileHeader } from '../ProfileHeader';

const DAY = 24 * 60 * 60 * 1000;
const future = new Date(Date.now() + 10 * DAY).toISOString();
const past = new Date(Date.now() - 10 * DAY).toISOString();

function texts(node: any, acc: string[] = []): string[] {
  if (!node) return acc;
  if (Array.isArray(node)) { node.forEach((n) => texts(n, acc)); return acc; }
  if (typeof node === 'string') { acc.push(node); return acc; }
  if (node.children) texts(node.children, acc);
  return acc;
}

let r: ReactTestRenderer;
afterEach(() => act(() => r?.unmount()));

function renderBadge(profile: Record<string, unknown>, paywallEnabled = true) {
  const onOpenPaywall = jest.fn();
  act(() => {
    r = create(
      <ProfileHeader
        profile={{ display_name: 'omar17', ...profile }}
        paywallEnabled={paywallEnabled}
        category="strength"
        activeCurrentTier={3}
        mode="dark"
        theme={{ text: {}, background: {} }}
        wraScore={0}
        staticPts={0}
        powerPts={0}
        mmPts={0}
        gloryPts={0}
        GLORY_MAX={100}
        onShowWarriorModal={jest.fn()}
        onOpenAdmin={jest.fn()}
        onOpenPaywall={onOpenPaywall}
        onFetchWRALeaderboard={jest.fn()}
        onOpenCommunityLeaderboard={jest.fn()}
        onFetchGloryLeaderboard={jest.fn()}
      />,
    );
  });
  const badge = r.root
    .findAllByType(TouchableOpacity)
    .find((n) => ['FREE', 'FIRST', 'PRO', 'MAX', 'EXPIRED'].includes(texts(n.children as any).join('')))!;
  return { badge, onOpenPaywall, label: texts(badge.children as any).join('') };
}

describe('plan badge on Profile', () => {
  it('a Pro plan opens the plan screen', () => {
    const { badge, label } = renderBadge({ subscription_tier: 'pro', access_expires_at: future });
    expect(label).toBe('PRO');
    expect(badge.props.disabled).toBe(false);
  });

  it('a bought or gifted Max plan opens the plan screen too', () => {
    const { badge, label, onOpenPaywall } = renderBadge({ subscription_tier: 'max', access_expires_at: future });
    expect(label).toBe('MAX');
    expect(badge.props.disabled).toBe(false);
    act(() => badge.props.onPress());
    expect(onOpenPaywall).toHaveBeenCalled();
  });

  it('Max from being a coach, with no plan, stays a plain label', () => {
    const { badge, label } = renderBadge({ is_coach: true, subscription_tier: null, access_expires_at: null });
    expect(label).toBe('MAX');
    expect(badge.props.disabled).toBe(true);
  });

  it('Max because the paywall is off stays a plain label', () => {
    const { badge, label } = renderBadge({ subscription_tier: null, access_expires_at: null }, false);
    expect(label).toBe('MAX');
    expect(badge.props.disabled).toBe(true);
  });

  it('an ended plan they bought shows EXPIRED and opens the plans', () => {
    const { badge, label } = renderBadge({ subscription_tier: 'max', access_expires_at: past, entitlement_source: 'rc_subscription', rc_original_transaction_id: 'tx1' });
    expect(label).toBe('EXPIRED');
    expect(badge.props.disabled).toBe(false);
  });

  it('an ended gift shows FREE, not EXPIRED (they never subscribed)', () => {
    const { badge, label } = renderBadge({ subscription_tier: 'pro', access_expires_at: past, entitlement_source: 'admin_grant' });
    expect(label).toBe('FREE');
    expect(badge.props.disabled).toBe(false);
  });
});
