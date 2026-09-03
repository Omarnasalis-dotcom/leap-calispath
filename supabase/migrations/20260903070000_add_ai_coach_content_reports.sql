-- App Store Review Guideline 4.7.1 (chatbots) requires apps with AI-powered
-- chat features to include "a method for filtering objectionable material,
-- a mechanism to report content and timely responses to concerns, and the
-- ability to block abusive users." Filtering already exists (see
-- supabase/functions/ai-coach/system-prompt.ts's SAFETY section);
-- "block abusive users" doesn't apply here (private 1:1 AI chat, no other
-- users involved) — this migration adds the missing reporting mechanism.
CREATE TABLE public.ai_coach_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('inaccurate', 'inappropriate', 'other')),
  assistant_message text NOT NULL,
  preceding_user_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id)
);

ALTER TABLE public.ai_coach_message_reports ENABLE ROW LEVEL SECURITY;

-- Self-service: a user can file a report (and only ever see/insert their
-- own — no read access, this isn't a place to browse other people's
-- reports). Reviewing is an admin-only action via the RPCs below.
CREATE POLICY "insert_own_report" ON public.ai_coach_message_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_list_ai_coach_reports(p_include_reviewed boolean DEFAULT false)
RETURNS SETOF public.ai_coach_message_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT * FROM ai_coach_message_reports
    WHERE p_include_reviewed OR reviewed_at IS NULL
    ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_ai_coach_report_reviewed(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;

  UPDATE ai_coach_message_reports
  SET reviewed_at = now(), reviewed_by = auth.uid()
  WHERE id = p_report_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_list_ai_coach_reports(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_ai_coach_reports(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_ai_coach_reports(boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_mark_ai_coach_report_reviewed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_mark_ai_coach_report_reviewed(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_ai_coach_report_reviewed(uuid) TO authenticated;
