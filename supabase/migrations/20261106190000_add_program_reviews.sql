-- Leap team review of an AI-built week. The athlete asks with a satisfaction
-- rating and an optional note; an admin edits and closes the case; the athlete
-- sees the result and can revert all of it.
--
-- Safety rules, kept here because every one protects the AI Coach's chain:
--  * warrior_programs.coach_id is never touched, so every ai_coach_* RPC keeps
--    working on the reviewed program.
--  * An edit changes the block_exercises row in place, the same write as
--    ai_coach_adjust_program: ids stay, so saved cards and logs still match.
--  * A logged block is refused, the same rule the AI Coach follows.
--  * overwrite_client_program and save_program_template are never used here:
--    the first deletes workout logs, the second moves current_week to the last
--    week and can delete blocks.
--  * No trigger is added to any program table. Reviews of ended programs are
--    cancelled lazily by _cancel_stale_program_reviews.

CREATE TABLE public.program_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warrior_program_id uuid NOT NULL REFERENCES public.warrior_programs(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  satisfaction smallint NOT NULL CHECK (satisfaction BETWEEN 1 AND 5),
  note text CHECK (char_length(note) <= 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  outcome text CHECK (outcome IN ('accurate', 'changed')),
  -- What the AI built, as it stood when the athlete asked.
  week_snapshot jsonb NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  overdue_alerted_at timestamptz,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Private to the team, for improving the AI Coach.
  reviewer_rating smallint CHECK (reviewer_rating BETWEEN 1 AND 5),
  reviewer_issues text[] NOT NULL DEFAULT '{}',
  -- Shown to the athlete.
  reviewer_message text CHECK (char_length(reviewer_message) <= 500),
  seen_at timestamptz,
  reverted_at timestamptz,
  revert_skipped integer
);

CREATE UNIQUE INDEX program_reviews_one_open_per_user ON public.program_reviews (user_id) WHERE status = 'open';
CREATE INDEX program_reviews_program_idx ON public.program_reviews (warrior_program_id);
CREATE INDEX program_reviews_status_idx ON public.program_reviews (status, requested_at);

CREATE TABLE public.program_review_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.program_reviews(id) ON DELETE CASCADE,
  -- No foreign key: the AI Coach may replace a block later, and this record
  -- has to outlive that.
  block_exercise_id uuid NOT NULL,
  block_name text,
  exercise_before text,
  exercise_after text,
  before jsonb NOT NULL,
  after jsonb NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (review_id, block_exercise_id)
);

-- Everything goes through the functions below: the rating is private, so the
-- athlete can't read these tables directly.
ALTER TABLE public.program_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_review_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_reviews, public.program_review_changes FROM anon, authenticated;
GRANT ALL ON public.program_reviews, public.program_review_changes TO service_role;

-- What an edit may change. Compared whole, so nulls count.
CREATE FUNCTION public._review_row(p_be public.block_exercises)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'exercise_id', p_be.exercise_id,
    'sets', p_be.sets,
    'reps', p_be.reps,
    'rest_seconds', p_be.rest_seconds,
    'hold_seconds', p_be.hold_seconds,
    'notes', p_be.notes
  );
$$;

-- superset, circuit or ladder keep their set count on the block as rounds, so
-- each exercise's sets must stay as the AI Coach's validation expects.
CREATE FUNCTION public._block_structure(p_notes text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v jsonb;
BEGIN
  v := substring(p_notes FROM '^\[CONCEPT:(.*?)\]')::jsonb;
  RETURN COALESCE(v->>'structure', v->>'type');
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE FUNCTION public._program_week_snapshot(p_template_id uuid, p_week integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'block_id', b.id,
    'name', b.name,
    'structure', public._block_structure(b.notes),
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

CREATE FUNCTION public._cancel_stale_program_reviews()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.program_reviews r
  SET status = 'cancelled', closed_at = now()
  WHERE r.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM public.warrior_programs w
      WHERE w.id = r.warrior_program_id AND w.status = 'active'
    );
$$;

-- Written in the reader's language here; push delivery is notify-program-review.
CREATE FUNCTION public._review_notify(
  p_user_id uuid, p_type text,
  p_title_en text, p_body_en text, p_title_ar text, p_body_ar text,
  p_data jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_arabic boolean;
BEGIN
  IF (SELECT (prefs->>p_type)::boolean FROM public.notification_preferences WHERE user_id = p_user_id) IS FALSE THEN
    RETURN;
  END IF;
  SELECT language = 'ar' INTO v_arabic FROM public.profiles WHERE id = p_user_id;
  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    p_user_id, p_type,
    CASE WHEN v_arabic THEN p_title_ar ELSE p_title_en END,
    CASE WHEN v_arabic THEN p_body_ar ELSE p_body_en END,
    p_data
  );
END;
$$;

-- ---- Athlete ---------------------------------------------------------------

CREATE FUNCTION public.request_program_review(
  p_warrior_program_id uuid, p_week_number integer, p_satisfaction integer, p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_ai_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000002';
  v_uid uuid := auth.uid();
  v_tier text;
  v_program RECORD;
  v_period_start timestamptz;
  v_name text;
  v_snapshot jsonb;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_review_id uuid;
  v_admin uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('request_program_review:' || v_uid::text));

  v_tier := public.caller_effective_tier();
  IF v_tier = 'free' THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_satisfaction IS NULL OR p_satisfaction NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'INVALID_RATING';
  END IF;

  SELECT id, template_id, coach_id, status INTO v_program
  FROM public.warrior_programs
  WHERE id = p_warrior_program_id AND warrior_id = v_uid;
  IF NOT FOUND OR v_program.status <> 'active' OR v_program.coach_id IS DISTINCT FROM v_ai_profile_id THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;

  v_snapshot := public._program_week_snapshot(v_program.template_id, p_week_number);
  IF jsonb_array_length(v_snapshot) = 0 THEN
    RAISE EXCEPTION 'WEEK_NOT_FOUND';
  END IF;

  PERFORM public._cancel_stale_program_reviews();
  IF EXISTS (SELECT 1 FROM public.program_reviews WHERE user_id = v_uid AND status = 'open') THEN
    RAISE EXCEPTION 'REVIEW_OPEN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_reviews
    WHERE warrior_program_id = p_warrior_program_id AND week_number = p_week_number AND status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'WEEK_REVIEWED';
  END IF;

  IF v_tier = 'first' THEN
    SELECT COALESCE(entitlement_period_start, date_trunc('month', now())) INTO v_period_start
    FROM public.profiles WHERE id = v_uid;
    IF EXISTS (
      SELECT 1 FROM public.program_reviews
      WHERE user_id = v_uid AND status <> 'cancelled' AND requested_at >= v_period_start
    ) THEN
      RAISE EXCEPTION 'REVIEW_LIMIT';
    END IF;
  END IF;

  INSERT INTO public.program_reviews (warrior_program_id, template_id, user_id, week_number, satisfaction, note, week_snapshot)
  VALUES (p_warrior_program_id, v_program.template_id, v_uid, p_week_number, p_satisfaction, left(v_note, 500), v_snapshot)
  RETURNING id INTO v_review_id;

  SELECT COALESCE(display_name, 'An athlete') INTO v_name FROM public.profiles WHERE id = v_uid;
  FOR v_admin IN SELECT id FROM public.profiles WHERE is_admin LOOP
    PERFORM public._review_notify(
      v_admin, 'program_review_request',
      'Program review requested', format('%s asked for a review of week %s.', v_name, p_week_number),
      'طلب مراجعة برنامج', format('%s طلب مراجعة الأسبوع %s.', v_name, p_week_number),
      jsonb_build_object('review_id', v_review_id)
    );
  END LOOP;

  RETURN v_review_id;
END;
$$;

CREATE FUNCTION public.get_my_program_reviews(p_warrior_program_id uuid)
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

CREATE FUNCTION public.mark_program_review_seen(p_review_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.program_reviews
  SET seen_at = now()
  WHERE id = p_review_id AND user_id = auth.uid() AND status = 'closed' AND seen_at IS NULL;
$$;

-- All at once. A block logged since, or changed since the review, keeps what
-- it has: its history and the athlete's newer choice both win.
CREATE FUNCTION public.revert_program_review(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_change public.program_review_changes;
  v_be public.block_exercises;
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

-- ---- Admin -----------------------------------------------------------------

CREATE FUNCTION public.admin_list_program_reviews(p_status text DEFAULT 'open')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  PERFORM public._cancel_stale_program_reviews();

  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.requested_at), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT r.id, r.user_id, r.week_number, r.satisfaction, r.note, r.status, r.outcome,
      r.requested_at, r.closed_at, r.reverted_at, r.reviewer_rating,
      p.display_name, p.language, p.subscription_tier, t.name AS program_name,
      (SELECT count(*) FROM public.program_review_changes c WHERE c.review_id = r.id) AS change_count
    FROM public.program_reviews r
    JOIN public.profiles p ON p.id = r.user_id
    JOIN public.program_templates t ON t.id = r.template_id
    WHERE r.status = p_status
    ORDER BY r.requested_at DESC
    LIMIT 200
  ) x;
  RETURN v_rows;
END;
$$;

CREATE FUNCTION public.admin_get_program_review(p_review_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT jsonb_build_object(
    'id', r.id,
    'user_id', r.user_id,
    'week_number', r.week_number,
    'satisfaction', r.satisfaction,
    'note', r.note,
    'status', r.status,
    'outcome', r.outcome,
    'requested_at', r.requested_at,
    'closed_at', r.closed_at,
    'reverted_at', r.reverted_at,
    'revert_skipped', r.revert_skipped,
    'reviewer_rating', r.reviewer_rating,
    'reviewer_issues', to_jsonb(r.reviewer_issues),
    'reviewer_message', r.reviewer_message,
    'program_name', t.name,
    'current_week', w.current_week,
    'athlete', jsonb_build_object(
      'display_name', p.display_name,
      'language', p.language,
      'subscription_tier', p.subscription_tier,
      'strength_tier', p.strength_tier,
      'primary_goal', p.primary_goal,
      'goals', to_jsonb(p.goals),
      'goal_other_text', p.goal_other_text,
      'training_days_per_week', p.training_days_per_week,
      'available_equipment', to_jsonb(p.available_equipment),
      'power_pbs', to_jsonb(p.power_pbs),
      'best_times', to_jsonb(p.best_times)
    ),
    'week_snapshot', r.week_snapshot,
    'week', public._program_week_snapshot(r.template_id, r.week_number),
    'changes', (
      SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.updated_at), '[]'::jsonb)
      FROM public.program_review_changes c WHERE c.review_id = r.id
    )
  ) INTO v_out
  FROM public.program_reviews r
  JOIN public.profiles p ON p.id = r.user_id
  JOIN public.program_templates t ON t.id = r.template_id
  JOIN public.warrior_programs w ON w.id = r.warrior_program_id
  WHERE r.id = p_review_id;

  IF v_out IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  RETURN v_out;
END;
$$;

-- p_expected is the row as the reviewer saw it: if the athlete or the AI Coach
-- changed it since, nothing is overwritten and the page shows the fresh one.
CREATE FUNCTION public.admin_update_review_exercise(
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
  WHERE review_id = p_review_id AND block_exercise_id = p_block_exercise_id;

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

CREATE FUNCTION public.admin_close_program_review(
  p_review_id uuid, p_rating integer, p_issues text[] DEFAULT '{}', p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_review public.program_reviews;
  v_outcome text;
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
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'INVALID_RATING';
  END IF;

  v_outcome := CASE WHEN EXISTS (SELECT 1 FROM public.program_review_changes WHERE review_id = p_review_id)
    THEN 'changed' ELSE 'accurate' END;

  UPDATE public.program_reviews SET
    status = 'closed',
    outcome = v_outcome,
    closed_at = now(),
    closed_by = auth.uid(),
    reviewer_rating = p_rating,
    reviewer_issues = COALESCE(p_issues, '{}'),
    reviewer_message = NULLIF(trim(COALESCE(p_message, '')), '')
  WHERE id = p_review_id;

  PERFORM public._review_notify(
    v_review.user_id, 'program_review_ready',
    'Your program review is ready',
    format('The Leap team finished reviewing week %s.', v_review.week_number),
    'مراجعة برنامجك جاهزة',
    format('أنهى فريق Leap مراجعة الأسبوع %s.', v_review.week_number),
    jsonb_build_object('screen', 'warrior-program', 'review_id', p_review_id)
  );

  RETURN jsonb_build_object('outcome', v_outcome);
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public._review_row(public.block_exercises),
  public._block_structure(text),
  public._program_week_snapshot(uuid, integer),
  public._cancel_stale_program_reviews(),
  public._review_notify(uuid, text, text, text, text, text, jsonb),
  public.request_program_review(uuid, integer, integer, text),
  public.get_my_program_reviews(uuid),
  public.mark_program_review_seen(uuid),
  public.revert_program_review(uuid),
  public.admin_list_program_reviews(text),
  public.admin_get_program_review(uuid),
  public.admin_update_review_exercise(uuid, uuid, jsonb, uuid, integer, integer, integer, integer, text, text),
  public.admin_close_program_review(uuid, integer, text[], text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.request_program_review(uuid, integer, integer, text),
  public.get_my_program_reviews(uuid),
  public.mark_program_review_seen(uuid),
  public.revert_program_review(uuid),
  public.admin_list_program_reviews(text),
  public.admin_get_program_review(uuid),
  public.admin_update_review_exercise(uuid, uuid, jsonb, uuid, integer, integer, integer, integer, text, text),
  public.admin_close_program_review(uuid, integer, text[], text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
