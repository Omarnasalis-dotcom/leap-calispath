-- Per-platform switch for the welcome offer screen (src/lib/offerPrompt.ts):
-- the screen after the first assessment, after the free program, and the
-- Profile banner. Off by default; turn it on after the device test.
-- Readable like the other app_config flags (table-level SELECT).
ALTER TABLE IF EXISTS public.app_config
  ADD COLUMN IF NOT EXISTS first_time_offer_enabled boolean NOT NULL DEFAULT false;
