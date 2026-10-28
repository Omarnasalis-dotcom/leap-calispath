jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../appVersion', () => ({ checkFirstTimeOfferEnabled: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { checkFirstTimeOfferEnabled } from '../appVersion';
import { isOfferAudience, isOfferDue, loadOfferSeen, markOfferSeen, offerDue, offerPrice } from '../offerPrompt';

const free = { is_admin: false, is_coach: false, subscription_tier: null, access_expires_at: null };
const base = { platform: 'ios', paywallEnabled: true, offerEnabled: true, profile: free };

describe('isOfferAudience', () => {
  it('is a free user who never subscribed, on a phone, with both switches on', () => {
    expect(isOfferAudience(base)).toBe(true);
    expect(isOfferAudience({ ...base, platform: 'android' })).toBe(true);
  });

  it('excludes web, switches off, admins, coaches and anyone who ever had a plan', () => {
    expect(isOfferAudience({ ...base, platform: 'web' })).toBe(false);
    expect(isOfferAudience({ ...base, paywallEnabled: false })).toBe(false);
    expect(isOfferAudience({ ...base, offerEnabled: false })).toBe(false);
    expect(isOfferAudience({ ...base, profile: null })).toBe(false);
    expect(isOfferAudience({ ...base, profile: { ...free, is_admin: true } })).toBe(false);
    expect(isOfferAudience({ ...base, profile: { ...free, is_coach: true } })).toBe(false);
    expect(isOfferAudience({ ...base, profile: { ...free, subscription_tier: 'pro' } })).toBe(false);
    expect(isOfferAudience({ ...base, profile: { ...free, access_expires_at: '2026-01-01T00:00:00Z' } })).toBe(false);
  });
});

describe('offerDue', () => {
  it('shows each moment once', () => {
    expect(offerDue('assessment', {})).toBe(true);
    expect(offerDue('assessment', { assessment: 'x' })).toBe(false);
    expect(offerDue('program_complete', { assessment: 'x' })).toBe(true);
    expect(offerDue('program_complete', { program_complete: 'x' })).toBe(false);
  });

  it('always shows the Profile gift, seen or not', () => {
    expect(offerDue('banner', {})).toBe(true);
    expect(offerDue('banner', { assessment: 'x', program_complete: 'y' })).toBe(true);
  });
});

describe('seen storage', () => {
  beforeEach(() => AsyncStorage.clear());

  it('remembers per user and keeps the first date', async () => {
    await markOfferSeen('u1', 'assessment');
    const first = (await loadOfferSeen('u1')).assessment;
    await markOfferSeen('u1', 'assessment');
    expect((await loadOfferSeen('u1')).assessment).toBe(first);
    expect(await loadOfferSeen('u2')).toEqual({});
  });

  it('treats unreadable storage as nothing seen', async () => {
    await AsyncStorage.setItem('welcome_offer_seen_u1', 'not json');
    expect(await loadOfferSeen('u1')).toEqual({});
  });
});

describe('isOfferDue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.replaceProperty(Platform, 'OS', 'ios');
    (checkFirstTimeOfferEnabled as jest.Mock).mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  it('asks the server switch only for the audience', async () => {
    (checkFirstTimeOfferEnabled as jest.Mock).mockResolvedValue(true);
    await expect(isOfferDue('assessment', { userId: 'u1', paywallEnabled: true, profile: { ...free, subscription_tier: 'pro' } })).resolves.toBe(false);
    expect(checkFirstTimeOfferEnabled).not.toHaveBeenCalled();
    await expect(isOfferDue('assessment', { userId: 'u1', paywallEnabled: true, profile: free })).resolves.toBe(true);
  });

  it('respects the switch and what was seen', async () => {
    (checkFirstTimeOfferEnabled as jest.Mock).mockResolvedValue(false);
    await expect(isOfferDue('assessment', { userId: 'u1', paywallEnabled: true, profile: free })).resolves.toBe(false);
    (checkFirstTimeOfferEnabled as jest.Mock).mockResolvedValue(true);
    await markOfferSeen('u1', 'assessment');
    await expect(isOfferDue('assessment', { userId: 'u1', paywallEnabled: true, profile: free })).resolves.toBe(false);
    await expect(isOfferDue('banner', { userId: 'u1', paywallEnabled: true, profile: free })).resolves.toBe(true);
  });
});

describe('offerPrice', () => {
  const intro = { price: 999.99, priceString: 'E£999.99', cycles: 2, periodUnit: 'MONTH', periodNumberOfUnits: 1 };

  it('reads the intro offer of Pro 1 month', () => {
    expect(offerPrice({ price: 1299, priceString: 'E£1,299', introPrice: intro }))
      .toEqual({ regular: 'E£1,299', intro: 'E£999.99', percentOff: 23, months: 2 });
  });

  it('counts months across multi-month periods', () => {
    expect(offerPrice({ price: 2149, priceString: 'x', introPrice: { ...intro, price: 1799, cycles: 1, periodNumberOfUnits: 2 } })?.months).toBe(2);
    expect(offerPrice({ price: 2149, priceString: 'x', introPrice: { ...intro, price: 1799, periodUnit: 'WEEK' } })?.months).toBeNull();
  });

  it('is null without a real discount', () => {
    expect(offerPrice(null)).toBeNull();
    expect(offerPrice({ price: 1299, priceString: 'x', introPrice: null })).toBeNull();
    expect(offerPrice({ price: 1299, priceString: 'x', introPrice: { ...intro, price: 1299 } })).toBeNull();
    expect(offerPrice({ price: 1299, priceString: 'x', introPrice: { ...intro, price: 0 } })).toBeNull();
  });
});
