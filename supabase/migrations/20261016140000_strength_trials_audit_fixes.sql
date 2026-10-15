-- Strength Trials audit fixes (docs/technical-audit/STRENGTH_TRIALS_AUDIT_2026-10-16.md).
--
-- M3: trial and step points come only from the Journey checkpoint (owner
-- rule). The payout counted every completed trial, practice runs of past
-- tiers included, because trial_history didn't know the mode. Now each row
-- records it and only real trials back a checkpoint. Existing rows are
-- treated as real trials (no trial points have been paid so far).
-- L3: the trial time is rounded before it is checked (the column is whole
-- seconds; a 59.6 s "new best" over 60 s used to be stored as a tie).
-- L1 + L2 (steps): a 30 s cooldown like every other submit, where an
-- identical resend (a lost reply) gets the saved result back instead of an
-- error; the minimum comes from tier_hard_floors, the maximum is 3600 s
-- like the trials and the app.

ALTER TABLE public.trial_history
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'progression'
  CHECK (mode IN ('progression', 'practice'));

CREATE OR REPLACE FUNCTION public.submit_trial_result(p_tier integer, p_time_seconds numeric, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_profile record;
  v_best_times jsonb;
  v_current_best numeric;
  v_new_tier integer;
  v_prev_best_time numeric;
  v_prev_completed_count integer;
  v_is_first_completion boolean;
  v_is_new_best boolean;
  v_tier_advanced boolean;
  v_floor integer;
  v_last_attempt_at timestamptz;
  v_seconds_since_last numeric;
  v_cooldown_seconds CONSTANT numeric := 30;
  v_overtaken_user_id uuid;
  v_overtaken_notification_id uuid;
  -- Anything but a real attempt at the athlete's own tier is practice.
  v_mode text := CASE WHEN p_mode = 'progression' THEN 'progression' ELSE 'practice' END;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED');
  END IF;

  -- trial_history keeps whole seconds: round first, so the checks below
  -- judge the time that is actually stored.
  p_time_seconds := round(p_time_seconds);

  -- Validate time bounds against the DB-authoritative floor table
  SELECT floor_seconds INTO v_floor
  FROM public.tier_hard_floors
  WHERE tier = p_tier;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIER');
  END IF;

  IF p_time_seconds <= 0 OR p_time_seconds > 3600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_TIME');
  END IF;

  IF p_time_seconds < v_floor THEN
    RETURN jsonb_build_object('success', false, 'error', 'DISHONOR',
      'message', format('Time %ss is below the minimum for Tier %s (%ss).', p_time_seconds, p_tier, v_floor));
  END IF;

  -- Per-(user, tier) cooldown: mirrors submit_static_hold/submit_onemm_log.
  -- A user can immediately attempt a different tier.
  SELECT attempted_at INTO v_last_attempt_at
  FROM public.trial_history
  WHERE user_id = v_user_id AND tier_attempted = p_tier
  ORDER BY attempted_at DESC LIMIT 1;

  IF v_last_attempt_at IS NOT NULL THEN
    v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_attempt_at));
    IF v_seconds_since_last < v_cooldown_seconds THEN
      RETURN jsonb_build_object('success', false, 'error', 'COOLDOWN',
        'message', format('Please wait %ss before submitting this tier again.',
          CEIL(v_cooldown_seconds - v_seconds_since_last)));
    END IF;
  END IF;

  -- Lock the profile row to avoid racing concurrent submissions
  SELECT strength_tier, best_times, display_name INTO v_profile
  FROM profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_FOUND');
  END IF;

  IF p_tier > v_profile.strength_tier THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN');
  END IF;

  SELECT MIN(time_seconds)::numeric, COUNT(*)
  INTO v_prev_best_time, v_prev_completed_count
  FROM trial_history
  WHERE user_id = v_user_id AND tier_attempted = p_tier AND completed = true;

  v_is_first_completion := (v_prev_completed_count = 0);
  v_is_new_best := (NOT v_is_first_completion) AND (p_time_seconds < v_prev_best_time);

  INSERT INTO trial_history (user_id, tier_attempted, time_seconds, completed, mode)
  VALUES (v_user_id, p_tier, p_time_seconds, true, v_mode);

  IF v_is_new_best OR v_is_first_completion THEN
    SELECT th.user_id INTO v_overtaken_user_id
    FROM (
      SELECT user_id, MIN(time_seconds) AS best_time
      FROM trial_history
      WHERE tier_attempted = p_tier AND completed = true AND user_id != v_user_id
      GROUP BY user_id
    ) th
    WHERE th.best_time > p_time_seconds AND th.best_time <= COALESCE(v_prev_best_time, 999999)
    ORDER BY th.best_time ASC
    LIMIT 1;

    IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM notification_preferences
      WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
    ) THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_overtaken_user_id,
        'leaderboard_overtaken',
        'You''ve Been Overtaken!',
        format('%s just beat your time in Tier %s. Defend your spot!', COALESCE(v_profile.display_name, 'Someone'), p_tier),
        jsonb_build_object('screen', 'profile')
      )
      RETURNING id INTO v_overtaken_notification_id;
    END IF;
  END IF;

  v_tier_advanced := false;

  IF p_mode = 'progression' THEN
    v_best_times := COALESCE(v_profile.best_times, '{}'::jsonb);
    v_current_best := (v_best_times ->> p_tier::text)::numeric;

    IF v_current_best IS NULL OR p_time_seconds < v_current_best THEN
      v_best_times := jsonb_set(v_best_times, ARRAY[p_tier::text], to_jsonb(p_time_seconds));
    END IF;

    v_new_tier := CASE WHEN p_tier = v_profile.strength_tier
      THEN LEAST(p_tier + 1, 9)
      ELSE v_profile.strength_tier
    END;
    v_tier_advanced := (v_new_tier > v_profile.strength_tier);

    UPDATE profiles
    SET best_times = v_best_times,
        strength_tier = GREATEST(v_new_tier, v_profile.strength_tier)
    WHERE id = v_user_id;
  END IF;

  IF v_tier_advanced THEN
    PERFORM public.notify_coach_of_achievement(
      v_user_id,
      'client_achievement',
      'Client Tier Up!',
      format('%s reached Tier %s in Strength.', COALESCE(v_profile.display_name, 'A warrior'), v_new_tier),
      jsonb_build_object('kind', 'tier_promotion', 'world', 'strength', 'new_tier', v_new_tier)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'is_first_completion', v_is_first_completion,
    'is_new_best', v_is_new_best,
    'tier_advanced', v_tier_advanced,
    'previous_best_time_seconds', v_prev_best_time,
    'overtaken_notification_id', v_overtaken_notification_id
  );
END;
$function$;

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
      -- 2026-10-15, a finished Strength Trial Step of the athlete's own
      -- tier (practice steps on past tiers never back it). Since
      -- 2026-10-16 only a real (progression) trial counts, never a
      -- practice run of a past tier.
      SELECT (SELECT count(*) FROM public.trial_history
              WHERE user_id = p_user AND completed AND mode = 'progression'
                AND attempted_at >= v_slot.assigned_at)
           + (SELECT count(*) FROM public.strength_step_attempts
              WHERE user_id = p_user AND NOT practice AND created_at >= v_slot.assigned_at)
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
$function$;

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
  v_last  record;
  v_wait  numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  -- p_tier = the athlete tier whose steps these are: the current tier, or a
  -- tier below it (practice).
  SELECT strength_tier INTO v_tier FROM public.profiles WHERE id = v_user;
  IF v_tier IS NULL OR p_tier IS NULL OR p_tier > v_tier THEN
    RAISE EXCEPTION 'NOT_CURRENT_TIER' USING ERRCODE = '22023';
  END IF;

  v_steps := CASE WHEN p_tier = 1 THEN 1 WHEN p_tier BETWEEN 2 AND 9 THEN 2 ELSE 0 END;
  IF p_step IS NULL OR p_step < 1 OR p_step > v_steps THEN
    RAISE EXCEPTION 'INVALID_STEP' USING ERRCODE = '22023';
  END IF;

  IF p_tier = v_tier AND p_step = 2 AND NOT EXISTS (
    SELECT 1 FROM public.strength_step_attempts WHERE user_id = v_user AND tier = p_tier AND step = 1
  ) THEN
    RAISE EXCEPTION 'STEP_LOCKED' USING ERRCODE = '22023';
  END IF;

  -- The base trial's minimum (the trial the step is built from, tier − 1).
  SELECT floor_seconds INTO v_floor FROM public.tier_hard_floors WHERE tier = p_tier - 1;
  IF v_floor IS NULL OR p_seconds IS NULL OR p_seconds < v_floor OR p_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_TIME' USING ERRCODE = '22023';
  END IF;

  -- 30 s between saved steps. The same step and time again inside that
  -- window is the app resending after a lost reply: answer with what was
  -- saved rather than saving it twice.
  SELECT tier, step, seconds, created_at INTO v_last
  FROM public.strength_step_attempts
  WHERE user_id = v_user
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND v_last.created_at > now() - interval '30 seconds' THEN
    IF v_last.tier = p_tier AND v_last.step = p_step AND v_last.seconds = p_seconds THEN
      RETURN jsonb_build_object(
        'first_clear', (SELECT count(*) = 1 FROM public.strength_step_attempts
                        WHERE user_id = v_user AND tier = p_tier AND step = p_step),
        'best_seconds', (SELECT min(seconds) FROM public.strength_step_attempts
                         WHERE user_id = v_user AND tier = p_tier AND step = p_step)
      );
    END IF;
    v_wait := CEIL(30 - EXTRACT(EPOCH FROM (now() - v_last.created_at)));
    RAISE EXCEPTION 'Please wait % seconds before saving another step.', v_wait
      USING ERRCODE = 'P1004';
  END IF;

  v_first := NOT EXISTS (
    SELECT 1 FROM public.strength_step_attempts WHERE user_id = v_user AND tier = p_tier AND step = p_step
  );

  INSERT INTO public.strength_step_attempts (user_id, tier, step, seconds, practice)
  VALUES (v_user, p_tier, p_step, p_seconds, p_tier < v_tier);

  RETURN jsonb_build_object(
    'first_clear', v_first,
    'best_seconds', (SELECT min(seconds) FROM public.strength_step_attempts
                     WHERE user_id = v_user AND tier = p_tier AND step = p_step)
  );
END;
$function$;
