-- 20260714120000_add_pb_force_overwrite.sql added a p_force parameter to
-- submit_static_hold, submit_power_assessment, and submit_onemm_log via
-- CREATE OR REPLACE FUNCTION — but a changed parameter list is a new
-- overload, not a replacement (the same pitfall 20260710180000's comment
-- warns about), so the old pre-p_force signatures were left behind
-- alongside the new ones instead of being superseded. With both present,
-- PostgREST can't reliably resolve which overload a client call should hit.
-- Drop the stale old-signature overloads; the new p_force-accepting ones
-- (already created) are the only ones left.
DROP FUNCTION IF EXISTS public.submit_static_hold(text, numeric);
DROP FUNCTION IF EXISTS public.submit_power_assessment(numeric, numeric, numeric, numeric);
DROP FUNCTION IF EXISTS public.submit_onemm_log(text, integer);
