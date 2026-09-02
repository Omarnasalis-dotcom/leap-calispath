-- Fixes a real bug in 20260902020000's WHERE clause:
-- `NOT (entitlement_source = 'rc_subscription' AND access_expires_at > now())`
-- silently excludes any row where entitlement_source IS NULL AND
-- access_expires_at IS NULL — SQL's three-valued logic makes the inner
-- expression NULL (not false) in that case, and `NOT NULL` is NULL too,
-- which a WHERE clause treats as non-matching. That NULL/NULL state is
-- exactly what 20260901040000's free-tier reset left on ~250 profiles —
-- precisely the accounts this grant most needed to cover. Confirmed live:
-- admin-web showed "Free" for accounts that should have had the grace
-- grant.
--
-- Rewritten with IS DISTINCT FROM (NULL-safe equality, never returns NULL)
-- so the exclusion only ever matches the one real, currently-active
-- rc_subscription row it was meant to protect. Same shape/values as
-- 20260902020000 otherwise — GREATEST-extends access_expires_at, so
-- re-running this for already-correctly-granted rows is a harmless no-op.
UPDATE public.profiles
SET
  access_granted_at = COALESCE(access_granted_at, now()),
  access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now() + interval '14 days'),
  entitlement_source = 'incident_grace_grant',
  subscription_tier = 'max',
  ai_coach_budget_usd = 10.00,
  entitlement_period_start = now()
WHERE entitlement_source IS DISTINCT FROM 'rc_subscription'
   OR access_expires_at IS NULL
   OR access_expires_at <= now();
