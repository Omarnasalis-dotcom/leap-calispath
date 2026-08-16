-- Coach/admin notification: flag an assigned client who hasn't logged a
-- single workout against their program in 3+ days since assignment.
--
-- Real-data dry run before writing this (per the 2026-08-05 fan-out
-- incident lesson: always check who's actually targeted before enabling a
-- new fan-out) surfaced 77 matches for the raw "assigned 3+ days ago, zero
-- workout_logs" condition — 76 of which belonged to coach_id
-- '00000000-0000-0000-0000-000000000001', the synthetic system account that
-- owns library/starter templates (display_name 'Leap', email
-- system+leap-templates@internal.leapcalispath.invalid, no push_token, no
-- human behind it). That account is explicitly excluded below — it isn't a
-- real coaching relationship, and nobody reads its inbox.
--
-- Dedup: re-flags the same client at most once every 7 days (checked
-- against this function's own notification rows, scoped by client id in
-- `data`, with a recency bound — not a nullable "already sent" flag with no
-- bound, which is exactly the shape that caused the 08-05 incident).
CREATE OR REPLACE FUNCTION public.get_clients_needing_attention()
RETURNS TABLE(warrior_program_id uuid, warrior_id uuid, client_name text, coach_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT wp.id, wp.warrior_id, COALESCE(p.display_name, 'A client'), wp.coach_id
  FROM public.warrior_programs wp
  JOIN public.profiles p ON p.id = wp.warrior_id
  WHERE wp.status = 'active'
    AND wp.coach_id IS NOT NULL
    AND wp.coach_id != wp.warrior_id
    AND wp.coach_id != '00000000-0000-0000-0000-000000000001'
    AND wp.assigned_at <= now() - interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.workout_logs wl WHERE wl.warrior_program_id = wp.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.type = 'client_needs_attention'
        AND (n.data->>'client_id') = wp.warrior_id::text
        AND n.created_at > now() - interval '7 days'
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_clients_needing_attention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clients_needing_attention() TO service_role;
