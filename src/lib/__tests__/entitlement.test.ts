import { isProRequiredError, PRO_REQUIRED_ERROR, getSubscriptionTier, canAccessPro, canAccessCustomizeProgram, meetsMinTier } from '../entitlement';
import { Profile } from '../../types';

function profile(overrides: Partial<Profile>): Profile {
  return { subscription_tier: null, access_expires_at: null, is_admin: false, is_coach: false, ...overrides } as Profile;
}

const future = new Date(Date.now() + 86400_000).toISOString();
const past = new Date(Date.now() - 86400_000).toISOString();

describe('entitlement', () => {
  describe('isProRequiredError', () => {
    it('returns true for an error with the PRO_REQUIRED message', () => {
      expect(isProRequiredError(new Error(PRO_REQUIRED_ERROR))).toBe(true);
      expect(isProRequiredError({ message: 'PRO_REQUIRED' })).toBe(true);
    });

    it('returns false for other errors, null, or non-error values', () => {
      expect(isProRequiredError(new Error('RATE_LIMIT: chat daily limit reached'))).toBe(false);
      expect(isProRequiredError({ message: 'Something else' })).toBe(false);
      expect(isProRequiredError(null)).toBe(false);
      expect(isProRequiredError(undefined)).toBe(false);
      expect(isProRequiredError('PRO_REQUIRED')).toBe(false);
    });
  });

  describe('getSubscriptionTier', () => {
    it('returns max while the paywall kill switch is off, regardless of profile', () => {
      expect(getSubscriptionTier(null, false)).toBe('max');
      expect(getSubscriptionTier(profile({ subscription_tier: null }), false)).toBe('max');
    });

    it('returns max for admins and coaches even with an expired/no subscription', () => {
      expect(getSubscriptionTier(profile({ is_admin: true, subscription_tier: null }), true)).toBe('max');
      expect(getSubscriptionTier(profile({ is_coach: true, access_expires_at: past }), true)).toBe('max');
    });

    it('returns the real tier when access is active and a tier is set', () => {
      expect(getSubscriptionTier(profile({ subscription_tier: 'first', access_expires_at: future }), true)).toBe('first');
      expect(getSubscriptionTier(profile({ subscription_tier: 'pro', access_expires_at: future }), true)).toBe('pro');
      expect(getSubscriptionTier(profile({ subscription_tier: 'max', access_expires_at: future }), true)).toBe('max');
    });

    it('falls back to free when access has expired, even if subscription_tier is stale', () => {
      expect(getSubscriptionTier(profile({ subscription_tier: 'pro', access_expires_at: past }), true)).toBe('free');
    });

    it('falls back to free with no active access or no tier set', () => {
      expect(getSubscriptionTier(profile({ subscription_tier: null, access_expires_at: null }), true)).toBe('free');
      expect(getSubscriptionTier(null, true)).toBe('free');
    });
  });

  describe('canAccessPro', () => {
    it('is true for any paid tier, First included', () => {
      expect(canAccessPro(profile({ subscription_tier: 'first', access_expires_at: future }), true)).toBe(true);
      expect(canAccessPro(profile({ subscription_tier: 'pro', access_expires_at: future }), true)).toBe(true);
      expect(canAccessPro(profile({ subscription_tier: 'max', access_expires_at: future }), true)).toBe(true);
    });

    it('is false for free', () => {
      expect(canAccessPro(profile({ subscription_tier: null, access_expires_at: null }), true)).toBe(false);
    });
  });

  describe('canAccessCustomizeProgram', () => {
    it('is false for First — the one feature First is excluded from', () => {
      expect(canAccessCustomizeProgram(profile({ subscription_tier: 'first', access_expires_at: future }), true)).toBe(false);
    });

    it('is true for Pro and Max', () => {
      expect(canAccessCustomizeProgram(profile({ subscription_tier: 'pro', access_expires_at: future }), true)).toBe(true);
      expect(canAccessCustomizeProgram(profile({ subscription_tier: 'max', access_expires_at: future }), true)).toBe(true);
    });

    it('is false for free', () => {
      expect(canAccessCustomizeProgram(profile({ subscription_tier: null, access_expires_at: null }), true)).toBe(false);
    });
  });

  describe('meetsMinTier', () => {
    it('allows a tier that meets or exceeds the requirement', () => {
      expect(meetsMinTier('first', 'first')).toBe(true);
      expect(meetsMinTier('pro', 'first')).toBe(true);
      expect(meetsMinTier('max', 'pro')).toBe(true);
    });

    it('blocks a tier below the requirement', () => {
      expect(meetsMinTier('free', 'first')).toBe(false);
      expect(meetsMinTier('first', 'pro')).toBe(false);
      expect(meetsMinTier('pro', 'max')).toBe(false);
    });
  });
});
