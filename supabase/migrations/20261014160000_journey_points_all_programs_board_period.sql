-- Owner decisions 2026-10-14 (supersede 20261014100000's current-program view):
--   1. Journey POINTS counts every program again, so it matches the badge's
--      lifetime total. The one exception: points earned in a program the
--      athlete DELETED (delete_past_program) are gone everywhere — the
--      POINTS total, lifetime points, badges and the community board.
--      Date-based points (extras, perfect day, streaks) aren't tied to a
--      program and stay.
--   2. The community board gets a period: 'week' (last 7 days, as before)
--      or 'lifetime' (all counted points).
-- The ledger keeps every row; deleted programs are filtered out on read
-- (delete_past_program only marks the program 'deleted').

-- Counted points: everything except rows from the athlete's deleted programs.
-- Signature kept (p_tz is no longer used) so journey_points_summary needs no
-- change: its total, 7-day strip and history now count every program.
CREATE OR REPLACE FUNCTION public.journey_points_visible(p_user uuid, p_tz text)
RETURNS SETOF public.journey_points
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jp.*
  FROM public.journey_points jp
  WHERE jp.user_id = p_user
    AND NOT (
      jp.source IN ('program_day', 'side_quest', 'trial')
      AND split_part(jp.source_key, ':', 1) IN (
        SELECT id::text FROM public.warrior_programs
        WHERE warrior_id = p_user AND status = 'deleted')
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_points_visible(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_points_visible(uuid, text) TO service_role;

-- Badge level for a counted total.
CREATE OR REPLACE FUNCTION public.journey_level_for(p_points integer)
RETURNS smallint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(max(level), 0)::smallint FROM public.journey_levels WHERE threshold <= p_points;
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_level_for(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_level_for(integer) TO service_role;

-- Award: every level the counted lifetime total has reached (never removes).
CREATE OR REPLACE FUNCTION public.journey_achievements_award(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.journey_achievements (user_id, level)
  SELECT p_user, l.level
  FROM public.journey_levels l
  WHERE l.threshold <= (SELECT COALESCE(sum(points), 0) FROM public.journey_points_visible(p_user, NULL))
  ON CONFLICT (user_id, level) DO NOTHING;
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_achievements_award(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_achievements_award(uuid) TO service_role;

-- After a program is deleted only: drop badges the counted total no longer
-- reaches. (Elsewhere badges are never lost, e.g. a same-day undo.)
CREATE OR REPLACE FUNCTION public.journey_achievements_trim(p_user uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.journey_achievements
  WHERE user_id = p_user
    AND level > public.journey_level_for(
      (SELECT COALESCE(sum(points), 0)::integer FROM public.journey_points_visible(p_user, NULL)));
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_achievements_trim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_achievements_trim(uuid) TO service_role;

-- State for the summary: lifetime = counted points.
CREATE OR REPLACE FUNCTION public.journey_achievement_state(p_user uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH life AS (
    SELECT COALESCE(sum(points), 0)::integer AS pts FROM public.journey_points_visible(p_user, NULL)
  ), owned AS (
    SELECT COALESCE(max(level), 0) AS lvl FROM public.journey_achievements WHERE user_id = p_user
  ), pending AS (
    SELECT max(level) AS top, array_agg(level ORDER BY level) AS all_levels
    FROM public.journey_achievements WHERE user_id = p_user AND celebrated_at IS NULL
  ), last_celebrated AS (
    SELECT COALESCE(max(level), 0) AS lvl FROM public.journey_achievements
    WHERE user_id = p_user AND celebrated_at IS NOT NULL
  )
  SELECT jsonb_build_object(
    'level', (SELECT lvl FROM owned),
    'lifetime', (SELECT pts FROM life),
    'current_threshold', (SELECT threshold FROM public.journey_levels WHERE level = (SELECT lvl FROM owned)),
    'next_level', (SELECT min(level) FROM public.journey_levels WHERE level > (SELECT lvl FROM owned)),
    'next_threshold', (SELECT min(threshold) FROM public.journey_levels WHERE level > (SELECT lvl FROM owned)),
    'pending', CASE WHEN (SELECT top FROM pending) IS NULL THEN NULL ELSE jsonb_build_object(
      'level', (SELECT top FROM pending),
      -- Shown in the reveal as "the badge you had": the last celebrated one.
      'previous_level', (SELECT lvl FROM last_celebrated),
      'skipped', to_jsonb(COALESCE((SELECT array_remove(all_levels, top) FROM pending), ARRAY[]::smallint[]))
    ) END
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_achievement_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_achievement_state(uuid) TO service_role;

-- Delete a past program: also removes its points everywhere (see the top).
CREATE OR REPLACE FUNCTION public.delete_past_program(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_warrior_id CONSTANT uuid := auth.uid();
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  UPDATE warrior_programs SET status = 'deleted'
  WHERE id = p_warrior_program_id
    AND warrior_id = v_warrior_id
    AND status = 'completed'
    AND coach_id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  -- Its Journey points no longer count (journey_points_visible); badges
  -- above the new total go too.
  PERFORM public.journey_achievements_trim(v_warrior_id);

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_past_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_past_program(uuid) TO authenticated, service_role;

-- Community board with a period ----------------------------------------------
-- 'week'     = counted points dated within each MEMBER's own last 7 local days
--              (their profile time zone; the caller's from the app).
-- 'lifetime' = all counted points.
-- Members with 0 points in the period are not ranked; the caller is always
-- returned. Ties go to whoever reached their total first. Only username,
-- badge level, points, rank and is_you leave the server. `weekly_points`
-- repeats `points` for apps released before the period existed (1.2.11),
-- which call this with p_tz only (= 'week').
DROP FUNCTION IF EXISTS public.get_journey_community_board(text);

CREATE OR REPLACE FUNCTION public.get_journey_community_board(p_tz text, p_period text DEFAULT 'week')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_community uuid;
  v_name text;
  v_lifetime boolean := p_period = 'lifetime';
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('week', 'lifetime') THEN
    RAISE EXCEPTION 'Invalid period' USING ERRCODE = '22023';
  END IF;

  SELECT p.community_id, c.name INTO v_community, v_name
  FROM public.profiles p LEFT JOIN public.communities c ON c.id = p.community_id
  WHERE p.id = v_user;

  IF v_community IS NULL THEN
    RETURN jsonb_build_object('community', NULL, 'members', 0, 'rows', '[]'::jsonb);
  END IF;

  RETURN (
    WITH members AS (
      SELECT p.id, COALESCE(NULLIF(trim(p.display_name), ''), 'Warrior') AS username,
             (now() AT TIME ZONE public.journey_points_tz(CASE WHEN p.id = v_user THEN p_tz ELSE p.timezone END))::date AS today
      FROM public.profiles p WHERE p.community_id = v_community
    ), totals AS (
      SELECT m.id, m.username, s.life, s.period_pts, s.reached_at
      FROM members m
      CROSS JOIN LATERAL (
        SELECT COALESCE(sum(v.points), 0)::integer AS life,
               COALESCE(sum(v.points) FILTER (WHERE v_lifetime OR v.local_date BETWEEN m.today - 6 AND m.today), 0)::integer AS period_pts,
               max(v.created_at) FILTER (WHERE v_lifetime OR v.local_date BETWEEN m.today - 6 AND m.today) AS reached_at
        FROM public.journey_points_visible(m.id, NULL) v
      ) s
    ), ranked AS (
      SELECT w.*,
             CASE WHEN w.period_pts > 0 THEN row_number() OVER (
               ORDER BY (w.period_pts > 0) DESC, w.period_pts DESC, w.reached_at ASC NULLS LAST, w.username) END AS rnk,
             -- Recorded levels are written when a member opens Journey; until
             -- then their counted lifetime total still shows the badge earned.
             GREATEST(
               (SELECT COALESCE(max(a.level), 0) FROM public.journey_achievements a WHERE a.user_id = w.id),
               public.journey_level_for(w.life)
             ) AS badge
      FROM totals w
    )
    SELECT jsonb_build_object(
      'community', v_name,
      'members', (SELECT count(*) FROM members),
      'period', p_period,
      'rows', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'username', r.username, 'points', r.period_pts, 'weekly_points', r.period_pts, 'rank', r.rnk,
                 'badge_level', r.badge, 'is_you', r.id = v_user)
               ORDER BY r.rnk NULLS LAST)
        FROM (SELECT * FROM ranked WHERE rnk IS NOT NULL AND rnk <= 100 OR id = v_user) r
      ), '[]'::jsonb)
    )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_journey_community_board(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_journey_community_board(text, text) TO authenticated, service_role;

-- Athletes who already deleted a program: trim badges their counted total
-- no longer reaches (none on prod at the time of writing).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT warrior_id FROM public.warrior_programs WHERE status = 'deleted' LOOP
    PERFORM public.journey_achievements_trim(r.warrior_id);
  END LOOP;
END $$;
