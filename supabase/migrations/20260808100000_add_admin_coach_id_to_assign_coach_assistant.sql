-- Gap found in an admin-panel coverage pass: assign_coach_assistant always
-- used auth.uid() as the coach, with no way for an admin to grant an
-- assistant on behalf of a coach they're managing through the admin panel
-- (unlike every other coaching RPC this session, which took an explicit
-- p_coach_id with an admin-override branch). coach_assistants itself
-- already has an "Admin manages all" FOR ALL policy, and removeAssistant's
-- direct DELETE already works fine for admin — this RPC was the one
-- remaining coach-self-only path.
-- Adding a parameter changes the signature — CREATE OR REPLACE would create
-- an ambiguous overload (PostgREST wouldn't know which 1-arg call to route
-- to) rather than replacing it in place, so the old signature must be
-- dropped first.
DROP FUNCTION IF EXISTS public.assign_coach_assistant(uuid);

CREATE OR REPLACE FUNCTION public.assign_coach_assistant(p_assistant_id uuid, p_coach_id uuid DEFAULT auth.uid())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_is_coach boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_assistant_id = p_coach_id THEN
    RAISE EXCEPTION 'Cannot assign yourself as your own assistant';
  END IF;

  v_is_admin := public.is_admin();

  IF NOT v_is_admin THEN
    IF auth.uid() != p_coach_id THEN
      RAISE EXCEPTION 'Only a coach can assign an assistant';
    END IF;

    SELECT is_coach INTO v_is_coach FROM profiles WHERE id = auth.uid();
    IF NOT COALESCE(v_is_coach, false) THEN
      RAISE EXCEPTION 'Only a coach can assign an assistant';
    END IF;

    IF is_coaching_paused(auth.uid()) THEN
      RAISE EXCEPTION 'Coaching access is paused';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM profiles w
    JOIN communities c ON c.id = w.community_id
    WHERE w.id = p_assistant_id AND c.created_by = p_coach_id
  ) THEN
    RAISE EXCEPTION 'That user is not a member of the coach''s community';
  END IF;

  INSERT INTO coach_assistants (coach_id, assistant_id)
  VALUES (p_coach_id, p_assistant_id)
  ON CONFLICT (coach_id, assistant_id) DO NOTHING;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.assign_coach_assistant(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_coach_assistant(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.assign_coach_assistant(uuid, uuid) TO authenticated;
