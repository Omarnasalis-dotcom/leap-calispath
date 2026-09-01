-- Gate 1 continued: the one place that actually closes the loophole. Same
-- 7-arg signature as 20260829030000 (no DROP FUNCTION needed — argument
-- list is unchanged). Before granting access, reclaim any ai_coach_requests
-- rows orphaned by a deleted account that previously held this same real
-- subscription (rc_original_transaction_id), and read/write the
-- authoritative period-start from rc_transaction_periods instead of
-- defaulting a fresh profile to now(). Scoped to real rc_subscription
-- restores only (p_original_transaction_id IS NOT NULL) — admin grants and
-- invite codes have no stable transaction id to key off and are unaffected.
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
END;
$function$;

-- Sourced by the 9 rate-limit RPCs (next migration) to tag each new
-- ai_coach_requests row with the caller's current real subscription, so a
-- future account deletion leaves a row apply_revenuecat_entitlement above
-- can reclaim. Mirrors caller_has_pro_access()'s centralization pattern.
CREATE OR REPLACE FUNCTION public.caller_rc_transaction_id()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT rc_original_transaction_id FROM profiles WHERE id = auth.uid();
$function$;

GRANT EXECUTE ON FUNCTION public.caller_rc_transaction_id() TO authenticated;
