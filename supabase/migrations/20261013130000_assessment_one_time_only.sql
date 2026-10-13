-- Audit 2026-10-13 (#1): the assessment RPCs only enforced a 72h lock and set
-- strength_tier unconditionally, with no "already assessed" guard. The app only
-- ever reaches the assessment screen while assessed_at IS NULL (AuthGuard rules
-- 5/5b/6), so a one-time placement is the only legitimate use — but a direct
-- REST call let any already-assessed user re-run it to jump straight to tier 7
-- (bypassing trials) or to lower their tier. submit_initial_assessment (v1) is
-- worse: it takes the tier as an integer argument directly. v1 is unused by the
-- app and admin-web, but is still EXECUTE-able by authenticated, so both are
-- hardened identically: reject once the caller has already been assessed.

CREATE OR REPLACE FUNCTION public.submit_initial_assessment_v2(
  p_pullup_variant text, p_pullup_reps integer,
  p_dip_variant text, p_dip_reps integer,
  p_pushup_variant text, p_pushup_reps integer,
  p_mu_variant text DEFAULT NULL::text, p_mu_reps integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_assessed_at TIMESTAMPTZ;
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

  SELECT assessed_at, assessment_locked_until
  INTO v_assessed_at, v_current_locked_until
  FROM public.profiles WHERE id = auth.uid();

  -- One-time placement: once assessed, the only way tiers move is trials.
  IF v_assessed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_ASSESSED: the assessment can only be completed once.';
  END IF;

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

CREATE OR REPLACE FUNCTION public.submit_initial_assessment(p_tier integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_assessed_at TIMESTAMPTZ;
  v_current_locked_until TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tier IS NULL OR p_tier < 0 OR p_tier > 7 THEN
    RAISE EXCEPTION 'INVALID_TIER: assessment tier must be between 0 and 7.';
  END IF;

  SELECT assessed_at, assessment_locked_until
  INTO v_assessed_at, v_current_locked_until
  FROM public.profiles WHERE id = auth.uid();

  IF v_assessed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_ASSESSED: the assessment can only be completed once.';
  END IF;

  IF v_current_locked_until IS NOT NULL AND v_current_locked_until > NOW() THEN
    RAISE EXCEPTION 'ASSESSMENT_LOCKED: You must wait 72 hours between assessments.';
  END IF;

  UPDATE public.profiles
  SET strength_tier = p_tier,
      assessed_at = NOW(),
      assessment_locked_until = NOW() + INTERVAL '72 hours',
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$function$;
