-- Counterpart to admin_grant_access (20260816100000), which is additive-only
-- and can never pull access back in. This lets an admin undo a mistaken or
-- no-longer-wanted gift by immediately expiring it.
--
-- Deliberately refuses to touch access sourced from 'rc_subscription': if a
-- user has a real active Apple subscription and this just set
-- access_expires_at to now() in our own mirror of that state, the next
-- RevenueCat webhook (a routine renewal, or even just an unrelated sync)
-- would silently re-extend it right back, since Apple/RevenueCat still
-- think the subscription is active — our database would just be
-- temporarily and confusingly out of sync with reality, not actually
-- cancelled. A real subscription can only be cancelled through Apple/
-- RevenueCat directly. This only revokes access we ourselves granted
-- out-of-band: 'admin_grant' or 'invite_code'.
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

  UPDATE profiles SET access_expires_at = now() WHERE id = p_user_id;

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
