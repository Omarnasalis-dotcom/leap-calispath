-- workout_logs is the highest-volume table in the app — one row per logged
-- block, growing continuously with normal usage (unlike program_templates/
-- warrior_programs, which only grow with new assignments). It had zero
-- indexes beyond its primary key, despite warrior_id/warrior_program_id/
-- block_id being hit on every read: ProgressTrackingScreen's per-warrior
-- fetch, WarriorProgramScreen's "logged today" check, the RLS policies on
-- this table and program_blocks that subquery it, and every delete/append/
-- overwrite RPC that clears logs for a specific assignment. Purely
-- additive: no data, no query behavior, no RLS/permission changes.
CREATE INDEX IF NOT EXISTS idx_workout_logs_warrior_id ON public.workout_logs USING btree (warrior_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_warrior_program_id ON public.workout_logs USING btree (warrior_program_id);
CREATE INDEX IF NOT EXISTS idx_workout_logs_block_id ON public.workout_logs USING btree (block_id);
