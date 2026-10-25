import React from 'react';
import { Linking, Platform, TextInput } from 'react-native';
import Purchases from 'react-native-purchases';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
const mockRefreshProfile = jest.fn();
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { subscription_tier: null, access_expires_at: null }, refreshProfile: mockRefreshProfile }),
}));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    syncPurchases: jest.fn(),
    presentCodeRedemptionSheet: jest.fn().mockResolvedValue(undefined),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, canDismiss: () => false, replace: jest.fn() } }));
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../../lib/analytics', () => ({ track: jest.fn() }));

import { RedeemCodeScreen } from '../RedeemCodeScreen';

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

let r: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => act(() => r?.unmount()));

describe('Android: our code box, then the Google Play redeem link', () => {
  beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('rejects a code with symbols and opens nothing', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => { r = create(<RedeemCodeScreen />); });
    await act(async () => { r.root.findByType(TextInput).props.onChangeText('LEAP-30'); });
    await act(async () => { button(r, 'REDEEM').props.onPress(); });
    expect(open).not.toHaveBeenCalled();
    expect(allText(r)).toContain('letters and numbers only');
  });

  it('opens Google Play with the cleaned-up code, then waits for the user', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => { r = create(<RedeemCodeScreen />); });
    await act(async () => { r.root.findByType(TextInput).props.onChangeText(' LEAP 30 '); });
    await act(async () => { button(r, 'REDEEM').props.onPress(); });
    expect(open).toHaveBeenCalledWith('https://play.google.com/redeem?code=LEAP30');
    expect(allText(r)).toContain("I'VE REDEEMED IT");
  });
});

describe("iOS: Apple's own code sheet", () => {
  it('has no code box and opens the StoreKit sheet, then listens for the purchase', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await act(async () => { r = create(<RedeemCodeScreen />); });
    expect(r.root.findAllByType(TextInput)).toHaveLength(0);
    await act(async () => { button(r, 'ENTER YOUR CODE').props.onPress(); });
    expect(Purchases.presentCodeRedemptionSheet).toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalled();
    expect(allText(r)).toContain("Apple's window");
  });
});
