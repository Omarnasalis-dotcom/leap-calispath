jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { checkPlanWelcome, markPlanWelcomeShown, notePlanBeforeChange, paidTier, welcomeFor } from '../planWelcome';
import type { Profile } from '../../types';

const future = new Date(Date.now() + 7 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();
const person = (over: Partial<Profile> = {}) =>
  ({ id: 'u1', subscription_tier: null, access_expires_at: null, is_admin: false, is_coach: false, ...over }) as unknown as Profile;
const free = person();
const pro = person({ subscription_tier: 'pro', access_expires_at: future } as Partial<Profile>);
const max = person({ subscription_tier: 'max', access_expires_at: future } as Partial<Profile>);
const endedMax = person({ subscription_tier: 'max', access_expires_at: past } as Partial<Profile>);

beforeEach(async () => { await AsyncStorage.clear(); });

describe('welcomeFor', () => {
  it('welcomes a new Pro or Max plan, and marks Pro → Max as an upgrade', () => {
    expect(welcomeFor('free', 'pro')).toEqual({ tier: 'pro', upgrade: false });
    expect(welcomeFor('free', 'max')).toEqual({ tier: 'max', upgrade: false });
    expect(welcomeFor('first', 'pro')).toEqual({ tier: 'pro', upgrade: false });
    expect(welcomeFor('pro', 'max')).toEqual({ tier: 'max', upgrade: true });
  });

  it('says nothing for the same plan, a lower plan or First', () => {
    expect(welcomeFor('pro', 'pro')).toBeNull();
    expect(welcomeFor('max', 'pro')).toBeNull();
    expect(welcomeFor('free', 'first')).toBeNull();
    expect(welcomeFor('pro', 'free')).toBeNull();
  });
});

describe('paidTier', () => {
  it('is free once the plan has ended', () => {
    expect(paidTier(endedMax)).toBe('free');
    expect(paidTier(pro)).toBe('pro');
    expect(paidTier(null)).toBe('free');
  });
});

describe('checkPlanWelcome', () => {
  it('only records the plan on the first look (people already on a plan get nothing)', async () => {
    expect(await checkPlanWelcome(pro, true)).toBeNull();
    expect(await checkPlanWelcome(pro, true)).toBeNull();
  });

  it('welcomes a plan gained after the first look, once', async () => {
    await checkPlanWelcome(free, true);
    expect(await checkPlanWelcome(pro, true)).toEqual({ tier: 'pro', upgrade: false });
    await markPlanWelcomeShown('u1', 'pro');
    expect(await checkPlanWelcome(pro, true)).toBeNull();
  });

  it('keeps asking until the screen was actually shown', async () => {
    await checkPlanWelcome(free, true);
    expect(await checkPlanWelcome(pro, true)).not.toBeNull();
    expect(await checkPlanWelcome(pro, true)).not.toBeNull();
  });

  it('shows the upgrade version for Pro → Max', async () => {
    await checkPlanWelcome(pro, true);
    expect(await checkPlanWelcome(max, true)).toEqual({ tier: 'max', upgrade: true });
  });

  it('welcomes again after a plan ended and a new one started (e.g. a gift, then a purchase)', async () => {
    await checkPlanWelcome(max, true);
    expect(await checkPlanWelcome(endedMax, true)).toBeNull();
    expect(await checkPlanWelcome(pro, true)).toEqual({ tier: 'pro', upgrade: false });
  });

  it('a purchase or gift claim made before Profile ever looked still gets its welcome', async () => {
    await notePlanBeforeChange(free);
    expect(await checkPlanWelcome(pro, true)).toEqual({ tier: 'pro', upgrade: false });
  });

  it('never shows for staff or while the paywall is off', async () => {
    await checkPlanWelcome(free, true);
    expect(await checkPlanWelcome({ ...pro, is_coach: true } as Profile, true)).toBeNull();
    expect(await checkPlanWelcome({ ...pro, is_admin: true } as Profile, true)).toBeNull();
    expect(await checkPlanWelcome(pro, false)).toBeNull();
    // Still due for the real customer case afterwards.
    expect(await checkPlanWelcome(pro, true)).toEqual({ tier: 'pro', upgrade: false });
  });
});
