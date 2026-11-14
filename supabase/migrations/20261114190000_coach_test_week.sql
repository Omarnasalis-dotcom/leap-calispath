-- Coach Test Week (owner plan 2026-11-14).
--
-- A coach marks blocks of an assigned program as test items. Each item
-- lives in the block's concept metadata, like is_tier_trial, so every
-- path that copies blocks (assign, duplicate week, restore) keeps it:
--   [CONCEPT:{..., "test_kind": "...", "test_movement": "..."}]
--   test_kind     max_reps   -> One Min Max (reps in 60 s), test_movement = onemm id
--                 one_rm     -> Power World, test_movement = pull_up|dip|squat|muscle_up|deadlift
--                               (deadlift has no world: test record + My Progress only)
--                 max_hold   -> Static World, test_movement = static category; the
--                               athlete picks the progression when logging
--                 form_check -> no world; the athlete sends the video to the
--                               coach on WhatsApp and marks it sent
--
-- Owner rules:
--  * Only coach-assigned programs take test results: warrior_programs.coach_id
--    is a coach or admin, and not the "Leap" library / AI Coach system
--    profiles (both flagged is_coach on prod).
--  * A result goes into its world through the world's own RPC (same checks,
--    same notifications). A world the athlete has not unlocked yet gets
--    nothing: the result stays in the test record only.
--  * A lower result than the world best never lowers the world (no "save
--    anyway" in a test); the test record keeps the real number.
--  * One result per item. Can't do it -> skip with a reason.
--  * Saving the item also logs the block (workout_logs, + one set log with
--    the number), so the day shows done, adherence counts it and My Progress
--    charts pick the number up.
--
-- The three world RPCs below are prod's current definitions (pulled
-- 2026-11-14) with one change each: the 30 s cooldown is skipped when
-- submit_program_test_item set leap.test_item_submit for its transaction,
-- so lifts logged back to back don't fail. Clients cannot set that GUC
-- (PostgREST exposes no set_config).

-- ---------------------------------------------------------------------------
-- Concept metadata of a block's notes, NULL when absent or not JSON.

CREATE OR REPLACE FUNCTION public._block_concept(p_notes text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
BEGIN
  RETURN (regexp_match(COALESCE(p_notes, ''), '^\[CONCEPT:(.*?)\]'))[1]::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public._block_concept(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Test results. Written only by the RPCs below.

CREATE TABLE IF NOT EXISTS public.program_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SET NULL: a deleted or replaced program keeps its athlete's test history.
  warrior_program_id uuid REFERENCES public.warrior_programs(id) ON DELETE SET NULL,
  warrior_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_id uuid REFERENCES public.program_blocks(id) ON DELETE SET NULL,
  week_number integer NOT NULL DEFAULT 1,
  test_kind text NOT NULL CHECK (test_kind IN ('max_reps', 'one_rm', 'max_hold', 'form_check')),
  -- The world movement actually tested (for max_hold: the progression the
  -- athlete picked). NULL for form checks.
  movement_id text,
  item_name text,
  status text NOT NULL CHECK (status IN ('done', 'skipped')),
  value numeric CHECK (value IS NULL OR value >= 0),
  unit text CHECK (unit IS NULL OR unit IN ('reps', 'kg', 'seconds')),
  skip_reason text CHECK (skip_reason IS NULL OR skip_reason IN ('cant_do', 'injury', 'no_equipment', 'no_time', 'other')),
  skip_detail text CHECK (skip_detail IS NULL OR char_length(skip_detail) <= 500),
  -- saved: sent to its world. locked: world not unlocked yet. no_world:
  -- the movement has no world (deadlift). none: form check / skipped.
  world_status text NOT NULL DEFAULT 'none' CHECK (world_status IN ('saved', 'locked', 'no_world', 'none')),
  is_new_pb boolean NOT NULL DEFAULT false,
  coach_grade text CHECK (coach_grade IS NULL OR coach_grade IN ('pass', 'needs_work')),
  coach_note text CHECK (coach_note IS NULL OR char_length(coach_note) <= 1000),
  graded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_test_results_item_unique UNIQUE (warrior_program_id, block_id)
);

CREATE INDEX IF NOT EXISTS program_test_results_warrior_idx
  ON public.program_test_results (warrior_id, created_at DESC);

ALTER TABLE public.program_test_results ENABLE ROW LEVEL SECURITY;

-- The athlete, any coach (or assistant) who has assigned them a program,
-- and admins can read. No write policies: RPCs only.
DROP POLICY IF EXISTS "Read own or coached test results" ON public.program_test_results;
CREATE POLICY "Read own or coached test results" ON public.program_test_results
  FOR SELECT TO authenticated
  USING (
    warrior_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true)
    OR EXISTS (
      SELECT 1 FROM public.warrior_programs wp
      WHERE wp.warrior_id = program_test_results.warrior_id
        AND (wp.coach_id = auth.uid() OR public.is_assistant_for(wp.coach_id))
    )
  );

REVOKE ALL ON public.program_test_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.program_test_results TO authenticated;

-- ---------------------------------------------------------------------------
-- Coach WhatsApp number, for the form-check "Send video to coach" button.

CREATE TABLE IF NOT EXISTS public.coach_contacts (
  coach_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{7,15}$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coach reads own contact" ON public.coach_contacts;
CREATE POLICY "Coach reads own contact" ON public.coach_contacts
  FOR SELECT TO authenticated
  USING (coach_id = auth.uid());

REVOKE ALL ON public.coach_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.coach_contacts TO authenticated;

-- Digits only, international format without "+" (wa.me links want that).
-- NULL / '' clears it.
CREATE OR REPLACE FUNCTION public.set_my_coach_whatsapp(p_number text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_digits text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND (is_coach OR is_admin)) THEN
    RAISE EXCEPTION 'NOT_COACH' USING ERRCODE = '42501';
  END IF;

  v_digits := NULLIF(regexp_replace(COALESCE(p_number, ''), '[^0-9]', '', 'g'), '');
  -- 00 international prefix -> drop it.
  IF v_digits LIKE '00%' THEN
    v_digits := substr(v_digits, 3);
  END IF;
  IF v_digits IS NOT NULL AND v_digits !~ '^[0-9]{7,15}$' THEN
    RAISE EXCEPTION 'BAD_NUMBER' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.coach_contacts (coach_id, whatsapp, updated_at)
  VALUES (v_uid, v_digits, now())
  ON CONFLICT (coach_id) DO UPDATE SET whatsapp = EXCLUDED.whatsapp, updated_at = now();

  RETURN v_digits;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_my_coach_whatsapp(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_coach_whatsapp(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Test blocks of one week of a template, and whether the program has a
-- result for each.

CREATE OR REPLACE FUNCTION public._test_week_counts(p_warrior_program_id uuid, p_template_id uuid, p_week integer)
RETURNS TABLE(total integer, done integer, skipped integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT count(*)::int,
         count(r.id) FILTER (WHERE r.status = 'done')::int,
         count(r.id) FILTER (WHERE r.status = 'skipped')::int
  FROM public.program_blocks pb
  LEFT JOIN public.program_test_results r
    ON r.block_id = pb.id AND r.warrior_program_id = p_warrior_program_id
  WHERE pb.template_id = p_template_id
    AND COALESCE(pb.week_number, 1) = p_week
    AND public._block_concept(pb.notes) ->> 'test_kind' IN ('max_reps', 'one_rm', 'max_hold', 'form_check');
$function$;

REVOKE ALL ON FUNCTION public._test_week_counts(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save one test item. p_status: 'done' (value logged / form check sent),
-- 'skipped' (with p_skip_reason) or 'none' (clear the item).
-- Errors are bare codes; the app maps them.

CREATE OR REPLACE FUNCTION public.submit_program_test_item(
  p_warrior_program_id uuid,
  p_block_id uuid,
  p_status text,
  p_value numeric DEFAULT NULL,
  p_movement_id text DEFAULT NULL,
  p_skip_reason text DEFAULT NULL,
  p_skip_detail text DEFAULT NULL
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
        SELECT r.is_new_pb, r.overtaken_notification_id, r.wra_overtaken_notification_id
        INTO v_new_pb, v_overtaken, v_wra_overtaken
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
        -- Like PowerService.savePB: only a heavier lift is sent, with the
        -- other three lifts' bests unchanged.
        IF v_value > v_current THEN
          SELECT r.is_new_pb, r.is_promotion, r.overtaken_notification_id, r.wra_overtaken_notification_id
          INTO v_new_pb, v_promotion, v_overtaken, v_wra_overtaken
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
        SELECT r.is_new_pb, r.overtaken_notification_id, r.wra_overtaken_notification_id
        INTO v_new_pb, v_overtaken, v_wra_overtaken
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

  INSERT INTO public.program_test_results AS r (
    warrior_program_id, warrior_id, block_id, week_number, test_kind, movement_id, item_name,
    status, value, unit, skip_reason, skip_detail, world_status, is_new_pb
  )
  VALUES (
    p_warrior_program_id, v_uid, p_block_id, v_week, v_kind, v_movement, v_item_name,
    p_status, v_value, v_unit,
    CASE WHEN p_status = 'skipped' THEN p_skip_reason END,
    CASE WHEN p_status = 'skipped' THEN v_detail END,
    v_world, COALESCE(v_new_pb, false)
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
    -- A PB stays a PB when the same item is saved again lower.
    is_new_pb = r.is_new_pb OR EXCLUDED.is_new_pb,
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
    CASE WHEN p_status = 'skipped' THEN '[STATUS:MISSED]' ELSE '' END,
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

REVOKE ALL ON FUNCTION public.submit_program_test_item(uuid, uuid, text, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_program_test_item(uuid, uuid, text, numeric, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- The athlete's (or their coach's) view of a program's tests: every result
-- plus who to send form-check videos to.

CREATE OR REPLACE FUNCTION public.get_program_tests(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_warrior_id uuid;
  v_coach_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT warrior_id, coach_id INTO v_warrior_id, v_coach_id
  FROM public.warrior_programs WHERE id = p_warrior_program_id;
  IF NOT FOUND OR NOT (
    v_warrior_id = v_uid
    OR v_coach_id = v_uid
    OR public.is_assistant_for(v_coach_id)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true)
  ) THEN
    RAISE EXCEPTION 'PROGRAM_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'coach', (
      SELECT jsonb_build_object('name', p.display_name, 'whatsapp', cc.whatsapp)
      FROM public.profiles p
      LEFT JOIN public.coach_contacts cc ON cc.coach_id = p.id
      WHERE p.id = v_coach_id AND (p.is_coach OR p.is_admin)
        AND p.id NOT IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
    ),
    'results', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.week_number, r.created_at)
      FROM public.program_test_results r
      WHERE r.warrior_program_id = p_warrior_program_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_program_tests(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_program_tests(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Coach grades an item (mainly form checks): pass / needs_work + note.
-- p_grade NULL clears the grade.

CREATE OR REPLACE FUNCTION public.grade_program_test_item(p_result_id uuid, p_grade text, p_note text DEFAULT NULL)
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
  IF p_grade IS NOT NULL AND p_grade NOT IN ('pass', 'needs_work') THEN
    RAISE EXCEPTION 'BAD_GRADE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.program_test_results r SET
    coach_grade = p_grade,
    coach_note = CASE WHEN p_grade IS NULL THEN NULL ELSE NULLIF(left(trim(COALESCE(p_note, '')), 1000), '') END,
    graded_by = CASE WHEN p_grade IS NULL THEN NULL ELSE v_uid END,
    graded_at = CASE WHEN p_grade IS NULL THEN NULL ELSE now() END
  WHERE r.id = p_result_id
    AND (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_admin = true)
      OR EXISTS (
        SELECT 1 FROM public.warrior_programs wp
        WHERE wp.id = r.warrior_program_id
          AND (wp.coach_id = v_uid OR public.is_assistant_for(wp.coach_id))
      )
    )
  RETURNING r.* INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESULT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN to_jsonb(v_result);
END;
$function$;

REVOKE ALL ON FUNCTION public.grade_program_test_item(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grade_program_test_item(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- World RPCs: prod definitions + the test-item cooldown skip.

CREATE OR REPLACE FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean, is_promotion boolean, overtaken_notification_id uuid, wra_overtaken_notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_current_pullup NUMERIC := 0.0;
    v_current_dip NUMERIC := 0.0;
    v_current_squat NUMERIC := 0.0;
    v_current_muscleup NUMERIC := 0.0;
    v_old_points NUMERIC := 0.0;
    v_new_points NUMERIC := 0.0;
    v_old_tier INT := 0;
    v_new_tier INT := 0;
    v_is_new_pb BOOLEAN := false;
    v_last_assessed_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_profile_points NUMERIC := 0.0;
    v_profile_tier INT := 0;
    v_new_profile_points NUMERIC := 0.0;
    v_new_profile_tier INT := 0;
    v_statics_tier NUMERIC := 0.0;
    v_one_mm_points NUMERIC := 0.0;
    v_display_name TEXT;
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
    v_wra_notification_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF p_pullup < 0 OR p_pullup > 150 OR
       p_dip < 0 OR p_dip > 200 OR
       p_squat < 0 OR p_squat > 300 OR
       p_muscleup < 0 OR p_muscleup > 100
    THEN
        RAISE EXCEPTION 'Assessment values exceed realistic physical limits.' USING ERRCODE = 'P1001';
    END IF;

    SELECT assessed_at INTO v_last_assessed_at
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    IF v_last_assessed_at IS NOT NULL
       -- Test items save several results back to back (see
       -- submit_program_test_item); only that function sets this flag.
       AND COALESCE(current_setting('leap.test_item_submit', true), '') <> 'on' THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_assessed_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1002';
        END IF;
    END IF;

    SELECT
        pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm
    INTO
        v_current_pullup, v_current_dip, v_current_squat, v_current_muscleup
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    v_current_pullup  := COALESCE(v_current_pullup, 0.0);
    v_current_dip     := COALESCE(v_current_dip, 0.0);
    v_current_squat   := COALESCE(v_current_squat, 0.0);
    v_current_muscleup := COALESCE(v_current_muscleup, 0.0);

    IF p_pullup > v_current_pullup OR
       p_dip > v_current_dip OR
       p_squat > v_current_squat OR
       p_muscleup > v_current_muscleup
    THEN
        v_is_new_pb := true;
    END IF;

    IF p_force THEN
        v_current_pullup   := p_pullup;
        v_current_dip      := p_dip;
        v_current_squat    := p_squat;
        v_current_muscleup := p_muscleup;
    ELSE
        v_current_pullup   := GREATEST(v_current_pullup, p_pullup);
        v_current_dip      := GREATEST(v_current_dip, p_dip);
        v_current_squat    := GREATEST(v_current_squat, p_squat);
        v_current_muscleup := GREATEST(v_current_muscleup, p_muscleup);
    END IF;

    v_old_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);
    v_new_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);

    IF v_old_points >= 250 THEN v_old_tier := 3;
    ELSIF v_old_points >= 100 THEN v_old_tier := 2;
    ELSE v_old_tier := 1;
    END IF;

    IF v_new_points >= 250 THEN v_new_tier := 3;
    ELSIF v_new_points >= 100 THEN v_new_tier := 2;
    ELSE v_new_tier := 1;
    END IF;

    INSERT INTO public.power_assessments AS pa (
        user_id, pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm, power_tier, assessed_at
    )
    VALUES (
        v_user_id, v_current_pullup, v_current_dip, v_current_squat, v_current_muscleup, v_new_tier, NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
        pullup_1rm   = EXCLUDED.pullup_1rm,
        dip_1rm      = EXCLUDED.dip_1rm,
        squat_1rm    = EXCLUDED.squat_1rm,
        muscleup_1rm = EXCLUDED.muscleup_1rm,
        power_tier   = GREATEST(COALESCE(pa.power_tier, 0), EXCLUDED.power_tier),
        assessed_at  = EXCLUDED.assessed_at;

    INSERT INTO public.power_assessment_log (user_id, pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm, created_at)
    VALUES (v_user_id, p_pullup, p_dip, p_squat, p_muscleup, NOW());

    -- Read the stored profile values: the tier ratchet and the overtake /
    -- Well-Rounded notifications below compare against them.
    SELECT COALESCE(power_points, 0.0), COALESCE(power_tier, 0), COALESCE(statics_tier, 0), COALESCE(one_mm_points, 0), display_name
    INTO v_profile_points, v_profile_tier, v_statics_tier, v_one_mm_points, v_display_name
    FROM public.profiles
    WHERE id = v_user_id;

    -- "Save anyway" (p_force) replaces the records above, so the world
    -- points follow them, down too. Otherwise points only go up. The tier
    -- always keeps the highest level reached (owner decision 2026-10-13).
    v_new_profile_points := CASE WHEN p_force THEN v_new_points ELSE GREATEST(v_profile_points, v_new_points) END;
    v_new_profile_tier := GREATEST(v_profile_tier, v_new_tier);

    UPDATE public.profiles
    SET power_points = v_new_profile_points,
        power_tier   = v_new_profile_tier,
        power_assessed_at = COALESCE(power_assessed_at, NOW()),
        updated_at   = NOW()
    WHERE id = v_user_id;

    IF v_new_profile_points > v_profile_points THEN
        SELECT p2.id INTO v_overtaken_user_id
        FROM public.profiles p2
        WHERE p2.power_tier = v_new_profile_tier
          AND p2.id != v_user_id
          AND p2.power_points < v_new_profile_points
          AND p2.power_points >= v_profile_points
        ORDER BY p2.power_points DESC
        LIMIT 1;

        IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_overtaken_user_id,
                'leaderboard_overtaken',
                'You''ve Been Overtaken!',
                format('%s just beat your score on the Power World leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
                jsonb_build_object('screen', 'power-world')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    v_wra_notification_id := public._find_and_notify_wra_overtake(
        v_user_id,
        v_statics_tier + v_profile_points + v_one_mm_points,
        v_statics_tier + v_new_profile_points + v_one_mm_points
    );

    IF v_is_new_pb THEN
        PERFORM public.notify_coach_of_achievement(
            v_user_id,
            'client_achievement',
            'Client PB!',
            format('%s set a new Power World PB.', COALESCE(v_display_name, 'A warrior')),
            jsonb_build_object('kind', 'power_pb', 'world', 'power', 'tier', v_new_profile_tier)
        );
    END IF;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier), v_overtaken_notification_id, v_wra_notification_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean, overtaken_notification_id uuid, wra_overtaken_notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_multiplier NUMERIC;
    v_max_hold_seconds NUMERIC;
    v_points NUMERIC;
    v_current_hold NUMERIC := 0.0;
    v_is_new_pb BOOLEAN := false;
    v_last_attempt_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_old_statics_tier NUMERIC := 0.0;
    v_new_statics_tier NUMERIC := 0.0;
    v_power_points NUMERIC := 0.0;
    v_one_mm_points NUMERIC := 0.0;
    v_display_name TEXT;
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
    v_wra_notification_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF p_hold_seconds < 0 THEN
        RAISE EXCEPTION 'Hold time cannot be negative.' USING ERRCODE = 'P1001';
    END IF;

    SELECT multiplier, max_hold_seconds INTO v_multiplier, v_max_hold_seconds
    FROM public.static_movements
    WHERE id = p_movement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid movement ID.' USING ERRCODE = 'P1002';
    END IF;

    IF p_hold_seconds > v_max_hold_seconds THEN
        RAISE EXCEPTION 'Hold time of %s exceeds the %s ceiling for this movement.', p_hold_seconds, v_max_hold_seconds
          USING ERRCODE = 'P1003';
    END IF;

    SELECT created_at INTO v_last_attempt_at
    FROM public.static_hold_attempts
    WHERE user_id = v_user_id AND movement_id = p_movement_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_attempt_at IS NOT NULL
       -- Test items save several results back to back (see
       -- submit_program_test_item); only that function sets this flag.
       AND COALESCE(current_setting('leap.test_item_submit', true), '') <> 'on' THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_attempt_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait %s before submitting this movement again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1004';
        END IF;
    END IF;

    SELECT hold_seconds INTO v_current_hold
    FROM public.static_holds
    WHERE user_id = v_user_id AND movement_id = p_movement_id;

    v_current_hold := COALESCE(v_current_hold, 0.0);
    v_is_new_pb := p_hold_seconds > v_current_hold;

    SELECT COALESCE(statics_tier, 0), COALESCE(power_points, 0), COALESCE(one_mm_points, 0), display_name
    INTO v_old_statics_tier, v_power_points, v_one_mm_points, v_display_name
    FROM public.profiles WHERE id = v_user_id;

    IF v_is_new_pb OR p_force THEN
        v_points := p_hold_seconds * v_multiplier;

        INSERT INTO public.static_holds (user_id, movement_id, hold_seconds, points, created_at)
        VALUES (v_user_id, p_movement_id, p_hold_seconds, v_points, NOW())
        ON CONFLICT (user_id, movement_id) DO UPDATE
        SET hold_seconds = EXCLUDED.hold_seconds, points = EXCLUDED.points, created_at = EXCLUDED.created_at;

        PERFORM public.sync_static_points(v_user_id);
    END IF;

    INSERT INTO public.static_hold_attempts (user_id, movement_id, hold_seconds, accepted, created_at)
    VALUES (v_user_id, p_movement_id, p_hold_seconds, v_is_new_pb, NOW());

    SELECT COALESCE(statics_tier, 0) INTO v_new_statics_tier FROM public.profiles WHERE id = v_user_id;

    IF v_new_statics_tier > v_old_statics_tier THEN
        SELECT p2.id INTO v_overtaken_user_id
        FROM public.profiles p2
        WHERE p2.id != v_user_id
          AND COALESCE(p2.statics_tier, 0) < v_new_statics_tier
          AND COALESCE(p2.statics_tier, 0) >= v_old_statics_tier
        ORDER BY p2.statics_tier DESC
        LIMIT 1;

        IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_overtaken_user_id,
                'leaderboard_overtaken',
                'You''ve Been Overtaken!',
                format('%s just beat your score on the Static World leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
                jsonb_build_object('screen', 'static-world')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    v_wra_notification_id := public._find_and_notify_wra_overtake(
        v_user_id,
        v_old_statics_tier + v_power_points + v_one_mm_points,
        v_new_statics_tier + v_power_points + v_one_mm_points
    );

    IF v_is_new_pb THEN
        PERFORM public.notify_coach_of_achievement(
            v_user_id,
            'client_achievement',
            'Client PB!',
            format('%s set a new Static World PB.', COALESCE(v_display_name, 'A warrior')),
            jsonb_build_object('kind', 'static_pb', 'world', 'static', 'movement_id', p_movement_id, 'hold_seconds', p_hold_seconds)
        );
    END IF;

    RETURN QUERY SELECT v_is_new_pb, v_overtaken_notification_id, v_wra_notification_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer, p_force boolean DEFAULT false)
 RETURNS TABLE(is_new_pb boolean, overtaken_notification_id uuid, wra_overtaken_notification_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_category_id TEXT;
    v_multiplier NUMERIC;
    v_max_reps INTEGER;
    v_points NUMERIC;
    v_current_max INT := 0;
    v_is_new_pb BOOLEAN := false;
    v_last_attempt_at TIMESTAMPTZ;
    v_seconds_since_last NUMERIC;
    v_cooldown_seconds CONSTANT NUMERIC := 30;
    v_old_one_mm_points NUMERIC := 0.0;
    v_new_one_mm_points NUMERIC := 0.0;
    v_statics_tier NUMERIC := 0.0;
    v_power_points NUMERIC := 0.0;
    v_display_name TEXT;
    v_overtaken_user_id UUID;
    v_overtaken_notification_id UUID;
    v_wra_notification_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    IF p_reps < 0 THEN
        RAISE EXCEPTION 'Rep count cannot be negative.' USING ERRCODE = 'P1001';
    END IF;

    SELECT category_id, multiplier, max_reps
    INTO v_category_id, v_multiplier, v_max_reps
    FROM public.onemm_movements
    WHERE id = p_movement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid movement ID.' USING ERRCODE = 'P1002';
    END IF;

    IF p_reps > v_max_reps THEN
        RAISE EXCEPTION 'Rep count of % exceeds the % ceiling for this movement.', p_reps, v_max_reps
          USING ERRCODE = 'P1003';
    END IF;

    SELECT created_at INTO v_last_attempt_at
    FROM public.one_min_max_logs
    WHERE user_id = v_user_id AND movement_id = p_movement_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_attempt_at IS NOT NULL
       -- Test items save several results back to back (see
       -- submit_program_test_item); only that function sets this flag.
       AND COALESCE(current_setting('leap.test_item_submit', true), '') <> 'on' THEN
        v_seconds_since_last := EXTRACT(EPOCH FROM (NOW() - v_last_attempt_at));
        IF v_seconds_since_last < v_cooldown_seconds THEN
            RAISE EXCEPTION 'Please wait % seconds before submitting this movement again.',
              CEIL(v_cooldown_seconds - v_seconds_since_last)
              USING ERRCODE = 'P1004';
        END IF;
    END IF;

    -- Only currently-counted (not superseded) rows determine the PB.
    SELECT COALESCE(MAX(reps), 0) INTO v_current_max
    FROM public.one_min_max_logs
    WHERE user_id = v_user_id AND movement_id = p_movement_id AND NOT excluded_from_pb;

    v_is_new_pb := p_reps >= v_current_max;

    -- Forcing a lower value: soft-supersede every currently-counted row
    -- that's still higher than this submission, so this one becomes the
    -- new recognized PB. Nothing is deleted — superseded rows stay in the
    -- table for history, they just stop counting toward MAX()-derived
    -- PB/points/leaderboard queries below.
    IF p_force AND NOT v_is_new_pb THEN
        UPDATE public.one_min_max_logs
        SET excluded_from_pb = true
        WHERE user_id = v_user_id AND movement_id = p_movement_id
          AND reps > p_reps AND NOT excluded_from_pb;
    END IF;

    SELECT COALESCE(one_mm_points, 0), COALESCE(statics_tier, 0), COALESCE(power_points, 0), display_name
    INTO v_old_one_mm_points, v_statics_tier, v_power_points, v_display_name
    FROM public.profiles WHERE id = v_user_id;

    v_points := p_reps * v_multiplier;

    INSERT INTO public.one_min_max_logs (
        user_id, movement_id, category_id, reps, points, created_at
    )
    VALUES (
        v_user_id, p_movement_id, v_category_id, p_reps, v_points, NOW()
    );

    PERFORM public.sync_onemm_points(v_user_id);

    SELECT COALESCE(one_mm_points, 0) INTO v_new_one_mm_points FROM public.profiles WHERE id = v_user_id;

    IF v_new_one_mm_points > v_old_one_mm_points THEN
        SELECT p2.id INTO v_overtaken_user_id
        FROM public.profiles p2
        WHERE p2.id != v_user_id
          AND COALESCE(p2.one_mm_points, 0) < v_new_one_mm_points
          AND COALESCE(p2.one_mm_points, 0) >= v_old_one_mm_points
        ORDER BY p2.one_mm_points DESC
        LIMIT 1;

        IF v_overtaken_user_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.notification_preferences
            WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
        ) THEN
            INSERT INTO public.notifications (user_id, type, title, body, data)
            VALUES (
                v_overtaken_user_id,
                'leaderboard_overtaken',
                'You''ve Been Overtaken!',
                format('%s just beat your score on the 1MM leaderboard. Defend your spot!', COALESCE(v_display_name, 'Someone')),
                jsonb_build_object('screen', 'one-min-max')
            )
            RETURNING id INTO v_overtaken_notification_id;
        END IF;
    END IF;

    v_wra_notification_id := public._find_and_notify_wra_overtake(
        v_user_id,
        v_statics_tier + v_power_points + v_old_one_mm_points,
        v_statics_tier + v_power_points + v_new_one_mm_points
    );

    IF v_is_new_pb THEN
        PERFORM public.notify_coach_of_achievement(
            v_user_id,
            'client_achievement',
            'Client PB!',
            format('%s set a new 1MM PB.', COALESCE(v_display_name, 'A warrior')),
            jsonb_build_object('kind', 'one_mm_pb', 'world', 'one_mm', 'movement_id', p_movement_id, 'reps', p_reps)
        );
    END IF;

    RETURN QUERY SELECT v_is_new_pb, v_overtaken_notification_id, v_wra_notification_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Planned-set fill: prod definition (2026-11-14) + never fill test blocks,
-- so a form check or an exercise's planned reps can't add assumed sets.

CREATE OR REPLACE FUNCTION public._fill_planned_sets(p_workout_log_id uuid, p_source text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO workout_set_logs
    (workout_log_id, block_exercise_id, set_index, reps_completed, weight_used, hold_seconds, created_at, source)
  SELECT wl.id,
         be.id,
         s.n,
         CASE WHEN COALESCE(be.hold_seconds, 0) > 0 THEN NULL ELSE be.reps END,
         NULL,
         CASE WHEN COALESCE(be.hold_seconds, 0) > 0 THEN be.hold_seconds END,
         wl.completed_at,
         p_source
  FROM workout_logs wl
  JOIN program_blocks pb ON pb.id = wl.block_id
  JOIN block_exercises be ON be.block_id = wl.block_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN substring(pb.notes from '"structure":"([a-z]+)"') IN ('circuit', 'superset')
        THEN GREATEST(COALESCE(substring(pb.notes from '"rounds":"?([0-9]+)')::int, 1), 1)
      ELSE GREATEST(COALESCE(be.sets, 1), 1)
    END AS planned
  ) p
  CROSS JOIN LATERAL generate_series(1, p.planned) AS s(n)
  WHERE wl.id = p_workout_log_id
    AND COALESCE(wl.notes, '') NOT LIKE '[STATUS:MISSED]%'
    -- Test items log their own number (or nothing, for form checks).
    AND (public._block_concept(pb.notes) ->> 'test_kind') IS NULL
    AND (COALESCE(be.reps, 0) > 0 OR COALESCE(be.hold_seconds, 0) > 0)
    AND NOT EXISTS (
      SELECT 1 FROM workout_set_logs sl
      WHERE sl.workout_log_id = wl.id AND sl.block_exercise_id = be.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM workout_set_logs sl
      WHERE sl.workout_log_id = wl.id AND sl.source = 'stale_slot'
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
