-- Closes the "delete account, restore same subscription" usage-reset
-- loophole (Gate 1 of 2). entitlement_period_start lives on profiles, which
-- cascade-deletes with the account — this tiny table persists the real
-- period-start per real subscription (keyed by rc_original_transaction_id,
-- which survives deletion) so apply_revenuecat_entitlement can restore the
-- correct value instead of defaulting a fresh profile to now(). Only
-- apply_revenuecat_entitlement (SECURITY DEFINER) touches this — no public
-- read/write policy needed.
CREATE TABLE public.rc_transaction_periods (
  rc_original_transaction_id text PRIMARY KEY,
  period_start timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.rc_transaction_periods ENABLE ROW LEVEL SECURITY;

-- Backfill: without this, an already-active subscriber's first
-- apply_revenuecat_entitlement call after this migration ships would find
-- no ledger row and (per that function's new logic) lazily create one with
-- period_start = now() on any non-"new period" event — silently resetting
-- their real, older entitlement_period_start. Seeding from every current
-- real holder up front means the ledger is never created lazily for anyone
-- who already had a subscription before this deploy; only genuinely brand
-- new transactions hit the lazy-insert path from that point on, and a
-- brand new transaction's first-ever period_start really is now().
INSERT INTO public.rc_transaction_periods (rc_original_transaction_id, period_start)
SELECT rc_original_transaction_id, entitlement_period_start
FROM public.profiles
WHERE entitlement_source = 'rc_subscription'
  AND rc_original_transaction_id IS NOT NULL
  AND entitlement_period_start IS NOT NULL
ON CONFLICT (rc_original_transaction_id) DO NOTHING;
