-- Cost is only known AFTER a Claude call completes (a single chat turn can
-- span multiple callClaude() calls inside the ai-coach edge function's
-- tool-use loop) — this is the second touchpoint of the two-part flow
-- started by ai_coach_log_chat_request() (which returns request_id for
-- exactly this purpose). Deliberately silent on 0-rows-affected: cost
-- bookkeeping must never break a chat reply that's already been generated
-- and sent to the athlete — the edge function logs a warning on failure
-- instead of surfacing an error to the client.
CREATE OR REPLACE FUNCTION public.ai_coach_record_chat_cost(
  p_request_id uuid,
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
  WHERE id = p_request_id AND user_id = auth.uid() AND kind = 'chat';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_record_chat_cost(uuid, integer, integer, integer, integer, numeric) TO authenticated;
