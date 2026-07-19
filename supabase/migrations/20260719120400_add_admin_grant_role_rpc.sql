-- Admin web control panel, phase 0: the first (and only) sanctioned path
-- for granting/revoking is_admin and is_coach.
--
-- Background: guard_profile_protected_fields (BEFORE UPDATE on profiles)
-- raises "Privilege Escalation Detected" when a non-superuser changes
-- is_admin/is_coach, exempting only postgres/supabase_admin/service_role.
-- A SECURITY DEFINER function owned by postgres therefore passes the
-- trigger — until now the only way to promote someone was the SQL
-- console. Every other client path stays blocked by the trigger.
--
-- Safety rails:
--   * role whitelist ('admin' | 'coach') — anything else raises
--   * last-admin protection: refuses to remove the final admin, which
--     would otherwise brick every admin surface at once (no one left who
--     could re-grant)
--   * every call is written to admin_audit_log, including no-op grants
CREATE OR REPLACE FUNCTION public.admin_grant_role(
  p_user_id uuid,
  p_role text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_count integer;
  v_target_is_admin boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin', 'coach') THEN
    RAISE EXCEPTION 'INVALID_ROLE' USING ERRCODE = '22023';
  END IF;

  SELECT is_admin INTO v_target_is_admin FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'USER_NOT_FOUND');
  END IF;

  IF p_role = 'admin' AND p_enabled = false AND coalesce(v_target_is_admin, false) THEN
    SELECT count(*) INTO v_admin_count FROM profiles WHERE is_admin = true;
    IF v_admin_count <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'LAST_ADMIN');
    END IF;
  END IF;

  IF p_role = 'admin' THEN
    UPDATE profiles SET is_admin = p_enabled WHERE id = p_user_id;
  ELSE
    UPDATE profiles SET is_coach = p_enabled WHERE id = p_user_id;
  END IF;

  INSERT INTO admin_audit_log (actor_id, action, target, detail)
  VALUES (
    auth.uid(),
    CASE WHEN p_enabled THEN 'grant_role' ELSE 'revoke_role' END,
    p_user_id::text,
    jsonb_build_object('role', p_role, 'enabled', p_enabled)
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, text, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_role(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_role(uuid, text, boolean) TO authenticated;
