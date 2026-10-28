import React from 'react';
import { Platform } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import Purchases from 'react-native-purchases';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ mode: 'dark' }) }));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1, INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2 },
  default: { getOfferings: jest.fn(), checkTrialOrIntroductoryPriceEligibility: jest.fn(), getAppUserID: jest.fn(() => Promise.resolve('u1')) },
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() } }));
const mockTrack = jest.fn();
jest.mock('../../lib/analytics', () => ({ track: (...a: unknown[]) => mockTrack(...a) }));
jest.mock('../../lib/appVersion', () => ({ checkFirstTimeOfferEnabled: jest.fn() }));

import { WelcomeOfferScreen } from '../WelcomeOfferScreen';
import { loadOfferSeen } from '../../lib/offerPrompt';
import { clearOfferCache } from '../../lib/offerStore';

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
    && (texts(n.children as any).join('').includes(label) || n.props.accessibilityLabel === label))[0];

const P = Purchases as unknown as Record<string, jest.Mock>;
const R = router as unknown as Record<string, jest.Mock>;
const proPackage = (introPrice: unknown) => ({
  current: {
    availablePackages: [
      { identifier: 'first', product: { identifier: 'first', price: 699, priceString: 'E£699', introPrice: null } },
      { identifier: 'pro_1month', product: { identifier: 'pro.1month', price: 1299, priceString: 'E£1,299', introPrice } },
    ],
  },
});
const intro = { price: 999.99, priceString: 'E£999.99', cycles: 2, periodUnit: 'MONTH', periodNumberOfUnits: 1 };

let r: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); clearOfferCache(); });
afterEach(() => { act(() => r?.unmount()); jest.restoreAllMocks(); });

async function open(trigger: 'assessment' | 'program_complete' | 'banner' = 'assessment') {
  await act(async () => { r = create(<WelcomeOfferScreen trigger={trigger} />); });
}

it('shows the intro price, the renewal price and the discount', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  P.getOfferings.mockResolvedValue(proPackage(intro));
  await open();
  const text = allText(r);
  expect(text).toContain('A welcome gift for you');
  expect(text).toContain('E£999.99 / month');
  expect(text).toContain('for your first 2 months, then E£1,299 / month');
  expect(text).toContain('−23%');
  expect(mockTrack).toHaveBeenCalledWith('offer_screen_viewed', { trigger: 'assessment', percent_off: 23 });
  expect((await loadOfferSeen('u1')).assessment).toBeTruthy();
});

it('claim opens the paywall and the code link opens Redeem a Code, in its place', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  P.getOfferings.mockResolvedValue(proPackage(intro));
  await open('program_complete');
  expect(allText(r)).toContain('Program complete!');
  await act(async () => { button(r, 'CLAIM MY OFFER').props.onPress(); });
  expect(R.replace).toHaveBeenCalledWith('/paywall?from=welcome_offer_program_complete');
  act(() => r.unmount());
  await open();
  await act(async () => { button(r, 'Have a code?').props.onPress(); });
  expect(R.replace).toHaveBeenCalledWith('/redeem-code');
});

it('closing goes back to where it was opened from', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  P.getOfferings.mockResolvedValue(proPackage(intro));
  await open();
  await act(async () => { button(r, 'Maybe later').props.onPress(); });
  expect(R.back).toHaveBeenCalled();
  expect(mockTrack).toHaveBeenCalledWith('offer_dismissed', { trigger: 'assessment' });
});

it('leaves at once when the store has no offer for this person', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  P.getOfferings.mockResolvedValue(proPackage(null));
  await open();
  expect(R.back).toHaveBeenCalled();
  expect(mockTrack).not.toHaveBeenCalledWith('offer_screen_viewed', expect.anything());
});

it('on iOS, leaves when Apple says the account is not eligible', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  P.getOfferings.mockResolvedValue(proPackage(intro));
  P.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({ 'pro.1month': { status: 1 } });
  await open();
  expect(R.back).toHaveBeenCalled();
});

it('leaves when the store fails to load', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  P.getOfferings.mockRejectedValue(new Error('offline'));
  await open();
  expect(R.back).toHaveBeenCalled();
});

it('counts the moment as seen only once the offer shows', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await AsyncStorage.clear();
  P.getOfferings.mockResolvedValue(proPackage(null));
  await open();
  expect((await loadOfferSeen('u1')).assessment).toBeUndefined();
});

it('keeps the store answer for the session, per account', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  P.getOfferings.mockResolvedValue(proPackage(intro));
  await open();
  act(() => r.unmount());
  await open();
  expect(P.getOfferings).toHaveBeenCalledTimes(1);
  act(() => r.unmount());
  P.getAppUserID.mockResolvedValueOnce('u2');
  await open();
  expect(P.getOfferings).toHaveBeenCalledTimes(2);
});
