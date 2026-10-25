import React from 'react';
import { Platform, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import Purchases from 'react-native-purchases';

jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
const mockRefreshProfile = jest.fn();
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { subscription_tier: null, access_expires_at: null }, refreshProfile: mockRefreshProfile }),
}));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    getProducts: jest.fn(),
    purchaseSubscriptionOption: jest.fn(),
    presentCodeRedemptionSheet: jest.fn().mockResolvedValue(undefined),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
  },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, canDismiss: () => false, replace: jest.fn() } }));
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args), functions: { invoke: jest.fn() } },
}));
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

const codeOption = { id: 'pro-1month:pro-1month-code', tags: ['rc-ignore-offer'] };
const P = Purchases as unknown as Record<string, jest.Mock>;

let r: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => act(() => r?.unmount()));

async function redeem(typed: string) {
  await act(async () => { r = create(<RedeemCodeScreen />); });
  await act(async () => { r.root.findByType(TextInput).props.onChangeText(typed); });
  await act(async () => { button(r, 'REDEEM').props.onPress(); });
}

describe('Android: Leap codes checked by the server, bought in-app', () => {
  beforeEach(() => { jest.replaceProperty(Platform, 'OS', 'android'); });
  afterEach(() => { jest.restoreAllMocks(); });

  it('rejects a code with symbols without asking the server', async () => {
    await redeem('LEAP-30');
    expect(mockRpc).not.toHaveBeenCalled();
    expect(allText(r)).toContain('letters and numbers only');
  });

  it("shows the server's reason when a code is refused", async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: false, error: 'CODE_USED_UP' }, error: null });
    await redeem('leap30');
    expect(mockRpc).toHaveBeenCalledWith('claim_promo_code', { p_code: 'LEAP30' });
    expect(P.purchaseSubscriptionOption).not.toHaveBeenCalled();
    expect(allText(r)).toContain('used up');
  });

  it('buys exactly the offer the server named', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: { ok: true, code: 'LEAP30', product_id: 'pro:pro-1month', offer_id: 'pro-1month-code' }, error: null })
      .mockResolvedValue({ data: null, error: null });
    P.getProducts.mockResolvedValueOnce([
      { identifier: 'pro:pro-2months', subscriptionOptions: [] },
      { identifier: 'pro:pro-1month', subscriptionOptions: [{ id: 'pro-1month', tags: [] }, codeOption] },
    ]);
    P.purchaseSubscriptionOption.mockResolvedValueOnce({});
    await redeem(' leap 30 ');
    expect(P.getProducts).toHaveBeenCalledWith(['pro']);
    expect(P.purchaseSubscriptionOption).toHaveBeenCalledWith(codeOption);
    expect(mockRpc).toHaveBeenCalledWith('mark_promo_code_purchased', { p_code: 'LEAP30' });
  });

  it('says the offer is unavailable when Play does not return it', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, code: 'LEAP30', product_id: 'pro:pro-1month', offer_id: 'pro-1month-code' }, error: null });
    P.getProducts.mockResolvedValueOnce([{ identifier: 'pro:pro-1month', subscriptionOptions: [{ id: 'pro-1month', tags: [] }] }]);
    await redeem('LEAP30');
    expect(P.purchaseSubscriptionOption).not.toHaveBeenCalled();
    expect(allText(r)).toContain("isn't available on your device");
  });

  it('closing Google\'s sheet is not an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, code: 'LEAP30', product_id: 'pro:pro-1month', offer_id: 'pro-1month-code' }, error: null });
    P.getProducts.mockResolvedValueOnce([{ identifier: 'pro:pro-1month', subscriptionOptions: [codeOption] }]);
    P.purchaseSubscriptionOption.mockRejectedValueOnce({ userCancelled: true });
    await redeem('LEAP30');
    expect(allText(r)).not.toContain('Something went wrong');
    expect(r.root.findAllByType(TextInput)).toHaveLength(1);
  });
});

describe("iOS: Apple's own code sheet", () => {
  it('has no code box and opens the StoreKit sheet, then listens for the purchase', async () => {
    await act(async () => { r = create(<RedeemCodeScreen />); });
    expect(r.root.findAllByType(TextInput)).toHaveLength(0);
    await act(async () => { button(r, 'ENTER YOUR CODE').props.onPress(); });
    expect(P.presentCodeRedemptionSheet).toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(P.addCustomerInfoUpdateListener).toHaveBeenCalled();
    expect(allText(r)).toContain("Apple's window");
  });
});
