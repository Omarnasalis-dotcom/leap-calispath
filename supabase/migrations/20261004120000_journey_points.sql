-- Journey points (owner decisions 2026-10-04). Motivation only — no
-- leaderboard. Every award is a row in journey_points, written only by the
-- SECURITY DEFINER functions below, each checked against real data:
--
--   program_day  +50  every block of a program day logged, at least one
--                     not "[STATUS:MISSED]" (same grouping as the app:
--                     "{Day} | {Block}" name prefix + week)
--   side_quest   +30  a journey_quest_slots 'done' row, paid only while
--   trial       +100  the user has more real results (weekly/1MM/static/
--                     power, or completed trials) since the program started
--                     than quests already paid on that program
--   task_book/run/meal +10/+20/+10  self-reported extras, any time today,
--                     paid only once a program day is finished that same
--                     local date (pending until then, expire at midnight),
--                     honor_daily_cap per day, undo only on the same day
--   perfect_day  +20  program day + all 3 extras (+ the day's side quest,
--                     unless the app says that card has none) on one date
--   streak            ladder on consecutive training days (a training day
--                     = a date with a program_day award; 3+ calendar days
--                     with none breaks it): 3 → 15, 7 → 50, 14 → 100,
--                     30 and every 30 after → 250. Paid once per run, only
--                     when reached today/yesterday (no history backfill).
--
-- "Today" is the user's local date from the IANA time zone the app sends
-- (validated; falls back to UTC). Values live in journey_points_config so
-- they can change without an app release.

-- ── Config ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journey_points_config (
  key   text PRIMARY KEY,
  value integer NOT NULL CHECK (value >= 0)
);
ALTER TABLE public.journey_points_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_points_config FROM PUBLIC, anon, authenticated;

INSERT INTO public.journey_points_config (key, value) VALUES
  ('program_day', 50),
  ('side_quest', 30),
  ('trial', 100),
  ('task_book', 10),
  ('task_run', 20),
  ('task_meal', 10),
  ('perfect_day', 20),
  ('streak_3', 15),
  ('streak_7', 50),
  ('streak_14', 100),
  ('streak_30', 250),
  ('honor_daily_cap', 60)
ON CONFLICT (key) DO NOTHING;

-- ── Ledger ──────────────────────────────────────────────────────────────
-- No FK to warrior_programs: points survive deleting a program.
CREATE TABLE IF NOT EXISTS public.journey_points (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source      text NOT NULL CHECK (source IN
                ('program_day', 'side_quest', 'trial', 'task_book', 'task_run', 'task_meal', 'perfect_day', 'streak')),
  source_key  text NOT NULL,
  points      integer NOT NULL CHECK (points >= 0),
  local_date  date NOT NULL,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, source_key)
);
CREATE INDEX IF NOT EXISTS journey_points_user_date_idx ON public.journey_points (user_id, local_date);

ALTER TABLE public.journey_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_points FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journey_points TO authenticated;
CREATE POLICY "Users read own journey points"
  ON public.journey_points FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── Extras ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journey_daily_tasks (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date  date NOT NULL,
  task        text NOT NULL CHECK (task IN ('book', 'run', 'meal')),
  amount      integer CHECK (amount BETWEEN 1 AND 10),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, local_date, task)
);

ALTER TABLE public.journey_daily_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.journey_daily_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.journey_daily_tasks TO authenticated;
CREATE POLICY "Users read own journey daily tasks"
  ON public.journey_daily_tasks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── Helpers (internal, not callable by clients) ─────────────────────────
CREATE OR REPLACE FUNCTION public.journey_points_tz(p_tz text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_tz IS NOT NULL AND EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_tz) THEN p_tz
    ELSE 'UTC'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.journey_points_value(p_key text)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT value FROM public.journey_points_config WHERE key = p_key), 0);
$function$;

-- Training dates newest first, cut at the first gap of 3+ empty days.
-- Empty when the latest training date is already 4+ days before p_today.
CREATE OR REPLACE FUNCTION public.journey_points_current_run(p_user uuid, p_today date)
RETURNS date[]
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_run  date[] := '{}';
  v_prev date;
  v_d    date;
BEGIN
  FOR v_d IN
    SELECT DISTINCT local_date FROM public.journey_points
    WHERE user_id = p_user AND source = 'program_day' AND local_date <= p_today
    ORDER BY local_date DESC
  LOOP
    IF v_prev IS NULL THEN
      EXIT WHEN p_today - v_d > 3;
    ELSE
      EXIT WHEN v_prev - v_d > 3;
    END IF;
    v_run := v_run || v_d;
    v_prev := v_d;
  END LOOP;
  RETURN v_run;
END;
$function$;

CREATE OR REPLACE FUNCTION public.journey_points_best_run(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_best integer := 0;
  v_len  integer := 0;
  v_prev date;
  v_d    date;
BEGIN
  FOR v_d IN
    SELECT DISTINCT local_date FROM public.journey_points
    WHERE user_id = p_user AND source = 'program_day'
    ORDER BY local_date
  LOOP
    v_len := CASE WHEN v_prev IS NOT NULL AND v_d - v_prev <= 3 THEN v_len + 1 ELSE 1 END;
    v_best := GREATEST(v_best, v_len);
    v_prev := v_d;
  END LOOP;
  RETURN v_best;
END;
$function$;

-- Pays everything owed. Idempotent: every award is ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.journey_points_award(p_user uuid, p_tz text, p_day_has_quest boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz      text := public.journey_points_tz(p_tz);
  v_today   date := (now() AT TIME ZONE public.journey_points_tz(p_tz))::date;
  v_slot    record;
  v_task    record;
  v_results integer;
  v_used    integer;
  v_is_trial boolean;
  v_cap     integer := public.journey_points_value('honor_daily_cap');
  v_paid    integer;
  v_pts     integer;
  v_run     date[];
  v_n       integer;
  v_m       integer;
BEGIN
  -- 1. Program days: fully logged, at least one block actually done.
  INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
  SELECT p_user, 'program_day', d.program_id || ':w' || d.wk || ':' || d.day_key,
         public.journey_points_value('program_day'),
         (d.finished_at AT TIME ZONE v_tz)::date, d.day_name
  FROM (
    SELECT wp.id AS program_id,
           COALESCE(pb.week_number, 1) AS wk,
           upper(trim(split_part(pb.name, ' | ', 1))) AS day_key,
           min(trim(split_part(pb.name, ' | ', 1))) AS day_name,
           count(*) AS n_blocks,
           count(l.finished_at) AS n_logged,
           count(*) FILTER (WHERE l.any_done) AS n_done,
           max(l.finished_at) AS finished_at
    FROM public.warrior_programs wp
    JOIN public.program_blocks pb ON pb.template_id = wp.template_id
    LEFT JOIN LATERAL (
      SELECT max(wl.completed_at) AS finished_at,
             bool_or(COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%') AS any_done
      FROM public.workout_logs wl
      WHERE wl.warrior_program_id = wp.id AND wl.block_id = pb.id
    ) l ON true
    WHERE wp.warrior_id = p_user
    GROUP BY 1, 2, 3
  ) d
  WHERE d.n_logged = d.n_blocks AND d.n_done > 0 AND d.finished_at IS NOT NULL
  ON CONFLICT (user_id, source, source_key) DO NOTHING;

  -- 2. Side quests and Strength Trials marked done on the Journey lane,
  --    each backed by a distinct real result since that program started.
  FOR v_slot IN
    SELECT s.warrior_program_id, s.slot_key, s.created_at, wp.assigned_at
    FROM public.journey_quest_slots s
    JOIN public.warrior_programs wp ON wp.id = s.warrior_program_id AND wp.warrior_id = p_user
    WHERE s.user_id = p_user AND s.status = 'done'
      AND NOT EXISTS (
        SELECT 1 FROM public.journey_points jp
        WHERE jp.user_id = p_user AND jp.source IN ('side_quest', 'trial')
          AND jp.source_key = s.warrior_program_id || ':' || s.slot_key
      )
    ORDER BY s.created_at
  LOOP
    v_is_trial := v_slot.slot_key LIKE '%\_trial';
    IF v_is_trial THEN
      SELECT count(*) INTO v_results FROM public.trial_history
      WHERE user_id = p_user AND completed AND attempted_at >= v_slot.assigned_at;
    ELSE
      SELECT (SELECT count(*) FROM public.weekly_entries WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.one_min_max_logs WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.static_holds WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.power_assessments WHERE user_id = p_user AND assessed_at >= v_slot.assigned_at)
      INTO v_results;
    END IF;
    SELECT count(*) INTO v_used FROM public.journey_points
    WHERE user_id = p_user
      AND source = CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END
      AND source_key LIKE v_slot.warrior_program_id || ':%';
    IF v_used < v_results THEN
      INSERT INTO public.journey_points (user_id, source, source_key, points, local_date)
      VALUES (p_user, CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END,
              v_slot.warrior_program_id || ':' || v_slot.slot_key,
              public.journey_points_value(CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END),
              (v_slot.created_at AT TIME ZONE v_tz)::date)
      ON CONFLICT (user_id, source, source_key) DO NOTHING;
    END IF;
  END LOOP;

  -- 3. Extras: unpaid ticks on any date that has a finished program day,
  --    book → run → meal, within that date's cap.
  FOR v_task IN
    SELECT t.local_date, t.task, t.amount
    FROM public.journey_daily_tasks t
    WHERE t.user_id = p_user
      AND EXISTS (SELECT 1 FROM public.journey_points jp
                  WHERE jp.user_id = p_user AND jp.source = 'program_day' AND jp.local_date = t.local_date)
      AND NOT EXISTS (SELECT 1 FROM public.journey_points jp
                      WHERE jp.user_id = p_user AND jp.source = 'task_' || t.task AND jp.source_key = t.local_date::text)
    ORDER BY t.local_date, array_position(ARRAY['book', 'run', 'meal'], t.task)
  LOOP
    SELECT COALESCE(sum(points), 0) INTO v_paid FROM public.journey_points
    WHERE user_id = p_user AND source IN ('task_book', 'task_run', 'task_meal') AND local_date = v_task.local_date;
    v_pts := LEAST(public.journey_points_value('task_' || v_task.task), GREATEST(v_cap - v_paid, 0));
    INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
    VALUES (p_user, 'task_' || v_task.task, v_task.local_date::text, v_pts, v_task.local_date, v_task.amount::text)
    ON CONFLICT (user_id, source, source_key) DO NOTHING;
  END LOOP;

  -- 4. Perfect day (today only — p_day_has_quest describes today's card).
  IF EXISTS (SELECT 1 FROM public.journey_points WHERE user_id = p_user AND source = 'program_day' AND local_date = v_today)
     AND (SELECT count(*) FROM public.journey_points
          WHERE user_id = p_user AND source IN ('task_book', 'task_run', 'task_meal') AND local_date = v_today) = 3
     AND (NOT COALESCE(p_day_has_quest, true)
          OR EXISTS (SELECT 1 FROM public.journey_points WHERE user_id = p_user AND source = 'side_quest' AND local_date = v_today))
  THEN
    INSERT INTO public.journey_points (user_id, source, source_key, points, local_date)
    VALUES (p_user, 'perfect_day', v_today::text, public.journey_points_value('perfect_day'), v_today)
    ON CONFLICT (user_id, source, source_key) DO NOTHING;
  END IF;

  -- 5. Streak ladder for the current run; a milestone reached before
  --    yesterday is history and isn't paid.
  v_run := public.journey_points_current_run(p_user, v_today);
  v_n := coalesce(array_length(v_run, 1), 0);
  FOR v_m IN SELECT generate_series(1, v_n) LOOP
    CONTINUE WHEN NOT (v_m IN (3, 7, 14) OR (v_m >= 30 AND v_m % 30 = 0));
    -- v_run is newest first: the m-th training date is v_run[v_n - v_m + 1].
    CONTINUE WHEN v_run[v_n - v_m + 1] < v_today - 1;
    INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
    VALUES (p_user, 'streak', v_run[v_n] || ':' || v_m,
            public.journey_points_value(CASE WHEN v_m >= 30 THEN 'streak_30' ELSE 'streak_' || v_m END),
            v_run[v_n - v_m + 1], v_m::text)
    ON CONFLICT (user_id, source, source_key) DO NOTHING;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.journey_points_summary(p_user uuid, p_tz text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today  date := (now() AT TIME ZONE public.journey_points_tz(p_tz))::date;
  v_monday date := date_trunc('week', (now() AT TIME ZONE public.journey_points_tz(p_tz)))::date;
  v_run    date[] := public.journey_points_current_run(p_user, (now() AT TIME ZONE public.journey_points_tz(p_tz))::date);
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
      FROM generate_series(v_monday, v_monday + 6, interval '1 day') d),
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

REVOKE ALL ON FUNCTION public.journey_points_tz(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_points_value(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_points_current_run(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_points_best_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_points_award(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.journey_points_summary(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Client API ──────────────────────────────────────────────────────────
-- p_day_has_quest: whether today's program card has a side quest attached
-- (Perfect day needs it only then).
CREATE OR REPLACE FUNCTION public.journey_points_sync(p_tz text, p_day_has_quest boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM public.journey_points_award(v_user, p_tz, p_day_has_quest);
  RETURN public.journey_points_summary(v_user, p_tz);
END;
$function$;

CREATE OR REPLACE FUNCTION public.journey_task_log(p_tz text, p_task text, p_amount integer DEFAULT NULL, p_day_has_quest boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := (now() AT TIME ZONE public.journey_points_tz(p_tz))::date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_task NOT IN ('book', 'run', 'meal') THEN
    RAISE EXCEPTION 'Unknown task %', p_task USING ERRCODE = '22023';
  END IF;
  IF p_task = 'meal' THEN
    p_amount := NULL;
  ELSIF p_amount IS NULL OR p_amount NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Amount must be 1-10' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.journey_daily_tasks (user_id, local_date, task, amount)
  VALUES (v_user, v_today, p_task, p_amount)
  ON CONFLICT (user_id, local_date, task) DO UPDATE SET amount = EXCLUDED.amount;

  PERFORM public.journey_points_award(v_user, p_tz, p_day_has_quest);
  RETURN public.journey_points_summary(v_user, p_tz);
END;
$function$;

-- Today only: a past day's extras are locked. Takes back that extra's
-- points and today's Perfect day (no longer true); never touches streaks.
CREATE OR REPLACE FUNCTION public.journey_task_undo(p_tz text, p_task text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_today date := (now() AT TIME ZONE public.journey_points_tz(p_tz))::date;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.journey_daily_tasks WHERE user_id = v_user AND local_date = v_today AND task = p_task;
  DELETE FROM public.journey_points
  WHERE user_id = v_user AND local_date = v_today
    AND ((source = 'task_' || p_task AND source_key = v_today::text)
         OR (source = 'perfect_day' AND source_key = v_today::text));
  RETURN public.journey_points_summary(v_user, p_tz);
END;
$function$;

REVOKE ALL ON FUNCTION public.journey_points_sync(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.journey_task_log(text, text, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.journey_task_undo(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_points_sync(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.journey_task_log(text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.journey_task_undo(text, text) TO authenticated;
