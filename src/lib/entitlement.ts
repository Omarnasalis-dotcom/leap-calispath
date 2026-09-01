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

export type SubscriptionTier = 'free' | 'first' | 'pro' | 'max';

// Mirrors caller_effective_tier() (supabase/migrations) exactly — keep in
// sync by hand. paywallEnabled is the app_config kill switch — while it's
// false, tier gating isn't enforced yet and everyone gets 'max' (the
// richest tier), letting paid features ship and be tested before real
// enforcement turns on. is_admin/is_coach always bypass to 'max' too:
// coaching is an internal role, not a paying customer segment. An expired
// paid tier is never trusted from a stale subscription_tier value — it
// always falls back to 'free'.
export function getSubscriptionTier(profile: Profile | null, paywallEnabled: boolean): SubscriptionTier {
  if (!paywallEnabled) return 'max';
  if (profile?.is_admin === true || profile?.is_coach === true) return 'max';
  if (hasActiveAccess(profile) && profile?.subscription_tier) {
    return profile.subscription_tier as SubscriptionTier;
  }
  return 'free';
}

// "Pro" here means "any paid tier" — First/Pro/Max all pass. This is what
// Program Templates, Quick Workouts, and AI Coach's "Start Program" gate
// all actually want; none of them distinguish between the three paid
// tiers, only Customize Program does (see canAccessCustomizeProgram).
export function canAccessPro(profile: Profile | null, paywallEnabled: boolean): boolean {
  return getSubscriptionTier(profile, paywallEnabled) !== 'free';
}

// Customize Program is the one feature where First is excluded — Pro/Max
// only.
export function canAccessCustomizeProgram(profile: Profile | null, paywallEnabled: boolean): boolean {
  const tier = getSubscriptionTier(profile, paywallEnabled);
  return tier === 'pro' || tier === 'max';
}

// Ordering for min_access_tier checks (program_templates) — a program built
// while the warrior held tier X stays usable as long as their CURRENT tier
// is >= X, even if the subscription that built it has since moved to
// another account (see end_active_program / WarriorProgramScreen.tsx).
const TIER_ORDER: Record<SubscriptionTier, number> = { free: 0, first: 1, pro: 2, max: 3 };

export function meetsMinTier(current: SubscriptionTier, required: SubscriptionTier): boolean {
  return TIER_ORDER[current] >= TIER_ORDER[required];
}

// Every server-side Pro gate this app has (RPCs and the ai-coach edge
// function alike) raises this exact string on rejection — see
// caller_has_pro_access() (supabase/migrations). Centralizing the
// comparison here instead of each screen re-typing the literal.
export const PRO_REQUIRED_ERROR = 'PRO_REQUIRED';

export function isProRequiredError(err: unknown): boolean {
  return (err as { message?: string } | null)?.message === PRO_REQUIRED_ERROR;
}
