-- Free-tier AI Coach intake stepper (Goal/Equipment recap -> Days/Week ->
-- Create Your Program -> paywall) needs to persist "days per week" so it's
-- answered once instead of asked fresh every AI Coach session — see
-- system-prompt.ts's own header comment, which already flagged this as a
-- known gap ("days per week is never persisted").
--
-- No column-grant change needed: get_my_profile() is `SELECT *`,
-- SECURITY DEFINER, scoped to the caller's own row (see
-- 20260630190000_lock_down_profiles_pii_columns.sql), so it already returns
-- this column — same precedent as assessment_raw
-- (20260823050000_persist_initial_assessment_raw.sql). Own-row-only by
-- design, not added to any cross-user column-grant list.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS training_days_per_week smallint
    CHECK (training_days_per_week BETWEEN 1 AND 7);
