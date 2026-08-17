import { Profile } from '../types';

// access_expires_at is the single source of truth for "does this user have
// access right now" — set by the automatic signup trial, redeem_invite_code,
// the grandfathering backfill, or the RevenueCat webhook. Same shape as
// isPowerWorldUnlocked/isStaticWorldUnlocked, just over a profile object
// rather than a raw tier number since this checks a timestamp, not a tier.
export function hasActiveAccess(profile: Profile | null): boolean {
  return !!profile?.access_expires_at && new Date(profile.access_expires_at).getTime() > Date.now();
}
