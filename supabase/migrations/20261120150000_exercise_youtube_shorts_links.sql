-- YouTube Shorts links don't play in the app (owner report 2026-11-20:
-- "Muscle Up band-assisted" demo). InlineVideoPlayer reads the video id from
-- youtu.be/, watch?v= and embed/ links only, so a youtube.com/shorts/<id>
-- link gives no id and no video. 19 of the 245 library links were Shorts,
-- including Lat Stretch SH Opener in most cool-downs.
--
-- The same video plays from https://youtu.be/<id> in every app version
-- already installed, so this rewrites the links instead of waiting for an
-- app build. A trigger does the same for any link saved later (admin-web,
-- the app's exercise library, CSV import), so it can't come back.
-- All 19 ids were checked: 11 characters, live, embedding allowed.

CREATE OR REPLACE FUNCTION public.normalize_youtube_url(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_url ~* '^\s*(https?://)?([a-z0-9-]+\.)?youtube\.com/shorts/[A-Za-z0-9_-]{11}([^A-Za-z0-9_-]|$)'
      THEN 'https://youtu.be/' || substring(p_url FROM '(?i)/shorts/([A-Za-z0-9_-]{11})')
    ELSE p_url
  END;
$function$;

CREATE OR REPLACE FUNCTION public.exercise_library_normalize_youtube_url()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.youtube_url := public.normalize_youtube_url(NEW.youtube_url);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS normalize_youtube_url ON public.exercise_library;
CREATE TRIGGER normalize_youtube_url
  BEFORE INSERT OR UPDATE OF youtube_url ON public.exercise_library
  FOR EACH ROW EXECUTE FUNCTION public.exercise_library_normalize_youtube_url();

-- The 19 existing Shorts links.
UPDATE public.exercise_library
SET youtube_url = public.normalize_youtube_url(youtube_url)
WHERE youtube_url IS DISTINCT FROM public.normalize_youtube_url(youtube_url);
