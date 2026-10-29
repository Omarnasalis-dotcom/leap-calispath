-- The app's username lives in profiles.display_name (profiles has no
-- username column). Re-create the three chat review functions that read it.

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
  SELECT u.user_id, p.display_name, u.last_at, u.turns, u.auto_issues, u.open_flags
  FROM per_user u
  LEFT JOIN public.profiles p ON p.id = u.user_id
  WHERE (u.text_match OR (p_search IS NOT NULL AND p.display_name ILIKE '%' || p_search || '%'))
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
    'username', (SELECT display_name FROM public.profiles WHERE id = p_user_id),
    'turns', v_rows
  );
END;
$$;

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
        'username', p.display_name,
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


REVOKE EXECUTE ON FUNCTION public.admin_coach_chat_users(text, boolean, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_coach_chat_turns(uuid, timestamptz, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_coach_flags(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_coach_chat_users(text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_coach_chat_turns(uuid, timestamptz, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_coach_flags(text) TO authenticated;
