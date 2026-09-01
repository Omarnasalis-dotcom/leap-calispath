-- Gate 1 finish: every ai_coach_requests-writing RPC now tags its INSERT
-- with public.caller_rc_transaction_id(), so a future account deletion
-- leaves a row apply_revenuecat_entitlement (previous migration) can
-- re-parent onto whoever restores the same subscription. No counting logic
-- changes anywhere below — every WHERE user_id = ... clause is unchanged,
-- byte-for-byte, from its current production body.
--
-- Gate 2 schema, landed here (must precede the two program_templates
-- INSERTs below that reference it): min_access_tier records which tier a
-- Pro-gated program was BUILT under, so continued access can be re-checked
-- later (WarriorProgramScreen.tsx) even after the subscription that built
-- it moves to another account. NULL = no ongoing lock (Program Templates
-- stays exempt — it already has its own tier-appropriate allowance via
-- select_library_template). ai_coach_create_program and
-- ai_coach_create_program_from_workouts require only "any paid tier"
-- (caller_has_pro_access()) to create, so they tag 'first'; the Pro/Max-only
-- creator (create_custom_program_from_workouts) tags 'pro' in a separate
-- migration since it doesn't touch ai_coach_requests at all.
ALTER TABLE public.program_templates ADD COLUMN min_access_tier text
  CHECK (min_access_tier IS NULL OR min_access_tier IN ('first', 'pro'));

CREATE OR REPLACE FUNCTION public.ai_coach_log_chat_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tier text;
  v_uid uuid := auth.uid();
  v_cap integer;
  v_count integer;
  v_request_id uuid;
  v_period_start timestamptz;
  v_budget numeric;
  v_spent numeric;
  v_limits RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_tier := public.caller_effective_tier();

  IF v_tier = 'free' THEN
    SELECT max(ai_coach_free_chat_lifetime_cap) INTO v_cap FROM public.app_config;
    v_cap := COALESCE(v_cap, 8);

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat';

    IF v_count >= v_cap THEN
      RAISE EXCEPTION 'PRO_REQUIRED: free chat limit reached' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
    VALUES (v_uid, 'chat', public.caller_rc_transaction_id())
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object('success', true, 'tier', 'free', 'request_id', v_request_id, 'cap', v_cap, 'remaining', GREATEST(v_cap - v_count - 1, 0));
  END IF;

  -- Paid tier. Kill-switch-off/admin/coach resolve to 'max' with no real
  -- period on record — default a synthetic period so the checks below
  -- still run sensibly instead of dividing by a NULL.
  SELECT entitlement_period_start, ai_coach_budget_usd
  INTO v_period_start, v_budget
  FROM public.profiles WHERE id = v_uid;
  v_period_start := COALESCE(v_period_start, date_trunc('month', now()));
  v_budget := COALESCE(v_budget, CASE v_tier WHEN 'first' THEN 1.00 WHEN 'pro' THEN 4.00 ELSE 10.00 END);

  SELECT COALESCE(sum(cost_usd), 0) INTO v_spent
  FROM public.ai_coach_requests
  WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

  IF v_spent >= v_budget THEN
    RAISE EXCEPTION 'RATE_LIMIT:BUDGET: AI Coach budget for this period reached';
  END IF;

  SELECT * INTO v_limits FROM public.ai_coach_tier_limits WHERE tier = v_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONFIG_ERROR: no ai_coach_tier_limits row for tier %', v_tier;
  END IF;

  IF v_limits.steady_daily_cap IS NULL AND v_limits.weekly_msg_cap IS NULL THEN
    -- First: one flat allowance for the whole period, no day-1/steady split.
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

    IF v_count >= v_limits.day1_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:CAP: AI Coach message limit for this period reached';
    END IF;
  ELSIF now() < v_period_start + interval '1 day' THEN
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= v_period_start;

    IF v_count >= v_limits.day1_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:DAY1: AI Coach day-1 message limit reached';
    END IF;
  ELSE
    -- GREATEST(...) matters when the day-1 window ends partway through a
    -- calendar day: without it, day-1 burst messages sent earlier that same
    -- calendar day would double-count against this day's steady cap, since
    -- date_trunc('day', now()) alone can't tell "today's steady-state
    -- messages" apart from "day-1 messages that happened to land today."
    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat'
      AND created_at >= GREATEST(date_trunc('day', now()), v_period_start + interval '1 day');

    IF v_count >= v_limits.steady_daily_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:DAILY: AI Coach daily message limit reached';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.ai_coach_requests
    WHERE user_id = v_uid AND kind = 'chat' AND created_at >= date_trunc('week', now());

    IF v_count >= v_limits.weekly_msg_cap THEN
      RAISE EXCEPTION 'RATE_LIMIT:WEEKLY: AI Coach weekly message limit reached';
    END IF;
  END IF;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (v_uid, 'chat', public.caller_rc_transaction_id())
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object('success', true, 'tier', v_tier, 'request_id', v_request_id, 'budget_usd', v_budget, 'spent_usd', v_spent);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_log_chat_request() TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_create_program(
  p_name text,
  p_description text,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_warrior_id CONSTANT uuid := auth.uid();
  v_today_count integer;
  v_new_template_id uuid;
  v_new_warrior_program_id uuid;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = v_warrior_id
    AND kind = 'create_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT: create_program daily limit reached';
  END IF;

  UPDATE public.warrior_programs
  SET status = 'completed'
  WHERE warrior_id = v_warrior_id AND status = 'active';

  INSERT INTO public.program_templates (name, description, coach_id, min_access_tier)
  VALUES (p_name, p_description, v_ai_profile_id, 'first')
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, p_blocks);

  INSERT INTO public.warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_ai_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (v_warrior_id, 'create_program', public.caller_rc_transaction_id());

  RETURN jsonb_build_object(
    'success', true,
    'warrior_program_id', v_new_warrior_program_id,
    'template_id', v_new_template_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_create_program(text, text, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_create_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_warrior_id CONSTANT uuid := auth.uid();
  v_today_count integer;
  v_new_template_id uuid;
  v_new_warrior_program_id uuid;
  v_blocks jsonb;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF p_workout_ids IS NULL OR array_length(p_workout_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one workout must be selected';
  END IF;
  IF array_length(p_workout_ids, 1) > 7 THEN
    RAISE EXCEPTION 'A custom program can have at most 7 days';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = v_warrior_id AND kind = 'create_program' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT: create_program daily limit reached';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
    LEFT JOIN public.standalone_workouts sw
      ON sw.id = ids.workout_id AND sw.kind = 'workout' AND sw.status = 'published'
    WHERE sw.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected workouts could not be found';
  END IF;

  PERFORM public._check_workout_ids_have_no_empty_blocks(p_workout_ids);

  WITH picks AS (
    SELECT ids.workout_id AS wid, ids.ord AS day_ord
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
  ),
  expanded AS (
    SELECT p.day_ord, swb.id AS block_id, swb.name AS block_name, swb.order_index AS block_order_index
    FROM picks p
    JOIN public.standalone_workouts sw ON sw.id = p.wid
    JOIN public.standalone_workout_blocks swb ON swb.workout_id = sw.id
  ),
  ordered AS (
    SELECT expanded.*, row_number() OVER (ORDER BY day_ord, block_order_index) - 1 AS global_order_index
    FROM expanded
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', 'DAY ' || day_ord || ' | ' || block_name,
      'order_index', global_order_index,
      'week_number', 1,
      'exercises', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'exercise_id', swe.exercise_id,
            'sets', swe.sets,
            'reps', swe.reps,
            'rest_seconds', swe.rest_seconds,
            'hold_seconds', swe.hold_seconds,
            'is_weighted', swe.is_weighted,
            'notes', swe.notes,
            'order_index', swe.order_index
          ) ORDER BY swe.order_index
        ), '[]'::jsonb)
        FROM public.standalone_workout_exercises swe
        WHERE swe.block_id = ordered.block_id
      )
    ) ORDER BY global_order_index
  ) INTO v_blocks
  FROM ordered;

  UPDATE public.warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

  INSERT INTO public.program_templates (name, description, coach_id, min_access_tier)
  VALUES ('My Custom Program', array_length(p_workout_ids, 1) || '-day custom program built from the Workout Library', v_ai_profile_id, 'first')
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, v_blocks);

  INSERT INTO public.warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_ai_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (v_warrior_id, 'create_program', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_new_warrior_program_id, 'template_id', v_new_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_create_program_from_workouts(uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_end_program(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT coach_id, warrior_id INTO v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'end_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: end_program daily limit reached';
  END IF;

  UPDATE public.warrior_programs SET status = 'completed' WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'end_program', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_end_program(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_delete_week(
  p_warrior_program_id uuid,
  p_week_number integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
  v_block_count integer;
  v_total_blocks integer;
  v_has_logs boolean;
  v_new_current_week integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_block_count
  FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'Week % not found', p_week_number;
  END IF;

  SELECT count(*) INTO v_total_blocks FROM public.program_blocks WHERE template_id = v_template_id;
  IF v_block_count = v_total_blocks THEN
    RAISE EXCEPTION 'Cannot delete the only week in this program — end the program instead if you want to stop it entirely.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.workout_logs wl
    JOIN public.program_blocks pb ON pb.id = wl.block_id
    WHERE pb.template_id = v_template_id AND pb.week_number = p_week_number
  ) INTO v_has_logs;
  IF v_has_logs THEN
    RAISE EXCEPTION 'Cannot delete week %: it already has logged workout history.', p_week_number;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'delete_week' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 3 THEN
    RAISE EXCEPTION 'RATE_LIMIT: delete_week daily limit reached';
  END IF;

  DELETE FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;

  SELECT COALESCE(MAX(week_number), 1) INTO v_new_current_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = LEAST(current_week, v_new_current_week)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'delete_week', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'deleted_week', p_week_number);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_delete_week(uuid, integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_append_week(
  p_warrior_program_id uuid,
  p_blocks jsonb,
  p_removed_block_names text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
  v_week_offset integer;
  v_new_max_week integer;
  v_new_block_names text[];
  v_carry_blocks jsonb;
  v_merged_blocks jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'append_week'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMIT: append_week daily limit reached';
  END IF;

  SELECT COALESCE(MAX(week_number), 0) INTO v_week_offset
  FROM public.program_blocks WHERE template_id = v_template_id;

  SELECT COALESCE(array_agg(elem->>'name'), ARRAY[]::text[])
  INTO v_new_block_names
  FROM jsonb_array_elements(COALESCE(p_blocks, '[]'::jsonb)) AS elem;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'name', pb.name,
      'notes', pb.notes,
      'order_index', pb.order_index,
      'week_number', 1,
      'exercises', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'exercise_id', be.exercise_id,
            'sets', be.sets,
            'reps', be.reps,
            'rest_seconds', be.rest_seconds,
            'hold_seconds', be.hold_seconds,
            'is_weighted', be.is_weighted,
            'notes', be.notes,
            'order_index', be.order_index
          ) ORDER BY be.order_index
        ), '[]'::jsonb)
        FROM block_exercises be WHERE be.block_id = pb.id
      )
    )
  ), '[]'::jsonb)
  INTO v_carry_blocks
  FROM program_blocks pb
  WHERE pb.template_id = v_template_id
    AND pb.week_number = v_week_offset
    AND pb.name != ALL(v_new_block_names)
    AND pb.name != ALL(COALESCE(p_removed_block_names, ARRAY[]::text[]));

  v_merged_blocks := v_carry_blocks || COALESCE(p_blocks, '[]'::jsonb);

  PERFORM public._insert_client_program_blocks(v_template_id, v_week_offset, v_merged_blocks);

  SELECT MAX(week_number) INTO v_new_max_week
  FROM public.program_blocks WHERE template_id = v_template_id;

  UPDATE public.warrior_programs
  SET current_week = COALESCE(v_new_max_week, 1)
  WHERE id = p_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'append_week', public.caller_rc_transaction_id());

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'week_offset', v_week_offset,
    'carried_forward_count', jsonb_array_length(v_carry_blocks)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_append_week(uuid, jsonb, text[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_adjust_program(
  p_warrior_program_id uuid,
  p_changes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
  v_change jsonb;
  v_block_exercise_id uuid;
  v_owning_template_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'adjust_program'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: adjust_program daily limit reached';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_block_exercise_id := (v_change->>'block_exercise_id')::uuid;

    -- Verify this exercise actually belongs to THIS warrior_program's
    -- template — never trust the id alone, an AI-adjacent caller could
    -- otherwise pass any block_exercise_id in the system, including one
    -- belonging to a different warrior or a real coach's client.
    SELECT pb.template_id INTO v_owning_template_id
    FROM public.block_exercises be
    JOIN public.program_blocks pb ON pb.id = be.block_id
    WHERE be.id = v_block_exercise_id;

    IF v_owning_template_id IS NULL OR v_owning_template_id != v_template_id THEN
      RAISE EXCEPTION 'block_exercise_id % does not belong to this program', v_block_exercise_id;
    END IF;

    UPDATE public.block_exercises
    SET
      sets = COALESCE((v_change->>'sets')::int, sets),
      reps = COALESCE((v_change->>'reps')::int, reps),
      rest_seconds = COALESCE((v_change->>'rest_seconds')::int, rest_seconds),
      hold_seconds = COALESCE((v_change->>'hold_seconds')::int, hold_seconds),
      is_weighted = COALESCE((v_change->>'is_weighted')::boolean, is_weighted),
      exercise_id = COALESCE((v_change->>'new_exercise_id')::uuid, exercise_id)
    WHERE id = v_block_exercise_id;
  END LOOP;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'adjust_program', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'template_id', v_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_adjust_program(uuid, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_add_block_to_week(
  p_warrior_program_id uuid,
  p_week_number integer,
  p_blocks jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_today_count integer;
  v_week_exists boolean;
  v_max_order integer;
  v_new_names text[];
  v_adjusted_blocks jsonb;
  v_block_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_block_count := jsonb_array_length(COALESCE(p_blocks, '[]'::jsonb));
  IF v_block_count = 0 THEN
    RAISE EXCEPTION 'At least one block is required';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number
  ) INTO v_week_exists;
  IF NOT v_week_exists THEN
    RAISE EXCEPTION 'Week % not found', p_week_number;
  END IF;

  SELECT array_agg(elem->>'name') INTO v_new_names
  FROM jsonb_array_elements(p_blocks) AS elem;

  IF EXISTS (
    SELECT 1 FROM public.program_blocks
    WHERE template_id = v_template_id AND week_number = p_week_number AND name = ANY(v_new_names)
  ) THEN
    RAISE EXCEPTION 'A block with that name already exists in week %; use adjust_program to edit an existing block''s exercises, or pick a different name to add a new one.', p_week_number;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'add_block' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 5 THEN
    RAISE EXCEPTION 'RATE_LIMIT: add_block daily limit reached';
  END IF;

  SELECT COALESCE(MAX(order_index), -1) INTO v_max_order
  FROM public.program_blocks WHERE template_id = v_template_id AND week_number = p_week_number;

  -- Renumber incoming order_index to continue after the week's existing
  -- max (preserving relative order) rather than trusting the caller to
  -- know it, and force week_number to land exactly on p_week_number via
  -- _insert_client_program_blocks's week_offset + block.week_number math
  -- (offset = p_week_number, block week_number forced to 0).
  SELECT jsonb_agg(
    elem || jsonb_build_object('order_index', v_max_order + ord, 'week_number', 0)
    ORDER BY ord
  )
  INTO v_adjusted_blocks
  FROM jsonb_array_elements(p_blocks) WITH ORDINALITY AS t(elem, ord);

  PERFORM public._insert_client_program_blocks(v_template_id, p_week_number, v_adjusted_blocks);

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'add_block', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'week_number', p_week_number, 'blocks_added', v_block_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(uuid, integer, jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION public.ai_coach_replace_block_exercises(
  p_warrior_program_id uuid,
  p_block_id uuid,
  p_exercises jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_template_id uuid;
  v_coach_id uuid;
  v_warrior_id uuid;
  v_owning_template_id uuid;
  v_today_count integer;
  v_exercise jsonb;
  v_exercise_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_exercise_count := jsonb_array_length(COALESCE(p_exercises, '[]'::jsonb));
  IF v_exercise_count = 0 THEN
    RAISE EXCEPTION 'At least one exercise is required';
  END IF;

  SELECT template_id, coach_id, warrior_id INTO v_template_id, v_coach_id, v_warrior_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  IF v_coach_id != v_ai_profile_id OR v_warrior_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to modify this program';
  END IF;

  -- Verify this block actually belongs to THIS warrior_program's template —
  -- never trust p_block_id alone, same reasoning as adjust_program's
  -- per-exercise ownership check, just one level up since we're replacing
  -- the whole list rather than editing one row.
  SELECT template_id INTO v_owning_template_id
  FROM public.program_blocks WHERE id = p_block_id;

  IF v_owning_template_id IS NULL OR v_owning_template_id != v_template_id THEN
    RAISE EXCEPTION 'block_id % does not belong to this program', p_block_id;
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'replace_block' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: replace_block daily limit reached';
  END IF;

  -- Delete-then-insert runs inside this function's own transaction — if any
  -- exercise fails to insert (e.g. a bad exercise_id), the whole call rolls
  -- back and the block keeps its original exercises rather than ending up
  -- empty.
  DELETE FROM public.block_exercises WHERE block_id = p_block_id;

  FOR v_exercise IN SELECT * FROM jsonb_array_elements(p_exercises)
  LOOP
    INSERT INTO public.block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, notes, order_index)
    VALUES (
      p_block_id,
      (v_exercise->>'exercise_id')::uuid,
      (v_exercise->>'sets')::int,
      (v_exercise->>'reps')::int,
      (v_exercise->>'rest_seconds')::int,
      (v_exercise->>'hold_seconds')::int,
      COALESCE((v_exercise->>'is_weighted')::boolean, false),
      v_exercise->>'notes',
      COALESCE((v_exercise->>'order_index')::int, 0)
    );
  END LOOP;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'replace_block', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'block_id', p_block_id, 'exercise_count', v_exercise_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_replace_block_exercises(uuid, uuid, jsonb) TO authenticated;
