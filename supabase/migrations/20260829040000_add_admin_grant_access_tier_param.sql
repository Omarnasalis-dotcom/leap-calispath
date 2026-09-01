-- admin_grant_access now grants a specific tier (First/Pro/Max), which gets
-- that tier's exact real $ budget + message caps — per the product owner's
-- explicit instruction, admin grants are "the same structure like the
-- paywall structure," not unlimited or special-cased. Duration options stay
-- the existing 1/3/6 month (decoupled from the 5 public products' 1/2-month
-- durations, since comps are more flexible than real SKUs). The budget is
-- always the tier's flat per-period base value regardless of duration granted
-- (a 6-month Pro comp gets $4 once at grant time, not $24 — no cron-based
-- monthly refresh is built here; an admin re-running this grant refreshes it).
-- entitlement_period_start always resets to now() on every grant, same as a
-- real new billing period starting.
--
-- Adding a parameter creates a new overload rather than replacing the old
-- 2-arg signature (Postgres resolves by argument types) — DROP the old one
-- first, per this project's own established gotcha for exactly this
-- situation, then re-apply the same PUBLIC/anon REVOKE + authenticated
-- GRANT the original signature had (20260819100000), since a fresh
-- function object gets Postgres's default "PUBLIC has EXECUTE" again.
DROP FUNCTION IF EXISTS public.admin_grant_access(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_grant_access(p_user_id uuid, p_tier text, p_duration_type text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_duration interval;
  v_budget_usd numeric;
  v_new_expires_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  CASE p_tier
    WHEN 'first' THEN v_budget_usd := 1.00;
    WHEN 'pro' THEN v_budget_usd := 4.00;
    WHEN 'max' THEN v_budget_usd := 10.00;
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIER');
  END CASE;

  CASE p_duration_type
    WHEN '1month' THEN v_duration := interval '1 month';
    WHEN '3month' THEN v_duration := interval '3 months';
    WHEN '6month' THEN v_duration := interval '6 months';
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'INVALID_DURATION_TYPE');
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now()) + v_duration,
    entitlement_source = 'admin_grant',
    subscription_tier = p_tier,
    ai_coach_budget_usd = v_budget_usd,
    entitlement_period_start = now()
  WHERE id = p_user_id
  RETURNING access_expires_at INTO v_new_expires_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (
    auth.uid(),
    'grant_access',
    p_user_id::text,
    jsonb_build_object('tier', p_tier, 'duration_type', p_duration_type, 'new_expires_at', v_new_expires_at)
  );

  RETURN jsonb_build_object('success', true, 'access_expires_at', v_new_expires_at, 'tier', p_tier);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_grant_access(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_access(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_access(uuid, text, text) TO authenticated;
