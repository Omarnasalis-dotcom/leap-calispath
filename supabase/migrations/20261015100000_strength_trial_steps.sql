-- Strength Trial Steps, step 1 (docs/features/STRENGTH_TRIAL_STEPS_PLAN.md).
-- Owner decisions 2026-10-15: small trials between tiers (Helot 1 step,
-- Neos–Demigod 2). A step never changes tier and never touches trial_history,
-- so the strength leaderboards stay clean. Steps sit in the Journey's Strength
-- Trial checkpoint (w{N}_trial); finishing one there pays the trial's 100.

-- Every finished step (the athlete's best time and cleared steps come from here).
CREATE TABLE IF NOT EXISTS public.strength_step_attempts (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tier        smallint NOT NULL CHECK (tier BETWEEN 0 AND 8),
  step        smallint NOT NULL CHECK (step BETWEEN 1 AND 2),
  seconds     integer NOT NULL CHECK (seconds > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strength_step_attempts_user_idx
  ON public.strength_step_attempts (user_id, tier, step);

ALTER TABLE public.strength_step_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Warriors read own step attempts" ON public.strength_step_attempts;
CREATE POLICY "Warriors read own step attempts" ON public.strength_step_attempts
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
-- Written only by submit_strength_step.
REVOKE ALL ON public.strength_step_attempts FROM anon, authenticated;
GRANT SELECT ON public.strength_step_attempts TO authenticated;
REVOKE ALL ON SEQUENCE public.strength_step_attempts_id_seq FROM anon, authenticated;

-- Save a finished step. Only the athlete's current tier, steps in order, and
-- a time at or above the tier's trial minimum (TIER_HARD_FLOORS in the app).
-- Errors are bare codes for the app to map.
CREATE OR REPLACE FUNCTION public.submit_strength_step(p_tier integer, p_step integer, p_seconds integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user  uuid := auth.uid();
  v_tier  integer;
  v_floor integer;
  v_steps integer;
  v_first boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT strength_tier INTO v_tier FROM public.profiles WHERE id = v_user;
  IF v_tier IS NULL OR p_tier IS DISTINCT FROM v_tier THEN
    RAISE EXCEPTION 'NOT_CURRENT_TIER' USING ERRCODE = '22023';
  END IF;

  v_steps := CASE WHEN p_tier = 0 THEN 1 WHEN p_tier BETWEEN 1 AND 8 THEN 2 ELSE 0 END;
  IF p_step IS NULL OR p_step < 1 OR p_step > v_steps THEN
    RAISE EXCEPTION 'INVALID_STEP' USING ERRCODE = '22023';
  END IF;

  IF p_step = 2 AND NOT EXISTS (
    SELECT 1 FROM public.strength_step_attempts WHERE user_id = v_user AND tier = p_tier AND step = 1
  ) THEN
    RAISE EXCEPTION 'STEP_LOCKED' USING ERRCODE = '22023';
  END IF;

  v_floor := (ARRAY[25, 90, 150, 180, 200, 220, 250, 360, 480])[p_tier + 1];
  IF p_seconds IS NULL OR p_seconds < v_floor OR p_seconds > 7200 THEN
    RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE = '22023';
  END IF;

  v_first := NOT EXISTS (
    SELECT 1 FROM public.strength_step_attempts WHERE user_id = v_user AND tier = p_tier AND step = p_step
  );

  INSERT INTO public.strength_step_attempts (user_id, tier, step, seconds)
  VALUES (v_user, p_tier, p_step, p_seconds);

  RETURN jsonb_build_object(
    'first_clear', v_first,
    'best_seconds', (SELECT min(seconds) FROM public.strength_step_attempts
                     WHERE user_id = v_user AND tier = p_tier AND step = p_step)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_strength_step(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_strength_step(integer, integer, integer) TO authenticated, service_role;

-- Award hook: the live definition (20261014120000) with one change, a trial
-- checkpoint also counts finished steps.
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
      -- A trial checkpoint is backed by a completed trial or, since
      -- 2026-10-15, a finished Strength Trial Step.
      SELECT (SELECT count(*) FROM public.trial_history
              WHERE user_id = p_user AND completed AND attempted_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.strength_step_attempts
              WHERE user_id = p_user AND created_at >= v_slot.assigned_at)
      INTO v_results;
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

  -- 6. Achievements: record every level the lifetime total has reached
  --    (2026-10-14, docs/features/JOURNEY_ACHIEVEMENTS_PLAN.md).
  PERFORM public.journey_achievements_award(p_user);
END;
$function$
;
