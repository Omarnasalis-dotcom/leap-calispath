-- RevenueCat webhook: skip duplicate and out-of-order events (audit
-- 2026-09-25, M23).
--
-- apply_revenuecat_entitlement overwrote access_expires_at with whatever
-- event arrived last. RevenueCat retries deliveries and doesn't guarantee
-- order, so a late older event could cut a paying user's access (or revoke
-- the new owner of a transferred subscription), and a redelivered RENEWAL
-- reset the AI Coach budget period.
--
-- Body below is the live prod definition with only the marked blocks added.
-- The signature gains two optional params and now returns the outcome, so
-- the old function is dropped first (CREATE OR REPLACE would add a second,
-- ambiguous overload). Callers passing the 7 original named params keep
-- working unchanged.

-- Server-only log of processed webhook events (dedupe + audit trail).
CREATE TABLE public.rc_webhook_events (
  event_id text PRIMARY KEY,
  app_user_id uuid,
  original_transaction_id text,
  event_at timestamptz,
  outcome text NOT NULL CHECK (outcome IN ('applied', 'stale')),
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rc_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rc_webhook_events FROM anon, authenticated;

ALTER TABLE public.rc_transaction_periods ADD COLUMN last_event_at timestamptz;

DROP FUNCTION public.apply_revenuecat_entitlement(uuid, timestamp with time zone, text, text, text, numeric, boolean);
-- The original 3-arg version (pre-tier-launch) has no callers left; with
-- the new defaults it only makes 3-arg calls ambiguous ("is not unique").
DROP FUNCTION public.apply_revenuecat_entitlement(uuid, timestamp with time zone, text);

CREATE OR REPLACE FUNCTION public.apply_revenuecat_entitlement(p_user_id uuid, p_expires_at timestamp with time zone, p_source text, p_original_transaction_id text DEFAULT NULL::text, p_tier text DEFAULT NULL::text, p_budget_usd numeric DEFAULT NULL::numeric, p_is_new_period boolean DEFAULT false, p_event_id text DEFAULT NULL::text, p_event_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing RECORD;
  v_last_event_at timestamptz;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_tier IS NOT NULL AND p_tier NOT IN ('first', 'pro', 'max') THEN
    RAISE EXCEPTION 'INVALID_TIER: %', p_tier;
  END IF;

  -- Webhook dedupe + ordering (2026-09-27, audit M23). Only when the caller
  -- passes the RevenueCat event id (revenuecat-webhook); confirm-entitlement
  -- reads live state from RevenueCat's API and never passes it, so it is
  -- unaffected. Everything below runs in this function's one transaction:
  -- if applying fails, the event is not recorded and RevenueCat's retry is
  -- processed normally.
  IF p_event_id IS NOT NULL THEN
    IF p_original_transaction_id IS NOT NULL THEN
      -- Row lock serializes concurrent deliveries for the same subscription.
      INSERT INTO rc_transaction_periods (rc_original_transaction_id, period_start)
      VALUES (p_original_transaction_id, now())
      ON CONFLICT (rc_original_transaction_id) DO NOTHING;
      SELECT last_event_at INTO v_last_event_at
      FROM rc_transaction_periods
      WHERE rc_original_transaction_id = p_original_transaction_id
      FOR UPDATE;
    END IF;

    -- RevenueCat redelivers an event (same id) when a delivery looked failed.
    IF EXISTS (SELECT 1 FROM rc_webhook_events WHERE event_id = p_event_id) THEN
      RETURN 'duplicate';
    END IF;

    -- Deliveries aren't ordered: never let an older event overwrite the
    -- result of a newer one for the same subscription (e.g. a late renewal
    -- shortening access, or a stale event for a transferred subscription
    -- revoking its new owner below).
    IF v_last_event_at IS NOT NULL AND p_event_at IS NOT NULL AND p_event_at < v_last_event_at THEN
      INSERT INTO rc_webhook_events (event_id, app_user_id, original_transaction_id, event_at, outcome)
      VALUES (p_event_id, p_user_id, p_original_transaction_id, p_event_at, 'stale');
      RETURN 'stale';
    END IF;
  END IF;

  IF p_original_transaction_id IS NOT NULL THEN
    UPDATE profiles
    SET access_expires_at = now()
    WHERE id <> p_user_id
      AND rc_original_transaction_id = p_original_transaction_id
      AND entitlement_source = 'rc_subscription'
      AND access_expires_at > now();

    -- A genuinely different real transaction landing on an account that
    -- already had an active one (different rc_original_transaction_id,
    -- still-active) means two separate store subscriptions are now both
    -- billing on the same account — almost always someone paying with a
    -- different Apple ID/Google account than before, not intentional
    -- double-billing. Flag it for the app to warn about and for admin-web
    -- to see; don't touch access/tier here beyond the normal grant below.
    SELECT rc_original_transaction_id, entitlement_source, access_expires_at
    INTO v_existing
    FROM profiles WHERE id = p_user_id;

    IF v_existing.rc_original_transaction_id IS NOT NULL
       AND v_existing.rc_original_transaction_id <> p_original_transaction_id
       AND v_existing.entitlement_source = 'rc_subscription'
       AND v_existing.access_expires_at > now()
    THEN
      UPDATE profiles
      SET duplicate_subscription_flagged_at = now(),
          duplicate_subscription_previous_transaction_id = v_existing.rc_original_transaction_id
      WHERE id = p_user_id;
    END IF;

    -- Reclaim usage history orphaned by a deleted account that previously
    -- held this same real subscription — closes the "delete, recreate,
    -- restore" usage-reset loophole.
    UPDATE ai_coach_requests
    SET user_id = p_user_id
    WHERE rc_original_transaction_id = p_original_transaction_id
      AND user_id IS NULL;

    INSERT INTO rc_transaction_periods (rc_original_transaction_id, period_start)
    VALUES (p_original_transaction_id, now())
    ON CONFLICT (rc_original_transaction_id) DO UPDATE
      SET period_start = CASE WHEN p_is_new_period THEN now() ELSE rc_transaction_periods.period_start END,
          updated_at = now();
  END IF;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = p_expires_at,
    entitlement_source = p_source,
    rc_original_transaction_id = COALESCE(p_original_transaction_id, rc_original_transaction_id),
    subscription_tier = COALESCE(p_tier, subscription_tier),
    ai_coach_budget_usd = COALESCE(p_budget_usd, ai_coach_budget_usd),
    entitlement_period_start = CASE
      WHEN p_original_transaction_id IS NOT NULL THEN
        (SELECT period_start FROM rc_transaction_periods WHERE rc_original_transaction_id = p_original_transaction_id)
      WHEN p_is_new_period THEN now()
      ELSE COALESCE(entitlement_period_start, now())
    END
  WHERE id = p_user_id;

  IF p_event_id IS NOT NULL THEN
    IF p_original_transaction_id IS NOT NULL AND p_event_at IS NOT NULL THEN
      UPDATE rc_transaction_periods
      SET last_event_at = GREATEST(COALESCE(last_event_at, p_event_at), p_event_at)
      WHERE rc_original_transaction_id = p_original_transaction_id;
    END IF;
    INSERT INTO rc_webhook_events (event_id, app_user_id, original_transaction_id, event_at, outcome)
    VALUES (p_event_id, p_user_id, p_original_transaction_id, p_event_at, 'applied')
    ON CONFLICT (event_id) DO NOTHING;
  END IF;

  RETURN 'applied';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_revenuecat_entitlement(uuid, timestamp with time zone, text, text, text, numeric, boolean, text, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_revenuecat_entitlement(uuid, timestamp with time zone, text, text, text, numeric, boolean, text, timestamp with time zone) TO service_role;
