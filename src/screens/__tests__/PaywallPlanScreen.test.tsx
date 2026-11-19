import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark', theme: { background: { primary: '#000' }, text: { primary: '#fff', secondary: '#999' } } }) }));
let mockProfile: Record<string, unknown> = {};
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: mockProfile, paywallEnabled: true, refreshProfile: jest.fn() }),
}));
let mockFrom: string | undefined = 'profile_badge';
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, back: jest.fn(), canGoBack: () => true, canDismiss: () => false, dismissAll: jest.fn() }),
  useNavigation: () => ({ addListener: () => () => { } }),
  useLocalSearchParams: () => ({ from: mockFrom }),
}));
const mockPresent = jest.fn(() => new Promise(() => { }));
jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: { presentPaywall: () => mockPresent() },
  PAYWALL_RESULT: { PURCHASED: 'PURCHASED', RESTORED: 'RESTORED', CANCELLED: 'CANCELLED' },
}));
jest.mock('react-native-purchases', () => ({ __esModule: true, default: { restorePurchases: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/analytics', () => ({ track: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../components/LeapLogo', () => ({ LeapLogo: () => null }));

import { PaywallScreen } from '../PaywallScreen';

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
    && texts(n.children as any).join('').includes(label))[0];

const future = new Date(Date.now() + 10 * 864e5).toISOString();
const past = '2026-10-01T10:00:00Z';
let r: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); mockFrom = 'profile_badge'; });
afterEach(() => act(() => r?.unmount()));

it('Free, from the badge: shows the plan and what upgrading unlocks, not the store right away', async () => {
  mockProfile = { id: 'u1', subscription_tier: null, access_expires_at: null };
  await act(async () => { r = create(<PaywallScreen />); });
  const text = allText(r);
  expect(text).toContain('Unlock the full app');
  expect(text).toContain('FREE');
  expect(text).toContain('CURRENT PLAN');
  expect(text).toContain('UPGRADE TO UNLOCK');
  expect(text).toContain('Your AI Coach');
  expect(text).toContain('Every program and workout');
  expect(text).toContain('Custom programs');
  expect(mockPresent).not.toHaveBeenCalled();
  await act(async () => { button(r, 'SEE PLANS').props.onPress(); });
  expect(mockPresent).toHaveBeenCalled();
});

it('Expired: names the plan that ended and when', async () => {
  mockProfile = { id: 'u1', subscription_tier: 'pro', access_expires_at: past, rc_original_transaction_id: 'tx1' };
  await act(async () => { r = create(<PaywallScreen />); });
  const text = allText(r);
  expect(text).toContain('Your plan has ended');
  expect(text).toContain('PRO');
  expect(text).toContain('EXPIRED');
  expect(text).toContain('Ended on');
  expect(text).toContain('RENEW TO GET THESE BACK');
});

it('Active: unchanged, with its end date and no unlock list', async () => {
  mockProfile = { id: 'u1', subscription_tier: 'max', access_expires_at: future };
  await act(async () => { r = create(<PaywallScreen />); });
  const text = allText(r);
  expect(text).toContain('Change Your Plan');
  expect(text).toContain('Active until');
  expect(text).not.toContain('UPGRADE TO UNLOCK');
});

it('the code link opens Redeem a Code', async () => {
  mockProfile = { id: 'u1' };
  await act(async () => { r = create(<PaywallScreen />); });
  await act(async () => { button(r, 'Have a code?').props.onPress(); });
  expect(mockReplace).toHaveBeenCalledWith('/redeem-code');
});

it('opened from a feature gate, a free user still goes straight to the plans', async () => {
  mockFrom = 'customize_program';
  mockProfile = { id: 'u1' };
  await act(async () => { r = create(<PaywallScreen />); });
  expect(allText(r)).not.toContain('UPGRADE TO UNLOCK');
});
