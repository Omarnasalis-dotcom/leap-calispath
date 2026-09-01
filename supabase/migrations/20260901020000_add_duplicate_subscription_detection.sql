-- Common industry approach for the "upgraded" from a different real payment
-- account scenario (confirmed via RevenueCat's own community docs: this is
-- a known, unpreventable-in-advance platform limitation — neither Apple nor
-- Google expose which payment account will be used before a purchase
-- completes, so there's no way to block it at the paywall). The standard
-- pattern instead is detect-after-the-fact + warn, since developers can't
-- even issue App Store refunds themselves — only Apple/Google support can.
--
-- Wired into apply_revenuecat_entitlement itself since every entitlement
-- path (webhook, confirm-entitlement, TRANSFER) already funnels through it
-- — one choke point catches all of them, regardless of how the second
-- transaction arrived.
ALTER TABLE public.profiles
  ADD COLUMN duplicate_subscription_flagged_at timestamptz,
  ADD COLUMN duplicate_subscription_previous_transaction_id text;

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
DECLARE
  v_existing RECORD;
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
END;
$function$;

-- Self-service dismiss, called once the user has seen the warning.
CREATE OR REPLACE FUNCTION public.acknowledge_duplicate_subscription()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.profiles
  SET duplicate_subscription_flagged_at = NULL,
      duplicate_subscription_previous_transaction_id = NULL
  WHERE id = auth.uid();
$function$;

GRANT EXECUTE ON FUNCTION public.acknowledge_duplicate_subscription() TO authenticated;

-- Same write-protection as every other entitlement field — a client
-- shouldn't be able to set or clear this by hand outside the RPC above.
CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
       NEW.is_coach IS DISTINCT FROM OLD.is_coach OR
       NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
       NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
       NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
       NEW.glory_score IS DISTINCT FROM OLD.glory_score OR
       NEW.streak IS DISTINCT FROM OLD.streak OR
       NEW.trials_passed IS DISTINCT FROM OLD.trials_passed OR
       NEW.power_points IS DISTINCT FROM OLD.power_points OR
       NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points OR
       NEW.clash_win_streak IS DISTINCT FROM OLD.clash_win_streak OR
       NEW.tournament_gp IS DISTINCT FROM OLD.tournament_gp OR
       NEW.access_granted_at IS DISTINCT FROM OLD.access_granted_at OR
       NEW.access_expires_at IS DISTINCT FROM OLD.access_expires_at OR
       NEW.invite_code_used IS DISTINCT FROM OLD.invite_code_used OR
       NEW.coach_beta_access IS DISTINCT FROM OLD.coach_beta_access OR
       NEW.entitlement_source IS DISTINCT FROM OLD.entitlement_source OR
       NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier OR
       NEW.entitlement_period_start IS DISTINCT FROM OLD.entitlement_period_start OR
       NEW.ai_coach_budget_usd IS DISTINCT FROM OLD.ai_coach_budget_usd OR
       NEW.rc_original_transaction_id IS DISTINCT FROM OLD.rc_original_transaction_id OR
       NEW.duplicate_subscription_flagged_at IS DISTINCT FROM OLD.duplicate_subscription_flagged_at OR
       NEW.duplicate_subscription_previous_transaction_id IS DISTINCT FROM OLD.duplicate_subscription_previous_transaction_id
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
        RAISE EXCEPTION 'Gender can only be set once and cannot be changed.';
    END IF;
    IF OLD.country IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
        RAISE EXCEPTION 'Country can only be set once and cannot be changed.';
    END IF;
    RETURN NEW;
END;
$function$;
