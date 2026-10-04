-- Journey points: `week` in the summary is now the last 7 days ending
-- today (today last), not the calendar week Monday → Sunday. On a Monday
-- the calendar week showed only today, hiding yesterday's workout even
-- though it was part of the current streak; the design handoff's 7-day
-- strip also ends on today. journey_points_summary only.

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
    'total', (SELECT COALESCE(sum(points), 0) FROM public.journey_points WHERE user_id = p_user),
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
               'points', (SELECT COALESCE(sum(points), 0) FROM public.journey_points WHERE user_id = p_user AND local_date = d::date),
               'trained', EXISTS (SELECT 1 FROM public.journey_points WHERE user_id = p_user AND source = 'program_day' AND local_date = d::date))
             ORDER BY d)
      FROM generate_series(v_today - 6, v_today, interval '1 day') d),
    -- Ledger for the history sheet: the last 7 local dates that have points.
    'recent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', local_date, 'source', source, 'label', label, 'points', points)
             ORDER BY local_date DESC, created_at, id)
      FROM public.journey_points
      WHERE user_id = p_user AND local_date IN (
        SELECT DISTINCT local_date FROM public.journey_points WHERE user_id = p_user ORDER BY local_date DESC LIMIT 7)), '[]'::jsonb),
    -- Awarded by this very call (same transaction) — what the app animates.
    'new_awards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('source', source, 'label', label, 'points', points, 'date', local_date) ORDER BY id)
      FROM public.journey_points WHERE user_id = p_user AND created_at = now()), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.journey_points_summary(uuid, text) FROM PUBLIC, anon, authenticated;
