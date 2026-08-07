-- Library templates (the shared recommendation catalog warriors can
-- self-select into) were unintentionally coach-writable: any coach could
-- call import_library_template to create one attributed to themselves,
-- edit its matching criteria or archive it via direct table writes (RLS
-- only checked coach_id = auth.uid(), same as an ordinary master
-- template), and publish_library_template explicitly allowed the owning
-- coach as well as admin. All 13 existing library_template rows already
-- belong to the admin account, so this restriction is purely additive.
--
-- program_templates already has a separate "Admin manages all templates"
-- FOR ALL policy, so admin is unaffected by tightening the coach/assistant
-- branches below.

ALTER POLICY "Coaches can insert templates" ON public.program_templates
WITH CHECK (
  NOT is_library_template
  AND (
    (
      coach_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.is_coach = true)
      AND NOT public.is_coaching_paused(auth.uid())
    )
    OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
  )
);

ALTER POLICY "Coaches can update templates" ON public.program_templates
USING (
  NOT is_library_template
  AND (
    (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
    OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
  )
)
WITH CHECK (
  NOT is_library_template
  AND (
    (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
    OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
  )
);

ALTER POLICY "Coaches can delete templates" ON public.program_templates
USING (
  NOT is_library_template
  AND (
    (coach_id = auth.uid() AND NOT public.is_coaching_paused(auth.uid()))
    OR (public.is_assistant_for(coach_id) AND NOT public.is_coaching_paused(coach_id))
  )
);

CREATE OR REPLACE FUNCTION public.import_library_template(p_name text, p_description text, p_blocks jsonb, p_matching_criteria jsonb DEFAULT NULL::jsonb, p_equipment_tags jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id uuid;
  v_block jsonb;
  v_exercise jsonb;
  v_saved_block_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  INSERT INTO program_templates (name, description, coach_id, is_library_template, status, matching_criteria, equipment_tags)
  VALUES (p_name, p_description, auth.uid(), true, 'draft', p_matching_criteria, COALESCE(p_equipment_tags, '[]'::jsonb))
  RETURNING id INTO v_template_id;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks)
  LOOP
    INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
    VALUES (
      v_template_id,
      v_block->>'name',
      v_block->>'notes',
      (v_block->>'order_index')::int,
      COALESCE((v_block->>'week_number')::int, 1)
    )
    RETURNING id INTO v_saved_block_id;

    FOR v_exercise IN SELECT * FROM jsonb_array_elements(COALESCE(v_block->'exercises', '[]'::jsonb))
    LOOP
      INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, notes, order_index)
      VALUES (
        v_saved_block_id,
        (v_exercise->>'exercise_id')::uuid,
        (v_exercise->>'sets')::int,
        (v_exercise->>'reps')::int,
        (v_exercise->>'rest_seconds')::int,
        (v_exercise->>'hold_seconds')::int,
        v_exercise->>'notes',
        (v_exercise->>'order_index')::int
      );
    END LOOP;
  END LOOP;

  RETURN v_template_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_library_template(p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id uuid;
  v_criteria jsonb;
  v_min int;
  v_max int;
  v_goal text;
  v_block_count int;
  v_duplicate_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized to publish this template');
  END IF;

  SELECT coach_id, matching_criteria INTO v_coach_id, v_criteria
  FROM program_templates
  WHERE id = p_template_id AND is_library_template = true;

  IF v_coach_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
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
