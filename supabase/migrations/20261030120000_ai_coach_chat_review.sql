-- AI Coach chat review (owner decision 2026-10-29): store every AI Coach
-- exchange server-side so the owner can read real chats, flag mistakes, bad
-- choices and bad behavior, and fix them. Privacy policy §2.4/§4.5/§6 must
-- be live before the ai-coach function starts writing here.
--
-- · One row per exchange (one ai-coach request): the athlete's message, the
--   final reply as sent, every tool call, how it ended, cost and latency.
--   The app keeps one ongoing chat per user and sends no conversation id,
--   so the review page shows each user's turns as one timeline.
-- · Only the people in ai_coach_chat_reviewers can read them — not every
--   admin. Seeded with the owner only. No client access to either table;
--   the ai-coach function writes with the service role, the admin page
--   reads through the SECURITY DEFINER RPCs below.
-- · Kept 90 days, except turns with a flag still open or being fixed.
--   Clearing the chat in the app does not delete them (owner decision);
--   deleting the account does (FK cascade on auth.users).

CREATE TABLE public.ai_coach_chat_reviewers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ai_coach_chat_reviewers (user_id)
SELECT id FROM auth.users WHERE id = '23757312-804f-4521-afb7-5e15a3a161d5';

CREATE TABLE public.ai_coach_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  request_id uuid,
  platform text,
  model text,
  user_message text,
  reply text,
  -- ok · deadline · max_tokens · empty · unacted_blocked · max_turns · error
  outcome text NOT NULL,
  error_message text,
  -- [{name, input, ok, error, result, ms}] in call order
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_errors int NOT NULL DEFAULT 0,
  safety_flags text[] NOT NULL DEFAULT '{}',
  unacted_correction boolean NOT NULL DEFAULT false,
  program_action text,
  history_length int,
  latency_ms int,
  cost_usd numeric(10, 6),
  input_tokens int,
  output_tokens int,
  auto_issue boolean GENERATED ALWAYS AS (
    outcome <> 'ok' OR tool_errors > 0 OR cardinality(safety_flags) > 0 OR unacted_correction
  ) STORED
);

CREATE INDEX ai_coach_turns_user_created ON public.ai_coach_turns (user_id, created_at DESC);
CREATE INDEX ai_coach_turns_created ON public.ai_coach_turns (created_at DESC);

CREATE TABLE public.ai_coach_turn_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id uuid NOT NULL REFERENCES public.ai_coach_turns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('mistake', 'bad_choice', 'bad_behavior')),
  severity text NOT NULL CHECK (severity IN ('critical', 'minor')),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixing', 'fixed', 'wont_fix')),
  fix_ref text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_coach_turn_flags_turn ON public.ai_coach_turn_flags (turn_id);
CREATE INDEX ai_coach_turn_flags_status ON public.ai_coach_turn_flags (status, created_at DESC);

ALTER TABLE public.ai_coach_chat_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_coach_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_coach_turn_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_coach_chat_reviewers FROM anon, authenticated;
REVOKE ALL ON public.ai_coach_turns FROM anon, authenticated;
REVOKE ALL ON public.ai_coach_turn_flags FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.caller_is_chat_reviewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.ai_coach_chat_reviewers WHERE user_id = auth.uid());
$$;

-- Users with chats, most recent first. p_search matches username or any
-- message/reply text; p_issues_only keeps users with an auto issue or a
-- flag still open/fixing.
CREATE OR REPLACE FUNCTION public.admin_coach_chat_users(
  p_search text DEFAULT NULL,
  p_issues_only boolean DEFAULT false,
  p_limit int DEFAULT 100
)
RETURNS TABLE (
  user_id uuid,
  username text,
  last_at timestamptz,
  turns bigint,
  auto_issues bigint,
  open_flags bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_is_chat_reviewer() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN QUERY
  WITH per_user AS (
    SELECT t.user_id,
           max(t.created_at) AS last_at,
           count(DISTINCT t.id) AS turns,
           count(DISTINCT t.id) FILTER (WHERE t.auto_issue) AS auto_issues,
           count(DISTINCT f.id) FILTER (WHERE f.status IN ('open', 'fixing')) AS open_flags,
           bool_or(
             p_search IS NULL OR p_search = ''
             OR t.user_message ILIKE '%' || p_search || '%'
             OR t.reply ILIKE '%' || p_search || '%'
           ) AS text_match
    FROM public.ai_coach_turns t
    LEFT JOIN public.ai_coach_turn_flags f ON f.turn_id = t.id
    GROUP BY t.user_id
  )
  SELECT u.user_id, p.username, u.last_at, u.turns, u.auto_issues, u.open_flags
  FROM per_user u
  LEFT JOIN public.profiles p ON p.id = u.user_id
  WHERE (u.text_match OR (p_search IS NOT NULL AND p.username ILIKE '%' || p_search || '%'))
    AND (NOT p_issues_only OR u.auto_issues > 0 OR u.open_flags > 0)
  ORDER BY u.last_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500));
END;
$$;

-- One user's chat, oldest first within the page. p_before pages back.
CREATE OR REPLACE FUNCTION public.admin_coach_chat_turns(
  p_user_id uuid,
  p_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF NOT public.caller_is_chat_reviewer() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  SELECT coalesce(jsonb_agg(row ORDER BY (row->>'created_at')::timestamptz), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT to_jsonb(t) || jsonb_build_object(
      'flags', coalesce((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at)
        FROM public.ai_coach_turn_flags f
        WHERE f.turn_id = t.id
      ), '[]'::jsonb)
    ) AS row
    FROM public.ai_coach_turns t
    WHERE t.user_id = p_user_id
      AND (p_before IS NULL OR t.created_at < p_before)
    ORDER BY t.created_at DESC
    LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  ) page;

  RETURN jsonb_build_object(
    'username', (SELECT username FROM public.profiles WHERE id = p_user_id),
    'turns', v_rows
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_flag_coach_turn(
  p_turn_id uuid,
  p_kind text,
  p_severity text,
  p_note text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.caller_is_chat_reviewer() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  INSERT INTO public.ai_coach_turn_flags (turn_id, kind, severity, note, created_by)
  VALUES (p_turn_id, p_kind, p_severity, coalesce(p_note, ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- NULL leaves a field as it is.
CREATE OR REPLACE FUNCTION public.admin_update_coach_flag(
  p_flag_id uuid,
  p_status text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_fix_ref text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_severity text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_is_chat_reviewer() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  UPDATE public.ai_coach_turn_flags
  SET status = coalesce(p_status, status),
      note = coalesce(p_note, note),
      fix_ref = coalesce(p_fix_ref, fix_ref),
      kind = coalesce(p_kind, kind),
      severity = coalesce(p_severity, severity),
      updated_at = now()
  WHERE id = p_flag_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FLAG_NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_coach_flag(p_flag_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_is_chat_reviewer() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
  DELETE FROM public.ai_coach_turn_flags WHERE id = p_flag_id;
END;
$$;

-- Flags across all users, with the turn they're on. p_status NULL = all.
CREATE OR REPLACE FUNCTION public.admin_coach_flags(p_status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.caller_is_chat_reviewer() THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(
      to_jsonb(f) || jsonb_build_object(
        'user_id', t.user_id,
        'username', p.username,
        'turn_created_at', t.created_at,
        'user_message', t.user_message,
        'reply', t.reply
      ) ORDER BY f.created_at DESC
    )
    FROM public.ai_coach_turn_flags f
    JOIN public.ai_coach_turns t ON t.id = f.turn_id
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE p_status IS NULL OR f.status = p_status
  ), '[]'::jsonb);
END;
$$;

-- 90-day retention; a turn with a flag still open or being fixed is kept
-- until the flag is closed.
CREATE OR REPLACE FUNCTION public.purge_old_ai_coach_turns()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int;
BEGIN
  DELETE FROM public.ai_coach_turns t
  WHERE t.created_at < now() - interval '90 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.ai_coach_turn_flags f
      WHERE f.turn_id = t.id AND f.status IN ('open', 'fixing')
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.caller_is_chat_reviewer() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_coach_chat_users(text, boolean, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_coach_chat_turns(uuid, timestamptz, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_flag_coach_turn(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_coach_flag(uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_delete_coach_flag(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_coach_flags(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.purge_old_ai_coach_turns() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.caller_is_chat_reviewer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_coach_chat_users(text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_coach_chat_turns(uuid, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_flag_coach_turn(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_coach_flag(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_coach_flag(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_coach_flags(text) TO authenticated;

SELECT cron.schedule(
  'purge-old-ai-coach-turns',
  '30 3 * * *',
  $$ SELECT public.purge_old_ai_coach_turns(); $$
);
