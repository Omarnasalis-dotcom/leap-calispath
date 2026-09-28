-- Arabic push notifications (audit M16).
--
-- 1. profiles.language: the language the app is running in, written by the
--    app itself on every profile load (AuthContext). Own-row only, like
--    training_days_per_week: get_my_profile() is `SELECT *`, so no column
--    grant is needed, and it isn't in guard_profile_protected_fields' list.
--
-- 2. localize_notification: a BEFORE INSERT trigger that rewrites the
--    athlete-facing notifications the server writes in English into Arabic
--    when the recipient's language is 'ar'. One place for all of them, so
--    the big submit_* RPCs (overtake alerts) and the Edge Functions (daily
--    reminder, weekly challenge, program update) keep writing English.
--    The stored row is what gets pushed, so the inbox and the push agree.
--    It matches on type + the exact English wording; if that wording ever
--    changes and stops matching, the notification simply stays English.
--    Notifications the app writes for the user's own achievements
--    (create_notification) are already in the app's language and don't
--    match any pattern. Coach and admin notifications stay English, like
--    the coach screens.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'
    CHECK (language IN ('en', 'ar'));

CREATE OR REPLACE FUNCTION public.localize_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Bidi isolates keep a Latin name or title from flipping the Arabic
  -- sentence around it (same as ltr() in the app).
  fsi CONSTANT text := E'⁨';
  pdi CONSTANT text := E'⁩';
  m text[];
  who text;
  board text;
BEGIN
  IF (SELECT language FROM profiles WHERE id = NEW.user_id) IS DISTINCT FROM 'ar' THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'leaderboard_overtaken' THEN
    m := regexp_match(NEW.body, '^(.*) just beat your time in Tier (\d+)\. Defend your spot!$');
    IF m IS NOT NULL THEN
      who := CASE WHEN m[1] = 'Someone' THEN 'أحد المنافسين' ELSE fsi || m[1] || pdi END;
      NEW.title := 'تم تجاوزك!';
      NEW.body := format('تفوّق %s للتو على وقتك في المستوى %s. دافع عن مركزك!', who, m[2]);
      RETURN NEW;
    END IF;

    m := regexp_match(NEW.body, '^(.*) just beat your score on the (.*) leaderboard\. Defend your spot!$');
    IF m IS NOT NULL THEN
      board := CASE m[2]
        WHEN 'Power World' THEN 'عالم الطاقة'
        WHEN 'Static World' THEN 'عالم الثبات'
        WHEN '1MM' THEN 'عالم التحمّل'
        WHEN 'Well-Rounded' THEN 'الرياضي المتكامل'
      END;
      IF board IS NOT NULL THEN
        who := CASE WHEN m[1] = 'Someone' THEN 'أحد المنافسين' ELSE fsi || m[1] || pdi END;
        NEW.title := 'تم تجاوزك!';
        NEW.body := format('تفوّق %s للتو على نتيجتك في لوحة صدارة %s. دافع عن مركزك!', who, board);
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.title = 'Time to Train!' THEN
    m := regexp_match(NEW.body, '^(.*), you haven''t trained today');
    IF m IS NOT NULL THEN
      NEW.title := 'حان وقت التدريب!';
      NEW.body := CASE WHEN m[1] = 'Warrior'
        THEN 'لم تتدرّب اليوم بعد — ابدأ قبل أن ينتهي اليوم.'
        ELSE format('لم تتدرّب اليوم بعد يا %s — ابدأ قبل أن ينتهي اليوم.', fsi || m[1] || pdi)
      END;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.title = 'New Challenge Started!' THEN
    m := regexp_match(NEW.body, '^"(.*)" is live this week');
    IF m IS NOT NULL THEN
      NEW.title := 'بدأ تحدٍّ جديد!';
      NEW.body := format('التحدي «%s» متاح هذا الأسبوع — سجّل نتيجتك في لوحة الصدارة.', fsi || m[1] || pdi);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.title = 'Last Chance This Week!' THEN
    m := regexp_match(NEW.body, '^You haven''t completed "(.*)" yet');
    IF m IS NOT NULL THEN
      NEW.title := 'الفرصة الأخيرة هذا الأسبوع!';
      NEW.body := format('لم تُكمل «%s» بعد — الأسبوع يوشك على الانتهاء.', fsi || m[1] || pdi);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.title = 'New Program Assigned!' THEN
    m := regexp_match(NEW.body, '^(.*) assigned you a new program: "(.*)"\.$');
    IF m IS NOT NULL THEN
      NEW.title := 'برنامج جديد لك!';
      NEW.body := format('عيّن لك %s برنامجًا جديدًا: «%s».', fsi || m[1] || pdi, fsi || m[2] || pdi);
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.title = 'New Week Unlocked!' THEN
    m := regexp_match(NEW.body, '^Week (\d+) of "(.*)" is now available\.$');
    IF m IS NOT NULL THEN
      NEW.title := 'أسبوع جديد متاح!';
      NEW.body := format('الأسبوع %s من «%s» متاح الآن.', m[1], fsi || m[2] || pdi);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
-- This runs inside the score-submission RPCs: a translation problem must
-- never fail the insert (or the submission), only leave it in English.
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.localize_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS localize_notification ON public.notifications;
CREATE TRIGGER localize_notification
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.localize_notification();
