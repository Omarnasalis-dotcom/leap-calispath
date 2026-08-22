import { Profile } from '../types';

// access_expires_at is the single source of truth for "does this user have
// an active Pro grant right now" — set by redeem_invite_code, the
// grandfathering backfill, or the RevenueCat webhook (subscription or
// trial, both arrive the same way). Same shape as
// isPowerWorldUnlocked/isStaticWorldUnlocked, just over a profile object
// rather than a raw tier number since this checks a timestamp, not a tier.
export function hasActiveAccess(profile: Profile | null): boolean {
  return !!profile?.access_expires_at && new Date(profile.access_expires_at).getTime() > Date.now();
}

// Single source of truth for every Pro-gated feature (AI Coach, full
// Workout Library, etc). paywallEnabled is the app_config kill switch —
// while it's false, Pro gating isn't enforced yet and everyone gets Pro
// access, letting Pro features ship and be tested before real enforcement
// turns on. is_admin/is_coach always bypass: coaching is an internal role,
// not a paying customer segment.
export function canAccessPro(profile: Profile | null, paywallEnabled: boolean): boolean {
  if (!paywallEnabled) return true;
  if (profile?.is_admin === true || profile?.is_coach === true) return true;
  return hasActiveAccess(profile);
}
