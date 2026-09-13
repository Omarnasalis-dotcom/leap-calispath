-- Reverts the temporary grace grant from the 2026-09-02 paywall incident
-- (20260902020000 / 20260902070000, extended to new signups by
-- 20260902050000-20260903050000). handle_new_user() was already reverted
-- to plain free-tier signups on 20260905150000, and paywall_enabled /
-- the real free-tier release are confirmed live in prod -- the grace grant
-- has served its purpose and would otherwise sit at Max tier until each
-- profile's 14-day window happens to expire naturally.
--
-- Only entitlement_source = 'incident_grace_grant' rows are touched.
-- Real rc_subscription payers, admin_grant comps, and admins/coaches are
-- untouched -- this is scoped to exactly the cohort that got this specific
-- one-time label, not a general reset. rc_original_transaction_id and
-- other purchase-history columns are left alone (none of this cohort
-- should have one, but leaving it alone is the established self-heal
-- pattern per 20260901040000/20260901050000 for any that do).
--
-- All six entitlement fields are cleared together, matching the
-- full-clear pattern from 20260901050000 (a prior partial clear left
-- ai_coach_budget_usd/entitlement_period_start stale and misleading).
UPDATE public.profiles
SET
  subscription_tier = NULL,
  access_granted_at = NULL,
  access_expires_at = NULL,
  entitlement_source = NULL,
  ai_coach_budget_usd = NULL,
  entitlement_period_start = NULL
WHERE entitlement_source = 'incident_grace_grant';
