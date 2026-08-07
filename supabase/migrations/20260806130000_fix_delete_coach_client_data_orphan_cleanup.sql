-- delete_coach_client_data only wiped the assignment's cloned template when
-- its name started with '[CUSTOM]%'. Neither clone-creation path
-- (assign_program_template, select_library_template) has ever produced that
-- prefix, so the wipe branch never actually ran — every deleted assignment
-- left its per-client clone (and blocks) behind, unreferenced by any
-- warrior_programs row. Coaching Center's "Master Templates" picker buckets
-- any non-library template with zero warrior_programs references as a
-- reusable master, so every one of these orphans reappeared there — visible
-- both as a coach's own stray clones and, when browsing as admin, as every
-- warrior's self-service library pick (owned by the fixed Leap system
-- profile id).
--
-- Fix: replace the unreliable name check with the same signal already used
-- to decide master-vs-assigned in the UI — after removing this assignment,
-- if no other warrior_programs row still points at the template, it can
-- only be a clone (both clone paths create a template exclusively for one
-- relationship; select_library_template's reuse branch is the only case
-- where a second warrior_programs row can point at the same clone, and that
-- case is exactly what this check protects).
CREATE OR REPLACE FUNCTION public.delete_coach_client_data(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id UUID;
  v_warrior_id UUID;
  v_owner_coach_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- Get assignment details
  SELECT template_id, warrior_id, coach_id INTO v_template_id, v_warrior_id, v_owner_coach_id
  FROM public.warrior_programs
  WHERE id = p_assignment_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();

  IF auth.uid() != v_owner_coach_id AND NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Not authorized to modify this assignment';
  END IF;

  -- A. Delete all workout logs associated with this program
  DELETE FROM public.workout_logs
  WHERE warrior_program_id = p_assignment_id;

  -- B. Delete the assignment connecting the client to the template
  DELETE FROM public.warrior_programs
  WHERE id = p_assignment_id;

  -- C. If no other assignment still references this template, it's an
  -- orphaned clone (not a reusable master) — wipe it entirely.
  IF NOT EXISTS (
    SELECT 1 FROM public.warrior_programs WHERE template_id = v_template_id
  ) THEN
    DELETE FROM public.block_exercises
    WHERE block_id IN (
      SELECT id FROM public.program_blocks WHERE template_id = v_template_id
    );

    DELETE FROM public.program_blocks
    WHERE template_id = v_template_id;

    DELETE FROM public.program_templates
    WHERE id = v_template_id;
  END IF;
END;
$function$;

-- One-time cleanup of pre-existing orphans created by the bug above. Only
-- targets rows owned by the fixed Leap system profile (self-service library
-- picks) with zero warrior_programs references — that combination is
-- unambiguous garbage, since select_library_template always links a fresh or
-- reused clone to a warrior_programs row in the same transaction it creates
-- it, so a system-owned template with no references can never be a
-- legitimate, reachable template. Coach-owned orphans are deliberately left
-- alone: a coach-owned, unreferenced template cannot be distinguished from a
-- master template the coach intentionally built and just hasn't assigned yet.
DELETE FROM public.block_exercises
WHERE block_id IN (
  SELECT pb.id
  FROM public.program_blocks pb
  JOIN public.program_templates pt ON pt.id = pb.template_id
  WHERE pt.coach_id = '00000000-0000-0000-0000-000000000001'
    AND pt.is_library_template = false
    AND NOT EXISTS (
      SELECT 1 FROM public.warrior_programs wp WHERE wp.template_id = pt.id
    )
);

DELETE FROM public.program_blocks
WHERE template_id IN (
  SELECT pt.id
  FROM public.program_templates pt
  WHERE pt.coach_id = '00000000-0000-0000-0000-000000000001'
    AND pt.is_library_template = false
    AND NOT EXISTS (
      SELECT 1 FROM public.warrior_programs wp WHERE wp.template_id = pt.id
    )
);

DELETE FROM public.program_templates pt
WHERE pt.coach_id = '00000000-0000-0000-0000-000000000001'
  AND pt.is_library_template = false
  AND NOT EXISTS (
    SELECT 1 FROM public.warrior_programs wp WHERE wp.template_id = pt.id
  );
