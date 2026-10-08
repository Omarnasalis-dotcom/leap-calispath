-- Journey points fixes (audit 2026-10-08, owner-approved):
-- * Streak milestones and Perfect day are paid for any day since launch
--   (2026-10-04), not only "today / yesterday". Points sync only on the
--   Journey tab, so training in Train and opening Journey 2+ days later lost
--   them for good. A milestone in a run that has since broken is paid too.
-- * journey_day_flags keeps whether each day's card needed a side quest, so
--   Perfect day can be judged on a later sync.
-- * Extras can't be logged for a date earlier than one already logged
--   (switching time zones could count one real day twice).
-- * The extras cap is 40: book 10 + run 20 + meal 10 (60 could never fill).
-- journey_points_award / journey_task_log only; same signatures and grants.

CREATE TABLE IF NOT EXISTS public.journey_day_flags (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  has_quest boolean NOT NULL,
  PRIMARY KEY (user_id, local_date)
);
ALTER TABLE public.journey_day_flags ENABLE ROW LEVEL SECURITY;
-- Written and read only inside the SECURITY DEFINER functions.
REVOKE ALL ON public.journey_day_flags FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.journey_day_flags TO service_role;

CREATE OR REPLACE FUNCTION public.journey_points_award(p_user uuid, p_tz text, p_day_has_quest boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz      text := public.journey_points_tz(p_tz);
  v_today   date := (now() AT TIME ZONE v_tz)::date;
  v_current_week integer;
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
  -- Points went live on this date; nothing earlier is paid retroactively.
  v_launch  constant date := date '2026-10-04';
BEGIN
  -- What today's lane card needs for Perfect day, kept so a later sync
  -- (another day, or one without the flag) can still judge today.
  IF p_day_has_quest IS NOT NULL THEN
    INSERT INTO public.journey_day_flags (user_id, local_date, has_quest)
    VALUES (p_user, v_today, p_day_has_quest)
    ON CONFLICT (user_id, local_date) DO UPDATE SET has_quest = EXCLUDED.has_quest;
  END IF;

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
      -- Never a slot ahead of the week the program is actually on.
      AND substring(s.slot_key FROM '^w([0-9]+)_')::integer <= COALESCE(wp.current_week, 1)
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
      -- label = the slot key, so "today's side quest" can be matched to
      -- the actual slot on today's card (not an old quest paid today).
      INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
      VALUES (p_user, CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END,
              v_slot.warrior_program_id || ':' || v_slot.slot_key,
              public.journey_points_value(CASE WHEN v_is_trial THEN 'trial' ELSE 'side_quest' END),
              (v_slot.created_at AT TIME ZONE v_tz)::date, v_slot.slot_key)
      ON CONFLICT (user_id, source, source_key) DO NOTHING;
    END IF;
  END LOOP;

  -- 3. Extras: every unpaid tick, book → run → meal, within that date's
  --    cap (owner decision 2026-10-04: they count at once, workout or not).
  FOR v_task IN
    SELECT t.local_date, t.task, t.amount
    FROM public.journey_daily_tasks t
    WHERE t.user_id = p_user
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

  -- 4. Perfect day, for every day since launch (not just today): Points
  --    only sync on the Journey tab, so a day finished in Train was lost if
  --    Journey wasn't reopened that day. A day needs its program day, all
  --    three extras and — when that day's card had one — a side quest paid
  --    that day (today: from the current week, so an old quest caught up
  --    today doesn't count).
  SELECT current_week INTO v_current_week FROM public.warrior_programs
  WHERE warrior_id = p_user AND status = 'active' ORDER BY assigned_at DESC LIMIT 1;
  INSERT INTO public.journey_points (user_id, source, source_key, points, local_date)
  SELECT p_user, 'perfect_day', pd.d::text, public.journey_points_value('perfect_day'), pd.d
  FROM (SELECT DISTINCT local_date AS d FROM public.journey_points
        WHERE user_id = p_user AND source = 'program_day' AND local_date BETWEEN v_launch AND v_today) pd
  WHERE (SELECT count(*) FROM public.journey_points
         WHERE user_id = p_user AND source IN ('task_book', 'task_run', 'task_meal') AND local_date = pd.d) = 3
    AND (NOT COALESCE((SELECT f.has_quest FROM public.journey_day_flags f
                       WHERE f.user_id = p_user AND f.local_date = pd.d), true)
         OR EXISTS (SELECT 1 FROM public.journey_points q
                    WHERE q.user_id = p_user AND q.source = 'side_quest' AND q.local_date = pd.d
                      AND (pd.d < v_today OR q.label LIKE 'w' || COALESCE(v_current_week, 1) || '\_%')))
  ON CONFLICT (user_id, source, source_key) DO NOTHING;

  -- 5. Streak ladder for every run since launch (3, 7, 14, then every 30):
  --    a milestone no longer has to be synced by the next day, and one in a
  --    run that has since broken is still paid. Runs break after more than 3
  --    days between program days (same rule as journey_points_current_run);
  --    the key (run start : count) matches the rows paid before this change.
  INSERT INTO public.journey_points (user_id, source, source_key, points, local_date, label)
  SELECT p_user, 'streak', n.run_start || ':' || n.m,
         public.journey_points_value(CASE WHEN n.m >= 30 THEN 'streak_30' ELSE 'streak_' || n.m END),
         n.local_date, n.m::text
  FROM (
    SELECT r.local_date,
           row_number() OVER (PARTITION BY r.run_id ORDER BY r.local_date) AS m,
           min(r.local_date) OVER (PARTITION BY r.run_id) AS run_start
    FROM (
      SELECT g.local_date, sum(g.brk) OVER (ORDER BY g.local_date) AS run_id
      FROM (
        SELECT d.local_date,
               CASE WHEN d.local_date - lag(d.local_date) OVER (ORDER BY d.local_date) <= 3 THEN 0 ELSE 1 END AS brk
        FROM (SELECT DISTINCT local_date FROM public.journey_points
              WHERE user_id = p_user AND source = 'program_day' AND local_date <= v_today) d
      ) g
    ) r
  ) n
  WHERE (n.m IN (3, 7, 14) OR (n.m >= 30 AND n.m % 30 = 0))
    AND n.local_date >= v_launch
  ON CONFLICT (user_id, source, source_key) DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.journey_task_log(p_tz text, p_task text, p_amount integer DEFAULT NULL::integer, p_day_has_quest boolean DEFAULT true)
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

  -- The day comes from the device's time zone. Switching zones could make
  -- one real day count as two dates (and pay the extras twice); a date
  -- earlier than one already logged is never real, so it's refused.
  IF EXISTS (SELECT 1 FROM public.journey_daily_tasks WHERE user_id = v_user AND local_date > v_today) THEN
    RAISE EXCEPTION 'Extras for this day are closed: a later day already has extras.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.journey_daily_tasks (user_id, local_date, task, amount)
  VALUES (v_user, v_today, p_task, p_amount)
  ON CONFLICT (user_id, local_date, task) DO UPDATE SET amount = EXCLUDED.amount;

  PERFORM public.journey_points_award(v_user, p_tz, p_day_has_quest);
  RETURN public.journey_points_summary(v_user, p_tz);
END;
$function$;

UPDATE public.journey_points_config SET value = 40 WHERE key = 'honor_daily_cap';
