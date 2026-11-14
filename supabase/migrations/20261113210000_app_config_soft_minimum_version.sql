-- Two update levels (owner decision 2026-11-13):
--   minimum_version       below it: full-screen forced update (no way past).
--   soft_minimum_version  below it (but not below minimum_version): an
--                         "Update available" pop-up with a Later button,
--                         asked at most once a day. Null = no pop-up.
-- latest_version stays the small Profile update icon.
-- Only builds after 1.2.18 read soft_minimum_version; older apps ignore it.
-- Example:
--   UPDATE public.app_config SET soft_minimum_version = '1.2.19' WHERE platform IN ('ios','android');
ALTER TABLE IF EXISTS public.app_config
  ADD COLUMN IF NOT EXISTS soft_minimum_version text
  CHECK (soft_minimum_version IS NULL OR soft_minimum_version ~ '^[0-9]+(\.[0-9]+){0,3}$');
