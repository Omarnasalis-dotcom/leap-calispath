-- A superset or circuit repeats by the block's rounds, with 1 set on each
-- exercise, so the review needs the rounds to change its volume (owner,
-- 2026-11-06). Written into the block's notes exactly as
-- ai_coach_update_block_structure merges them, with rounds as text like the AI
-- Coach's own. AMRAP, For Time and ladders don't run on this number and stay
-- locked.

ALTER TABLE public.program_review_changes
  ADD COLUMN kind text NOT NULL DEFAULT 'exercise' CHECK (kind IN ('exercise', 'rounds'));

COMMENT ON COLUMN public.program_review_changes.block_exercise_id IS
  'The block_exercises id, or the program_blocks id when kind is rounds.';

CREATE FUNCTION public._block_rounds(p_notes text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN (substring(p_notes FROM '^\[CONCEPT:(.*?)\]')::jsonb)->>'rounds';
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE FUNCTION public._block_timing(p_notes text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN (substring(p_notes FROM '^\[CONCEPT:(.*?)\]')::jsonb)->>'timing_system';
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Same merge as ai_coach_update_block_structure.
CREATE FUNCTION public._block_with_rounds(p_notes text, p_rounds text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_concept text := (regexp_match(COALESCE(p_notes, ''), '^\[CONCEPT:(.*?)\]'))[1];
  -- ltrim: the non-greedy match leaves \s* matching nothing, so a space would
  -- be added on every edit.
  v_plain text := ltrim(regexp_replace(COALESCE(p_notes, ''), '^\[CONCEPT:.*?\]', ''));
BEGIN
  RETURN trim(both ' ' from (
    '[CONCEPT:' || (v_concept::jsonb || jsonb_build_object('rounds', p_rounds))::text || '] ' || v_plain
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public._program_week_snapshot(p_template_id uuid, p_week integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'block_id', b.id,
    'name', b.name,
    'structure', public._block_structure(b.notes),
    'rounds', public._block_rounds(b.notes),
    'timing', public._block_timing(b.notes),
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
        'before', c.before,
        'after', c.after,
        'reason', c.reason
      ) ORDER BY c.updated_at), '[]'::jsonb)
      FROM public.program_review_changes c WHERE c.review_id = r.id
    )
  ) ORDER BY r.requested_at DESC), '[]'::jsonb)
  FROM public.program_reviews r
  JOIN public.warrior_programs w ON w.id = r.warrior_program_id
  WHERE r.warrior_program_id = p_warrior_program_id
    AND r.user_id = auth.uid()
    AND r.status <> 'cancelled';
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
    IF v_change.kind = 'rounds' THEN
      SELECT * INTO v_block FROM public.program_blocks WHERE id = v_change.block_exercise_id FOR UPDATE;
      IF NOT FOUND
        OR public._block_rounds(v_block.notes) IS DISTINCT FROM v_change.after->>'rounds'
        OR EXISTS (SELECT 1 FROM public.workout_logs WHERE block_id = v_block.id) THEN
        v_skipped := v_skipped + 1;
      ELSE
        UPDATE public.program_blocks
        SET notes = public._block_with_rounds(v_block.notes, v_change.before->>'rounds')
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

CREATE FUNCTION public.admin_update_review_rounds(
  p_review_id uuid, p_block_id uuid, p_expected text, p_rounds integer, p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_block public.program_blocks;
  v_after jsonb;
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
  IF public._block_structure(v_block.notes) IS NULL
    OR public._block_structure(v_block.notes) NOT IN ('superset', 'circuit')
    OR COALESCE(public._block_timing(v_block.notes), 'straight_set') <> 'straight_set' THEN
    RAISE EXCEPTION 'NOT_ROUND_BLOCK';
  END IF;
  IF public._block_rounds(v_block.notes) IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'STALE';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF p_rounds IS NULL OR p_rounds NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'INVALID_VALUES';
  END IF;

  UPDATE public.program_blocks
  SET notes = public._block_with_rounds(v_block.notes, p_rounds::text)
  WHERE id = p_block_id;

  v_after := jsonb_build_object('rounds', p_rounds::text);

  SELECT * INTO v_existing FROM public.program_review_changes
  WHERE review_id = p_review_id AND block_exercise_id = p_block_id;

  IF NOT FOUND THEN
    INSERT INTO public.program_review_changes (review_id, block_exercise_id, kind, block_name, before, after, reason)
    VALUES (p_review_id, p_block_id, 'rounds', v_block.name, jsonb_build_object('rounds', p_expected), v_after, v_reason);
  ELSIF v_existing.before = v_after THEN
    DELETE FROM public.program_review_changes WHERE id = v_existing.id;
  ELSE
    UPDATE public.program_review_changes SET after = v_after, reason = v_reason, updated_at = now() WHERE id = v_existing.id;
  END IF;

  RETURN v_after;
END;
$$;

-- Authenticated too: Supabase grants new public functions to it directly.
REVOKE EXECUTE ON FUNCTION
  public._block_rounds(text),
  public._block_timing(text),
  public._block_with_rounds(text, text),
  public.admin_update_review_rounds(uuid, uuid, text, integer, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_review_rounds(uuid, uuid, text, integer, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
