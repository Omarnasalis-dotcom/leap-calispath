-- Two changes to the community join-code flow:
--
-- 1. create_community now stores join_code uppercased. Codes used to be
--    machine-generated in a fixed uppercase format, so this never mattered;
--    now the user types their own, and join_community's lookup is case-
--    insensitive (`ILIKE`) while the column's UNIQUE constraint is
--    case-sensitive — "ABC123" and "abc123" could otherwise both exist as
--    distinct rows and collide ambiguously at lookup time. Normalizing to
--    uppercase on write closes that gap.
--
-- 2. New get_my_community_join_code RPC — the community's creator ("leader")
--    previously had no way to see their own join code again after creation
--    (join_code is deliberately excluded from communities' granted column
--    list, see 20260710140000). SECURITY DEFINER, scoped to communities
--    the caller actually created — same ownership-check shape as every
--    other "read a private column back for its owner" RPC this session.
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
    VALUES (trim(p_name), upper(trim(p_join_code)), auth.uid())
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

CREATE OR REPLACE FUNCTION public.get_my_community_join_code(p_community_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT join_code FROM communities
  WHERE id = p_community_id AND created_by = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_community_join_code(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_community_join_code(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_community_join_code(uuid) TO authenticated;
