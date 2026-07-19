-- Admin web control panel, phase 0: read-side RPCs for the admin web app.
--
-- Shared conventions (per-RPC release checklist for every admin function):
--   1. SECURITY DEFINER + SET search_path TO 'public'
--   2. First statement is the is_admin() rejection — before any query runs
--   3. GRANT EXECUTE to authenticated, REVOKE from anon/PUBLIC
--   4. Negative-tested: a non-admin JWT must get an error, never data
--
-- Why RPCs instead of direct SELECTs: several sources are deliberately
-- locked to the anon client — trial_history is owner-only, communities'
-- join_code is column-revoked (20260710140000), and profiles' PII columns
-- are slated to be re-revoked (20260630190000, temporarily reverted by
-- 20260701000000 for old-binary compat). The panel reads through these
-- DEFINER functions only, so the re-lockdown cannot break it.

-- 1. Headline numbers for the dashboard, one round trip. Also drives the
--    "no challenge configured for next week" banner.
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Most recent Saturday, matching ChallengeService.getCurrentWeekStart():
  -- dow is 0 (Sun) .. 6 (Sat), so daysBack = (dow + 1) % 7.
  v_week_start date := current_date - ((extract(dow FROM current_date)::int + 1) % 7);
  v_next_week_start date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  v_next_week_start := v_week_start + 7;

  RETURN jsonb_build_object(
    'total_users', (SELECT count(*) FROM profiles),
    'assessed_users', (SELECT count(*) FROM profiles WHERE assessed_at IS NOT NULL),
    'coaches', (SELECT count(*) FROM profiles WHERE is_coach = true),
    'admins', (SELECT count(*) FROM profiles WHERE is_admin = true),
    'active_this_week', (
      SELECT count(DISTINCT t.uid) FROM (
        SELECT warrior_id AS uid FROM workout_logs WHERE completed_at >= v_week_start
        UNION SELECT user_id FROM weekly_entries WHERE submitted_at >= v_week_start
        UNION SELECT user_id FROM one_min_max_logs WHERE created_at >= v_week_start
        UNION SELECT user_id FROM static_holds WHERE created_at >= v_week_start
        UNION SELECT user_id FROM trial_history WHERE attempted_at >= v_week_start
        UNION SELECT user_id FROM power_assessments WHERE assessed_at >= v_week_start
      ) t WHERE t.uid IS NOT NULL
    ),
    'world_participation', jsonb_build_object(
      'strength', (SELECT count(DISTINCT user_id) FROM trial_history),
      'power', (SELECT count(*) FROM profiles WHERE power_assessed_at IS NOT NULL),
      'static', (SELECT count(DISTINCT user_id) FROM static_holds),
      'one_mm', (SELECT count(DISTINCT user_id) FROM one_min_max_logs)
    ),
    'pending_invite_requests', (SELECT count(*) FROM invite_requests WHERE status = 'pending'),
    'community_count', (SELECT count(*) FROM communities),
    'week_start', v_week_start,
    'next_week_start', v_next_week_start,
    'this_week_challenge_groups', (
      SELECT coalesce(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
      FROM weekly_challenges WHERE week_start = v_week_start
    ),
    'next_week_challenge_groups', (
      SELECT coalesce(jsonb_agg(group_id ORDER BY group_id), '[]'::jsonb)
      FROM weekly_challenges WHERE week_start = v_next_week_start
    )
  );
END;
$function$;

-- 2. Paginated user search. Signup date comes from auth.users (profiles
--    has no created_at column). Sort column goes through a fixed
--    whitelist before entering the dynamic query — never interpolate the
--    raw parameter.
CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query text DEFAULT NULL,
  p_sort text DEFAULT 'created_at',
  p_desc boolean DEFAULT true,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  email text,
  display_name text,
  first_name text,
  last_name text,
  strength_tier integer,
  power_tier integer,
  statics_tier numeric,
  glory_score integer,
  power_points numeric,
  one_mm_points numeric,
  streak integer,
  is_admin boolean,
  is_coach boolean,
  community_id uuid,
  community_name text,
  country text,
  gender text,
  last_active timestamptz,
  created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sort_expr text;
BEGIN
  IF NOT public.is_admin() THEN
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
    WHERE $1 IS NULL OR trim($1) = ''
       OR p.display_name ILIKE '%%' || trim($1) || '%%'
       OR p.email        ILIKE '%%' || trim($1) || '%%'
       OR p.first_name   ILIKE '%%' || trim($1) || '%%'
       OR p.last_name    ILIKE '%%' || trim($1) || '%%'
    ORDER BY %s %s NULLS LAST
    LIMIT $2 OFFSET $3
    $q$,
    v_sort_expr,
    CASE WHEN p_desc THEN 'DESC' ELSE 'ASC' END
  )
  USING p_query, least(greatest(coalesce(p_limit, 50), 1), 200), greatest(coalesce(p_offset, 0), 0);
END;
$function$;

-- 3. Full single-user profile for the user-detail drill-down, incl. PII
--    (that's the point of the admin view). push_token is stripped — it's
--    a device credential with no display value, and admins have no use
--    for it.
CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT (to_jsonb(p) - 'push_token') || jsonb_build_object(
    'community_name', c.name,
    'auth_created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'stats', jsonb_build_object(
      'trials_total', (SELECT count(*) FROM trial_history th WHERE th.user_id = p_user_id),
      'trials_completed', (SELECT count(*) FROM trial_history th WHERE th.user_id = p_user_id AND th.completed = true),
      'weekly_entries', (SELECT count(*) FROM weekly_entries we WHERE we.user_id = p_user_id),
      'workout_logs', (SELECT count(*) FROM workout_logs wl WHERE wl.warrior_id = p_user_id),
      'static_holds', (SELECT count(*) FROM static_holds sh WHERE sh.user_id = p_user_id),
      'one_mm_logs', (SELECT count(*) FROM one_min_max_logs ol WHERE ol.user_id = p_user_id),
      'power_assessments', (SELECT count(*) FROM power_assessments pa WHERE pa.user_id = p_user_id)
    )
  )
  INTO v_result
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  LEFT JOIN communities c ON c.id = p.community_id
  WHERE p.id = p_user_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_result;
END;
$function$;

-- 4. Cross-user trial history. trial_history's SELECT policy is
--    owner-only ("Warriors see own trials"), so this is the only admin
--    read path.
CREATE OR REPLACE FUNCTION public.admin_get_user_trial_history(p_user_id uuid)
RETURNS SETOF public.trial_history
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT * FROM trial_history th
  WHERE th.user_id = p_user_id
  ORDER BY th.attempted_at DESC;
END;
$function$;

-- 5. Community directory with the two things the anon path can't provide:
--    join_code (column-revoked since 20260710140000) and member counts
--    (no denormalized column exists — counted live off the indexed
--    profiles.community_id FK).
CREATE OR REPLACE FUNCTION public.admin_get_communities()
RETURNS TABLE(
  id uuid,
  name text,
  join_code text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz,
  member_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.join_code, c.created_by, p.display_name, c.created_at,
         (SELECT count(*) FROM profiles pr WHERE pr.community_id = c.id)
  FROM communities c
  LEFT JOIN profiles p ON p.id = c.created_by
  ORDER BY c.created_at DESC;
END;
$function$;

-- 6. Weekly-challenge participation analytics for one week (defaults to
--    the current week) plus an 8-week entry-count trend per group.
CREATE OR REPLACE FUNCTION public.admin_get_challenge_analytics(p_week_start date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_week date;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  v_week := coalesce(
    p_week_start,
    current_date - ((extract(dow FROM current_date)::int + 1) % 7)
  );

  RETURN jsonb_build_object(
    'week_start', v_week,
    'challenges', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.group_id), '[]'::jsonb)
      FROM (
        SELECT wc.id, wc.group_id, wc.title, wc.scoring_type, wc.time_limit,
               wc.is_active,
               count(we.id) AS entry_count,
               count(DISTINCT we.user_id) AS participant_count,
               min(we.score) AS min_score,
               max(we.score) AS max_score,
               round(avg(we.score), 2) AS avg_score,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY we.score) AS median_score
        FROM weekly_challenges wc
        LEFT JOIN weekly_entries we ON we.challenge_id = wc.id
        WHERE wc.week_start = v_week
        GROUP BY wc.id
      ) x
    ),
    'trend', (
      SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.week_start, t.group_id), '[]'::jsonb)
      FROM (
        SELECT wc.week_start, wc.group_id, count(we.id) AS entry_count
        FROM weekly_challenges wc
        LEFT JOIN weekly_entries we ON we.challenge_id = wc.id
        WHERE wc.week_start > v_week - 56 AND wc.week_start <= v_week
        GROUP BY wc.week_start, wc.group_id
      ) t
    )
  );
END;
$function$;

-- 7. Coaching-center analytics: template/assignment counts, workout-log
--    activity, and a per-coach leaderboard. workout_logs already has an
--    admin read policy, but the aggregation belongs server-side.
CREATE OR REPLACE FUNCTION public.admin_get_coaching_analytics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'templates', jsonb_build_object(
      'total', (SELECT count(*) FROM program_templates),
      'library_count', (SELECT count(*) FROM program_templates WHERE is_library_template = true),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(coalesce(s.status, 'unknown'), s.n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM program_templates GROUP BY status) s
      )
    ),
    'assignments', jsonb_build_object(
      'total', (SELECT count(*) FROM warrior_programs),
      'by_status', (
        SELECT coalesce(jsonb_object_agg(coalesce(s.status, 'unknown'), s.n), '{}'::jsonb)
        FROM (SELECT status, count(*) AS n FROM warrior_programs GROUP BY status) s
      )
    ),
    'workout_logs', jsonb_build_object(
      'total', (SELECT count(*) FROM workout_logs),
      'last_7_days', (SELECT count(*) FROM workout_logs WHERE completed_at >= now() - interval '7 days'),
      'last_28_days', (SELECT count(*) FROM workout_logs WHERE completed_at >= now() - interval '28 days'),
      'active_warriors_last_7_days', (
        SELECT count(DISTINCT warrior_id) FROM workout_logs
        WHERE completed_at >= now() - interval '7 days'
      )
    ),
    'coach_leaderboard', (
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.active_clients DESC, x.templates DESC), '[]'::jsonb)
      FROM (
        SELECT p.id AS coach_id, p.display_name,
               (SELECT count(DISTINCT wp.warrior_id) FROM warrior_programs wp
                WHERE wp.coach_id = p.id AND wp.status = 'active') AS active_clients,
               (SELECT count(*) FROM program_templates pt WHERE pt.coach_id = p.id) AS templates,
               (SELECT count(*) FROM program_templates pt
                WHERE pt.coach_id = p.id AND pt.status = 'published') AS published_templates
        FROM profiles p
        WHERE p.is_coach = true OR p.is_admin = true
        LIMIT 100
      ) x
    )
  );
END;
$function$;

-- Grants — checklist item 3 for every function above.
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_overview() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_dashboard_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_overview() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_search_users(text, text, boolean, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_search_users(text, text, boolean, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, text, boolean, integer, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_trial_history(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_user_trial_history(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_trial_history(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_communities() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_communities() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_communities() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_challenge_analytics(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_challenge_analytics(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_challenge_analytics(date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_get_coaching_analytics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_get_coaching_analytics() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coaching_analytics() TO authenticated;
