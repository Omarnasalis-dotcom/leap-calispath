-- Owner, 2026-11-06: full access in a review, delete included. A reviewer can
-- add, remove and reorder exercises, set weighted, rename a block, edit its
-- note, change its type, and add, move or delete blocks. Days and weeks stay
-- with the AI Coach.
--
-- Each of these saves the whole block before and after, so revert can bring
-- back something deleted, under its original ids. A block that's logged is
-- still refused, the same rule the AI Coach follows, and it's what keeps the
-- foreign keys from workout_logs safe. Every result keeps the rules
-- validateBlockStructure enforces (reviewedBlocks.test.ts).

ALTER TABLE public.program_review_changes
  DROP CONSTRAINT program_review_changes_kind_check,
  DROP CONSTRAINT program_review_changes_review_id_block_exercise_id_key;
ALTER TABLE public.program_review_changes
  ADD CONSTRAINT program_review_changes_kind_check CHECK (kind IN ('exercise', 'rounds', 'settings', 'structure')),
  ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY,
  -- What was done, for the athlete's card: {op, exercise, to, ...}.
  ADD COLUMN detail jsonb,
  -- Null when the block didn't exist on that side of the change.
  ALTER COLUMN before DROP NOT NULL,
  ALTER COLUMN after DROP NOT NULL;
CREATE UNIQUE INDEX program_review_changes_one_per_row
  ON public.program_review_changes (review_id, block_exercise_id) WHERE kind <> 'structure';

COMMENT ON COLUMN public.program_review_changes.block_exercise_id IS
  'The block_exercises id, or the program_blocks id when kind is settings or structure.';

CREATE FUNCTION public._block_full(p_block_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'id', b.id, 'template_id', b.template_id, 'name', b.name, 'notes', b.notes,
    'order_index', b.order_index, 'week_number', b.week_number,
    'exercises', (
      SELECT COALESCE(jsonb_agg(to_jsonb(be) ORDER BY be.order_index, be.id), '[]'::jsonb)
      FROM public.block_exercises be WHERE be.block_id = b.id
    )
  )
  FROM public.program_blocks b WHERE b.id = p_block_id;
$$;

-- Without order_index: adding a block shifts the others, which isn't a change
-- to them.
CREATE FUNCTION public._block_fingerprint(p_full jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5((p_full - 'order_index')::text);
$$;

CREATE OR REPLACE FUNCTION public._program_week_snapshot(p_template_id uuid, p_week integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'block_id', b.id,
    'name', b.name,
    'structure', public._block_structure(b.notes),
    'timing', public._block_timing(b.notes),
    'settings', public._block_settings(b.notes),
    'fingerprint', public._block_fingerprint(public._block_full(b.id)),
    'order_index', b.order_index,
    'note', ltrim(regexp_replace(COALESCE(b.notes, ''), '^\[CONCEPT:.*?\]', '')),
    'logged', EXISTS (SELECT 1 FROM public.workout_logs wl WHERE wl.block_id = b.id),
    'exercises', (
      SELECT COALESCE(jsonb_agg(public._review_row(be) || jsonb_build_object(
        'block_exercise_id', be.id,
        'name', e.name,
        'is_weighted', be.is_weighted
      ) ORDER BY be.order_index, be.id), '[]'::jsonb)
      FROM public.block_exercises be
      JOIN public.exercise_library e ON e.id = be.exercise_id
      WHERE be.block_id = b.id
    )
  ) ORDER BY b.order_index, b.id), '[]'::jsonb)
  FROM public.program_blocks b
  WHERE b.template_id = p_template_id AND b.week_number = p_week;
$$;

CREATE FUNCTION public._restore_block(p_full jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid := (p_full->>'id')::uuid;
BEGIN
  INSERT INTO public.program_blocks (id, template_id, name, notes, order_index, week_number)
  VALUES (v_id, (p_full->>'template_id')::uuid, p_full->>'name', p_full->>'notes',
          (p_full->>'order_index')::int, (p_full->>'week_number')::int)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, notes = EXCLUDED.notes, order_index = EXCLUDED.order_index, week_number = EXCLUDED.week_number;

  DELETE FROM public.block_exercises WHERE block_id = v_id;
  INSERT INTO public.block_exercises (id, block_id, exercise_id, sets, reps, rest_seconds, notes, order_index, hold_seconds, is_weighted)
  SELECT id, block_id, exercise_id, sets, reps, rest_seconds, notes, order_index, hold_seconds, is_weighted
  FROM jsonb_populate_recordset(NULL::public.block_exercises, p_full->'exercises');
END;
$$;

CREATE FUNCTION public._undo_structure_change(p_change public.program_review_changes)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_id uuid := p_change.block_exercise_id;
  v_exists boolean := EXISTS (SELECT 1 FROM public.program_blocks WHERE id = v_id);
  v_order integer;
  v_template uuid;
  v_week integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_id) THEN
    RETURN false;
  END IF;

  IF p_change.after IS NULL THEN
    -- It was deleted. A new block in its place doesn't matter: ids are unique.
    IF v_exists THEN
      RETURN false;
    END IF;
    PERFORM public._restore_block(p_change.before);
    RETURN true;
  END IF;

  IF NOT v_exists OR public._block_fingerprint(public._block_full(v_id)) <> public._block_fingerprint(p_change.after) THEN
    RETURN false;
  END IF;

  IF p_change.before IS NULL THEN
    SELECT order_index, template_id, week_number INTO v_order, v_template, v_week FROM public.program_blocks WHERE id = v_id;
    DELETE FROM public.program_blocks WHERE id = v_id;
    UPDATE public.program_blocks SET order_index = order_index - 1
    WHERE template_id = v_template AND week_number = v_week AND order_index > v_order;
    RETURN true;
  END IF;

  PERFORM public._restore_block(p_change.before);
  RETURN true;
END;
$$;

-- A block keeps its own name after "DAY | ", which is how the app and the AI
-- Coach group blocks into days.
CREATE FUNCTION public._block_day(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN position(' | ' IN p_name) > 0 THEN split_part(p_name, ' | ', 1) END;
$$;

-- The block's settings after a change of type: what it had where that still
-- applies, sensible values where it doesn't, and what validateBlockStructure
-- requires of the new type.
CREATE FUNCTION public._block_retyped(p_concept jsonb, p_timing text, p_structure text, p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_base jsonb;
  v_values jsonb;
  v_out jsonb;
  v_defaults CONSTANT jsonb := '{"rounds":"3","rest_after_round":60,"time_cap_min":10,"tabata_work_seconds":20,"tabata_rest_seconds":10,"tabata_rounds":8,"ladder_start":10,"ladder_sub":2,"ladder_direction":"down"}';
  v_key text;
BEGIN
  IF p_timing NOT IN ('straight_set', 'amrap', 'fortime', 'tabata')
    OR p_structure NOT IN ('single', 'superset', 'circuit', 'ladder') THEN
    RAISE EXCEPTION 'INVALID_VALUES';
  END IF;

  v_base := COALESCE(p_concept, '{}'::jsonb)
    - 'rounds' - 'rest_after_round' - 'time_cap_min' - 'timer_seconds' - 'type'
    - 'tabata_work_seconds' - 'tabata_rest_seconds' - 'tabata_rounds'
    - 'ladder_start' - 'ladder_sub' - 'ladder_direction';
  -- Tabata always runs as a circuit, as in BlockConfigWizard.
  v_base := v_base || jsonb_build_object(
    'timing_system', p_timing,
    'structure', CASE WHEN p_timing = 'tabata' THEN 'circuit' ELSE p_structure END
  );
  v_base := v_base || jsonb_build_object('focus_tag', COALESCE(p_concept->>'focus_tag', 'FULL_BODY'))
                   || jsonb_build_object('is_weighted', COALESCE((p_concept->>'is_weighted')::boolean, false));

  v_values := '{}';
  FOREACH v_key IN ARRAY public._block_setting_keys(v_base) LOOP
    v_values := v_values || jsonb_build_object(v_key, COALESCE(
      NULLIF(COALESCE(p_settings, '{}'::jsonb)->v_key, 'null'::jsonb),
      NULLIF(p_concept->v_key, 'null'::jsonb),
      v_defaults->v_key
    ));
  END LOOP;

  v_out := v_base || jsonb_strip_nulls(public._checked_block_settings(v_values));
  -- A timed superset or circuit doesn't use rounds, but validation requires them.
  IF v_out->>'structure' IN ('superset', 'circuit', 'ladder') AND NOT (v_out ? 'rounds') THEN
    v_out := v_out || '{"rounds":"1"}'::jsonb;
  END IF;
  RETURN v_out;
END;
$$;

CREATE FUNCTION public.admin_review_block_op(
  p_review_id uuid, p_block_id uuid, p_fingerprint text, p_op text, p_args jsonb, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_block public.program_blocks;
  v_other public.program_blocks;
  v_before jsonb;
  v_concept jsonb;
  v_new jsonb;
  v_plain text;
  v_day text;
  v_name text;
  v_exercise_name text;
  v_row public.block_exercises;
  v_rows uuid[];
  v_index integer;
  v_target integer;
  v_id uuid;
  v_detail jsonb;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_args jsonb := COALESCE(p_args, '{}'::jsonb);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_review FROM public.program_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_review.status <> 'open' THEN
    RAISE EXCEPTION 'REVIEW_CLOSED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warrior_programs WHERE id = v_review.warrior_program_id AND status = 'active') THEN
    RAISE EXCEPTION 'PROGRAM_ENDED';
  END IF;

  SELECT * INTO v_block FROM public.program_blocks WHERE id = p_block_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE';
  END IF;
  IF v_block.template_id <> v_review.template_id OR v_block.week_number <> v_review.week_number THEN
    RAISE EXCEPTION 'NOT_IN_REVIEW';
  END IF;
  IF p_op <> 'add_block' AND EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = p_block_id) THEN
    RAISE EXCEPTION 'BLOCK_LOGGED';
  END IF;

  v_before := public._block_full(p_block_id);
  IF public._block_fingerprint(v_before) IS DISTINCT FROM p_fingerprint THEN
    RAISE EXCEPTION 'STALE';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  v_concept := public._block_concept(v_block.notes);
  v_plain := ltrim(regexp_replace(COALESCE(v_block.notes, ''), '^\[CONCEPT:.*?\]', ''));
  v_day := public._block_day(v_block.name);
  v_detail := jsonb_build_object('op', p_op);

  IF p_op = 'add_exercise' THEN
    SELECT name INTO v_exercise_name FROM public.exercise_library WHERE id = (v_args->>'exercise_id')::uuid;
    IF v_exercise_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    INSERT INTO public.block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, order_index)
    VALUES (
      p_block_id, (v_args->>'exercise_id')::uuid,
      -- With rounds on the block, each exercise stays at 1 set.
      CASE WHEN COALESCE(v_concept->>'rounds', '') <> '' THEN 1 ELSE GREATEST(COALESCE((v_args->>'sets')::int, 3), 1) END,
      (v_args->>'reps')::int, (v_args->>'rest_seconds')::int, (v_args->>'hold_seconds')::int,
      COALESCE((v_args->>'is_weighted')::boolean, false),
      (SELECT COALESCE(max(order_index), -1) + 1 FROM public.block_exercises WHERE block_id = p_block_id)
    );
    v_detail := v_detail || jsonb_build_object('exercise', v_exercise_name);

  ELSIF p_op IN ('remove_exercise', 'move_exercise', 'set_weighted') THEN
    SELECT * INTO v_row FROM public.block_exercises WHERE id = (v_args->>'block_exercise_id')::uuid AND block_id = p_block_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'STALE';
    END IF;
    SELECT name INTO v_exercise_name FROM public.exercise_library WHERE id = v_row.exercise_id;
    v_detail := v_detail || jsonb_build_object('exercise', v_exercise_name);

    IF p_op = 'remove_exercise' THEN
      IF (SELECT count(*) FROM public.block_exercises WHERE block_id = p_block_id) <= 1 THEN
        RAISE EXCEPTION 'LAST_EXERCISE';
      END IF;
      DELETE FROM public.block_exercises WHERE id = v_row.id;

    ELSIF p_op = 'set_weighted' THEN
      UPDATE public.block_exercises SET is_weighted = COALESCE((v_args->>'is_weighted')::boolean, false) WHERE id = v_row.id;
      v_detail := v_detail || jsonb_build_object('weighted', COALESCE((v_args->>'is_weighted')::boolean, false));

    ELSE
      SELECT array_agg(id ORDER BY order_index, id) INTO v_rows FROM public.block_exercises WHERE block_id = p_block_id;
      v_index := array_position(v_rows, v_row.id);
      v_target := v_index + CASE v_args->>'direction' WHEN 'up' THEN -1 WHEN 'down' THEN 1 ELSE 0 END;
      IF v_target = v_index OR v_target < 1 OR v_target > array_length(v_rows, 1) THEN
        RAISE EXCEPTION 'INVALID_VALUES';
      END IF;
      v_rows[v_index] := v_rows[v_target];
      v_rows[v_target] := v_row.id;
      FOR v_index IN 1 .. array_length(v_rows, 1) LOOP
        UPDATE public.block_exercises SET order_index = v_index - 1 WHERE id = v_rows[v_index];
      END LOOP;
    END IF;

  ELSIF p_op = 'rename_block' THEN
    v_name := NULLIF(trim(COALESCE(v_args->>'name', '')), '');
    IF v_name IS NULL OR char_length(v_name) > 60 OR position('|' IN v_name) > 0 THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    UPDATE public.program_blocks
    SET name = CASE WHEN v_day IS NULL THEN v_name ELSE v_day || ' | ' || v_name END
    WHERE id = p_block_id;
    v_detail := v_detail || jsonb_build_object('to', v_name);

  ELSIF p_op = 'set_block_note' THEN
    IF char_length(COALESCE(v_args->>'note', '')) > 500 THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    UPDATE public.program_blocks
    SET notes = trim(both ' ' from (
      COALESCE('[CONCEPT:' || v_concept::text || '] ', '') || COALESCE(trim(v_args->>'note'), '')
    ))
    WHERE id = p_block_id;

  ELSIF p_op = 'change_type' THEN
    IF COALESCE((v_concept->>'is_tier_trial')::boolean, false) THEN
      RAISE EXCEPTION 'NO_BLOCK_SETTINGS';
    END IF;
    v_new := public._block_retyped(v_concept, v_args->>'timing_system', v_args->>'structure', v_args->'settings');
    UPDATE public.program_blocks
    SET notes = trim(both ' ' from ('[CONCEPT:' || v_new::text || '] ' || v_plain))
    WHERE id = p_block_id;
    IF COALESCE(v_new->>'rounds', '') <> '' THEN
      UPDATE public.block_exercises SET sets = 1 WHERE block_id = p_block_id;
    ELSIF COALESCE(v_concept->>'rounds', '') ~ '^[0-9]+$' AND (v_concept->>'rounds')::int > 1 THEN
      -- Leaving rounds behind: the same volume, now counted per exercise.
      UPDATE public.block_exercises SET sets = (v_concept->>'rounds')::int WHERE block_id = p_block_id;
    END IF;
    v_detail := v_detail || jsonb_build_object('timing', v_new->>'timing_system', 'structure', v_new->>'structure');

  ELSIF p_op = 'move_block' THEN
    SELECT * INTO v_other FROM public.program_blocks b
    WHERE b.template_id = v_block.template_id AND b.week_number = v_block.week_number AND b.id <> v_block.id
      AND public._block_day(b.name) IS NOT DISTINCT FROM v_day
      AND CASE v_args->>'direction'
        WHEN 'up' THEN (b.order_index, b.id) < (v_block.order_index, v_block.id)
        WHEN 'down' THEN (b.order_index, b.id) > (v_block.order_index, v_block.id)
        ELSE false END
    ORDER BY CASE WHEN v_args->>'direction' = 'up' THEN b.order_index END DESC,
             CASE WHEN v_args->>'direction' = 'down' THEN b.order_index END ASC
    LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    IF EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_other.id) THEN
      RAISE EXCEPTION 'BLOCK_LOGGED';
    END IF;
    v_new := public._block_full(v_other.id);
    UPDATE public.program_blocks SET order_index = v_other.order_index WHERE id = v_block.id;
    UPDATE public.program_blocks SET order_index = v_block.order_index WHERE id = v_other.id;
    -- The neighbour is undone on its own row, and shown only once.
    INSERT INTO public.program_review_changes (review_id, block_exercise_id, kind, block_name, before, after, reason)
    VALUES (p_review_id, v_other.id, 'structure', v_other.name, v_new, public._block_full(v_other.id), v_reason);

  ELSIF p_op = 'delete_block' THEN
    DELETE FROM public.program_blocks WHERE id = p_block_id;
    INSERT INTO public.program_review_changes (review_id, block_exercise_id, kind, block_name, before, after, reason, detail)
    VALUES (p_review_id, p_block_id, 'structure', v_block.name, v_before, NULL, v_reason, v_detail);
    RETURN jsonb_build_object('deleted', true);

  ELSIF p_op = 'add_block' THEN
    v_name := NULLIF(trim(COALESCE(v_args->>'name', '')), '');
    SELECT name INTO v_exercise_name FROM public.exercise_library WHERE id = (v_args->>'exercise_id')::uuid;
    IF v_name IS NULL OR char_length(v_name) > 60 OR position('|' IN v_name) > 0 OR v_exercise_name IS NULL THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    UPDATE public.program_blocks SET order_index = order_index + 1
    WHERE template_id = v_block.template_id AND week_number = v_block.week_number AND order_index > v_block.order_index;
    v_new := jsonb_build_object('timing_system', 'straight_set', 'structure', 'single', 'focus_tag', COALESCE(v_concept->>'focus_tag', 'FULL_BODY'), 'is_weighted', false);
    INSERT INTO public.program_blocks (template_id, name, notes, order_index, week_number)
    VALUES (
      v_block.template_id,
      CASE WHEN v_day IS NULL THEN v_name ELSE v_day || ' | ' || v_name END,
      '[CONCEPT:' || v_new::text || ']',
      v_block.order_index + 1,
      v_block.week_number
    )
    RETURNING id INTO v_id;
    INSERT INTO public.block_exercises (block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, order_index)
    VALUES (v_id, (v_args->>'exercise_id')::uuid, GREATEST(COALESCE((v_args->>'sets')::int, 3), 1),
            (v_args->>'reps')::int, (v_args->>'rest_seconds')::int, (v_args->>'hold_seconds')::int, 0);
    INSERT INTO public.program_review_changes (review_id, block_exercise_id, kind, block_name, before, after, reason, detail)
    VALUES (p_review_id, v_id, 'structure', v_name, NULL, public._block_full(v_id), v_reason,
            v_detail || jsonb_build_object('exercise', v_exercise_name));
    RETURN jsonb_build_object('block_id', v_id);

  ELSE
    RAISE EXCEPTION 'INVALID_VALUES';
  END IF;

  INSERT INTO public.program_review_changes (review_id, block_exercise_id, kind, block_name, before, after, reason, detail)
  VALUES (p_review_id, p_block_id, 'structure', v_block.name, v_before, public._block_full(p_block_id), v_reason, v_detail);

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_review_exercise(
  p_review_id uuid,
  p_block_exercise_id uuid,
  p_expected jsonb,
  p_exercise_id uuid,
  p_sets integer,
  p_reps integer,
  p_rest_seconds integer,
  p_hold_seconds integer,
  p_notes text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_be public.block_exercises;
  v_block public.program_blocks;
  v_after jsonb;
  v_existing public.program_review_changes;
  v_before_name text;
  v_after_name text;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_review FROM public.program_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_review.status <> 'open' THEN
    RAISE EXCEPTION 'REVIEW_CLOSED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warrior_programs WHERE id = v_review.warrior_program_id AND status = 'active') THEN
    RAISE EXCEPTION 'PROGRAM_ENDED';
  END IF;

  SELECT * INTO v_be FROM public.block_exercises WHERE id = p_block_exercise_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE';
  END IF;
  SELECT * INTO v_block FROM public.program_blocks WHERE id = v_be.block_id;
  IF v_block.template_id <> v_review.template_id OR v_block.week_number <> v_review.week_number THEN
    RAISE EXCEPTION 'NOT_IN_REVIEW';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_be.block_id) THEN
    RAISE EXCEPTION 'BLOCK_LOGGED';
  END IF;
  IF public._review_row(v_be) IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'STALE';
  END IF;

  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF p_sets IS NULL OR p_sets NOT BETWEEN 1 AND 20
    OR COALESCE(p_reps, 0) NOT BETWEEN 0 AND 500
    OR COALESCE(p_rest_seconds, 0) NOT BETWEEN 0 AND 900
    OR COALESCE(p_hold_seconds, 0) NOT BETWEEN 0 AND 600 THEN
    RAISE EXCEPTION 'INVALID_VALUES';
  END IF;
  IF p_sets <> v_be.sets AND public._block_structure(v_block.notes) IN ('superset', 'circuit', 'ladder') THEN
    RAISE EXCEPTION 'ROUND_BLOCK_SETS';
  END IF;

  UPDATE public.block_exercises SET
    exercise_id = p_exercise_id,
    sets = p_sets,
    reps = p_reps,
    rest_seconds = p_rest_seconds,
    hold_seconds = p_hold_seconds,
    notes = NULLIF(trim(COALESCE(p_notes, '')), '')
  WHERE id = p_block_exercise_id
  RETURNING * INTO v_be;

  v_after := public._review_row(v_be);
  SELECT name INTO v_after_name FROM public.exercise_library WHERE id = v_be.exercise_id;

  SELECT * INTO v_existing FROM public.program_review_changes
  WHERE review_id = p_review_id AND block_exercise_id = p_block_exercise_id AND kind <> 'structure';

  IF NOT FOUND THEN
    SELECT name INTO v_before_name FROM public.exercise_library WHERE id = (p_expected->>'exercise_id')::uuid;
    INSERT INTO public.program_review_changes
      (review_id, block_exercise_id, block_name, exercise_before, exercise_after, before, after, reason)
    VALUES
      (p_review_id, p_block_exercise_id, v_block.name, v_before_name, v_after_name, p_expected, v_after, v_reason);
  ELSIF v_existing.before = v_after THEN
    -- Put back as the AI built it: no change left to report.
    DELETE FROM public.program_review_changes WHERE id = v_existing.id;
  ELSE
    UPDATE public.program_review_changes
    SET after = v_after, exercise_after = v_after_name, reason = v_reason, updated_at = now()
    WHERE id = v_existing.id;
  END IF;

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_review_block(
  p_review_id uuid, p_block_id uuid, p_expected jsonb, p_settings jsonb, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_block public.program_blocks;
  v_current jsonb;
  v_after jsonb;
  v_before jsonb;
  v_existing public.program_review_changes;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_review FROM public.program_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_review.status <> 'open' THEN
    RAISE EXCEPTION 'REVIEW_CLOSED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warrior_programs WHERE id = v_review.warrior_program_id AND status = 'active') THEN
    RAISE EXCEPTION 'PROGRAM_ENDED';
  END IF;

  SELECT * INTO v_block FROM public.program_blocks WHERE id = p_block_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE';
  END IF;
  IF v_block.template_id <> v_review.template_id OR v_block.week_number <> v_review.week_number THEN
    RAISE EXCEPTION 'NOT_IN_REVIEW';
  END IF;
  IF EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = p_block_id) THEN
    RAISE EXCEPTION 'BLOCK_LOGGED';
  END IF;

  v_current := public._block_settings(v_block.notes);
  IF v_current = '{}'::jsonb THEN
    RAISE EXCEPTION 'NO_BLOCK_SETTINGS';
  END IF;
  IF v_current IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'STALE';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_settings) k WHERE NOT (v_current ? k)) THEN
    RAISE EXCEPTION 'INVALID_VALUES';
  END IF;

  v_after := public._checked_block_settings(v_current || p_settings);
  IF public._settings_text(v_after) = public._settings_text(v_current) THEN
    RETURN v_current;
  END IF;

  UPDATE public.program_blocks
  SET notes = public._block_with_settings(v_block.notes, v_after)
  WHERE id = p_block_id;

  SELECT * INTO v_existing FROM public.program_review_changes
  WHERE review_id = p_review_id AND block_exercise_id = p_block_id AND kind <> 'structure';

  IF NOT FOUND THEN
    INSERT INTO public.program_review_changes (review_id, block_exercise_id, kind, block_name, before, after, reason)
    VALUES (p_review_id, p_block_id, 'settings', v_block.name, v_current, v_after, v_reason);
  ELSIF public._settings_text(v_existing.before) = public._settings_text(v_after) THEN
    DELETE FROM public.program_review_changes WHERE id = v_existing.id;
  ELSE
    UPDATE public.program_review_changes SET after = v_after, reason = v_reason, updated_at = now() WHERE id = v_existing.id;
  END IF;

  RETURN v_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_program_review(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_change public.program_review_changes;
  v_be public.block_exercises;
  v_block public.program_blocks;
  v_reverted integer := 0;
  v_skipped integer := 0;
BEGIN
  SELECT * INTO v_review FROM public.program_reviews
  WHERE id = p_review_id AND user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_review.status <> 'closed' OR v_review.outcome IS DISTINCT FROM 'changed' OR v_review.reverted_at IS NOT NULL THEN
    RAISE EXCEPTION 'NOT_REVERTIBLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warrior_programs WHERE id = v_review.warrior_program_id AND status = 'active') THEN
    RAISE EXCEPTION 'PROGRAM_ENDED';
  END IF;

  -- Newest first, so each change undoes back to what the one before it left.
  FOR v_change IN
    SELECT * FROM public.program_review_changes WHERE review_id = p_review_id ORDER BY updated_at DESC, seq DESC
  LOOP
    IF v_change.kind = 'structure' THEN
      IF public._undo_structure_change(v_change) THEN
        v_reverted := v_reverted + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
      CONTINUE;
    END IF;

    IF v_change.kind <> 'exercise' THEN
      SELECT * INTO v_block FROM public.program_blocks WHERE id = v_change.block_exercise_id FOR UPDATE;
      IF NOT FOUND
        OR NOT (public._settings_text(public._block_settings(v_block.notes)) @> public._settings_text(v_change.after))
        OR EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_block.id) THEN
        v_skipped := v_skipped + 1;
      ELSE
        UPDATE public.program_blocks
        SET notes = public._block_with_settings(v_block.notes, v_change.before)
        WHERE id = v_block.id;
        v_reverted := v_reverted + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT * INTO v_be FROM public.block_exercises WHERE id = v_change.block_exercise_id FOR UPDATE;
    IF NOT FOUND
      OR public._review_row(v_be) <> v_change.after
      OR EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_be.block_id) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    UPDATE public.block_exercises SET
      exercise_id = (v_change.before->>'exercise_id')::uuid,
      sets = (v_change.before->>'sets')::int,
      reps = (v_change.before->>'reps')::int,
      rest_seconds = (v_change.before->>'rest_seconds')::int,
      hold_seconds = (v_change.before->>'hold_seconds')::int,
      notes = v_change.before->>'notes'
    WHERE id = v_change.block_exercise_id;
    v_reverted := v_reverted + 1;
  END LOOP;

  UPDATE public.program_reviews SET reverted_at = now(), revert_skipped = v_skipped WHERE id = p_review_id;
  RETURN jsonb_build_object('reverted', v_reverted, 'skipped', v_skipped);
END;
$$;

-- Snapshots are for revert: the athlete gets what was done, and only the row
-- that says so, which leaves out a moved block's neighbour.
CREATE OR REPLACE FUNCTION public.get_my_program_reviews(p_warrior_program_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'week_number', r.week_number,
    'status', r.status,
    'outcome', r.outcome,
    'message', r.reviewer_message,
    'requested_at', r.requested_at,
    'closed_at', r.closed_at,
    'seen_at', r.seen_at,
    'reverted_at', r.reverted_at,
    'revert_skipped', r.revert_skipped,
    'can_revert', r.status = 'closed' AND r.outcome = 'changed' AND r.reverted_at IS NULL AND w.status = 'active',
    'changes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'kind', c.kind,
        'block_name', c.block_name,
        'exercise_before', c.exercise_before,
        'exercise_after', c.exercise_after,
        'before', CASE WHEN c.kind = 'structure' THEN NULL ELSE c.before END,
        'after', CASE WHEN c.kind = 'structure' THEN NULL ELSE c.after END,
        'detail', c.detail,
        'reason', c.reason
      ) ORDER BY c.updated_at, c.seq), '[]'::jsonb)
      FROM public.program_review_changes c
      WHERE c.review_id = r.id AND (c.kind <> 'structure' OR c.detail IS NOT NULL)
    )
  ) ORDER BY r.requested_at DESC), '[]'::jsonb)
  FROM public.program_reviews r
  JOIN public.warrior_programs w ON w.id = r.warrior_program_id
  WHERE r.warrior_program_id = p_warrior_program_id
    AND r.user_id = auth.uid()
    AND r.status <> 'cancelled';
$$;

-- Authenticated too: Supabase grants new public functions to it directly.
REVOKE EXECUTE ON FUNCTION
  public._block_full(uuid),
  public._block_fingerprint(jsonb),
  public._restore_block(jsonb),
  public._undo_structure_change(public.program_review_changes),
  public._block_day(text),
  public._block_retyped(jsonb, text, text, jsonb),
  public.admin_review_block_op(uuid, uuid, text, text, jsonb, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_review_block_op(uuid, uuid, text, text, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
