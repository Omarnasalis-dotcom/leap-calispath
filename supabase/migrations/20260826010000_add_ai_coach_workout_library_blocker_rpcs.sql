-- Rebuild plan Phase 3 (docs/features/ai-coach-rebuild-plan.md): two RPCs
-- that block the Match->Clone->Adapt flow entirely without them.
--
-- 3.1 ai_coach_create_program_from_workouts is a clone of
-- create_custom_program_from_workouts's CURRENT body (20260822060000 —
-- not the superseded 20260822040000 original; that earlier version
-- flattened each workout into a single block via
-- `swe.workout_id = sw.id`, but 20260822060000 rewrote it to clone each
-- workout's OWN blocks as separate program_blocks rows via
-- standalone_workout_blocks/swe.block_id — confirmed by grepping every
-- migration touching this function, not just the one that first added it)
-- with exactly one change: coach_id = AI_COACH_SYSTEM_PROFILE_ID ('...0002'), not
-- LEAP_SYSTEM_PROFILE_ID ('...0001'). Every other ai_coach_* write RPC
-- guards `IF v_coach_id != v_ai_profile_id RAISE 'Not authorized'` — a
-- library-built program owned by '...0001' would assign fine and then
-- reject every subsequent AI Coach edit, and get_user_context would report
-- is_ai_coach_owned: false. Reuses the 'create_program' rate-limit kind
-- (already shared by ai_coach_create_program) rather than adding a new one
-- — both are "the athlete now has one fresh AI-owned program" from the
-- rate limit's point of view.
--
-- 3.2 ai_coach_replace_block_exercises closes the one gap neither
-- adjust_program (UPDATEs existing block_exercises rows only, never
-- INSERTs/DELETEs) nor append_week (only ever writes a brand-new week
-- number) can cover: add/remove/reorder exercises within a block that's
-- already written. Same ownership boundary as adjust_program, checked one
-- level up (program_blocks.template_id instead of block_exercises's owning
-- template) since we're replacing the whole exercise list, not editing one
-- row at a time.

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.ai_coach_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kind%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_coach_requests DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.ai_coach_requests ADD CONSTRAINT ai_coach_requests_kind_check
    CHECK (kind IN ('chat', 'create_program', 'append_week', 'adjust_program', 'end_program', 'delete_week', 'add_block', 'replace_block'));
END $$;

CREATE OR REPLACE FUNCTION public.ai_coach_create_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_warrior_id CONSTANT uuid := auth.uid();
  v_paywall_enabled boolean;
  v_is_pro boolean;
  v_blocked_title text;
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

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = v_warrior_id AND kind = 'create_program' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 2 THEN
    RAISE EXCEPTION 'RATE_LIMIT: create_program daily limit reached';
  END IF;

  -- Mirrors canAccessPro() (src/lib/entitlement.ts) server-side, same as
  -- the original create_custom_program_from_workouts — this RPC can't be
  -- called directly to bypass the client's own lock check.
  SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM public.app_config;
  v_is_pro := NOT COALESCE(v_paywall_enabled, false)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_warrior_id AND (is_admin OR is_coach))
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = v_warrior_id AND access_expires_at > now());

  SELECT title INTO v_blocked_title
  FROM public.standalone_workouts
  WHERE id = ANY(p_workout_ids)
    AND (kind <> 'workout' OR status <> 'published' OR (is_free = false AND NOT v_is_pro))
  LIMIT 1;
  IF v_blocked_title IS NOT NULL THEN
    RAISE EXCEPTION 'Workout not available: %', v_blocked_title;
  END IF;

  -- Checked via the unnested array (one row per occurrence), not a plain
  -- `id = ANY(...)` count comparison — the same workout id can legitimately
  -- appear more than once, and ANY() membership dedupes matches, which
  -- would make a duplicate-id selection falsely fail this check.
  IF EXISTS (
    SELECT 1
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
    LEFT JOIN public.standalone_workouts sw
      ON sw.id = ids.workout_id AND sw.kind = 'workout' AND sw.status = 'published'
    WHERE sw.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected workouts could not be found';
  END IF;

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

  INSERT INTO public.program_templates (name, description, coach_id)
  VALUES ('My Custom Program', array_length(p_workout_ids, 1) || '-day custom program built from the Workout Library', v_ai_profile_id)
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, v_blocks);

  INSERT INTO public.warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_ai_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (v_warrior_id, 'create_program');

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_new_warrior_program_id, 'template_id', v_new_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_create_program_from_workouts(uuid[]) TO authenticated;


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

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'replace_block');

  RETURN jsonb_build_object('success', true, 'block_id', p_block_id, 'exercise_count', v_exercise_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_replace_block_exercises(uuid, uuid, jsonb) TO authenticated;
