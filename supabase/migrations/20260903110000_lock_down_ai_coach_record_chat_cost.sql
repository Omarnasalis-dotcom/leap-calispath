-- ai_coach_record_chat_cost was reachable by any authenticated user calling
-- it directly (GRANT ... TO authenticated, no REVOKE) — and it trusted
-- every argument, including p_cost_usd, at face value. Recomputing cost
-- from the token counts server-side would not have fixed this: the token
-- counts themselves are just as much client-supplied arguments as the cost
-- figure is. The only real fix is closing off who can call it at all —
-- this is infrastructure telemetry (what a Claude call actually cost),
-- not a user action, so unlike every other ai-coach RPC it has no
-- legitimate reason to be reachable by the athlete's own JWT in the first
-- place.
--
-- Switches auth from auth.uid() to an explicit p_user_id, since a
-- service-role caller carries no user JWT for auth.uid() to resolve.
-- p_user_id is safe to trust here specifically because the only caller
-- left standing is the ai-coach edge function itself, which already
-- verified that user's identity via userClient.auth.getUser() before ever
-- reaching this call (see index.ts) — and the service-role key that makes
-- this callable at all is a server-side secret no client ever holds.
CREATE OR REPLACE FUNCTION public.ai_coach_record_chat_cost(
  p_request_id uuid,
  p_user_id uuid,
  p_input_tokens integer,
  p_output_tokens integer,
  p_cache_creation_input_tokens integer,
  p_cache_read_input_tokens integer,
  p_cost_usd numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ai_coach_requests
  SET
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cache_creation_input_tokens = p_cache_creation_input_tokens,
    cache_read_input_tokens = p_cache_read_input_tokens,
    cost_usd = p_cost_usd
  WHERE id = p_request_id AND user_id = p_user_id AND kind = 'chat';
END;
$function$;

-- Old (auth.uid()-based) signature is being replaced, not overloaded.
DROP FUNCTION IF EXISTS public.ai_coach_record_chat_cost(uuid, integer, integer, integer, integer, numeric);

REVOKE EXECUTE ON FUNCTION public.ai_coach_record_chat_cost(uuid, uuid, integer, integer, integer, integer, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_coach_record_chat_cost(uuid, uuid, integer, integer, integer, integer, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_coach_record_chat_cost(uuid, uuid, integer, integer, integer, integer, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_coach_record_chat_cost(uuid, uuid, integer, integer, integer, integer, numeric) TO service_role;
