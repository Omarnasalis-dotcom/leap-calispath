-- "New Week Unlocked!" in the reader's language (2026-11-20).
--
-- notification_fields() read the coach's name and program out of "New
-- Program Assigned!" but not "New Week Unlocked!", so the Notifications
-- screen could only show that one as the text it was saved with: English for
-- everyone whose app was in English when the coach published the week, even
-- after switching to Arabic. It now also reads the week number and program
-- name ("Week 7 of "Foundation" is now available." or its Arabic), so the app
-- writes the line in the language it's showing. notify-client-program-update
-- also sends these fields itself from now on; this covers the rows already
-- written (last 60 days, filled once below) and any other sender.
--
-- The name goes in week_program, not program_name: app 1.2.20 shows any
-- program_name as "New program: …", and ignores a field it doesn't know.
-- Everything else is unchanged from 20261119100000.

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
    m := regexp_match(p_body, '^Week (\d+) of "(.*)" is now available\.$');
    IF m IS NULL THEN
      m := regexp_match(p_body, '^الأسبوع (\d+) من «(.*)» متاح الآن\.$');
    END IF;
    IF m IS NOT NULL THEN
      RETURN jsonb_build_object('week', m[1]::int, 'week_program', translate(m[2], iso, ''));
    END IF;
    RETURN out;
  END IF;

  RETURN out;
EXCEPTION WHEN OTHERS THEN
  RETURN '{}'::jsonb;
END;
$function$;

REVOKE ALL ON FUNCTION public.notification_fields(text, text, jsonb) FROM PUBLIC, anon, authenticated;

-- The "New Week Unlocked!" rows the Notifications screen can still show.
UPDATE public.notifications n
SET data = f.extra || coalesce(n.data, '{}'::jsonb)
FROM (
  SELECT id, public.notification_fields(type, body, data) AS extra
  FROM public.notifications
  WHERE created_at > now() - interval '60 days'
    AND type = 'client_program_update'
    AND NOT (coalesce(data, '{}'::jsonb) ? 'week')
) f
WHERE n.id = f.id AND f.extra <> '{}'::jsonb;
