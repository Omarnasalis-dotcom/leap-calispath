-- Gap found live: a pure assistant (not independently is_coach) hit
-- ADMIN_ONLY calling admin_search_users, so the "Search warrior" box in
-- AssignForm always errored and no warrior could ever be selected —
-- breaking "assign a program to a client with no existing assignment: Yes"
-- from the permission matrix. Widen the gate to has_coaching_access(), and
-- widen the community filter so an assistant sees members of every
-- community they have delegated access to, not just one they created
-- themselves (they never create communities).
CREATE OR REPLACE FUNCTION public.admin_search_users(p_query text DEFAULT NULL::text, p_sort text DEFAULT 'created_at'::text, p_desc boolean DEFAULT true, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, email text, display_name text, first_name text, last_name text, strength_tier integer, power_tier integer, statics_tier numeric, glory_score integer, power_points numeric, one_mm_points numeric, streak integer, is_admin boolean, is_coach boolean, community_id uuid, community_name text, country text, gender text, last_active timestamp with time zone, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sort_expr text;
  v_is_admin boolean;
BEGIN
  v_is_admin := public.is_admin();

  IF NOT v_is_admin AND NOT public.has_coaching_access(auth.uid()) THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  -- Whitelist → concrete column expression. Unknown values fall back to
  -- signup date rather than erroring, so a stale client can't break the
  -- page.
  v_sort_expr := CASE p_sort
    WHEN 'created_at'    THEN 'u.created_at'
    WHEN 'last_active'   THEN 'p.last_active'
    WHEN 'display_name'  THEN 'p.display_name'
    WHEN 'strength_tier' THEN 'p.strength_tier'
    WHEN 'glory_score'   THEN 'p.glory_score'
    WHEN 'power_points'  THEN 'p.power_points'
    WHEN 'one_mm_points' THEN 'p.one_mm_points'
    WHEN 'streak'        THEN 'p.streak'
    ELSE 'u.created_at'
  END;

  RETURN QUERY EXECUTE format(
    $q$
    SELECT p.id, p.email, p.display_name, p.first_name, p.last_name,
           p.strength_tier, p.power_tier, p.statics_tier, p.glory_score,
           p.power_points, p.one_mm_points, p.streak, p.is_admin, p.is_coach,
           p.community_id, c.name AS community_name, p.country, p.gender,
           p.last_active, u.created_at,
           count(*) OVER () AS total_count
    FROM profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN communities c ON c.id = p.community_id
    WHERE ($4 OR EXISTS (
            SELECT 1 FROM communities cc
            WHERE cc.id = p.community_id
              AND (cc.created_by = $5 OR public.is_assistant_for(cc.created_by, $5))
          ))
      AND ($1 IS NULL OR trim($1) = ''
       OR p.display_name ILIKE '%%' || trim($1) || '%%'
       OR p.email        ILIKE '%%' || trim($1) || '%%'
       OR p.first_name   ILIKE '%%' || trim($1) || '%%'
       OR p.last_name    ILIKE '%%' || trim($1) || '%%')
    ORDER BY %s %s NULLS LAST
    LIMIT $2 OFFSET $3
    $q$,
    v_sort_expr,
    CASE WHEN p_desc THEN 'DESC' ELSE 'ASC' END
  )
  USING p_query, least(greatest(coalesce(p_limit, 50), 1), 200), greatest(coalesce(p_offset, 0), 0), v_is_admin, auth.uid();
END;
$function$;
