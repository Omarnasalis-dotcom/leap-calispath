-- Incident follow-up to 20260902010000: that migration reverted
-- paywall_enabled back to false to stop actively hard-locking users, but
-- that also means enforcement can't be safely turned back on yet — every
-- profile is currently sitting at free tier after 20260901040000's full
-- reset, so flipping the flag back on today would immediately repeat the
-- exact same incident for the same ~250 accounts.
--
-- This grants every current profile a 14-day grace window at Max tier so
-- nobody hits a hard paywall regardless of whether the kill switch is on,
-- while the underlying gating code (this app's binary-version blind spot)
-- gets a real fix separately. Mirrors admin_grant_access's shape —
-- access_granted_at/access_expires_at/entitlement_source/subscription_tier/
-- ai_coach_budget_usd/entitlement_period_start set together, never in
-- isolation, per 20260901050000's own comment on why a partial write
-- leaves stale columns other readers (admin panel, AI-coach budget) trust
-- as current. access_expires_at only ever extends (GREATEST), never
-- shrinks, so nobody who already has more time loses any of it. This is a
-- one-time backfill for accounts that exist right now, not an ongoing
-- policy — it doesn't touch how new signups or real purchases are granted.
--
-- Excludes the one row with a real, currently-active RevenueCat
-- subscription (entitlement_source = 'rc_subscription') so its accurate
-- billing-period/budget data isn't overwritten with grace-grant values —
-- GREATEST would never shrink their expiry anyway, but relabeling a real
-- subscriber's entitlement_source/entitlement_period_start would make the
-- admin panel and AI-coach budget tracking lie about their actual plan.
UPDATE public.profiles
SET
  access_granted_at = COALESCE(access_granted_at, now()),
  access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now() + interval '14 days'),
  entitlement_source = 'incident_grace_grant',
  subscription_tier = 'max',
  ai_coach_budget_usd = 10.00,
  entitlement_period_start = now()
WHERE NOT (entitlement_source = 'rc_subscription' AND access_expires_at > now());
