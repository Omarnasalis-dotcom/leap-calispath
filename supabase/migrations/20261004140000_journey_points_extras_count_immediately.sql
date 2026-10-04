-- Journey points: extras (book / run / no cheat meal) now count the moment
-- they're ticked, instead of waiting for a finished program day that same
-- date (owner decision 2026-10-04, after "pending" read as broken on
-- device). Perfect day still needs a finished program day, and streaks
-- still only count training days. Only step 3 of journey_points_award
-- changes; the rest is 20261004120000_journey_points.sql verbatim.
-- Any ticks already pending are paid on the user's next sync.

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

REVOKE ALL ON FUNCTION public.journey_points_award(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
