-- "10 Min Core AMRAP" was imported with 3 intended exercises (per the
-- user's own original import JSON) but only 1 ("Hanging Knee Raises")
-- ever made it into the live block — "V-Ups" and "Russian Twist" don't
-- exactly match the real library spellings ("V- Ups" with a space before
-- the dash, "Russion Twist" misspelled) and were silently dropped.
-- Restoring the other two now, resolved to their real library names/ids,
-- matching the reps from the original import JSON.
--
-- This is one instance of a broader pattern found while investigating:
-- 18 blocks across the library have a suspiciously thin single exercise
-- where the workout's own description implies several movements —
-- flagged separately for the rest, not fixed here without a real source
-- of truth per block.
INSERT INTO public.standalone_workout_exercises (block_id, exercise_id, reps, order_index) VALUES
  ('d6413113-5387-467f-89cb-287953ec7d6f', 'e79ac465-bfca-4249-9c25-523e3c6c8ee1', 15, 1), -- V- Ups
  ('d6413113-5387-467f-89cb-287953ec7d6f', 'd7dd6ee6-4885-44fb-9cb5-09cdcc4011a3', 20, 2); -- Russion Twist
