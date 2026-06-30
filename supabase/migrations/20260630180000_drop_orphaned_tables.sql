-- statics_assessments: defined with columns (handstand_variant,
-- front_lever_hold, etc.) and self-only RLS, but zero references anywhere
-- in client code or RPCs. Leftover from an earlier design that used a
-- dedicated Static assessment step; superseded by the simpler PB-tracking
-- static_holds model. Safe to drop — nothing reads or writes to it.
DROP TABLE IF EXISTS "public"."statics_assessments";

-- one_mm_scores: defined with its own columns and RLS policies, but zero
-- client or RPC code references it. Every actual 1MM log goes through
-- one_min_max_logs instead. Same "orphaned from earlier design" shape.
DROP TABLE IF EXISTS "public"."one_mm_scores";
