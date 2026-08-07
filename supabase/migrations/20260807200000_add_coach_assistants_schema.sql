-- Delegated coach access: a coach can grant a member of their own community
-- scoped working access to their clients/templates/exercise library,
-- without that person becoming an independent coach.
--
-- Deliberately NOT modeled as is_coach = true on the assistant — is_coach is
-- a global, admin-managed privilege flag (gates the mobile Coaching Hub,
-- counts toward admin dashboard "coaches" stats, lets someone independently
-- build their own community/roster). Letting a coach grant that via "make my
-- client my assistant" would be a real privilege-escalation shortcut, not
-- just an implementation convenience. This is a separate, narrower
-- relationship instead.
--
-- No INSERT policy: rows are only ever created by assign_coach_assistant()
-- (a SECURITY DEFINER RPC, runs as the function owner and so isn't subject
-- to RLS on its own writes), since granting has a business rule — the
-- target must currently be in the coach's own community — that's worth a
-- real error message rather than a generic RLS-violation failure.
create table "public"."coach_assistants" (
  "id" uuid not null default gen_random_uuid(),
  "coach_id" uuid not null references public.profiles(id) on delete cascade,
  "assistant_id" uuid not null references public.profiles(id) on delete cascade,
  "created_at" timestamptz not null default now(),
  constraint "coach_assistants_pkey" primary key ("id"),
  constraint "coach_assistants_unique" unique ("coach_id", "assistant_id")
);

create index idx_coach_assistants_coach_id on public.coach_assistants(coach_id);
create index idx_coach_assistants_assistant_id on public.coach_assistants(assistant_id);

alter table "public"."coach_assistants" enable row level security;

create policy "Coach or assistant can view the relationship"
  on "public"."coach_assistants" as permissive for select to public
  using (coach_id = auth.uid() or assistant_id = auth.uid());

create policy "Coach or assistant can remove the relationship"
  on "public"."coach_assistants" as permissive for delete to public
  using (coach_id = auth.uid() or assistant_id = auth.uid());

create policy "Admin manages all assistant relationships"
  on "public"."coach_assistants" as permissive for all to public
  using (public.is_admin());

grant select, delete on table "public"."coach_assistants" to "authenticated";

-- Mirrors public.is_admin() / public.is_coaching_paused() exactly.
create or replace function public.is_assistant_for(p_coach_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from coach_assistants where coach_id = p_coach_id and assistant_id = p_uid
  );
$$;

revoke execute on function public.is_assistant_for(uuid, uuid) from public;
revoke execute on function public.is_assistant_for(uuid, uuid) from anon;
grant execute on function public.is_assistant_for(uuid, uuid) to authenticated;

-- Admin-web's route-access gate: broader than is_coach alone, without
-- changing what is_coach itself means or gates anywhere else.
create or replace function public.has_coaching_access(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    exists (select 1 from profiles where id = p_uid and is_coach = true)
    or exists (select 1 from coach_assistants where assistant_id = p_uid);
$$;

revoke execute on function public.has_coaching_access(uuid) from public;
revoke execute on function public.has_coaching_access(uuid) from anon;
grant execute on function public.has_coaching_access(uuid) to authenticated;
