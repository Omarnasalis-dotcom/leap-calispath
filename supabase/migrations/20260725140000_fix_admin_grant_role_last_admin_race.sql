-- admin_grant_role's "last admin" protection (20260719120400) had a TOCTOU
-- race: it does SELECT count(*) FROM profiles WHERE is_admin = true, then
-- later UPDATEs, with no lock in between. Two concurrent revoke-admin calls
-- targeting two different admins can each read the pre-update count (which
-- still includes the other admin, since neither UPDATE has committed yet),
-- both pass the "count > 1" check, and both proceed — zeroing out every
-- admin at once. This is exactly the scenario the last-admin protection was
-- written to prevent, per its own comment ("would otherwise brick every
-- admin surface at once, no one left who could re-grant").
--
-- Confirmed exploitable locally: with two admin test accounts, firing
-- admin_grant_role(admin2, 'admin', false) as admin1 and
-- admin_grant_role(admin1, 'admin', false) as admin2 concurrently (forced
-- to genuinely overlap via a temporary injected pg_sleep between the count
-- check and the update, to widen the race window past what plain curl
-- backgrounding reliably produces) both returned {"success": true}, leaving
-- is_admin = false for every profile in the table. Once at zero admins,
-- there is no remaining client path to re-grant — it requires direct DB
-- access.
--
-- Fix: take a transaction-scoped advisory lock, keyed to a fixed constant,
-- before reading or writing is_admin. This serializes every concurrent
-- admin_grant_role(..., 'admin', ...) call (grant or revoke) so the count
-- check and the subsequent update are effectively atomic relative to other
-- callers — the second call in any concurrent pair now blocks until the
-- first's transaction commits, then re-reads the updated count and correctly
-- returns LAST_ADMIN instead of also succeeding. is_coach changes are
-- unaffected (no last-role rule applies there, so no lock needed on that
-- branch). Re-tested locally: the same concurrent-revoke scenario now
-- yields one {"success": true} and one {"success": false, "error":
-- "LAST_ADMIN"}, with exactly one admin remaining afterward. Normal
-- single-caller grant/revoke of both roles, and the sole-admin
-- self-revoke-blocked case, are unaffected.
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

  IF p_role = 'admin' THEN
    -- Serializes concurrent admin grant/revoke calls so the last-admin
    -- check below can't race (see migration comment above). Released
    -- automatically at transaction end (each RPC call is its own implicit
    -- transaction).
    PERFORM pg_advisory_xact_lock(hashtext('admin_grant_role:is_admin'));
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
