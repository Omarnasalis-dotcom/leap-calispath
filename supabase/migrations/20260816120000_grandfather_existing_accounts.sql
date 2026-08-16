-- One-time backfill: every account created before the trial-grant system
-- existed has access_granted_at/access_expires_at = NULL. Give them a
-- 90-day grandfathered window (longer than the 14-day organic trial) so
-- nobody already using the app hits an immediate expired-access paywall
-- once the paywall gate ships. Idempotent by construction (only touches
-- rows where access_expires_at IS NULL) — safe to re-run, and naturally
-- a no-op for anyone who already has access from redeem_invite_code or the
-- new signup trial, since both set access_expires_at at creation/redemption
-- time.
UPDATE public.profiles
SET
  access_granted_at = now(),
  access_expires_at = now() + interval '90 days',
  entitlement_source = 'grandfathered'
WHERE access_expires_at IS NULL;
