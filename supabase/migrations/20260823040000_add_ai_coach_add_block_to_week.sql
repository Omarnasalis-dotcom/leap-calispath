-- Fills a real gap: neither adjust_program (only UPDATEs existing
-- block_exercises rows, never INSERTs) nor append_week (only ever writes a
-- brand-new week number) can add a new block/day to a week that's already
-- written, in place, without bumping current_week. Same ownership boundary
-- and direct-write pattern as append_week/adjust_program (no tap-confirm
-- card — purely additive, nothing destroyed, same risk class as those two).

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
    CHECK (kind IN ('chat', 'create_program', 'append_week', 'adjust_program', 'end_program', 'delete_week', 'add_block'));
END $$;

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

  INSERT INTO public.ai_coach_requests (user_id, kind) VALUES (auth.uid(), 'add_block');

  RETURN jsonb_build_object('success', true, 'week_number', p_week_number, 'blocks_added', v_block_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_add_block_to_week(uuid, integer, jsonb) TO authenticated;
