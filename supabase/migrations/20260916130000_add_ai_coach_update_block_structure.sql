-- Closes the "frozen structure after cloning" gap found 2026-09-16:
-- adjust_program and ai_coach_replace_block_exercises can only ever touch a
-- block's exercises, never its timing_system/structure/rounds/time_cap/
-- ladder/tabata fields — a workout cloned via propose_program_from_workouts
-- as straight_set + single stayed straight_set + single forever, with no
-- way to apply system-prompt.ts §16's own role table once a real athlete's
-- numbers called for something else (an advanced athlete's Pull day should
-- become a descending ladder, not stay a flat straight set).
--
-- Same safety pattern as ai_coach_adjust_program/ai_coach_replace_block_exercises
-- exactly: caller_has_pro_access() gate, coach_id must be the AI system
-- profile AND warrior_id must be the caller (never a human-coach-owned
-- program), block_id ownership re-verified against the caller's own
-- template_id (never trusted from the model), a per-day rate limit logged
-- into ai_coach_requests.
--
-- Metadata-only, never exercises — those stay exactly as adjust_program/
-- ai_coach_replace_block_exercises left them. program_blocks has no
-- separate metadata column: the CONCEPT tag lives inside `notes` as
-- "[CONCEPT:{json}] plain coach_notes text" (transformBlocksForInsert /
-- parseConceptNotes in blockHelpers.ts). This shallow-merges the caller's
-- partial metadata object over whatever CONCEPT json is already there and
-- reassembles the same notes format, so the plain coach_notes text and any
-- field the caller didn't mention both survive untouched.
--
-- p_changes is an array (same shape idea as ai_coach_adjust_program's
-- p_changes) so the mandatory Adapt-after-clone pass (system-prompt.ts §11)
-- can fix every block in a freshly cloned program in ONE call — found live
-- (2026-09-16, before this ever shipped) that a single-block-per-call
-- design would have cost one rate-limited unit per block just for a
-- required system step, on top of whatever the athlete does later that
-- day. One ai_coach_requests row per CALL, not per block, exactly like
-- ai_coach_adjust_program already does — so an Adapt pass covering an
-- entire multi-day program still costs exactly 1 of the 10 daily units.
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
    CHECK (kind IN ('chat', 'create_program', 'append_week', 'adjust_program', 'end_program', 'delete_week', 'add_block', 'replace_block', 'update_block_structure'));
END $$;

CREATE OR REPLACE FUNCTION public.ai_coach_update_block_structure(
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
  v_block_id uuid;
  v_owning_template_id uuid;
  v_old_notes text;
  v_concept_json text;
  v_plain_notes text;
  v_merged_metadata jsonb;
  v_new_notes text;
  v_updated_count integer := 0;
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

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid() AND kind = 'update_block_structure' AND created_at >= date_trunc('day', now());
  IF v_today_count >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMIT: update_block_structure daily limit reached';
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_block_id := (v_change->>'block_id')::uuid;

    SELECT template_id, notes INTO v_owning_template_id, v_old_notes
    FROM public.program_blocks WHERE id = v_block_id;

    IF v_owning_template_id IS NULL OR v_owning_template_id != v_template_id THEN
      RAISE EXCEPTION 'block_id % does not belong to this program', v_block_id;
    END IF;

    v_concept_json := (regexp_match(COALESCE(v_old_notes, ''), '^\[CONCEPT:(.*?)\]'))[1];
    v_plain_notes := regexp_replace(COALESCE(v_old_notes, ''), '^\[CONCEPT:.*?\]\s*', '');

    IF v_concept_json IS NULL THEN
      RAISE EXCEPTION 'Block % has no existing structure metadata to update — it may be malformed. Use replace_block_exercises or rebuild the day instead.', v_block_id;
    END IF;

    v_merged_metadata := v_concept_json::jsonb || COALESCE(v_change->'metadata', '{}'::jsonb);
    v_new_notes := trim(both ' ' from ('[CONCEPT:' || v_merged_metadata::text || '] ' || v_plain_notes));

    UPDATE public.program_blocks
    SET notes = v_new_notes
    WHERE id = v_block_id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  INSERT INTO public.ai_coach_requests (user_id, kind, rc_original_transaction_id)
  VALUES (auth.uid(), 'update_block_structure', public.caller_rc_transaction_id());

  RETURN jsonb_build_object('success', true, 'blocks_updated', v_updated_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_update_block_structure(uuid, jsonb) TO authenticated;
