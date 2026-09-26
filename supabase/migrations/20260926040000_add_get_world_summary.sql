-- get_world_summary(p_world) — one read-only call that feeds the redesigned
-- world dashboards (assets/design_handoff_worlds/README.md §0.4, §2.1, §3.2):
--
--   ranked_count    users with a score > 0 (Rank ring denominator)
--   top_score       the #1 score in the world (Power/Endurance Score ring)
--   my_score        the caller's score
--   my_rank         the caller's rank, NULL when unranked
--   above_rank      rank of the nearest user strictly above the caller
--   above_score     their score (Gap circle / goal card "pts to pass")
--   above_name      their display name ("x pts to pass @name")
--   movement_bests  { movement_id: world-best raw value } (seconds / kg / reps)
--
-- Scores and ranks reuse each world's LIVE formula exactly, so nothing here
-- can disagree with the leaderboards:
--   static — sum of per-category peak points, DENSE_RANK
--            (get_static_well_rounded_leaderboard)
--   onemm  — sum of per-pattern peak points excluding superseded PBs,
--            DENSE_RANK (get_onemm_well_rounded_leaderboard)
--   power  — profiles.power_points, rank = count(strictly higher) + 1
--            (PowerService.getGloryRank)
--
-- Always global (no community filter): the dashboard circles read "OF WORLD".
-- The leaderboard sheet keeps using the existing, community-aware RPCs.
--
-- SECURITY DEFINER because it aggregates across users, same as the existing
-- leaderboard RPCs. It returns only aggregates plus the one display name the
-- public leaderboards already show.

CREATE OR REPLACE FUNCTION public.get_world_summary(p_world text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
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
      SELECT user_id, score, DENSE_RANK() OVER (ORDER BY score DESC) AS rnk FROM scores
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
      SELECT user_id, score, DENSE_RANK() OVER (ORDER BY score DESC) AS rnk FROM scores
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
      FROM public.profiles WHERE power_points > 0
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

REVOKE ALL ON FUNCTION public.get_world_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_world_summary(text) TO authenticated;
