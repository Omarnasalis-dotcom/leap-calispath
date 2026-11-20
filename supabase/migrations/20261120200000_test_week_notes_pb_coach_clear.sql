-- Test Week follow-ups for the coach's assistant workflow (2026-11-20).
-- Server only: no app build needed, and current apps keep working.
--
--  * program_test_results.note: the athlete's note on one item (p_note,
--    optional, cut to 500 chars). Also written to workout_logs.notes, after
--    the "[STATUS:MISSED] " prefix when the item is skipped, so EXPORT WEEK's
--    log.notes carries it. Changing only the note keeps the coach's grade.
--  * PB flags are worked out on every save against the athlete's world best
--    from before this save: is_new_pb when higher, is_matched_pb (new column)
--    when equal. One Min Max counts a tie as a PB in its own world; the test
--    record no longer does. Saving the same value again keeps the item's
--    flags; any other change recomputes them. Before: is_new_pb = old OR new,
--    so a value corrected down kept "New PB".
--    Known limit: a typo saved high, then corrected down, already raised the
--    world best, so the corrected value is not flagged even if it beats the
--    athlete's older best.
--  * clear_program_test_item: the program's coach, their assistant or an
--    admin clears one result, the same way the athlete's own clear does.
--    A result already sent to a world stays there.
--
-- submit_program_test_item gains p_note. DROP the 7-argument version first:
-- CREATE OR REPLACE with a longer list would add a second overload, and the
-- apps' named-argument .rpc() calls without p_note would become ambiguous.

ALTER TABLE public.program_test_results
  ADD COLUMN IF NOT EXISTS note text CHECK (note IS NULL OR char_length(note) <= 500),
  ADD COLUMN IF NOT EXISTS is_matched_pb boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.submit_program_test_item(uuid, uuid, text, numeric, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_program_test_item(
  p_warrior_program_id uuid,
  p_block_id uuid,
  p_status text,
  p_value numeric DEFAULT NULL,
  p_movement_id text DEFAULT NULL,
  p_skip_reason text DEFAULT NULL,
  p_skip_detail text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_template_id uuid;
  v_coach_id uuid;
  v_block_name text;
  v_block_notes text;
  v_week integer;
  v_kind text;
  v_target text;
  v_movement text;
  v_unit text;
  v_value numeric;
  v_world text := 'none';
  v_new_pb boolean := false;
  v_matched_pb boolean := false;
  -- The athlete's world best for this movement from before this save.
  v_prior numeric := 0;
  v_note text;
  v_promotion boolean := false;
  v_overtaken uuid;
  v_wra_overtaken uuid;
  v_tier integer;
  v_cat text;
  v_max numeric;
  v_pull numeric;
  v_dip numeric;
  v_squat numeric;
  v_mu numeric;
  v_current numeric;
  v_bex_id uuid;
  v_item_name text;
  v_detail text;
  v_log_id uuid;
  v_result public.program_test_results;
  v_min_access_tier text;
  v_tier_rank CONSTANT jsonb := '{"free":0,"first":1,"pro":2,"max":3}'::jsonb;
  v_before record;
  v_after record;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('done', 'skipped', 'none') THEN
    RAISE EXCEPTION 'BAD_STATUS' USING ERRCODE = '22023';
  END IF;

  SELECT wp.template_id, wp.coach_id INTO v_template_id, v_coach_id
  FROM public.warrior_programs wp
  WHERE wp.id = p_warrior_program_id AND wp.warrior_id = v_uid AND wp.status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROGRAM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- A real coach: the library ("Leap", ...0001) and AI Coach (...0002)
  -- system profiles are flagged is_coach too, and own every self-built and
  -- AI program.
  IF v_coach_id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles c WHERE c.id = v_coach_id AND (c.is_coach OR c.is_admin)
     ) THEN
    RAISE EXCEPTION 'NOT_COACH_PROGRAM' USING ERRCODE = '42501';
  END IF;

  SELECT pb.name, pb.notes, COALESCE(pb.week_number, 1)
  INTO v_block_name, v_block_notes, v_week
  FROM public.program_blocks pb
  WHERE pb.id = p_block_id AND pb.template_id = v_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  v_kind := public._block_concept(v_block_notes) ->> 'test_kind';
  v_target := NULLIF(public._block_concept(v_block_notes) ->> 'test_movement', '');
  IF v_kind IS NULL OR v_kind NOT IN ('max_reps', 'one_rm', 'max_hold', 'form_check') THEN
    RAISE EXCEPTION 'NOT_A_TEST' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before FROM public._test_week_counts(p_warrior_program_id, v_template_id, v_week);

  -- Clear.
  IF p_status = 'none' THEN
    DELETE FROM public.workout_logs
    WHERE warrior_id = v_uid AND block_id = p_block_id AND warrior_program_id = p_warrior_program_id;
    DELETE FROM public.program_test_results
    WHERE warrior_program_id = p_warrior_program_id AND block_id = p_block_id;
    RETURN jsonb_build_object('success', true, 'result', NULL, 'week_complete', false);
  END IF;

  -- The block's exercise names the item and takes the set log.
  SELECT be.id, el.name INTO v_bex_id, v_item_name
  FROM public.block_exercises be
  LEFT JOIN public.exercise_library el ON el.id = be.exercise_id
  WHERE be.block_id = p_block_id
  ORDER BY be.order_index NULLS LAST, be.id
  LIMIT 1;
  v_item_name := COALESCE(
    v_item_name,
    NULLIF(trim(substr(v_block_name, strpos(v_block_name, ' | ') + 3)), ''),
    v_block_name
  );

  IF p_status = 'done' THEN
    -- Same paid rule as log_block_with_sets.
    SELECT pt.min_access_tier INTO v_min_access_tier
    FROM public.program_templates pt WHERE pt.id = v_template_id;
    IF v_min_access_tier IS NOT NULL
       AND COALESCE((v_tier_rank ->> public.caller_effective_tier())::int, 0)
         < COALESCE((v_tier_rank ->> v_min_access_tier)::int, 0) THEN
      RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(strength_tier, 0) INTO v_tier FROM public.profiles WHERE id = v_uid;
    PERFORM set_config('leap.test_item_submit', 'on', true);

    IF v_kind = 'max_reps' THEN
      v_movement := v_target;
      v_unit := 'reps';
      SELECT category_id, max_reps INTO v_cat, v_max
      FROM public.onemm_movements WHERE id = v_movement;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'BAD_MOVEMENT' USING ERRCODE = '22023';
      END IF;
      IF p_value IS NULL OR p_value <= 0 OR p_value <> trunc(p_value) THEN
        RAISE EXCEPTION 'BAD_VALUE' USING ERRCODE = '22023';
      END IF;
      IF p_value > v_max THEN
        RAISE EXCEPTION 'VALUE_TOO_HIGH' USING ERRCODE = '22023';
      END IF;
      v_value := p_value;
      -- Same unlock tiers as ONEMM_CATEGORIES in src/lib/oneMMLogic.ts.
      IF v_tier >= (CASE v_cat WHEN 'entry' THEN 0 WHEN 'main' THEN 3 ELSE 5 END) THEN
        -- Same PB rows as submit_onemm_log (superseded rows don't count).
        SELECT COALESCE(MAX(reps), 0) INTO v_prior
        FROM public.one_min_max_logs
        WHERE user_id = v_uid AND movement_id = v_movement AND NOT excluded_from_pb;
        SELECT r.overtaken_notification_id, r.wra_overtaken_notification_id
        INTO v_overtaken, v_wra_overtaken
        FROM public.submit_onemm_log(v_movement, v_value::int, false) r;
        v_world := 'saved';
      ELSE
        v_world := 'locked';
      END IF;

    ELSIF v_kind = 'one_rm' THEN
      v_movement := v_target;
      v_unit := 'kg';
      IF v_movement IS NULL OR v_movement NOT IN ('pull_up', 'dip', 'squat', 'muscle_up', 'deadlift') THEN
        RAISE EXCEPTION 'BAD_MOVEMENT' USING ERRCODE = '22023';
      END IF;
      -- Same ceilings as submit_power_assessment; deadlift is bar weight.
      v_max := CASE v_movement WHEN 'pull_up' THEN 150 WHEN 'dip' THEN 200 WHEN 'squat' THEN 300
                               WHEN 'muscle_up' THEN 100 ELSE 500 END;
      IF p_value IS NULL OR p_value < 0 THEN
        RAISE EXCEPTION 'BAD_VALUE' USING ERRCODE = '22023';
      END IF;
      IF p_value > v_max THEN
        RAISE EXCEPTION 'VALUE_TOO_HIGH' USING ERRCODE = '22023';
      END IF;
      v_value := p_value;
      IF v_movement = 'deadlift' THEN
        v_world := 'no_world';
      ELSIF v_tier < 6 THEN
        v_world := 'locked';
      ELSE
        SELECT pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm INTO v_pull, v_dip, v_squat, v_mu
        FROM public.power_assessments WHERE user_id = v_uid;
        v_current := COALESCE(CASE v_movement WHEN 'pull_up' THEN v_pull WHEN 'dip' THEN v_dip
                                              WHEN 'squat' THEN v_squat ELSE v_mu END, 0);
        v_prior := v_current;
        -- Like PowerService.savePB: only a heavier lift is sent, with the
        -- other three lifts' bests unchanged.
        IF v_value > v_current THEN
          SELECT r.is_promotion, r.overtaken_notification_id, r.wra_overtaken_notification_id
          INTO v_promotion, v_overtaken, v_wra_overtaken
          FROM public.submit_power_assessment(
            CASE WHEN v_movement = 'pull_up' THEN v_value ELSE COALESCE(v_pull, 0) END,
            CASE WHEN v_movement = 'dip' THEN v_value ELSE COALESCE(v_dip, 0) END,
            CASE WHEN v_movement = 'squat' THEN v_value ELSE COALESCE(v_squat, 0) END,
            CASE WHEN v_movement = 'muscle_up' THEN v_value ELSE COALESCE(v_mu, 0) END,
            false
          ) r;
        END IF;
        v_world := 'saved';
      END IF;

    ELSIF v_kind = 'max_hold' THEN
      v_movement := p_movement_id;
      v_unit := 'seconds';
      SELECT category, max_hold_seconds INTO v_cat, v_max
      FROM public.static_movements WHERE id = v_movement;
      IF NOT FOUND OR (v_target IS NOT NULL AND v_cat <> v_target) THEN
        RAISE EXCEPTION 'BAD_MOVEMENT' USING ERRCODE = '22023';
      END IF;
      IF p_value IS NULL OR p_value <= 0 THEN
        RAISE EXCEPTION 'BAD_VALUE' USING ERRCODE = '22023';
      END IF;
      IF p_value > v_max THEN
        RAISE EXCEPTION 'VALUE_TOO_HIGH' USING ERRCODE = '22023';
      END IF;
      v_value := p_value;
      -- isStaticWorldUnlocked: Strength tier 1.
      IF v_tier >= 1 THEN
        v_prior := COALESCE((
          SELECT sh.hold_seconds FROM public.static_holds sh
          WHERE sh.user_id = v_uid AND sh.movement_id = v_movement
        ), 0);
        SELECT r.overtaken_notification_id, r.wra_overtaken_notification_id
        INTO v_overtaken, v_wra_overtaken
        FROM public.submit_static_hold(v_movement, v_value, false) r;
        v_world := 'saved';
      ELSE
        v_world := 'locked';
      END IF;

    ELSE -- form_check: sent to the coach on WhatsApp.
      v_movement := NULL;
      v_unit := NULL;
      v_value := NULL;
    END IF;

  ELSE -- skipped
    IF p_skip_reason IS NULL OR p_skip_reason NOT IN ('cant_do', 'injury', 'no_equipment', 'no_time', 'other') THEN
      RAISE EXCEPTION 'BAD_REASON' USING ERRCODE = '22023';
    END IF;
    v_movement := CASE WHEN v_kind = 'max_hold' THEN NULL ELSE v_target END;
  END IF;

  v_detail := NULLIF(left(trim(COALESCE(p_skip_detail, '')), 500), '');
  -- A note can't pass itself off as the missed marker of workout_logs.notes.
  v_note := NULLIF(left(trim(regexp_replace(COALESCE(p_note, ''), '^\s*\[STATUS:MISSED\]', '')), 500), '');

  -- PB against the world best from before this save (only a result that
  -- went into its world can be one).
  IF v_world = 'saved' THEN
    v_new_pb := v_value > v_prior;
    v_matched_pb := v_prior > 0 AND v_value = v_prior;
  END IF;

  INSERT INTO public.program_test_results AS r (
    warrior_program_id, warrior_id, block_id, week_number, test_kind, movement_id, item_name,
    status, value, unit, skip_reason, skip_detail, world_status, is_new_pb, is_matched_pb, note
  )
  VALUES (
    p_warrior_program_id, v_uid, p_block_id, v_week, v_kind, v_movement, v_item_name,
    p_status, v_value, v_unit,
    CASE WHEN p_status = 'skipped' THEN p_skip_reason END,
    CASE WHEN p_status = 'skipped' THEN v_detail END,
    v_world, COALESCE(v_new_pb, false), COALESCE(v_matched_pb, false), v_note
  )
  ON CONFLICT ON CONSTRAINT program_test_results_item_unique DO UPDATE SET
    week_number = EXCLUDED.week_number,
    test_kind = EXCLUDED.test_kind,
    movement_id = EXCLUDED.movement_id,
    item_name = EXCLUDED.item_name,
    status = EXCLUDED.status,
    value = EXCLUDED.value,
    unit = EXCLUDED.unit,
    skip_reason = EXCLUDED.skip_reason,
    skip_detail = EXCLUDED.skip_detail,
    world_status = EXCLUDED.world_status,
    note = EXCLUDED.note,
    -- The same result saved again keeps its flags (the world best now
    -- includes this item's own earlier save); any other change recomputes.
    is_new_pb = CASE WHEN (r.status, r.value, r.movement_id) IS NOT DISTINCT FROM (EXCLUDED.status, EXCLUDED.value, EXCLUDED.movement_id)
                     THEN r.is_new_pb ELSE EXCLUDED.is_new_pb END,
    is_matched_pb = CASE WHEN (r.status, r.value, r.movement_id) IS NOT DISTINCT FROM (EXCLUDED.status, EXCLUDED.value, EXCLUDED.movement_id)
                         THEN r.is_matched_pb ELSE EXCLUDED.is_matched_pb END,
    -- A changed result needs a fresh look from the coach.
    coach_grade = CASE WHEN (r.status, r.value, r.movement_id) IS NOT DISTINCT FROM (EXCLUDED.status, EXCLUDED.value, EXCLUDED.movement_id)
                       THEN r.coach_grade END,
    coach_note = CASE WHEN (r.status, r.value, r.movement_id) IS NOT DISTINCT FROM (EXCLUDED.status, EXCLUDED.value, EXCLUDED.movement_id)
                      THEN r.coach_note END,
    graded_by = CASE WHEN (r.status, r.value, r.movement_id) IS NOT DISTINCT FROM (EXCLUDED.status, EXCLUDED.value, EXCLUDED.movement_id)
                     THEN r.graded_by END,
    graded_at = CASE WHEN (r.status, r.value, r.movement_id) IS NOT DISTINCT FROM (EXCLUDED.status, EXCLUDED.value, EXCLUDED.movement_id)
                     THEN r.graded_at END,
    updated_at = now()
  RETURNING r.* INTO v_result;

  -- Block log: one per item, replacing any earlier one.
  DELETE FROM public.workout_logs
  WHERE warrior_id = v_uid AND block_id = p_block_id AND warrior_program_id = p_warrior_program_id;

  INSERT INTO public.workout_logs (
    warrior_program_id, warrior_id, block_id, notes, rating, missed_reason, missed_detail
  )
  VALUES (
    p_warrior_program_id, v_uid, p_block_id,
    CASE WHEN p_status = 'skipped' THEN '[STATUS:MISSED]' || COALESCE(' ' || v_note, '') ELSE COALESCE(v_note, '') END,
    5,
    CASE WHEN p_status = 'skipped' THEN
      CASE p_skip_reason WHEN 'injury' THEN 'injury' WHEN 'no_time' THEN 'no_time' ELSE 'other' END
    END,
    CASE WHEN p_status = 'skipped' THEN v_detail END
  )
  RETURNING id INTO v_log_id;

  IF p_status = 'done' AND v_bex_id IS NOT NULL AND v_unit IS NOT NULL THEN
    INSERT INTO public.workout_set_logs (
      workout_log_id, block_exercise_id, set_index, reps_completed, weight_used, hold_seconds, source
    )
    VALUES (
      v_log_id, v_bex_id, 1,
      CASE v_unit WHEN 'reps' THEN v_value::int WHEN 'kg' THEN 1 END,
      CASE WHEN v_unit = 'kg' THEN v_value END,
      CASE WHEN v_unit = 'seconds' THEN v_value END,
      'test'
    );
  END IF;

  -- Tell the coach once, when this save finishes the week's test.
  SELECT * INTO v_after FROM public._test_week_counts(p_warrior_program_id, v_template_id, v_week);
  IF v_after.total > 0 AND v_after.done + v_after.skipped = v_after.total
     AND v_before.done + v_before.skipped < v_before.total THEN
    SELECT display_name INTO v_name FROM public.profiles WHERE id = v_uid;
    PERFORM public.notify_coach_of_achievement(
      v_uid,
      'client_achievement',
      'Test week finished',
      format('%s finished the Week %s test: %s done, %s skipped.',
             COALESCE(v_name, 'A warrior'), v_week, v_after.done, v_after.skipped),
      jsonb_build_object('kind', 'test_week_complete', 'warrior_program_id', p_warrior_program_id, 'week', v_week)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'result', to_jsonb(v_result),
    'is_promotion', COALESCE(v_promotion, false),
    'overtaken_notification_id', v_overtaken,
    'wra_overtaken_notification_id', v_wra_overtaken,
    'week_complete', v_after.total > 0 AND v_after.done + v_after.skipped = v_after.total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_program_test_item(uuid, uuid, text, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_program_test_item(uuid, uuid, text, numeric, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Coach clears one result (and the block log it wrote), like the athlete's
-- own clear (submit_program_test_item with 'none'). The athlete can log the
-- item again afterwards. Errors are bare codes.

CREATE OR REPLACE FUNCTION public.clear_program_test_item(p_result_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result public.program_test_results;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_result
  FROM public.program_test_results r
  WHERE r.id = p_result_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true)
      OR EXISTS (
        SELECT 1 FROM public.warrior_programs wp
        WHERE wp.id = r.warrior_program_id
          AND (wp.coach_id = v_uid OR public.is_assistant_for(wp.coach_id))
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESULT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_result.block_id IS NOT NULL AND v_result.warrior_program_id IS NOT NULL THEN
    DELETE FROM public.workout_logs
    WHERE warrior_id = v_result.warrior_id
      AND block_id = v_result.block_id
      AND warrior_program_id = v_result.warrior_program_id;
  END IF;
  DELETE FROM public.program_test_results WHERE id = p_result_id;

  RETURN jsonb_build_object('success', true, 'cleared', to_jsonb(v_result));
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_program_test_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_program_test_item(uuid) TO authenticated;
