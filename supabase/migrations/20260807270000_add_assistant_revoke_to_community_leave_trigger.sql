-- Extends the existing community-leave trigger: if the person leaving (or
-- switching away from) a community is also a registered assistant for that
-- community's owning coach, immediately revoke the assistant relationship —
-- unlike the client-leave case (flag + notify, never auto-remove), an
-- assistant leaving keeps full edit/create/assign power over the coach's
-- entire roster with no active membership tie, so this is auto-revoked
-- rather than left for the coach to notice and act on. The coach still gets
-- notified either way.
CREATE OR REPLACE FUNCTION public.handle_community_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old_coach_id uuid;
  v_new_coach_id uuid;
  v_affected_id uuid;
  v_removed_assistant_id uuid;
BEGIN
  IF OLD.community_id IS NOT NULL THEN
    SELECT created_by INTO v_old_coach_id FROM communities WHERE id = OLD.community_id;
  END IF;

  IF NEW.community_id IS NOT NULL THEN
    SELECT created_by INTO v_new_coach_id FROM communities WHERE id = NEW.community_id;
  END IF;

  -- Left the old coach's community (didn't just switch to another community
  -- still owned by that same coach) while an active, not-already-flagged
  -- assignment from them exists.
  IF v_old_coach_id IS NOT NULL AND v_old_coach_id IS DISTINCT FROM v_new_coach_id THEN
    UPDATE warrior_programs
    SET community_left_at = now()
    WHERE warrior_id = NEW.id
      AND coach_id = v_old_coach_id
      AND status = 'active'
      AND community_left_at IS NULL
    RETURNING id INTO v_affected_id;

    IF v_affected_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_old_coach_id,
        'client_left_community',
        'Client Left Your Community',
        COALESCE(NEW.display_name, 'A client') || ' left your community. Their program is still active — review when ready.',
        jsonb_build_object('screen', 'my-clients', 'warriorId', NEW.id)
      );
    END IF;

    -- Assistant-revoke: same "left this coach's community" condition, an
    -- independent check since a person could in principle be both a client
    -- and an assistant for the same coach.
    DELETE FROM coach_assistants
    WHERE coach_id = v_old_coach_id AND assistant_id = NEW.id
    RETURNING id INTO v_removed_assistant_id;

    IF v_removed_assistant_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, body, data)
      VALUES (
        v_old_coach_id,
        'assistant_left_community',
        'Assistant Removed',
        COALESCE(NEW.display_name, 'Your assistant') || ' left your community — their assistant access has been removed.',
        jsonb_build_object('screen', 'my-clients', 'warriorId', NEW.id)
      );
    END IF;
  END IF;

  -- Rejoined the same coach's community — clear any earlier flag so the
  -- badge disappears once they're back. (Assistant status is NOT restored
  -- automatically — the coach has to re-grant it, same as any other
  -- deliberate access grant.)
  IF v_new_coach_id IS NOT NULL THEN
    UPDATE warrior_programs
    SET community_left_at = NULL
    WHERE warrior_id = NEW.id
      AND coach_id = v_new_coach_id
      AND community_left_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$function$;
