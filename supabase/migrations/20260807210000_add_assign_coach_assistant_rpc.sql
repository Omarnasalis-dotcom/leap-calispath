-- Grants delegated access. Mirrors assign_program_template's community
-- check exactly (same roster model: the coach's community defines who's
-- eligible). Coach-only — an assistant can never grant further assistants.
CREATE OR REPLACE FUNCTION public.assign_coach_assistant(p_assistant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_coach boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_assistant_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot assign yourself as your own assistant';
  END IF;

  SELECT is_coach INTO v_is_coach FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_coach, false) THEN
    RAISE EXCEPTION 'Only a coach can assign an assistant';
  END IF;

  IF is_coaching_paused(auth.uid()) THEN
    RAISE EXCEPTION 'Coaching access is paused';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM profiles w
    JOIN communities c ON c.id = w.community_id
    WHERE w.id = p_assistant_id AND c.created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'That user is not a member of your community';
  END IF;

  INSERT INTO coach_assistants (coach_id, assistant_id)
  VALUES (auth.uid(), p_assistant_id)
  ON CONFLICT (coach_id, assistant_id) DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_coach_assistant(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_coach_assistant(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_coach_assistant(uuid) TO authenticated;
