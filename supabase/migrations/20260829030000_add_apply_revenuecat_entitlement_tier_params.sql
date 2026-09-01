-- Extends apply_revenuecat_entitlement with the new tier system. p_tier/
-- p_budget_usd are COALESCE-defaulted so an unmapped/legacy product_id
-- (see the webhook's PRODUCT_TIER_MAP) leaves the caller's existing tier/
-- budget untouched rather than erroring the whole entitlement update —
-- access_expires_at still advances correctly regardless. p_is_new_period
-- controls whether entitlement_period_start resets to now() (a real new
-- billing period — INITIAL_PURCHASE/RENEWAL/PRODUCT_CHANGE) or is left as
-- whatever it already was (any other event type, or the confirm-entitlement
-- fallback path, which always passes false — see that function's own
-- comment for why). Service-role guard and multi-account-sharing guard
-- unchanged from the current body (20260820010000).
--
-- Adding parameters (even with DEFAULTs) changes the argument-type list, so
-- CREATE OR REPLACE would create a second overload rather than replace this
-- one — DROP the old 4-arg signature first, per this project's established
-- overload gotcha, to avoid an ambiguous-call error the next time the
-- webhook/confirm-entitlement functions invoke this by name.
DROP FUNCTION IF EXISTS public.apply_revenuecat_entitlement(uuid, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.apply_revenuecat_entitlement(
  p_user_id uuid,
  p_expires_at timestamptz,
  p_source text,
  p_original_transaction_id text DEFAULT NULL,
  p_tier text DEFAULT NULL,
  p_budget_usd numeric DEFAULT NULL,
  p_is_new_period boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_tier IS NOT NULL AND p_tier NOT IN ('first', 'pro', 'max') THEN
    RAISE EXCEPTION 'INVALID_TIER: %', p_tier;
  END IF;

  IF p_original_transaction_id IS NOT NULL THEN
    UPDATE profiles
    SET access_expires_at = now()
    WHERE id <> p_user_id
      AND rc_original_transaction_id = p_original_transaction_id
      AND entitlement_source = 'rc_subscription'
      AND access_expires_at > now();
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
      WHEN p_is_new_period THEN now()
      ELSE COALESCE(entitlement_period_start, now())
    END
  WHERE id = p_user_id;
END;
$function$;
