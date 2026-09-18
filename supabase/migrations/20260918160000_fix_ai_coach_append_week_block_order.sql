-- Fixes a real live bug: after week 1 was logged, append_week produced
-- week 2 with blocks in a shuffled order because the AI edited some blocks
-- and not others. Root cause -- this function merged carried-forward
-- blocks (their real order_index from the previous week) with whatever
-- order_index the AI assigned the blocks it actually sent, but the AI only
-- ever sees the blocks it's editing that turn, so its numbers are relative
-- to that small subset, not the whole week. An edited day could jump to
-- the front.
--
-- The edge function (appendWeek.ts's computeAppendWeekOrdering, blockHelpers.ts's
-- computeWeekOrderIndex) now computes the real order for the WHOLE week --
-- by day order from the previous week, then by the fixed phase order every
-- day already follows -- server-side, before this RPC is ever called, and
-- passes it here for both halves of the merge: p_blocks already carries
-- the corrected order_index for what the AI sent, and the new
-- p_carry_order_overrides tells this function the corrected order_index
-- for each block it's about to carry forward unchanged, keyed by exact
-- block name. A name with no override (shouldn't happen when the edge
-- function is used, but this RPC has no way to enforce that) falls back to
-- its own order_index from the previous week, same as before this fix.
--
-- DROP FUNCTION first, same "would otherwise become ambiguous" reasoning
-- as the previous fix to this function (20260823010000) -- Supabase's
-- .rpc() always calls with named arguments, so adding a new parameter via
-- plain CREATE OR REPLACE would create a second overload rather than
-- replace the existing one.
DROP FUNCTION IF EXISTS public.ai_coach_append_week(uuid, jsonb, text[]);

CREATE OR REPLACE FUNCTION public.ai_coach_append_week(
  p_warrior_program_id uuid,
  p_blocks jsonb,
  p_removed_block_names text[] DEFAULT NULL,
  p_carry_order_overrides jsonb DEFAULT '{}'::jsonb
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

  -- Hard ownership boundary: only ever an AI-owned program belonging to the
  -- caller. A real human coach's program is never reachable through this
  -- RPC, regardless of who's asking.
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
      'order_index', COALESCE((p_carry_order_overrides->>pb.name)::int, pb.order_index),
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

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (auth.uid(), 'append_week');

  RETURN jsonb_build_object(
    'success', true,
    'template_id', v_template_id,
    'week_offset', v_week_offset,
    'carried_forward_count', jsonb_array_length(v_carry_blocks)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_append_week(uuid, jsonb, text[], jsonb) TO authenticated;
