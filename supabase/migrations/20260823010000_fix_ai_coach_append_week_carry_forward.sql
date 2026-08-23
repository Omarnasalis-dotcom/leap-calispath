-- Fixes a real production bug: ai_coach_append_week's own tool description
-- (and system-prompt.ts's FIX 7) always claimed "the app carries forward
-- anything from the prior week that isn't overridden" — but the original
-- RPC (20260821180000_add_ai_coach_write_rpcs.sql) never implemented any
-- carry-forward at all; it inserted exactly the blocks it was given and
-- nothing else. When the AI Coach correctly followed its own (false)
-- instructions and sent only changed blocks, the new week landed with
-- those blocks and nothing else — reproduced end-to-end from a real
-- conversation transcript before writing this fix.
--
-- Real carry-forward, keyed by exact block name ("DAY | SECTION", e.g.
-- "PULL DAY 1 | Strength"): any block from the previous week whose name
-- isn't present in p_blocks (being replaced) or in the new
-- p_removed_block_names list (being deliberately dropped) is copied
-- forward verbatim, exercises included. To change a block's exercises
-- (add/remove/modify freely), the AI resends it with the SAME name and its
-- full new exercise list. A new name creates a new block. This gives the
-- AI full "like a real coach" adaptability per block without needing
-- separate exercise-level diff/merge logic — it always writes a block's
-- complete desired exercise list, exactly like it already does for
-- create_program and for any block it explicitly changes today.

-- Adding p_removed_block_names via CREATE OR REPLACE would create a SECOND
-- overload alongside the existing 2-arg signature rather than replacing it
-- — Postgres resolves overloads by argument name/type sets regardless of
-- positional vs. named calling convention, and Supabase's .rpc() always
-- calls with named arguments, so a call passing just
-- {p_warrior_program_id, p_blocks} would become ambiguous between the old
-- 2-arg function and the new 3-arg-with-default one. Same "is not unique"
-- failure mode already reproduced and fixed this same way for
-- save_standalone_workout (20260822070000_add_standalone_workout_cover_image.sql)
-- — dropping the old signature first avoids it here too.
DROP FUNCTION IF EXISTS public.ai_coach_append_week(uuid, jsonb);

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
