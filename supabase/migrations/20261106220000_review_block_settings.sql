-- Owner, 2026-11-06: a review can adjust every block setting, not only rounds:
-- rest between rounds, AMRAP and For Time caps, Tabata and ladders. What's
-- allowed depends on the block, and each value keeps the rule the AI Coach
-- validates, so a reviewed block is never one it would reject. Written the
-- same way as ai_coach_update_block_structure. The block's type doesn't change.

ALTER TABLE public.program_review_changes DROP CONSTRAINT program_review_changes_kind_check;
ALTER TABLE public.program_review_changes
  ADD CONSTRAINT program_review_changes_kind_check CHECK (kind IN ('exercise', 'rounds', 'settings'));

COMMENT ON COLUMN public.program_review_changes.block_exercise_id IS
  'The block_exercises id, or the program_blocks id when kind is settings.';

DROP FUNCTION public.admin_update_review_rounds(uuid, uuid, text, integer, text);
DROP FUNCTION public._block_with_rounds(text, text);

CREATE FUNCTION public._block_concept(p_notes text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN (regexp_match(COALESCE(p_notes, ''), '^\[CONCEPT:(.*?)\]'))[1]::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Same conditions as the app's BlockConfigWizard and the AI Coach's validation.
CREATE FUNCTION public._block_setting_keys(p_concept jsonb)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_timing text := COALESCE(p_concept->>'timing_system', 'straight_set');
  v_structure text := COALESCE(p_concept->>'structure', 'single');
  v_keys text[] := '{}';
BEGIN
  IF p_concept IS NULL OR COALESCE((p_concept->>'is_tier_trial')::boolean, false) THEN
    RETURN v_keys;
  END IF;
  IF v_timing IN ('amrap', 'fortime') THEN
    v_keys := v_keys || ARRAY['time_cap_min'];
  ELSIF v_timing = 'tabata' THEN
    v_keys := v_keys || ARRAY['tabata_work_seconds', 'tabata_rest_seconds', 'tabata_rounds'];
  ELSIF v_structure IN ('superset', 'circuit', 'ladder') THEN
    v_keys := v_keys || ARRAY['rounds', 'rest_after_round'];
  END IF;
  IF v_structure = 'ladder' THEN
    IF NOT v_keys @> ARRAY['rounds'] THEN
      v_keys := v_keys || ARRAY['rounds'];
    END IF;
    v_keys := v_keys || ARRAY['ladder_start', 'ladder_sub', 'ladder_direction'];
  END IF;
  RETURN v_keys;
END;
$$;

-- The block's adjustable settings, with a missing one as null.
CREATE FUNCTION public._block_settings(p_notes text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(k, COALESCE(c.v->k, 'null'::jsonb)), '{}'::jsonb)
  FROM (SELECT public._block_concept(p_notes) AS v) c,
       unnest(public._block_setting_keys(c.v)) AS k;
$$;

-- Every value as text, so 90 and "90" (the wizard's form) count as the same.
CREATE FUNCTION public._settings_text(p_settings jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(key, to_jsonb(value #>> '{}')), '{}'::jsonb)
  FROM jsonb_each(p_settings);
$$;

-- Same merge as ai_coach_update_block_structure; a null removes the setting.
CREATE FUNCTION public._block_with_settings(p_notes text, p_settings jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_concept jsonb := public._block_concept(p_notes);
  -- ltrim: the non-greedy match leaves \s* matching nothing, so a space would
  -- be added on every edit.
  v_plain text := ltrim(regexp_replace(COALESCE(p_notes, ''), '^\[CONCEPT:.*?\]', ''));
  v_entry RECORD;
BEGIN
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_settings) LOOP
    IF v_entry.value = 'null'::jsonb THEN
      v_concept := v_concept - v_entry.key;
    ELSE
      v_concept := v_concept || jsonb_build_object(v_entry.key, v_entry.value);
    END IF;
  END LOOP;
  RETURN trim(both ' ' from ('[CONCEPT:' || v_concept::text || '] ' || v_plain));
END;
$$;

-- Keeps each value in the form the AI Coach stores it: rounds as text, the
-- rest as numbers. Rest between rounds is the only one that can be empty.
CREATE FUNCTION public._checked_block_settings(p_settings jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_entry RECORD;
  v_text text;
  v_number integer;
  v_low integer;
  v_high integer;
  v_out jsonb := '{}';
BEGIN
  FOR v_entry IN SELECT key, value FROM jsonb_each(p_settings) LOOP
    v_text := NULLIF(trim(COALESCE(v_entry.value #>> '{}', '')), '');
    IF v_entry.key = 'ladder_direction' THEN
      IF v_text IS NULL OR v_text NOT IN ('up', 'down') THEN
        RAISE EXCEPTION 'INVALID_VALUES';
      END IF;
      v_out := v_out || jsonb_build_object(v_entry.key, v_text);
      CONTINUE;
    END IF;
    IF v_text IS NULL THEN
      IF v_entry.key <> 'rest_after_round' THEN
        RAISE EXCEPTION 'INVALID_VALUES';
      END IF;
      v_out := v_out || jsonb_build_object(v_entry.key, 'null'::jsonb);
      CONTINUE;
    END IF;
    IF v_text !~ '^[0-9]{1,4}$' THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    v_number := v_text::integer;
    SELECT lo, hi INTO v_low, v_high FROM (VALUES
      ('rounds', 1, 20), ('rest_after_round', 0, 600), ('time_cap_min', 1, 60),
      ('tabata_work_seconds', 5, 120), ('tabata_rest_seconds', 0, 120), ('tabata_rounds', 1, 30),
      ('ladder_start', 1, 100), ('ladder_sub', 1, 50)
    ) AS r(k, lo, hi) WHERE r.k = v_entry.key;
    IF v_low IS NULL OR v_number NOT BETWEEN v_low AND v_high THEN
      RAISE EXCEPTION 'INVALID_VALUES';
    END IF;
    v_out := v_out || jsonb_build_object(
      v_entry.key,
      CASE WHEN v_entry.key = 'rounds' THEN to_jsonb(v_text) ELSE to_jsonb(v_number) END
    );
  END LOOP;

  -- A ladder going down would otherwise reach a round of 0 reps.
  IF v_out->>'ladder_direction' = 'down'
    AND (v_out->>'ladder_start')::int - (v_out->>'ladder_sub')::int * ((v_out->>'rounds')::int - 1) < 1 THEN
    RAISE EXCEPTION 'LADDER_TOO_LONG';
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._program_week_snapshot(p_template_id uuid, p_week integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'block_id', b.id,
    'name', b.name,
    'structure', public._block_structure(b.notes),
    'timing', public._block_timing(b.notes),
    'settings', public._block_settings(b.notes),
    'logged', EXISTS (SELECT 1 FROM public.workout_logs wl WHERE wl.block_id = b.id),
    'exercises', (
      SELECT COALESCE(jsonb_agg(public._review_row(be) || jsonb_build_object(
        'block_exercise_id', be.id,
        'name', e.name
      ) ORDER BY be.order_index, be.id), '[]'::jsonb)
      FROM public.block_exercises be
      JOIN public.exercise_library e ON e.id = be.exercise_id
      WHERE be.block_id = b.id
    )
  ) ORDER BY b.order_index, b.id), '[]'::jsonb)
  FROM public.program_blocks b
  WHERE b.template_id = p_template_id AND b.week_number = p_week;
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

  FOR v_change IN SELECT * FROM public.program_review_changes WHERE review_id = p_review_id LOOP
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

CREATE FUNCTION public.admin_update_review_block(
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
  WHERE review_id = p_review_id AND block_exercise_id = p_block_id;

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

-- Authenticated too: Supabase grants new public functions to it directly.
REVOKE EXECUTE ON FUNCTION
  public._block_concept(text),
  public._block_setting_keys(jsonb),
  public._block_settings(text),
  public._settings_text(jsonb),
  public._block_with_settings(text, jsonb),
  public._checked_block_settings(jsonb),
  public.admin_update_review_block(uuid, uuid, jsonb, jsonb, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_review_block(uuid, uuid, jsonb, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
