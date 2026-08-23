-- submit_initial_assessment_v2 took the raw movement-test numbers (variant +
-- reps for pull-up/dip/push-up/muscle-up), used them only to compute
-- strength_tier, then discarded them — the actual "12 strict pull-ups, 8
-- standard dips" performance was never persisted anywhere. AI Coach's
-- get_user_context could therefore only ever see the derived tier, never
-- what the athlete actually demonstrated to earn it.
--
-- Adds a jsonb column capturing the latest assessment's raw numbers,
-- written in the same UPDATE that sets strength_tier (same transaction,
-- same clamped inputs already used for scoring — no separate unclamped
-- write path). This is deliberately last-assessment-only, not a history
-- table: re-assessment is rate-limited to every 72h and the AI mainly
-- needs "where are they now," not a trend line across assessments.
--
-- No column-grant change needed: get_my_profile() is `SELECT *` (see
-- 20260630190000_lock_down_profiles_pii_columns.sql), SECURITY DEFINER,
-- scoped to the caller's own row, so it already returns this column. It is
-- deliberately NOT added to the cross-user column-grant list (leaderboards
-- etc.) — this is personal performance data, own-row-only by design, same
-- as email/push_token/first_name/last_name.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assessment_raw jsonb;

CREATE OR REPLACE FUNCTION public.submit_initial_assessment_v2(
  p_pullup_variant text, p_pullup_reps integer,
  p_dip_variant text,    p_dip_reps integer,
  p_pushup_variant text, p_pushup_reps integer,
  p_mu_variant text DEFAULT NULL, p_mu_reps integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_current_locked_until TIMESTAMPTZ;
  v_tier integer;
  v_pullup_reps integer;
  v_dip_reps integer;
  v_pushup_reps integer;
  v_mu_reps integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT assessment_locked_until INTO v_current_locked_until
  FROM public.profiles WHERE id = auth.uid();

  IF v_current_locked_until IS NOT NULL AND v_current_locked_until > NOW() THEN
    RAISE EXCEPTION 'ASSESSMENT_LOCKED: You must wait 72 hours between assessments.';
  END IF;

  v_pullup_reps := LEAST(GREATEST(COALESCE(p_pullup_reps, 0), 0), 1000);
  v_dip_reps    := LEAST(GREATEST(COALESCE(p_dip_reps, 0), 0), 1000);
  v_pushup_reps := LEAST(GREATEST(COALESCE(p_pushup_reps, 0), 0), 1000);
  v_mu_reps     := LEAST(GREATEST(COALESCE(p_mu_reps, 0), 0), 1000);

  v_tier := public.calculate_spartan_rank(
    p_pullup_variant, v_pullup_reps,
    p_dip_variant,    v_dip_reps,
    p_pushup_variant, v_pushup_reps,
    p_mu_variant,     v_mu_reps
  );

  UPDATE public.profiles
  SET strength_tier = v_tier,
      assessed_at = NOW(),
      assessment_locked_until = NOW() + INTERVAL '72 hours',
      assessment_raw = jsonb_build_object(
        'pullup_variant', p_pullup_variant, 'pullup_reps', v_pullup_reps,
        'dip_variant', p_dip_variant,       'dip_reps', v_dip_reps,
        'pushup_variant', p_pushup_variant, 'pushup_reps', v_pushup_reps,
        'mu_variant', p_mu_variant,         'mu_reps', CASE WHEN p_mu_variant IS NULL THEN NULL ELSE v_mu_reps END
      ),
      updated_at = NOW()
  WHERE id = auth.uid();

  RETURN v_tier;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_initial_assessment_v2(text,integer,text,integer,text,integer,text,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_initial_assessment_v2(text,integer,text,integer,text,integer,text,integer) TO authenticated;
