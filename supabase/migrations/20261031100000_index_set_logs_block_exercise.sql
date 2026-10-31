-- Index workout_set_logs.block_exercise_id (2026-10-31 DB health check).
-- The FK is ON DELETE SET NULL with no index, so every deleted block_exercise
-- (AI Coach day/week rebuilds, template saves) made Postgres seq-scan all set
-- logs app-wide: 68,564 deletes vs 67,691 seq scans since the stats reset.
-- No behavior change. lock_timeout makes the build fail cleanly instead of
-- queueing set-log writes behind a long transaction; just re-run it.

SET lock_timeout = '3s';

CREATE INDEX IF NOT EXISTS workout_set_logs_block_exercise_id_idx
  ON public.workout_set_logs (block_exercise_id);

RESET lock_timeout;
