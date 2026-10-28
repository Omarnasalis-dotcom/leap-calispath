-- The newest version in each store, for Profile's dismissible "update
-- available" card (minimum_version stays the hard block). Null = no card.
-- Set it per platform once a release is live in that store, e.g.:
--   UPDATE public.app_config SET latest_version = '1.2.16' WHERE platform = 'ios';
ALTER TABLE IF EXISTS public.app_config
  ADD COLUMN IF NOT EXISTS latest_version text
  CHECK (latest_version IS NULL OR latest_version ~ '^[0-9]+(\.[0-9]+){0,3}$');
