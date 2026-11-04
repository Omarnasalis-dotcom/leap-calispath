-- AI Coach answers the app can collect after a dropped connection.
--
-- Found live 2026-11-04: an athlete's phone disconnected near the end of a
-- 34s Day 1 build (app backgrounded or signal lost). The server finished
-- the build, but the answer only ever went down the closed stream, so the
-- athlete saw "Something went wrong", lost the paid-for card and gave up.
--
-- The ai-coach Edge Function now writes one row per message the app tags
-- with a client_request_id: 'running' when the build starts, then 'done'
-- with the exact final payload the stream carried, or 'failed'. When the
-- stream breaks, the app asks for its own row by that id and shows the
-- answer as if it had arrived normally.
--
-- Rows live 1 day (every store call deletes older rows). Account deletion
-- removes them (FK cascade). Same data the chat-review log already keeps
-- (privacy policy §2.4), for a much shorter time.

CREATE TABLE public.ai_coach_results (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_request_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_request_id)
);

CREATE INDEX ai_coach_results_created ON public.ai_coach_results (created_at);

-- No client access to the table at all: writes come only from the Edge
-- Function (ai_coach_store_result), reads only through ai_coach_get_result.
ALTER TABLE public.ai_coach_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_coach_results FROM PUBLIC, anon, authenticated;

-- Called only by the ai-coach Edge Function with the service key, after it
-- verified the user (same trust model as ai_coach_record_chat_cost).
CREATE FUNCTION public.ai_coach_store_result(
  p_user_id uuid,
  p_client_request_id uuid,
  p_status text,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ai_coach_results (user_id, client_request_id, status, payload)
  VALUES (p_user_id, p_client_request_id, p_status, p_payload)
  ON CONFLICT (user_id, client_request_id) DO UPDATE
    SET status = EXCLUDED.status,
        payload = EXCLUDED.payload,
        updated_at = now();

  DELETE FROM public.ai_coach_results WHERE created_at < now() - interval '1 day';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_coach_store_result(uuid, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_coach_store_result(uuid, uuid, text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_coach_store_result(uuid, uuid, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_coach_store_result(uuid, uuid, text, jsonb) TO service_role;

-- The app's lookup: only the caller's own row, read-only. NULL when there
-- is no row (the message never reached the server, or it expired).
CREATE FUNCTION public.ai_coach_get_result(p_client_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('status', r.status, 'payload', r.payload)
  FROM public.ai_coach_results r
  WHERE r.user_id = auth.uid()
    AND r.client_request_id = p_client_request_id
    AND r.created_at > now() - interval '1 day';
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_coach_get_result(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_coach_get_result(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_get_result(uuid) TO authenticated;
