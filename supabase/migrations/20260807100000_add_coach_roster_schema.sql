-- Foundation for scoped coach access to admin-web: a coach's community
-- (repurposed, not a new concept — see communities/profiles.community_id)
-- becomes their client roster, and admin can pause a coach's write access
-- without touching their data.
--
-- coaching_paused_at is deliberately a separate column from is_coach rather
-- than reusing/flipping is_coach itself — is_coach already has unrelated
-- meanings elsewhere (exercise_library insert rights, nav visibility, admin
-- dashboard "coach count" stats), so pausing must not change what those see.
alter table "public"."profiles"
  add column "coaching_paused_at" timestamptz,
  add column "coaching_paused_reason" text;

-- Set when a client leaves the assigning coach's community while their
-- assignment is still active (see the trigger added in a later migration).
-- Never auto-clears the assignment itself — this is purely a visibility flag
-- for the coach's client list, so they know a decision (keep vs. remove) is
-- worth making, without anything being silently deleted.
alter table "public"."warrior_programs"
  add column "community_left_at" timestamptz;

-- Mirrors public.is_admin() exactly (supabase/migrations/20260719120000_add_is_admin_helper.sql).
create or replace function public.is_coaching_paused(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from profiles where id = uid and coaching_paused_at is not null
  );
$$;

revoke execute on function public.is_coaching_paused(uuid) from public;
revoke execute on function public.is_coaching_paused(uuid) from anon;
grant execute on function public.is_coaching_paused(uuid) to authenticated;
