-- Authoritative re-check before flipping a library template to published.
-- The client (validateForPublish in src/lib/TemplateLibraryPublish.ts)
-- runs the full check first for inline UX feedback, including the
-- per-block timing_system/structure check — that part is deliberately
-- NOT duplicated here, since it requires parsing the [CONCEPT:{...}] tag
-- out of program_blocks.notes (BlockConceptParser's job), and replicating
-- that parsing in plpgsql risks drifting from the canonical JS
-- implementation. This RPC re-checks the parts that matter most for data
-- integrity if bypassed: tier range validity and duplicate coverage,
-- which is what getRecommendations()'s matching actually depends on.
CREATE OR REPLACE FUNCTION public.publish_library_template(p_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_coach_id uuid;
  v_is_admin boolean;
  v_criteria jsonb;
  v_min int;
  v_max int;
  v_goal text;
  v_block_count int;
  v_duplicate_id uuid;
BEGIN
  SELECT coach_id, matching_criteria INTO v_coach_id, v_criteria
  FROM program_templates
  WHERE id = p_template_id AND is_library_template = true;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to publish this template');
  END IF;

  IF v_criteria IS NULL OR v_criteria->'tier_range' IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Set a tier range before publishing');
  END IF;

  v_min := (v_criteria->'tier_range'->>'min')::int;
  v_max := (v_criteria->'tier_range'->>'max')::int;
  v_goal := v_criteria->>'goal';

  IF v_min > v_max THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tier range minimum can''t exceed maximum');
  END IF;
  IF v_min < 0 OR v_max > 9 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tier range must be within 0-9');
  END IF;
  IF v_goal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Set a goal before publishing');
  END IF;

  SELECT count(*) INTO v_block_count FROM program_blocks WHERE template_id = p_template_id;
  IF v_block_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template has no blocks');
  END IF;

  SELECT id INTO v_duplicate_id
  FROM program_templates
  WHERE is_library_template = true
    AND status = 'published'
    AND id != p_template_id
    AND matching_criteria @> jsonb_build_object('goal', v_goal, 'tier_range', v_criteria->'tier_range')
  LIMIT 1;

  IF v_duplicate_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Another published template already covers this exact tier range and goal');
  END IF;

  UPDATE program_templates
  SET status = 'published', published_at = now()
  WHERE id = p_template_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;
