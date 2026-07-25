-- Re-enforces the column-level SELECT restriction on public.profiles that
-- 20260630190000_lock_down_profiles_pii_columns.sql originally put in place.
--
-- Timeline: 20260630190000 revoked table-wide SELECT from authenticated and
-- replaced it with an explicit safe-column GRANT (display_name, tiers,
-- scores, country, gender, etc.) so cross-user reads (leaderboards,
-- coaching) keep working while email/push_token/timezone/first_name/
-- last_name stay hidden from other users. That broke TestFlight 1.0.1,
-- which called from('profiles').select('*') directly — PostgREST expands
-- select=* to every column, and Postgres rejected the query outright because
-- authenticated no longer had table-level SELECT. 20260701000000
-- emergency-restored `GRANT SELECT ON TABLE public.profiles TO authenticated`
-- as a stopgap, which re-opened cross-user reads of the PII columns the
-- earlier migration was written to close, with an explicit note to
-- re-restrict once no deployed binary still needs table-wide SELECT.
--
-- TestFlight 1.0.1 is now confirmed retired by the product owner — no
-- shipped build depends on select('*') against profiles anymore (the app's
-- own cross-user reads all use explicit safe-column lists or the
-- get_my_profile() SECURITY DEFINER RPC for own-row reads). This migration
-- supersedes 20260701000000_restore_authenticated_profiles_select.sql:
-- pulling the table-wide grant back out leaves the column-level grants from
-- 20260630190000 (and the later per-column grants, e.g. community_id in
-- 20260710140100_add_profiles_community_id.sql) as the only SELECT path for
-- authenticated, restoring the original intended steady-state.
--
-- IMPORTANT (found via local empirical testing, not obvious from the docs):
-- in PostgreSQL, `REVOKE <priv> ON TABLE ... FROM <role>` for a privilege
-- type that can also be granted at the column level (SELECT, INSERT,
-- UPDATE, REFERENCES) does NOT only remove the table-wide ACL entry — it
-- also strips every existing column-level grant of that same privilege for
-- that role, even ones granted independently and earlier (e.g. by
-- 20260630190000 and 20260710140100). Verified on a throwaway scratch table
-- reproducing the exact grant/revoke order profiles went through
-- (column-grant, then table-grant, then table-revoke): the column-level
-- entries were wiped, not just the table-level one. A bare REVOKE here would
-- therefore not just close the PII leak — it would also break every
-- legitimate cross-user read (leaderboards, coaching, community, clash
-- matchmaking), which is why the safe column list is re-granted immediately
-- below, in the same migration/transaction, right after the revoke.
REVOKE SELECT ON TABLE public.profiles FROM authenticated;

-- Restore the safe-column-only SELECT grant that the REVOKE above just wiped.
-- This is exactly the column list from 20260630190000_lock_down_profiles_pii_columns.sql
-- plus community_id, added later by 20260710140100_add_profiles_community_id.sql.
-- Deliberately omitted (never read cross-user): email, push_token, timezone,
-- first_name, last_name — own-row reads of those go through get_my_profile().
GRANT SELECT (
  id, display_name, strength_tier, power_tier, statics_tier,
  glory_score, streak, last_active, assessed_at, assessment_locked_until,
  power_assessed_at, statics_assessed_at, best_times, trials_attempted,
  trials_passed, is_public, updated_at, power_pbs, power_points,
  is_admin, is_searching_clash, tournament_gp, clash_win_streak,
  one_mm_points, one_mm_rank, coach_beta_access, access_granted_at,
  access_expires_at, invite_code_used, is_coach, coach_id, gender, country,
  community_id
) ON TABLE public.profiles TO authenticated;
