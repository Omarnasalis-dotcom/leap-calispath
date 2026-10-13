-- Owner decision 2026-10-14: the Journey shows the points of the CURRENT
-- program only, not a lifetime sum across every program (finished or
-- archived). The journey_points ledger keeps everything; only what the
-- summary counts changes:
--   * program_day / side_quest / trial rows (source_key starts with the
--     warrior_program id) count when they belong to the active program;
--   * date-based rows (extras, perfect_day, streak) count from the local
--     date the active program was assigned.
-- With no active program nothing is scoped (all points show, as before).
-- Restoring an old program brings its own points back.

CREATE OR REPLACE FUNCTION public.journey_points_visible(p_user uuid, p_tz text)
RETURNS SETOF public.journey_points
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH act AS (
    SELECT id::text AS program_id,
           (assigned_at AT TIME ZONE public.journey_points_tz(p_tz))::date AS start_date
    FROM public.warrior_programs
    WHERE warrior_id = p_user AND status = 'active'
    ORDER BY assigned_at DESC
    LIMIT 1
  )
  SELECT jp.*
  FROM public.journey_points jp
  WHERE jp.user_id = p_user
    AND (
      NOT EXISTS (SELECT 1 FROM act)
      OR CASE WHEN jp.source IN ('program_day', 'side_quest', 'trial')
              THEN split_part(jp.source_key, ':', 1) = (SELECT program_id FROM act)
              ELSE jp.local_date >= (SELECT start_date FROM act)
         END
    );
$function$;

-- Internal helper for journey_points_summary only.
REVOKE EXECUTE ON FUNCTION public.journey_points_visible(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_points_visible(uuid, text) TO service_role;

-- Summary: total, the 7-day strip's points and the history list use the
-- current program's points. Streak, trained flags, today's tasks and this
-- call's new awards are unchanged.
CREATE OR REPLACE FUNCTION public.journey_points_summary(p_user uuid, p_tz text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz     text := public.journey_points_tz(p_tz);
  v_today  date := (now() AT TIME ZONE v_tz)::date;
  v_run    date[] := public.journey_points_current_run(p_user, v_today);
BEGIN
  RETURN jsonb_build_object(
    'today', v_today,
    'total', (SELECT COALESCE(sum(points), 0) FROM public.journey_points_visible(p_user, v_tz)),
    'streak', coalesce(array_length(v_run, 1), 0),
    'best_streak', public.journey_points_best_run(p_user),
    'trained_today', EXISTS (SELECT 1 FROM public.journey_points
                             WHERE user_id = p_user AND source = 'program_day' AND local_date = v_today),
    'values', (SELECT jsonb_object_agg(key, value) FROM public.journey_points_config),
    'tasks_today', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'task', t.task, 'amount', t.amount,
               'paid', EXISTS (SELECT 1 FROM public.journey_points jp WHERE jp.user_id = p_user
                               AND jp.source = 'task_' || t.task AND jp.source_key = t.local_date::text))
             ORDER BY array_position(ARRAY['book', 'run', 'meal'], t.task))
      FROM public.journey_daily_tasks t WHERE t.user_id = p_user AND t.local_date = v_today), '[]'::jsonb),
    'week', (
      SELECT jsonb_agg(jsonb_build_object(
               'date', d::date,
               'points', (SELECT COALESCE(sum(points), 0) FROM public.journey_points_visible(p_user, v_tz) WHERE local_date = d::date),
               'trained', EXISTS (SELECT 1 FROM public.journey_points WHERE user_id = p_user AND source = 'program_day' AND local_date = d::date))
             ORDER BY d)
      FROM generate_series(v_today - 6, v_today, interval '1 day') d),
    -- Ledger for the history sheet: the last 7 local dates that have points.
    'recent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', local_date, 'source', source, 'label', label, 'points', points)
             ORDER BY local_date DESC, created_at, id)
      FROM public.journey_points_visible(p_user, v_tz)
      WHERE local_date IN (
        SELECT DISTINCT local_date FROM public.journey_points_visible(p_user, v_tz) ORDER BY local_date DESC LIMIT 7)), '[]'::jsonb),
    -- Awarded by this very call (same transaction) — what the app animates.
    'new_awards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', source, 'label', label, 'points', points, 'date', local_date) ORDER BY id)
      FROM public.journey_points WHERE user_id = p_user AND created_at = now()), '[]'::jsonb)
  );
END;
$function$
;
