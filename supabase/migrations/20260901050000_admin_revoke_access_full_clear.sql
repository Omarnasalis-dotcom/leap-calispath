-- admin_revoke_access (20260818100000) predates the 2026-08-29 Free/First/
-- Pro/Max tier system and was never updated for it — it only cleared
-- access_expires_at, leaving subscription_tier/entitlement_source/
-- access_granted_at/ai_coach_budget_usd/entitlement_period_start all
-- stale on the row. getSubscriptionTier()/caller_effective_tier() both
-- gate correctly on access_expires_at first, so this wasn't a live bug
-- (a "revoked" user was already correctly read as free), but it's exactly
-- the same "clears one column, leaves the rest dangling" pattern the prior
-- migration (20260901040000) had to work around with a manual full clear
-- for 200+ rows. Matching that same full-clear shape here so a future
-- revoke never needs a cleanup pass again, and so admin_search_users /
-- any other reader of these columns never sees a "revoked" row still
-- carrying a stale tier label.
--
-- Safety behavior (rc_subscription refusal, admin-only, audit log) is
-- unchanged — this only widens what gets cleared.
CREATE OR REPLACE FUNCTION public.admin_revoke_access(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_source text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT entitlement_source INTO v_source FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF v_source = 'rc_subscription' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'REAL_SUBSCRIPTION_CANNOT_BE_REVOKED_HERE'
    );
  END IF;

  UPDATE profiles
  SET subscription_tier = NULL,
      access_granted_at = NULL,
      access_expires_at = NULL,
      entitlement_source = NULL,
      ai_coach_budget_usd = NULL,
      entitlement_period_start = NULL
  WHERE id = p_user_id;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (
    auth.uid(),
    'revoke_access',
    p_user_id::text,
    jsonb_build_object('previous_source', v_source)
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- Same stale-column cleanup, applied once to the 10 rows that had already
-- naturally expired (organic trial or a real-but-now-lapsed rc_subscription)
-- before 20260901040000 ran, so its `access_expires_at > now()` condition
-- didn't catch them. Functionally these were already reading as free via
-- getSubscriptionTier()/caller_effective_tier() (both gate on
-- access_expires_at first) — this is display/data hygiene only, not a
-- behavior change.
UPDATE public.profiles
SET subscription_tier = NULL,
    access_granted_at = NULL,
    entitlement_source = NULL,
    ai_coach_budget_usd = NULL,
    entitlement_period_start = NULL
WHERE subscription_tier IS NOT NULL
  AND (access_expires_at IS NULL OR access_expires_at <= now());
