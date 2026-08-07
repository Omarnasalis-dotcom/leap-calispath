-- Bug found live: CommunityPage's fetchMyCommunities did a direct
-- `.from('communities').select('id, name, join_code')`, which fails with
-- "permission denied for table communities" — the authenticated role only
-- has column-level SELECT on id/name/created_by/created_at, never
-- join_code (deliberately: join codes are admin-only, they never reach
-- app clients). Rather than widen that grant (which would leak every
-- community's join code to every authenticated user), expose it through a
-- SECURITY DEFINER RPC scoped to communities the caller actually owns or
-- assists — the coach still needs their own join code to invite people.
CREATE OR REPLACE FUNCTION public.get_coach_communities(p_coach_id uuid DEFAULT auth.uid())
RETURNS TABLE(id uuid, name text, join_code text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() != p_coach_id AND NOT public.is_assistant_for(p_coach_id) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.join_code
  FROM communities c
  WHERE c.created_by = p_coach_id
  ORDER BY c.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_coach_communities(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_coach_communities(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_communities(uuid) TO authenticated;
