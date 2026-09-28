-- Eternity (tier 9) trial hard floor: 10 min -> 7 min (owner decision
-- 2026-09-29). Also in src/constants/Progression.ts and the
-- submit-trial-result Edge Function; Champions Arena has its own floors.
UPDATE public.tier_hard_floors SET floor_seconds = 420 WHERE tier = 9;
