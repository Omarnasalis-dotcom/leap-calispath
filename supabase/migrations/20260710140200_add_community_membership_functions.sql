-- Community feature, phase 1 (continued): create/join/leave RPCs.

-- Not SECURITY DEFINER — the caller already has a legitimate direct INSERT
-- path via the "Authenticated users can create communities" RLS policy
-- (created_by = auth.uid()). This RPC exists only to turn a raw unique-
-- constraint violation into a clean {success, error} shape instead of a
-- raw Postgres error reaching the UI, same convention as
-- publish_library_template/save_program_template.
CREATE OR REPLACE FUNCTION public.create_community(p_name text, p_join_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  IF trim(coalesce(p_name, '')) = '' OR trim(coalesce(p_join_code, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NAME_AND_CODE_REQUIRED');
  END IF;

  BEGIN
    INSERT INTO public.communities (name, join_code, created_by)
    VALUES (trim(p_name), trim(p_join_code), auth.uid())
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    IF EXISTS (SELECT 1 FROM public.communities WHERE name ILIKE trim(p_name)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'NAME_TAKEN');
    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'CODE_TAKEN');
    END IF;
  END;

  -- Creating a community also joins it — same "one at a time" rule as
  -- join_community, and there'd be no other way to become a member of a
  -- community you just made.
  UPDATE public.profiles SET community_id = v_id WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'community_id', v_id);
END;
$function$;

-- SECURITY DEFINER: join_code is deliberately not in profiles/communities'
-- granted column list (see 20260710140000), so this is the only path that
-- can resolve a code to a community. Modeled directly on
-- redeem_invite_code (20260704130200_fix_redeem_invite_code_idor.sql) —
-- case-insensitive code match, ownership implicit via auth.uid() (no
-- p_user_id param to spoof, unlike the older invite-code RPC this fixed).
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
  WHERE join_code ILIKE trim(p_join_code);

  IF v_community_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'CODE_NOT_FOUND');
  END IF;

  UPDATE profiles SET community_id = v_community_id WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'community_id', v_community_id);
END;
$function$;

-- SECURITY DEFINER for consistency with join_community, and to avoid
-- depending on profiles' exact column-level UPDATE grant state (only its
-- SELECT grants were audited/locked down this session).
CREATE OR REPLACE FUNCTION public.leave_community()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  UPDATE profiles SET community_id = NULL WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_community(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_community(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_community() TO authenticated;
