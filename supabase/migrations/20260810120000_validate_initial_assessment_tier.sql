-- SECURITY: submit_initial_assessment accepted a client-computed tier and
-- wrote it straight to profiles.strength_tier with no validation.
--
-- Why the existing defences did not cover this: both profile triggers
-- (guard_profile_protected_fields, prevent_tier_modification) deliberately
-- let SECURITY DEFINER RPCs through — prevent_tier_modification says so in
-- its own comment ("SECURITY DEFINER RPCs run as the 'postgres' role, which
-- bypasses this block safely"). That is correct by design: the RPCs are meant
-- to be the trusted path. But submit_initial_assessment was a trusted path
-- that trusted its input. A direct `UPDATE profiles SET strength_tier = 9`
-- is blocked; `rpc('submit_initial_assessment', { p_tier: 9 })` was not.
--
-- Impact: any authenticated user could call the RPC once with p_tier = 9 and
-- become Eternity permanently (tiers only ratchet upward via Math.max),
-- unlocking Static World (>=1), Power World (>=6) and Champions Arena (>=9),
-- and topping every strength leaderboard. Out-of-range values were writable
-- too, which would break TIER_NAMES[tier] lookups across the app.
--
-- This migration:
--   1. Ports the client's tier calculation to SQL (calculate_spartan_rank).
--   2. Adds submit_initial_assessment_v2, which takes the raw reps/variants
--      and computes the tier server-side — the client no longer decides it.
--   3. Hardens the legacy submit_initial_assessment(p_tier) with a 0..7 range
--      check rather than dropping it. Shipped builds (v1.1.7 and earlier) still
--      call the old signature, and removing it would strand real users mid-
--      onboarding — the same failure mode as the TestFlight 1.0.1 incident
--      documented in 20260725110000. The legacy path stays usable but can no
--      longer claim a tier above the assessment's own hard cap.
--
-- Note on the cap: calculateSpartanRank ends with Math.min(finalTier, 7), so
-- a legitimate assessment can never produce 8 or 9. The range check is 0..7,
-- not 0..9, for that reason.

-- 1. Faithful SQL port of src/lib/spartanLogic.ts.
--    Behaviour is replicated EXACTLY, including the muscle-up quirk: the JS
--    does `assessment.muscleups ? calculateMuscleUpTier(...) : 0`, so a missing
--    muscle-up entry collapses the whole result to tier 0 via the weakest-link
--    Math.min. That is arguably a latent bug (calculateMuscleUpTier itself
--    floors at 3, implying T0-T3 need no muscle-up), but the client always
--    sends the field, so reproducing it exactly guarantees the server never
--    disagrees with an honest client. Do not "fix" it here without also
--    changing spartanLogic.ts, or the two will drift.
CREATE OR REPLACE FUNCTION public.calculate_spartan_rank(
  p_pullup_variant text, p_pullup_reps integer,
  p_dip_variant text,    p_dip_reps integer,
  p_pushup_variant text, p_pushup_reps integer,
  p_mu_variant text,     p_mu_reps integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_pullup integer;
  v_dip integer;
  v_pushup integer;
  v_mu integer;
BEGIN
  -- Pull-ups
  IF    p_pullup_variant = 'strict_pullup' AND p_pullup_reps >= 15 THEN v_pullup := 7;
  ELSIF p_pullup_variant = 'strict_pullup' AND p_pullup_reps >= 10 THEN v_pullup := 6;
  ELSIF p_pullup_variant = 'strict_pullup' AND p_pullup_reps >= 6  THEN v_pullup := 5;
  ELSIF p_pullup_variant = 'strict_pullup' AND p_pullup_reps >= 1  THEN v_pullup := 4;
  ELSIF p_pullup_variant IN ('strict_pullup','assisted_pullup') AND p_pullup_reps >= 10 THEN v_pullup := 3;
  ELSIF p_pullup_variant IN ('strict_pullup','assisted_pullup') AND p_pullup_reps >= 5  THEN v_pullup := 2;
  ELSIF p_pullup_reps >= 5 THEN v_pullup := 1;
  ELSE  v_pullup := 0;
  END IF;

  -- Dips
  IF    p_dip_variant = 'standard_dip' AND p_dip_reps >= 30 THEN v_dip := 7;
  ELSIF p_dip_variant = 'standard_dip' AND p_dip_reps >= 20 THEN v_dip := 6;
  ELSIF p_dip_variant = 'standard_dip' AND p_dip_reps >= 15 THEN v_dip := 5;
  ELSIF p_dip_variant = 'standard_dip' AND p_dip_reps >= 10 THEN v_dip := 4;
  ELSIF p_dip_variant = 'standard_dip' AND p_dip_reps >= 5  THEN v_dip := 3;
  ELSIF p_dip_reps >= 10 THEN v_dip := 2;
  ELSIF p_dip_reps >= 5  THEN v_dip := 1;
  ELSE  v_dip := 0;
  END IF;

  -- Push-ups
  IF    p_pushup_variant = 'standard_pushup' AND p_pushup_reps >= 50 THEN v_pushup := 7;
  ELSIF p_pushup_variant = 'standard_pushup' AND p_pushup_reps >= 40 THEN v_pushup := 6;
  ELSIF p_pushup_variant = 'standard_pushup' AND p_pushup_reps >= 30 THEN v_pushup := 5;
  ELSIF p_pushup_variant = 'standard_pushup' AND p_pushup_reps >= 20 THEN v_pushup := 4;
  ELSIF p_pushup_variant = 'standard_pushup' AND p_pushup_reps >= 15 THEN v_pushup := 3;
  ELSIF p_pushup_variant = 'standard_pushup' AND p_pushup_reps >= 10 THEN v_pushup := 2;
  ELSIF p_pushup_reps >= 5 THEN v_pushup := 1;
  ELSE  v_pushup := 0;
  END IF;

  -- Muscle-ups (see note above re: NULL collapsing to 0)
  IF p_mu_variant IS NULL OR p_mu_reps IS NULL THEN
    v_mu := 0;
  ELSIF p_mu_variant = 'strict_mu' AND p_mu_reps >= 6 THEN v_mu := 7;
  ELSIF p_mu_variant = 'strict_mu' AND p_mu_reps >= 3 THEN v_mu := 6;
  ELSIF p_mu_variant = 'strict_mu' AND p_mu_reps >= 1 THEN v_mu := 5;
  ELSIF p_mu_variant IN ('strict_mu','banded_mu') AND p_mu_reps >= 1 THEN v_mu := 4;
  ELSE  v_mu := 3;
  END IF;

  -- Weakest-link rule, then the assessment's hard cap at tier 7.
  RETURN LEAST(LEAST(v_pullup, v_dip), LEAST(v_pushup, v_mu), 7);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.calculate_spartan_rank(text,integer,text,integer,text,integer,text,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.calculate_spartan_rank(text,integer,text,integer,text,integer,text,integer) TO authenticated, service_role;

-- 2. The real fix: the server computes the tier from raw performance data.
--    Reps are clamped to a sane 0..1000 before scoring so an absurd payload
--    cannot be used to probe or overflow anything; the thresholds top out at
--    50, so clamping changes no legitimate result.
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT assessment_locked_until INTO v_current_locked_until
  FROM public.profiles WHERE id = auth.uid();

  IF v_current_locked_until IS NOT NULL AND v_current_locked_until > NOW() THEN
    RAISE EXCEPTION 'ASSESSMENT_LOCKED: You must wait 72 hours between assessments.';
  END IF;

  v_tier := public.calculate_spartan_rank(
    p_pullup_variant, LEAST(GREATEST(COALESCE(p_pullup_reps, 0), 0), 1000),
    p_dip_variant,    LEAST(GREATEST(COALESCE(p_dip_reps, 0), 0), 1000),
    p_pushup_variant, LEAST(GREATEST(COALESCE(p_pushup_reps, 0), 0), 1000),
    p_mu_variant,     LEAST(GREATEST(COALESCE(p_mu_reps, 0), 0), 1000)
  );

  UPDATE public.profiles
  SET strength_tier = v_tier,
      assessed_at = NOW(),
      assessment_locked_until = NOW() + INTERVAL '72 hours',
      updated_at = NOW()
  WHERE id = auth.uid();

  RETURN v_tier;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_initial_assessment_v2(text,integer,text,integer,text,integer,text,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_initial_assessment_v2(text,integer,text,integer,text,integer,text,integer) TO authenticated;

-- 3. Legacy signature: kept working for already-shipped builds, but no longer
--    trusts the value blindly. 0..7 is the full range a real assessment can
--    produce, so this rejects every out-of-range write and caps the ceiling at
--    the same place an honest client would land. It does NOT stop a determined
--    caller on an old build from claiming 7 — only migrating clients to v2
--    closes that, which is why the app is being moved over in the same change.
CREATE OR REPLACE FUNCTION public.submit_initial_assessment(p_tier integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_locked_until TIMESTAMPTZ;
  v_current_locked_until TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tier IS NULL OR p_tier < 0 OR p_tier > 7 THEN
    RAISE EXCEPTION 'INVALID_TIER: assessment tier must be between 0 and 7.';
  END IF;

  SELECT assessment_locked_until INTO v_current_locked_until
  FROM public.profiles WHERE id = auth.uid();

  IF v_current_locked_until IS NOT NULL AND v_current_locked_until > NOW() THEN
    RAISE EXCEPTION 'ASSESSMENT_LOCKED: You must wait 72 hours between assessments.';
  END IF;

  v_locked_until := NOW() + INTERVAL '72 hours';

  UPDATE public.profiles
  SET strength_tier = p_tier,
      assessed_at = NOW(),
      assessment_locked_until = v_locked_until,
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.submit_initial_assessment(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_initial_assessment(integer) TO authenticated;
