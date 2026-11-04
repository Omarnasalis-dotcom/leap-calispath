-- Previous programs now include programs a human coach assigned (owner
-- decision 2026-11-04). Starting another program — the AI Coach, Quick
-- Build/Customize Program, a library template — already moved a coach's
-- program to 'completed', but 20261001010000 kept it out of this list, so
-- the athlete could never switch back to it. Now it is listed, restorable
-- and deletable like a LEAP or AI Coach program, and restoring another
-- program no longer refuses to swap out an active coach program.
--
-- Unchanged: end_active_program() still refuses a coach's program (ending
-- one without starting another stays the coach's call).
--
-- Bodies are the live definitions with only the coach_id restriction
-- removed; is_coach is new in get_past_programs for the app's icon.

CREATE OR REPLACE FUNCTION public.get_past_programs()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_warrior_id CONSTANT uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  -- sessions_done: distinct days logged as done — a missed day is a
  -- workout_logs row whose notes start with '[STATUS:MISSED]' (same
  -- convention as isMissedLog in src/lib/trainingCenter.ts).
  SELECT COALESCE(jsonb_agg(p ORDER BY p.last_activity_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      wp.id,
      pt.name,
      pt.min_access_tier,
      wp.coach_id = '00000000-0000-0000-0000-000000000002' AS is_ai_coach,
      wp.coach_id NOT IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002') AS is_coach,
      wp.assigned_at,
      COALESCE(logs.sessions_done, 0) AS sessions_done,
      GREATEST(wp.assigned_at, logs.last_logged_at) AS last_activity_at
    FROM warrior_programs wp
    JOIN program_templates pt ON pt.id = wp.template_id
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT wl.block_id) FILTER (
          WHERE wl.notes IS NULL OR left(wl.notes, 15) <> '[STATUS:MISSED]'
        ) AS sessions_done,
        max(wl.completed_at) AS last_logged_at
      FROM workout_logs wl
      WHERE wl.warrior_program_id = wp.id
    ) logs ON true
    WHERE wp.warrior_id = v_warrior_id
      AND wp.status = 'completed'
    ORDER BY GREATEST(wp.assigned_at, logs.last_logged_at) DESC
    LIMIT 20
  ) p;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_program(p_warrior_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_warrior_id CONSTANT uuid := auth.uid();
  v_target RECORD;
  v_tier text;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  -- Serializes a double-tap (or two devices) so they can't both leave an
  -- 'active' row behind.
  PERFORM 1 FROM warrior_programs WHERE warrior_id = v_warrior_id FOR UPDATE;

  SELECT wp.id, wp.coach_id, wp.status, wp.template_id, pt.min_access_tier
  INTO v_target
  FROM warrior_programs wp
  JOIN program_templates pt ON pt.id = wp.template_id
  WHERE wp.id = p_warrior_program_id AND wp.warrior_id = v_warrior_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  IF v_target.status = 'active' THEN
    RETURN jsonb_build_object('success', true, 'warrior_program_id', v_target.id, 'template_id', v_target.template_id);
  END IF;

  IF v_target.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  -- Same tier ordering as meetsMinTier (src/lib/entitlement.ts): restoring
  -- a program built on a tier the caller no longer holds would only land
  -- them on WarriorProgramScreen's lock screen, so route to the paywall
  -- instead.
  IF v_target.min_access_tier IS NOT NULL THEN
    v_tier := public.caller_effective_tier();
    IF (CASE v_tier WHEN 'first' THEN 1 WHEN 'pro' THEN 2 WHEN 'max' THEN 3 ELSE 0 END)
       < (CASE v_target.min_access_tier WHEN 'first' THEN 1 WHEN 'pro' THEN 2 ELSE 0 END) THEN
      RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';
  UPDATE warrior_programs SET status = 'active' WHERE id = v_target.id;

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_target.id, 'template_id', v_target.template_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_past_program(p_warrior_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_warrior_id CONSTANT uuid := auth.uid();
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  UPDATE warrior_programs SET status = 'deleted'
  WHERE id = p_warrior_program_id
    AND warrior_id = v_warrior_id
    AND status = 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found';
  END IF;

  -- Its Journey points no longer count (journey_points_visible); badges
  -- above the new total go too.
  PERFORM public.journey_achievements_trim(v_warrior_id);

  RETURN jsonb_build_object('success', true);
END;
$function$;
