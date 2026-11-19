-- Notifications screen "Needs you" (app redesign, PR #29).
--
-- 1. notifications.acted_at: when the person tapped the item or its button
--    (Join / Defend / Build week / Use code). read_at and opened_at are set
--    just by opening the screen, so they can't say "dealt with".
-- 2. notification_fields(): the names inside a notification (the challenge,
--    who overtook you, the board or tier, the week, the program) as separate
--    data fields, so the app can lead with them in either language. A
--    BEFORE INSERT trigger fills them from the English text, before
--    localize_notification translates it (triggers run in name order:
--    extract_… < localize_…). The last 60 days are filled once below, from
--    the English or the Arabic text.
-- 3. get_inbox_status(ids): whether a "Needs you" item is done: the AI Coach
--    week after it is built, or the challenge has ended / has the person's
--    score. Other types return null (the app decides from acted_at and age).
--
-- Nothing here can fail an insert: the trigger swallows its own errors, the
-- same way localize_notification does inside the score-submission RPCs.

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS acted_at timestamptz;

CREATE OR REPLACE FUNCTION public.notification_fields(p_type text, p_body text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  m text[];
  -- Bidi isolates localize_notification wraps names in.
  iso CONSTANT text := E'⁨⁩';
  out jsonb := '{}'::jsonb;
BEGIN
  IF p_body IS NULL THEN
    RETURN out;
  END IF;

  IF p_type = 'leaderboard_overtaken' THEN
    m := regexp_match(p_body, '^(.*) just beat your time in Tier (\d+)\. Defend your spot!$');
    IF m IS NOT NULL THEN
      RETURN jsonb_strip_nulls(jsonb_build_object('kind', 'time', 'tier', m[2]::int, 'by_name', NULLIF(m[1], 'Someone')));
    END IF;
    m := regexp_match(p_body, '^(.*) just beat your score on the (.*) leaderboard\. Defend your spot!$');
    IF m IS NOT NULL THEN
      RETURN jsonb_strip_nulls(jsonb_build_object('kind', 'score', 'board_name', m[2], 'by_name', NULLIF(m[1], 'Someone')));
    END IF;
    m := regexp_match(p_body, '^تفوّق (.*) للتو على وقتك في المستوى (\d+)\.');
    IF m IS NOT NULL THEN
      RETURN jsonb_strip_nulls(jsonb_build_object('kind', 'time', 'tier', m[2]::int,
        'by_name', NULLIF(translate(m[1], iso, ''), 'أحد المنافسين')));
    END IF;
    m := regexp_match(p_body, '^تفوّق (.*) للتو على نتيجتك في لوحة صدارة (.*)\. دافع عن مركزك!$');
    IF m IS NOT NULL THEN
      RETURN jsonb_strip_nulls(jsonb_build_object('kind', 'score',
        'board_name', CASE m[2]
          WHEN 'عالم الطاقة' THEN 'Power World'
          WHEN 'عالم الثبات' THEN 'Static World'
          WHEN 'عالم التحمّل' THEN '1MM'
          WHEN 'الرياضي المتكامل' THEN 'Well-Rounded'
        END,
        'by_name', NULLIF(translate(m[1], iso, ''), 'أحد المنافسين')));
    END IF;
    RETURN out;
  END IF;

  IF p_type = 'weekly_challenge_started' THEN
    m := regexp_match(p_body, '^"(.*)" is live this week');
    IF m IS NULL THEN
      m := regexp_match(p_body, '^التحدي «(.*)» متاح هذا الأسبوع');
    END IF;
    IF m IS NOT NULL THEN
      RETURN jsonb_build_object('challenge_name', translate(m[1], iso, ''));
    END IF;
    RETURN out;
  END IF;

  IF p_type = 'week_complete_nudge' THEN
    m := regexp_match(coalesce(p_data->>'key', ''), '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):w(\d+)$');
    IF m IS NOT NULL THEN
      RETURN jsonb_build_object('program_id', m[1], 'week', m[2]::int);
    END IF;
    RETURN out;
  END IF;

  IF p_type = 'client_program_update' THEN
    m := regexp_match(p_body, '^(.*) assigned you a new program: "(.*)"\.$');
    IF m IS NULL THEN
      m := regexp_match(p_body, '^عيّن لك (.*) برنامجًا جديدًا: «(.*)»\.$');
    END IF;
    IF m IS NOT NULL THEN
      RETURN jsonb_build_object('by_name', translate(m[1], iso, ''), 'program_name', translate(m[2], iso, ''));
    END IF;
    RETURN out;
  END IF;

  RETURN out;
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$function$;

CREATE OR REPLACE FUNCTION public.extract_notification_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  extra jsonb;
BEGIN
  extra := public.notification_fields(NEW.type, NEW.body, NEW.data);
  IF extra <> '{}'::jsonb THEN
    -- What the sender set wins over what was read from the text.
    NEW.data := extra || coalesce(NEW.data, '{}'::jsonb);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS extract_notification_fields ON public.notifications;
CREATE TRIGGER extract_notification_fields
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.extract_notification_fields();

-- The rows the Notifications screen can still show (60 days).
UPDATE public.notifications n
SET data = f.extra || coalesce(n.data, '{}'::jsonb)
FROM (
  SELECT id, public.notification_fields(type, body, data) AS extra
  FROM public.notifications
  WHERE created_at > now() - interval '60 days'
    AND type IN ('leaderboard_overtaken', 'weekly_challenge_started', 'week_complete_nudge', 'client_program_update')
) f
WHERE n.id = f.id AND f.extra <> '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_inbox_status(p_ids uuid[])
RETURNS TABLE(id uuid, resolved boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT n.id,
    CASE
      WHEN n.type = 'week_complete_nudge'
        AND n.data->>'program_id' ~ '^[0-9a-f-]{36}$' AND n.data->>'week' ~ '^\d+$' THEN
        coalesce((
          SELECT wp.current_week > (n.data->>'week')::int
              OR EXISTS (
                SELECT 1 FROM program_blocks b
                WHERE b.template_id = wp.template_id
                  AND coalesce(b.week_number, 1) = (n.data->>'week')::int + 1)
          FROM warrior_programs wp
          WHERE wp.id = (n.data->>'program_id')::uuid
            AND wp.warrior_id = auth.uid()
            AND wp.status = 'active'
        ), true)  -- program ended or replaced: nothing left to build
      WHEN n.type = 'weekly_challenge_started' AND n.data ? 'challenge_name' THEN
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM weekly_challenges c
            WHERE c.title = n.data->>'challenge_name'
              AND c.week_start BETWEEN (n.created_at AT TIME ZONE 'utc')::date - 2 AND (n.created_at AT TIME ZONE 'utc')::date
          ) THEN n.created_at < now() - interval '7 days'
          ELSE NOT EXISTS (
              SELECT 1 FROM weekly_challenges c
              WHERE c.title = n.data->>'challenge_name'
                AND c.week_start BETWEEN (n.created_at AT TIME ZONE 'utc')::date - 2 AND (n.created_at AT TIME ZONE 'utc')::date
                AND c.is_active
                AND c.week_start + 7 > CURRENT_DATE)
            OR EXISTS (
              SELECT 1 FROM weekly_challenges c
              JOIN weekly_entries e ON e.challenge_id = c.id AND e.user_id = auth.uid()
              WHERE c.title = n.data->>'challenge_name'
                AND c.week_start BETWEEN (n.created_at AT TIME ZONE 'utc')::date - 2 AND (n.created_at AT TIME ZONE 'utc')::date)
        END
      ELSE NULL
    END
  FROM notifications n
  WHERE n.id = ANY(p_ids)
    AND n.user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_inbox_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_status(uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.notification_fields(text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.extract_notification_fields() FROM PUBLIC, anon, authenticated;
