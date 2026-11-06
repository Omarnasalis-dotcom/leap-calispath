-- The last day card the AI Coach proposed, so it can see it on the next
-- message. Found live 2026-11-06: a card lives only on the phone and only
-- chat text reaches the model, so asking to change one exercise rebuilt the
-- day from memory and silently changed other things.
--
-- · One row per athlete, replaced by each new day card.
-- · Rows live 1 day (every store call deletes older ones). Account deletion
--   removes them (FK cascade). Only the program content the chat-review log
--   already keeps (privacy policy §2.4), for a much shorter time.
-- · Nothing reads this table until the ai-coach function uses it, and only
--   while the AI_COACH_PENDING_CARD secret allows it. With no table or no
--   row the coach works as it did before.

CREATE TABLE public.ai_coach_pending_cards (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  card jsonb NOT NULL,
  proposed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_coach_pending_cards_proposed ON public.ai_coach_pending_cards (proposed_at);

-- No client access at all: the ai-coach function is the only reader and
-- writer, through the two functions below.
ALTER TABLE public.ai_coach_pending_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_coach_pending_cards FROM PUBLIC, anon, authenticated;

-- Called only by the ai-coach Edge Function with the service key, after it
-- verified the user (same trust model as ai_coach_store_result).
CREATE FUNCTION public.ai_coach_store_pending_card(
  p_user_id uuid,
  p_card jsonb,
  p_proposed_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.ai_coach_pending_cards (user_id, card, proposed_at)
  VALUES (p_user_id, p_card, p_proposed_at)
  ON CONFLICT (user_id) DO UPDATE
    SET card = EXCLUDED.card,
        proposed_at = EXCLUDED.proposed_at;

  DELETE FROM public.ai_coach_pending_cards WHERE proposed_at < now() - interval '1 day';
END;
$function$;

-- The card, unless it expired or the athlete's program changed after it was
-- proposed (Add, Redo, or any other write logged in ai_coach_requests). An
-- added day is read from the program itself, so its card must not be used.
CREATE FUNCTION public.ai_coach_get_pending_card(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.card
  FROM public.ai_coach_pending_cards c
  WHERE c.user_id = p_user_id
    AND c.proposed_at > now() - interval '1 day'
    AND NOT EXISTS (
      SELECT 1
      FROM public.ai_coach_requests r
      WHERE r.user_id = p_user_id
        AND r.kind <> 'chat'
        AND r.created_at >= c.proposed_at
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_coach_store_pending_card(uuid, jsonb, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_coach_store_pending_card(uuid, jsonb, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_coach_store_pending_card(uuid, jsonb, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_coach_store_pending_card(uuid, jsonb, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.ai_coach_get_pending_card(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_coach_get_pending_card(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ai_coach_get_pending_card(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_coach_get_pending_card(uuid) TO service_role;
