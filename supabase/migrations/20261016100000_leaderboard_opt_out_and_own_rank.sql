-- Leaderboards: opt-out + your own rank beyond the top (2026-10-13 audit item
-- "leaderboards capped at 100, no opt-out"; owner decisions 2026-10-16).
--
-- 1. profiles.leaderboard_hidden: "Hide me from leaderboards". A hidden
--    athlete disappears from every board OTHER people see (Strength, Static,
--    Endurance, Power, Well-Rounded, Weekly, Journey community); still on
--    Team boards and Champions Arena. They always see their own row. Ranks
--    are counted over visible athletes only (no gaps). Set by the athlete
--    (own-row update; the column isn't a protected field).
-- 2. Capped boards take p_include_me (default false): with it, the caller's
--    own row is returned with its true rank even outside the top N, so
--    nobody past #100 loses their rank. Old apps don't send it and get the
--    same rows as before (minus hidden athletes).
-- Signatures gain a parameter (and the Strength board a `rank` column), so
-- each function is dropped and re-created; grants are re-applied.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS leaderboard_hidden boolean NOT NULL DEFAULT false;
-- The own-profile read is get_my_profile() (SETOF profiles), so the app sees
-- the new column without a column grant.

-- The one visibility rule every board asks (docs/features/FAIR_PLAY_MODERATION_PLAN.md):
-- is this athlete shown to the caller on the `p_scope` board? You always see
-- yourself; others only if you haven't hidden yourself. Fair Play's admin
-- holds plug in here later (scope 'well_rounded' will also honour Static,
-- Power and Endurance holds), so the boards never change again.
-- Scopes: strength, static, endurance, power, well_rounded, weekly, journey.
-- Runs as the definer (the column isn't client-readable); used by row policies.
CREATE OR REPLACE FUNCTION public.leaderboard_visible(p_user uuid, p_scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_user = auth.uid()
      OR NOT COALESCE((SELECT leaderboard_hidden FROM public.profiles WHERE id = p_user), false);
$function$;
REVOKE EXECUTE ON FUNCTION public.leaderboard_visible(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard_visible(uuid, text) TO authenticated, service_role;

-- Strength tier board ---------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_tier_leaderboard(integer, uuid);
CREATE FUNCTION public.get_tier_leaderboard(tier_num integer, p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(user_id uuid, display_name text, best_time integer, total_attempts bigint, country text, gender text, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT th.user_id, p.display_name, MIN(th.time_seconds) AS best_time, COUNT(th.id) AS total_attempts, p.country, p.gender
    FROM public.trial_history th
    JOIN public.profiles p ON p.id = th.user_id
    WHERE th.tier_attempted = tier_num
      AND th.completed = true
      AND (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'strength')
    GROUP BY th.user_id, p.display_name, p.country, p.gender
  ), ranked AS (
    SELECT base.*, ROW_NUMBER() OVER (ORDER BY base.best_time ASC) AS rank FROM base
  )
  SELECT r.user_id, r.display_name, r.best_time, r.total_attempts, r.country, r.gender, r.rank
  FROM ranked r
  WHERE r.rank <= 100 OR (p_include_me AND r.user_id = auth.uid())
  ORDER BY r.rank;
$function$;

-- Static: one movement --------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_static_movement_leaderboard(text, uuid);
CREATE FUNCTION public.get_static_movement_leaderboard(m_id text, p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(rank bigint, user_id uuid, display_name text, best_time_seconds numeric, points numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT ROW_NUMBER() OVER (ORDER BY sh.points DESC, sh.created_at ASC) AS rank,
           sh.user_id,
           COALESCE(p.display_name, split_part(p.email, '@', 1)) AS display_name,
           sh.hold_seconds AS best_time_seconds,
           sh.points
    FROM public.static_holds sh
    JOIN public.profiles p ON sh.user_id = p.id
    WHERE sh.movement_id = m_id
      AND (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'static')
  )
  SELECT r.rank, r.user_id, r.display_name, r.best_time_seconds, r.points
  FROM ranked r
  WHERE r.rank <= 100 OR (p_include_me AND r.user_id = auth.uid())
  ORDER BY r.rank;
$function$;

-- Static: a level -------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_static_level_leaderboard(integer, text[], uuid);
CREATE FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[], p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(rank bigint, user_id uuid, display_name text, total_points numeric, movement_times jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT sh.user_id,
           COALESCE(p.display_name, split_part(p.email, '@', 1)) AS display_name,
           SUM(sh.points) AS total_points,
           jsonb_object_agg(sh.movement_id, sh.hold_seconds) AS movement_times
    FROM public.static_holds sh
    JOIN public.profiles p ON sh.user_id = p.id
    WHERE sh.movement_id = ANY(m_ids)
      AND (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'static')
    GROUP BY sh.user_id, p.display_name, p.email
  ), ranked AS (
    SELECT ROW_NUMBER() OVER (ORDER BY base.total_points DESC) AS rank, base.* FROM base
  )
  SELECT r.rank, r.user_id, r.display_name, r.total_points, r.movement_times
  FROM ranked r
  WHERE r.rank <= 100 OR (p_include_me AND r.user_id = auth.uid())
  ORDER BY r.rank;
$function$;

-- Static: well-rounded --------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_static_well_rounded_leaderboard(uuid);
CREATE FUNCTION public.get_static_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(u_id uuid, d_name text, hs_pts numeric, fl_pts numeric, bl_pts numeric, pl_pts numeric, hs_time numeric, fl_time numeric, bl_time numeric, pl_time numeric, t_score numeric, rnk bigint, country text, gender text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH best_per_category AS (
    SELECT sh.user_id, sm.category, MAX(sh.points) AS best_points, MAX(sh.hold_seconds) AS best_time
    FROM public.static_holds sh
    JOIN public.static_movements sm ON sm.id = sh.movement_id
    GROUP BY sh.user_id, sm.category
  ), pivoted AS (
    SELECT bpc.user_id,
      MAX(CASE WHEN bpc.category = 'handstand'   THEN bpc.best_points ELSE 0 END) AS hs_pts,
      MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_points ELSE 0 END) AS fl_pts,
      MAX(CASE WHEN bpc.category = 'back_lever'  THEN bpc.best_points ELSE 0 END) AS bl_pts,
      MAX(CASE WHEN bpc.category = 'planche'     THEN bpc.best_points ELSE 0 END) AS pl_pts,
      MAX(CASE WHEN bpc.category = 'handstand'   THEN bpc.best_time   ELSE 0 END) AS hs_time,
      MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_time   ELSE 0 END) AS fl_time,
      MAX(CASE WHEN bpc.category = 'back_lever'  THEN bpc.best_time   ELSE 0 END) AS bl_time,
      MAX(CASE WHEN bpc.category = 'planche'     THEN bpc.best_time   ELSE 0 END) AS pl_time
    FROM best_per_category bpc
    WHERE bpc.category IS NOT NULL
    GROUP BY bpc.user_id
  ), ranked AS (
    SELECT p.id AS u_id,
           COALESCE(p.display_name, split_part(p.email, '@', 1)) AS d_name,
           pv.hs_pts, pv.fl_pts, pv.bl_pts, pv.pl_pts,
           pv.hs_time, pv.fl_time, pv.bl_time, pv.pl_time,
           (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) AS t_score,
           DENSE_RANK() OVER (ORDER BY (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) DESC) AS rnk,
           ROW_NUMBER() OVER (ORDER BY (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) DESC) AS pos,
           p.country, p.gender
    FROM pivoted pv
    JOIN public.profiles p ON pv.user_id = p.id
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'static')
  )
  SELECT r.u_id, r.d_name, r.hs_pts, r.fl_pts, r.bl_pts, r.pl_pts, r.hs_time, r.fl_time, r.bl_time, r.pl_time, r.t_score, r.rnk, r.country, r.gender
  FROM ranked r
  WHERE r.pos <= 100 OR (p_include_me AND r.u_id = auth.uid())
  ORDER BY r.pos;
$function$;

-- Endurance: one category (top 50) -------------------------------------------
DROP FUNCTION IF EXISTS public.get_onemm_category_leaderboard(text, uuid);
CREATE FUNCTION public.get_onemm_category_leaderboard(p_category_id text, p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(u_id uuid, d_name text, gender text, t_score numeric, rnk bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH user_totals AS (
    SELECT omml.user_id, SUM(omml.points) AS total_score
    FROM public.one_min_max_logs omml
    WHERE omml.category_id = p_category_id
    GROUP BY omml.user_id
  ), ranked AS (
    SELECT p.id AS u_id,
           COALESCE(p.display_name, split_part(p.email, '@', 1)) AS d_name,
           p.gender AS gender,
           ut.total_score::numeric AS t_score,
           DENSE_RANK() OVER (ORDER BY ut.total_score DESC) AS rnk,
           ROW_NUMBER() OVER (ORDER BY ut.total_score DESC) AS pos
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'endurance')
  )
  SELECT r.u_id, r.d_name, r.gender, r.t_score, r.rnk
  FROM ranked r
  WHERE r.pos <= 50 OR (p_include_me AND r.u_id = auth.uid())
  ORDER BY r.pos;
$function$;

-- Endurance: well-rounded -----------------------------------------------------
DROP FUNCTION IF EXISTS public.get_onemm_well_rounded_leaderboard(uuid);
CREATE FUNCTION public.get_onemm_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(u_id uuid, d_name text, country text, gender text, t_score numeric, rnk bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH pattern_peaks AS (
    SELECT omml.user_id, om.pattern_id, MAX(omml.points) AS best_points
    FROM public.one_min_max_logs omml
    JOIN public.onemm_movements om ON om.id = omml.movement_id
    WHERE NOT omml.excluded_from_pb
    GROUP BY omml.user_id, om.pattern_id
  ), user_totals AS (
    SELECT pp.user_id, SUM(pp.best_points) AS total_score FROM pattern_peaks pp GROUP BY pp.user_id
  ), ranked AS (
    SELECT p.id AS u_id,
           COALESCE(p.display_name, split_part(p.email, '@', 1)) AS d_name,
           p.country AS country,
           p.gender AS gender,
           ut.total_score::numeric AS t_score,
           DENSE_RANK() OVER (ORDER BY ut.total_score DESC) AS rnk,
           ROW_NUMBER() OVER (ORDER BY ut.total_score DESC) AS pos
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    WHERE (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'endurance')
  )
  SELECT r.u_id, r.d_name, r.country, r.gender, r.t_score, r.rnk
  FROM ranked r
  WHERE r.pos <= 100 OR (p_include_me AND r.u_id = auth.uid())
  ORDER BY r.pos;
$function$;

-- Global well-rounded ---------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_global_well_rounded_leaderboard(uuid);
CREATE FUNCTION public.get_global_well_rounded_leaderboard(p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(rank bigint, user_id uuid, display_name text, country text, gender text, static_pts numeric, power_pts numeric, endurance_pts numeric, total_score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT p.id AS user_id, p.display_name, p.country, p.gender,
           COALESCE(p.statics_tier, 0)::numeric AS static_pts,
           COALESCE(p.power_points, 0)::numeric AS power_pts,
           COALESCE(p.one_mm_points, 0)::numeric AS endurance_pts,
           (COALESCE(p.statics_tier, 0) + COALESCE(p.power_points, 0) + COALESCE(p.one_mm_points, 0))::numeric AS total_score
    FROM public.profiles p
    WHERE (COALESCE(p.statics_tier, 0) + COALESCE(p.power_points, 0) + COALESCE(p.one_mm_points, 0)) > 0
      AND (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'well_rounded')
  ), ranked AS (
    SELECT ROW_NUMBER() OVER (ORDER BY base.total_score DESC) AS rank, base.* FROM base
  )
  SELECT r.rank, r.user_id, r.display_name, r.country, r.gender, r.static_pts, r.power_pts, r.endurance_pts, r.total_score
  FROM ranked r
  WHERE r.rank <= 100 OR (p_include_me AND r.user_id = auth.uid())
  ORDER BY r.rank;
$function$;

-- Power tier board (was read straight from profiles by the app) -------------
CREATE OR REPLACE FUNCTION public.get_power_tier_board(p_tier integer, p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(user_id uuid, display_name text, power_points numeric, country text, gender text, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH ranked AS (
    SELECT p.id AS user_id, p.display_name, COALESCE(p.power_points, 0)::numeric AS power_points, p.country, p.gender,
           ROW_NUMBER() OVER (ORDER BY COALESCE(p.power_points, 0) DESC) AS rank
    FROM public.profiles p
    WHERE p.power_tier = p_tier
      AND (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible(p.id, 'power')
  )
  SELECT r.user_id, r.display_name, r.power_points, r.country, r.gender, r.rank
  FROM ranked r
  WHERE r.rank <= 100 OR (p_include_me AND r.user_id = auth.uid())
  ORDER BY r.rank;
$function$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.get_tier_leaderboard(integer, uuid, boolean)',
    'public.get_static_movement_leaderboard(text, uuid, boolean)',
    'public.get_static_level_leaderboard(integer, text[], uuid, boolean)',
    'public.get_static_well_rounded_leaderboard(uuid, boolean)',
    'public.get_onemm_category_leaderboard(text, uuid, boolean)',
    'public.get_onemm_well_rounded_leaderboard(uuid, boolean)',
    'public.get_global_well_rounded_leaderboard(uuid, boolean)',
    'public.get_power_tier_board(integer, uuid, boolean)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- Weekly Challenge entries: read straight by the app, so hide at the row
-- level (old apps included): others' entries only when not hidden.
ALTER POLICY "Anyone can read entries" ON public.weekly_entries
  USING (public.is_admin() OR public.leaderboard_visible(user_id, 'weekly'));

-- Journey community board: hidden members only see themselves --------------
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
        -- Hidden athletes only ever see themselves.
        AND public.leaderboard_visible(p.id, 'journey')
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

-- World dashboards' rank, ranked count and "athlete above you": over visible
-- athletes only (per-movement world records stay: a time, not a person).
CREATE OR REPLACE FUNCTION public.get_world_summary(p_world text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_world = 'static' THEN
    WITH per_cat AS (
      SELECT sh.user_id, sm.category, MAX(sh.points) AS best_points
      FROM public.static_holds sh
      JOIN public.static_movements sm ON sm.id = sh.movement_id
      WHERE sm.category IS NOT NULL
      GROUP BY sh.user_id, sm.category
    ),
    scores AS (
      SELECT user_id, SUM(best_points)::numeric AS score
      FROM per_cat GROUP BY user_id HAVING SUM(best_points) > 0
    ),
    ranked AS (
      -- Hidden athletes don't count for anyone but themselves.
      SELECT s.user_id, s.score, DENSE_RANK() OVER (ORDER BY s.score DESC) AS rnk
      FROM scores s
      WHERE public.leaderboard_visible(s.user_id, 'static')
    )
    SELECT jsonb_build_object(
      'ranked_count', (SELECT COUNT(*) FROM ranked),
      'top_score',    COALESCE((SELECT MAX(score) FROM ranked), 0),
      'my_score',     COALESCE((SELECT score FROM ranked WHERE user_id = v_uid), 0),
      'my_rank',      (SELECT rnk FROM ranked WHERE user_id = v_uid),
      'above',        (SELECT jsonb_build_object('rank', r.rnk, 'score', r.score,
                         'name', COALESCE(p.display_name, 'Warrior'))
                       FROM ranked r JOIN public.profiles p ON p.id = r.user_id
                       WHERE r.score > COALESCE((SELECT score FROM ranked WHERE user_id = v_uid), 0)
                       ORDER BY r.score ASC LIMIT 1),
      'movement_bests', COALESCE((SELECT jsonb_object_agg(movement_id, best)
                         FROM (SELECT movement_id, MAX(hold_seconds) AS best
                               FROM public.static_holds GROUP BY movement_id) b), '{}'::jsonb)
    ) INTO v_result;

  ELSIF p_world = 'onemm' THEN
    WITH per_pattern AS (
      SELECT l.user_id, om.pattern_id, MAX(l.points) AS best_points
      FROM public.one_min_max_logs l
      JOIN public.onemm_movements om ON om.id = l.movement_id
      WHERE NOT l.excluded_from_pb
      GROUP BY l.user_id, om.pattern_id
    ),
    scores AS (
      SELECT user_id, SUM(best_points)::numeric AS score
      FROM per_pattern GROUP BY user_id HAVING SUM(best_points) > 0
    ),
    ranked AS (
      -- Hidden athletes don't count for anyone but themselves.
      SELECT s.user_id, s.score, DENSE_RANK() OVER (ORDER BY s.score DESC) AS rnk
      FROM scores s
      WHERE public.leaderboard_visible(s.user_id, 'endurance')
    )
    SELECT jsonb_build_object(
      'ranked_count', (SELECT COUNT(*) FROM ranked),
      'top_score',    COALESCE((SELECT MAX(score) FROM ranked), 0),
      'my_score',     COALESCE((SELECT score FROM ranked WHERE user_id = v_uid), 0),
      'my_rank',      (SELECT rnk FROM ranked WHERE user_id = v_uid),
      'above',        (SELECT jsonb_build_object('rank', r.rnk, 'score', r.score,
                         'name', COALESCE(p.display_name, 'Warrior'))
                       FROM ranked r JOIN public.profiles p ON p.id = r.user_id
                       WHERE r.score > COALESCE((SELECT score FROM ranked WHERE user_id = v_uid), 0)
                       ORDER BY r.score ASC LIMIT 1),
      'movement_bests', COALESCE((SELECT jsonb_object_agg(movement_id, best)
                         FROM (SELECT movement_id, MAX(reps) AS best
                               FROM public.one_min_max_logs
                               WHERE NOT excluded_from_pb
                               GROUP BY movement_id) b), '{}'::jsonb)
    ) INTO v_result;

  ELSIF p_world = 'power' THEN
    WITH scores AS (
      SELECT id AS user_id, power_points::numeric AS score, display_name
      FROM public.profiles
      WHERE power_points > 0 AND public.leaderboard_visible(id, 'power')
    ),
    me AS (SELECT COALESCE((SELECT score FROM scores WHERE user_id = v_uid), 0) AS score)
    SELECT jsonb_build_object(
      'ranked_count', (SELECT COUNT(*) FROM scores),
      'top_score',    COALESCE((SELECT MAX(score) FROM scores), 0),
      'my_score',     (SELECT score FROM me),
      'my_rank',      CASE WHEN (SELECT score FROM me) > 0
                        THEN (SELECT COUNT(*) FROM scores WHERE score > (SELECT score FROM me)) + 1
                      END,
      'above',        (SELECT jsonb_build_object(
                         'rank', (SELECT COUNT(*) FROM scores s2 WHERE s2.score > s.score) + 1,
                         'score', s.score,
                         'name', COALESCE(s.display_name, 'Warrior'))
                       FROM scores s
                       WHERE s.score > (SELECT score FROM me)
                       ORDER BY s.score ASC LIMIT 1),
      'movement_bests', (SELECT jsonb_build_object(
                         'pull_up',   COALESCE(MAX(pullup_1rm), 0),
                         'dip',       COALESCE(MAX(dip_1rm), 0),
                         'squat',     COALESCE(MAX(squat_1rm), 0),
                         'muscle_up', COALESCE(MAX(muscleup_1rm), 0))
                       FROM public.power_assessments)
    ) INTO v_result;

  ELSE
    RAISE EXCEPTION 'Unknown world: %', p_world USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_world_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_summary(text) TO authenticated, service_role;
