-- Detect a client leaving their coach's community while they have an
-- active assignment. Deliberately a trigger on profiles.community_id
-- rather than logic inside leave_community alone — a trigger fires
-- regardless of *how* community_id changes (leave_community, a future
-- admin/kick action, or the ON DELETE SET NULL cascade when a coach
-- deletes their own community), so there's one single source of truth
-- instead of duplicating this check into every RPC that could touch the
-- column.
--
-- Never touches the assignment itself — only flags it
-- (warrior_programs.community_left_at) and notifies the coach. Removing or
-- keeping the assignment stays the coach's own decision via the existing
-- "Delete client data" action.
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
  END IF;

  -- Rejoined the same coach's community — clear any earlier flag so the
  -- badge disappears once they're back.
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

DROP TRIGGER IF EXISTS on_community_membership_change ON public.profiles;
CREATE TRIGGER on_community_membership_change
AFTER UPDATE OF community_id ON public.profiles
FOR EACH ROW
WHEN (OLD.community_id IS DISTINCT FROM NEW.community_id)
EXECUTE FUNCTION public.handle_community_membership_change();
