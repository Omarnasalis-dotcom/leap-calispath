-- Confirmed product spec (subscription_tiers_pricing_confirmed, 2026-08-29):
-- First ("starter") tier exists to let a user create exactly ONE AI Coach
-- program, ever — not a renewable daily/monthly allowance like Pro/Max.
-- This was never actually enforced: First was only gated by the same
-- 2-per-day rate limit as every other paid tier, so a First subscriber
-- could keep creating (and replacing) programs indefinitely.
--
-- Free tier's existing behavior is untouched and already correct: it can
-- chat and get a proposal card, but ai_coach_create_program/_from_workouts
-- already raise PRO_REQUIRED for it via caller_has_pro_access() — hitting
-- "Start Program" is exactly where free hits the paywall today.
--
-- Lifetime, not per-period: counts every ai_coach_requests row with
-- kind='create_program' this user has ever produced, regardless of whether
-- that program was later ended/deleted, and regardless of what tier they
-- were on at the time. A First subscriber who used their one program, then
-- upgraded to Pro and later downgraded back to First, does not get a second
-- free one — the tier's whole value proposition is a single sample, not a
-- renewable-on-resubscribe resource.
--
-- Raises the exact same bare 'PRO_REQUIRED' string as every other gate here
-- (entitlement.ts's isProRequiredError does exact string equality) — routes
-- to the paywall exactly like hitting the tier gate itself, upselling
-- Pro/Max for "more programs" rather than a dead-end error.
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
  v_tier text;
  v_lifetime_count integer;
  v_today_count integer;
  v_new_template_id uuid;
  v_new_warrior_program_id uuid;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  v_tier := public.caller_effective_tier();
  IF v_tier = 'free' THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_tier = 'first' THEN
    SELECT count(*) INTO v_lifetime_count
    FROM public.ai_coach_requests
    WHERE user_id = v_warrior_id AND kind = 'create_program';

    IF v_lifetime_count >= 1 THEN
      RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
    END IF;
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
  v_tier text;
  v_lifetime_count integer;
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

  v_tier := public.caller_effective_tier();
  IF v_tier = 'free' THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_tier = 'first' THEN
    SELECT count(*) INTO v_lifetime_count
    FROM public.ai_coach_requests
    WHERE user_id = v_warrior_id AND kind = 'create_program';

    IF v_lifetime_count >= 1 THEN
      RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
    END IF;
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
