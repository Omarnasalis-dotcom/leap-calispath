-- Goals & Equipment redesign -- multi-select goals (previously one, via
-- primary_goal) plus a free-text "Other" option. Purely additive, same
-- style as 20260908190000_add_milestone_lane_fields.sql: two new nullable
-- columns, no existing column touched. primary_goal/available_equipment
-- stay as-is (nothing outside GoalsEquipmentScreen/MilestoneLaneScreen
-- reads either, and no Edge Function consumes them) -- app code reads
-- goals/primary_goal together for backward compatibility with any already-
-- set legacy single-goal values, so no backfill is needed here either.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS goals text[],
  ADD COLUMN IF NOT EXISTS goal_other_text text;
