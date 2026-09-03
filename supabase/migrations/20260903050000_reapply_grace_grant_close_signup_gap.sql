-- Re-runs the same corrected grant sweep as 20260902070000 (identical
-- NULL-safe WHERE clause, same reasoning — see that migration's comment)
-- to catch anyone who fell through the ~1-day gap between 20260903010000
-- (reverted the new-signup auto-grant) and 20260903040000 (reinstated it):
-- any account created in that window got no grant at all and would still
-- be reading as genuinely free right now.
--
-- Idempotent and safe for everyone else — GREATEST-extends
-- access_expires_at (never shrinks), and re-setting identical values for
-- an already-correctly-granted row is a no-op. This runs BEFORE the
-- Apple-reviewer account gets manually revoked to free tier separately
-- (admin-web) — that revoke is a deliberate, later, one-off action on one
-- specific account, not something this broad sweep should account for.
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
