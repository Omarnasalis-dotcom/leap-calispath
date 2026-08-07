-- Communities now double as coach rosters when created by a coach (see
-- assign_program_template's community-membership check) — admin needs to
-- tell those apart from purely social, warrior-created communities at a
-- glance rather than having to cross-reference the Users list.
DROP FUNCTION IF EXISTS public.admin_get_communities();

CREATE OR REPLACE FUNCTION public.admin_get_communities()
 RETURNS TABLE(id uuid, name text, join_code text, created_by uuid, created_by_name text, created_by_is_coach boolean, created_at timestamp with time zone, member_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.join_code, c.created_by, p.display_name,
         COALESCE(p.is_coach, false), c.created_at,
         (SELECT count(*) FROM profiles pr WHERE pr.community_id = c.id)
  FROM communities c
  LEFT JOIN profiles p ON p.id = c.created_by
  ORDER BY c.created_at DESC;
END;
$function$;
