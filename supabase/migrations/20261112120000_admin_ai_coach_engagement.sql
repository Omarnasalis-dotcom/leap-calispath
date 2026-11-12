-- Admin Dashboard: AI Coach engagement panel (design phase 2).
--
-- Read-only aggregates for one window (default 7 days): AI Coach programs
-- and how many of those athletes trained, chat activity with a daily trend,
-- reply health (turns flagged automatically: errors, cut-offs, claims it
-- didn't act on, tool errors, safety flags) and spend. Totals only: no
-- message text and no names, so any admin may read it (the chat log itself
-- stays owner-only through ai_coach_chat_reviewers).
--
-- Sources: warrior_programs/workout_logs (AI Coach programs are owned by the
-- AI Coach system profile 0002), ai_coach_turns (one row per message, logged
-- since 2026-10-30) and ai_coach_requests (the cost log, one row per model
-- call). Days are local days in Africa/Cairo, like the Growth report.

CREATE OR REPLACE FUNCTION public.admin_get_ai_coach_engagement(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c_ai_coach CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);
  v_since timestamptz := now() - make_interval(days => v_days);
  v_tz CONSTANT text := 'Africa/Cairo';
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  WITH ai_programs AS (
    SELECT wp.id, wp.warrior_id
    FROM warrior_programs wp
    WHERE wp.coach_id = c_ai_coach AND wp.status = 'active'
  ),
  trained AS (
    SELECT DISTINCT wl.warrior_id
    FROM workout_logs wl
    JOIN ai_programs p ON p.id = wl.warrior_program_id
    WHERE wl.completed_at >= v_since
      AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'
  ),
  turns AS (
    SELECT t.user_id, t.created_at, t.outcome, t.auto_issue
    FROM ai_coach_turns t
    WHERE t.created_at >= v_since
  ),
  days AS (
    SELECT d::date AS day
    FROM generate_series(
      (now() AT TIME ZONE v_tz)::date - (v_days - 1),
      (now() AT TIME ZONE v_tz)::date,
      interval '1 day'
    ) AS d
  ),
  daily AS (
    SELECT dy.day,
           count(t.*) AS messages,
           count(DISTINCT t.user_id) AS people
    FROM days dy
    LEFT JOIN turns t ON (t.created_at AT TIME ZONE v_tz)::date = dy.day
    GROUP BY dy.day
  ),
  outcomes AS (
    SELECT outcome, count(*) AS n
    FROM turns
    WHERE auto_issue
    GROUP BY outcome
  ),
  spend AS (
    SELECT coalesce(sum(r.cost_usd), 0) AS cost_usd, count(*) AS requests
    FROM ai_coach_requests r
    WHERE r.created_at >= v_since
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'programs', jsonb_build_object(
      'active_athletes', (SELECT count(DISTINCT warrior_id) FROM ai_programs),
      'trained_athletes', (SELECT count(*) FROM trained)
    ),
    'chat', jsonb_build_object(
      'people', (SELECT count(DISTINCT user_id) FROM turns),
      'messages', (SELECT count(*) FROM turns),
      'daily', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('day', day, 'messages', messages, 'people', people) ORDER BY day), '[]'::jsonb)
        FROM daily
      )
    ),
    'health', jsonb_build_object(
      'turns', (SELECT count(*) FROM turns),
      'issues', (SELECT count(*) FROM turns WHERE auto_issue),
      'by_outcome', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('outcome', outcome, 'turns', n) ORDER BY n DESC), '[]'::jsonb)
        FROM outcomes
      )
    ),
    'cost', (SELECT jsonb_build_object('usd', round(cost_usd::numeric, 2), 'requests', requests) FROM spend)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_ai_coach_engagement(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ai_coach_engagement(integer) TO authenticated, service_role;
