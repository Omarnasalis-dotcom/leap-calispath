-- Self-service "build your week" RPC for the Workout Library's Workouts
-- tab: turns a caller-chosen, ordered set of standalone_workouts (each one
-- full training day) into a real one-week program, replacing whatever
-- program the warrior currently has active. Modeled directly on
-- ai_coach_create_program (20260821180000_add_ai_coach_write_rpcs.sql) —
-- same auth.uid()-trusted, deactivate-then-create shape — minus its
-- AI-specific rate-limit table, and reuses _insert_client_program_blocks
-- (20260702141000_add_client_program_write_functions.sql) exactly like
-- select_library_template and ai_coach_create_program already do.

CREATE OR REPLACE FUNCTION public.create_custom_program_from_workouts(p_workout_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_leap_profile_id CONSTANT uuid := '00000000-0000-0000-0000-000000000001'; -- LEAP_SYSTEM_PROFILE_ID, src/constants/system.ts
  v_warrior_id CONSTANT uuid := auth.uid();
  v_paywall_enabled boolean;
  v_is_pro boolean;
  v_blocked_title text;
  v_new_template_id uuid;
  v_new_warrior_program_id uuid;
  v_blocks jsonb;
BEGIN
  IF v_warrior_id IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  IF p_workout_ids IS NULL OR array_length(p_workout_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one workout must be selected';
  END IF;
  IF array_length(p_workout_ids, 1) > 7 THEN
    RAISE EXCEPTION 'A custom program can have at most 7 days';
  END IF;

  -- Mirrors canAccessPro() (src/lib/entitlement.ts) server-side so this RPC
  -- can't be called directly to bypass the client's own lock check. app_config
  -- is keyed per-platform; any platform row with paywall_enabled=true is
  -- treated as enabled — erring toward gating is the safe direction.
  SELECT bool_or(paywall_enabled) INTO v_paywall_enabled FROM app_config;
  v_is_pro := NOT COALESCE(v_paywall_enabled, false)
    OR EXISTS (SELECT 1 FROM profiles WHERE id = v_warrior_id AND (is_admin OR is_coach))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = v_warrior_id AND access_expires_at > now());

  SELECT title INTO v_blocked_title
  FROM standalone_workouts
  WHERE id = ANY(p_workout_ids)
    AND (kind <> 'workout' OR status <> 'published' OR (is_free = false AND NOT v_is_pro))
  LIMIT 1;
  IF v_blocked_title IS NOT NULL THEN
    RAISE EXCEPTION 'Workout not available: %', v_blocked_title;
  END IF;

  -- Checked via the unnested array (one row per occurrence), not a plain
  -- `id = ANY(...)` count comparison — the same workout id can legitimately
  -- appear more than once (e.g. Push Day on both Day 1 and Day 4), and
  -- ANY() membership dedupes matches, which would make a duplicate-id
  -- selection falsely fail this "did every id resolve" check.
  IF EXISTS (
    SELECT 1
    FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
    LEFT JOIN standalone_workouts sw
      ON sw.id = ids.workout_id AND sw.kind = 'workout' AND sw.status = 'published'
    WHERE sw.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected workouts could not be found';
  END IF;

  -- Build the blocks jsonb in the caller-chosen order (array position, via
  -- WITH ORDINALITY) — exactly the shape _insert_client_program_blocks
  -- expects. "DAY {n} | {title}" follows the existing "DAY | BLOCK" naming
  -- convention (program_blocks.name split on the first '|' everywhere it's
  -- consumed — WarriorProgramScreen, templateLibrary.ts, ProgramExportBuilder):
  -- the part before '|' becomes the "Day N" heading, the part after becomes
  -- the block/session name shown under it — here, the workout's own title.
  SELECT jsonb_agg(
    jsonb_build_object(
      'name', 'DAY ' || ord || ' | ' || sw.title,
      'order_index', ord - 1,
      'week_number', 1,
      'exercises', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'exercise_id', swe.exercise_id,
            'sets', swe.sets,
            'reps', swe.reps,
            'rest_seconds', swe.rest_seconds,
            'hold_seconds', swe.hold_seconds,
            'is_weighted', swe.is_weighted,
            'notes', swe.notes,
            'order_index', swe.order_index
          ) ORDER BY swe.order_index
        ), '[]'::jsonb)
        FROM standalone_workout_exercises swe
        WHERE swe.workout_id = sw.id
      )
    ) ORDER BY ord
  ) INTO v_blocks
  FROM unnest(p_workout_ids) WITH ORDINALITY AS ids(workout_id, ord)
  JOIN standalone_workouts sw ON sw.id = ids.workout_id;

  UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = v_warrior_id AND status = 'active';

  INSERT INTO program_templates (name, description, coach_id)
  VALUES ('My Custom Program', array_length(p_workout_ids, 1) || '-day custom program built from the Workout Library', v_leap_profile_id)
  RETURNING id INTO v_new_template_id;

  PERFORM public._insert_client_program_blocks(v_new_template_id, 0, v_blocks);

  INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
  VALUES (v_leap_profile_id, v_warrior_id, v_new_template_id, 'active')
  RETURNING id INTO v_new_warrior_program_id;

  RETURN jsonb_build_object('success', true, 'warrior_program_id', v_new_warrior_program_id, 'template_id', v_new_template_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_custom_program_from_workouts(uuid[]) TO authenticated;
