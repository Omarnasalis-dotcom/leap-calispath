-- Fourth AI Coach rate-limit RPC, for plain chat turns (no program write
-- involved). Kept consistent with the other three (ai_coach_create_program /
-- append_week / adjust_program): SECURITY DEFINER, trusts only auth.uid(),
-- checks today's count before logging. This also means the ai-coach Edge
-- Function never needs the service-role key at all — every call, including
-- this one, goes through a request-scoped client authenticated as the
-- calling user, consistent with how every write RPC in this migration set
-- already works.
CREATE OR REPLACE FUNCTION public.ai_coach_log_chat_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_today_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;

  SELECT count(*) INTO v_today_count
  FROM public.ai_coach_requests
  WHERE user_id = auth.uid()
    AND kind = 'chat'
    AND created_at >= date_trunc('day', now());

  IF v_today_count >= 40 THEN
    RAISE EXCEPTION 'RATE_LIMIT: chat daily limit reached';
  END IF;

  INSERT INTO public.ai_coach_requests (user_id, kind)
  VALUES (auth.uid(), 'chat');

  RETURN jsonb_build_object('success', true);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ai_coach_log_chat_request() TO authenticated;
