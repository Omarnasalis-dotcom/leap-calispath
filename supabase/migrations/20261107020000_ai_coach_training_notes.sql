-- Lasting training facts the AI Coach remembers (owner decision 2026-11-06).
-- Found live: "I play football, no legs" and "my rings don't reach the ground"
-- lived only in the chat, so clearing it lost them and the coach proposed legs
-- again. save_athlete_update only kept equipment and strict maxes.
--
-- · One short list per athlete, replaced whole by each save, like equipment.
-- · Own table, so guard_profile_protected_fields is untouched and clients have
--   no direct access. Account deletion removes it (FK cascade).

CREATE TABLE public.ai_coach_training_notes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  notes text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_coach_training_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_coach_training_notes FROM PUBLIC, anon, authenticated;

-- Called with the athlete's own JWT by the save_athlete_update tool.
CREATE FUNCTION public.ai_coach_save_training_notes(p_notes text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid CONSTANT uuid := auth.uid();
  v_notes text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated';
  END IF;
  IF NOT public.caller_has_pro_access() THEN
    RAISE EXCEPTION 'PRO_REQUIRED' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(n ORDER BY ord), '{}') INTO v_notes
  FROM (
    SELECT trim(e) AS n, min(o) AS ord
    FROM unnest(COALESCE(p_notes, '{}')) WITH ORDINALITY AS t(e, o)
    WHERE trim(e) <> ''
    GROUP BY trim(e)
  ) s;

  IF cardinality(v_notes) > 10 THEN
    RAISE EXCEPTION 'Keep training_notes to 10 short notes';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_notes) n WHERE char_length(n) > 200) THEN
    RAISE EXCEPTION 'Keep each training note under 200 characters';
  END IF;

  INSERT INTO public.ai_coach_training_notes (user_id, notes, updated_at)
  VALUES (v_uid, v_notes, now())
  ON CONFLICT (user_id) DO UPDATE SET notes = EXCLUDED.notes, updated_at = now();

  RETURN v_notes;
END;
$function$;

CREATE FUNCTION public.ai_coach_get_training_notes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT notes FROM public.ai_coach_training_notes WHERE user_id = auth.uid()), '{}');
$function$;

REVOKE EXECUTE ON FUNCTION public.ai_coach_save_training_notes(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_save_training_notes(text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.ai_coach_get_training_notes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_coach_get_training_notes() TO authenticated;
