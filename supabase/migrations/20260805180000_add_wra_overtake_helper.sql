-- Shared helper for the Global Well-Rounded (WRA) leaderboard overtake
-- check. WRA's formula (get_global_well_rounded_leaderboard) is
-- statics_tier + power_points + one_mm_points — a change to ANY of the
-- three underlying boards can move a user's WRA rank, so this is called
-- from all three submission RPCs (submit_static_hold, submit_onemm_log,
-- submit_power_assessment) rather than duplicating the same find+notify
-- logic three times. Same "direct leapfrog, single recipient" semantics as
-- every other overtake check, global scope (WRA isn't tier-scoped), same
-- shared 'leaderboard_overtaken' preference key as strength/power.
CREATE OR REPLACE FUNCTION public._find_and_notify_wra_overtake(p_user_id uuid, p_old_wra numeric, p_new_wra numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_overtaken_user_id uuid;
  v_notification_id uuid;
BEGIN
  IF p_new_wra <= p_old_wra THEN
    RETURN NULL;
  END IF;

  SELECT p2.id INTO v_overtaken_user_id
  FROM public.profiles p2
  WHERE p2.id != p_user_id
    AND (COALESCE(p2.statics_tier, 0) + COALESCE(p2.power_points, 0) + COALESCE(p2.one_mm_points, 0)) < p_new_wra
    AND (COALESCE(p2.statics_tier, 0) + COALESCE(p2.power_points, 0) + COALESCE(p2.one_mm_points, 0)) >= p_old_wra
  ORDER BY (COALESCE(p2.statics_tier, 0) + COALESCE(p2.power_points, 0) + COALESCE(p2.one_mm_points, 0)) DESC
  LIMIT 1;

  IF v_overtaken_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_preferences
    WHERE user_id = v_overtaken_user_id AND (prefs->>'leaderboard_overtaken') = 'false'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_overtaken_user_id,
    'leaderboard_overtaken',
    'You''ve Been Overtaken!',
    'Someone just beat your score on the Well-Rounded leaderboard. Defend your spot!',
    jsonb_build_object('screen', 'profile')
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._find_and_notify_wra_overtake(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._find_and_notify_wra_overtake(uuid, numeric, numeric) TO service_role;
