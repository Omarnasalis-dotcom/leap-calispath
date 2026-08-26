-- Rebuild plan Phase 8.6 (staged enable): the live iOS/Android store builds
-- don't yet carry the Coach entry point wired up on ProfileScreen (confirmed
-- with Omar — the UI shipped to app/coach.tsx exists in origin/main but not
-- in what's actually published), so flipping this on now has no real user
-- exposure yet. Left enabled globally rather than admin/coach-scoped since
-- there's no public-facing path to reach it regardless.
UPDATE public.app_config SET ai_coach_enabled = true;
