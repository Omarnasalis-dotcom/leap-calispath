-- Invite codes and community join codes: exact matching only, and unused
-- invite codes no longer readable by clients (audit 2026-09-25, H2 + H6).
--
-- H2: all four RPCs matched with ILIKE on user input, so '%' matched every
-- row -- one redeem_invite_code('%') call marked every unused code as used,
-- and join_community('%') joined an arbitrary community. Now a
-- case-insensitive equality (upper = upper), so '%' and '_' are literal.
-- All stored codes are already upper-case with no surrounding spaces, so no
-- real code stops working.
--
-- H6: the "Users can validate codes" SELECT policy let any signed-in user
-- list every unused code (28, incl. lifetime/master). Nothing needs it: the
-- four RPCs are SECURITY DEFINER (owner postgres) and bypass RLS, and admin
-- screens use the separate "Admins can do everything" policy.
--
-- Invite codes are retired in the app (AuthScreen INVITE_CODE_ENABLED=false);
-- this protects older builds that still show the field.
--
-- Bodies are the live prod definitions (pg_get_functiondef) with only the
-- WHERE line changed. Same signatures, so existing grants are preserved.

DROP POLICY IF EXISTS "Users can validate codes" ON public.invite_codes;

CREATE OR REPLACE FUNCTION public.reserve_invite_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_id uuid;
BEGIN
  -- Atomically claim the code by setting used_at, 
  -- but allow it if both used_by AND used_at are null,
  -- OR if the lock is older than 10 minutes (expired reservation)
  UPDATE invite_codes
  SET used_at = now()
  WHERE upper(code) = upper(trim(p_code))
    AND used_by IS NULL
    AND (used_at IS NULL OR used_at < now() - interval '10 minutes')
  RETURNING id INTO v_code_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found, invalid, or currently being claimed');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_id uuid;
  v_type text;
  v_duration interval;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE invite_codes
  SET used_by = p_user_id, used_at = now()
  WHERE upper(code) = upper(trim(p_code))
    AND used_by IS NULL
  RETURNING id, type INTO v_code_id, v_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found or already used');
  END IF;

  CASE v_type
    WHEN 'trial_14' THEN v_duration := interval '14 days';
    WHEN 'member_30' THEN v_duration := interval '30 days';
    WHEN 'member_90' THEN v_duration := interval '90 days';
    WHEN 'lifetime' THEN v_duration := interval '100 years';
    WHEN 'master' THEN v_duration := interval '100 years';
    ELSE v_duration := interval '7 days';
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = COALESCE(access_granted_at, now()),
    access_expires_at = GREATEST(COALESCE(access_expires_at, now()), now()) + v_duration,
    invite_code_used = p_code,
    entitlement_source = 'invite_code'
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.release_invite_code(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Release the lock by clearing used_at, 
  -- but ONLY if a user hasn't successfully claimed it yet
  UPDATE invite_codes
  SET used_at = NULL
  WHERE upper(code) = upper(trim(p_code))
    AND used_by IS NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.join_community(p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_community_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT id INTO v_community_id
  FROM communities
  WHERE upper(join_code) = upper(trim(p_join_code));

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CODE_NOT_FOUND');
  END IF;

  UPDATE profiles SET community_id = v_community_id WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'community_id', v_community_id);
END;
$function$;
