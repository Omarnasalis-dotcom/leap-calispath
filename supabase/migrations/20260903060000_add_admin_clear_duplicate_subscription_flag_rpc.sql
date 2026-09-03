-- Companion to removing the end-user-facing "Possible Duplicate Subscription"
-- alert from ProfileScreen.tsx. That alert's "Got it" button was the only
-- existing way to clear duplicate_subscription_flagged_at (via the
-- self-service acknowledge_duplicate_subscription RPC) — without it, a
-- flagged account has no path back to clean except this new admin action,
-- for use once support has actually looked into (and resolved, or ruled
-- out) a flagged account.
CREATE OR REPLACE FUNCTION public.admin_clear_duplicate_subscription_flag(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  UPDATE profiles
  SET duplicate_subscription_flagged_at = NULL,
      duplicate_subscription_previous_transaction_id = NULL
  WHERE id = p_user_id;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (auth.uid(), 'clear_duplicate_subscription_flag', p_user_id::text, '{}'::jsonb);

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_duplicate_subscription_flag(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_clear_duplicate_subscription_flag(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_duplicate_subscription_flag(uuid) TO authenticated;
