-- Admin-only toggle for a coach's write access. Pausing/resuming never
-- touches any client/template/exercise data — it only flips
-- profiles.coaching_paused_at, which every coach-write RLS policy and RPC
-- added in this batch of migrations checks.
CREATE OR REPLACE FUNCTION public.admin_set_coaching_paused(p_user_id uuid, p_paused boolean, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND is_coach = true) THEN
    RAISE EXCEPTION 'User is not a coach';
  END IF;

  UPDATE profiles
  SET coaching_paused_at = CASE WHEN p_paused THEN now() ELSE NULL END,
      coaching_paused_reason = CASE WHEN p_paused THEN p_reason ELSE NULL END
  WHERE id = p_user_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_set_coaching_paused(uuid, boolean, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_coaching_paused(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_coaching_paused(uuid, boolean, text) TO authenticated;
