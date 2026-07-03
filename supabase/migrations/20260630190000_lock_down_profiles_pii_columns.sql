-- profiles exposed PII (email/push_token/first_name/last_name/timezone) to
-- anyone with the anon key — even unauthenticated — via a `to public
-- using(true)` SELECT policy plus table-wide SELECT grants. Cross-user readers
-- (leaderboards, coaching) only ever need display_name/tiers/scores/country/
-- gender, so we deny access to the 5 sensitive columns at the COLUMN level
-- instead of locking rows (which would break coaching's legitimate cross-user
-- reads). Own-row full reads move to get_my_profile() (SECURITY DEFINER).

-- 1. Remove the unauthenticated row policy. After this, anon has no SELECT
--    path to profiles at all. "Warriors can view all profiles" (authenticated,
--    using(true)) stays — column grants below do the real enforcement.
drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

-- 2. Replace table-wide SELECT with safe-column-only SELECT.
revoke select on table public.profiles from anon;
revoke select on table public.profiles from authenticated;

grant select (
  id, display_name, strength_tier, power_tier, statics_tier,
  glory_score, streak, last_active, assessed_at, assessment_locked_until,
  power_assessed_at, statics_assessed_at, best_times, trials_attempted,
  trials_passed, is_public, updated_at, power_pbs, power_points,
  is_admin, is_searching_clash, tournament_gp, clash_win_streak,
  one_mm_points, one_mm_rank, coach_beta_access, access_granted_at,
  access_expires_at, invite_code_used, is_coach, coach_id, gender, country
) on table public.profiles to authenticated;
-- Deliberately omitted (never read cross-user): email, push_token, timezone,
-- first_name, last_name.

-- 3. Own-row full reads (need the omitted columns) go through a definer RPC.
--    Owner bypasses the column grant; the WHERE clause limits it to the caller.
create or replace function public.get_my_profile()
returns setof public.profiles
language sql
security definer
set search_path = ''
as $$
  select * from public.profiles where id = auth.uid();
$$;
