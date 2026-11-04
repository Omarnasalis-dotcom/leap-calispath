-- The AI Coach remembers what the athlete tells it (owner decision
-- 2026-11-04). Athletes can't redo the assessment after onboarding, and
-- equipment is only picked once in CoachSetup, so "I have rings" or "I do 15
-- pull-ups now" said in chat was lost with the chat: every new conversation
-- started from stale onboarding answers, and the build's safety check kept
-- comparing against the old assessment.
--
-- current_maxes: the athlete's latest confirmed strict maxes, from chat:
-- {"pull_ups": 15, "dips": 20, "push_ups": 40, "muscle_ups": 4,
--  "updated_at": "..."}. assessment_raw stays untouched as history.
-- Read through get_my_profile() (select *), like every other profile field.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_maxes jsonb;

-- Called by the ai-coach save_athlete_update tool with the athlete's own
-- JWT, after they confirmed the change in chat. Equipment uses CoachSetup's
-- ids (src/constants/goals.ts EQUIPMENT) so the setup screen and the coach
-- read the same list. Numbers merge into what is already saved.
CREATE FUNCTION public.ai_coach_save_athlete_update(
  p_equipment text[] DEFAULT NULL,
  p_current_maxes jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid CONSTANT uuid := auth.uid();
  v_bad text;
  v_maxes jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_equipment IS NULL AND p_current_maxes IS NULL THEN
    RAISE EXCEPTION 'Nothing to save';
  END IF;

  IF p_equipment IS NOT NULL THEN
    SELECT e INTO v_bad FROM unnest(p_equipment) e
    WHERE e NOT IN ('free_weights', 'weight_belt', 'resistance_bands', 'rings', 'pull_up_bar', 'dip_bar', 'low_parallettes')
    LIMIT 1;
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'Unknown equipment "%": use free_weights, weight_belt, resistance_bands, rings, pull_up_bar, dip_bar or low_parallettes', v_bad;
    END IF;
    UPDATE public.profiles
    SET available_equipment = (SELECT COALESCE(array_agg(DISTINCT e ORDER BY e), '{}') FROM unnest(p_equipment) e)
    WHERE id = v_uid;
  END IF;

  IF p_current_maxes IS NOT NULL THEN
    IF jsonb_typeof(p_current_maxes) <> 'object' THEN
      RAISE EXCEPTION 'current_maxes must be an object';
    END IF;
    SELECT jsonb_object_agg(key, (value #>> '{}')::int)
    INTO v_maxes
    FROM jsonb_each(p_current_maxes)
    WHERE key IN ('pull_ups', 'dips', 'push_ups', 'muscle_ups')
      AND jsonb_typeof(value) = 'number'
      AND (value #>> '{}')::numeric BETWEEN 0 AND 500
      AND (value #>> '{}')::numeric = trunc((value #>> '{}')::numeric);
    IF v_maxes IS NULL THEN
      RAISE EXCEPTION 'current_maxes needs whole numbers for pull_ups, dips, push_ups or muscle_ups';
    END IF;
    UPDATE public.profiles
    SET current_maxes = (COALESCE(current_maxes, '{}'::jsonb) - 'updated_at') || v_maxes || jsonb_build_object('updated_at', now())
    WHERE id = v_uid;
  END IF;

  RETURN (
    SELECT jsonb_build_object('equipment', available_equipment, 'current_maxes', current_maxes)
    FROM public.profiles WHERE id = v_uid
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_coach_save_athlete_update(text[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_coach_save_athlete_update(text[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_save_athlete_update(text[], jsonb) TO authenticated, service_role;
