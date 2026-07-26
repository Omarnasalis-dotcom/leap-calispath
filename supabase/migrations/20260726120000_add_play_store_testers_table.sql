-- Email signups for Android closed testing, collected from the leap-arena.com landing page
-- popup (shown in place of a dead Play Store link until the app has a public Play listing).
-- Rows are triaged manually today: an admin adds each pending email as a Play Console closed
-- tester and flips status to 'invited'. No automated invite email is sent by this migration.

create table "public"."play_store_testers" (
  "id" uuid not null default gen_random_uuid(),
  "email" text not null,
  "status" text not null default 'pending',
  "created_at" timestamp with time zone not null default now()
);

alter table "public"."play_store_testers" enable row level security;

alter table "public"."play_store_testers"
  add constraint "play_store_testers_pkey" primary key ("id");

alter table "public"."play_store_testers"
  add constraint "play_store_testers_email_key" unique ("email");

alter table "public"."play_store_testers"
  add constraint "play_store_testers_status_check"
  check (status = any (array['pending'::text, 'invited'::text]));

create index idx_play_store_testers_status on public.play_store_testers using btree (status);

-- Minimal grants: anon may only INSERT (the public signup form). Unlike the legacy
-- invite_requests table, anon gets no SELECT/UPDATE/DELETE/TRUNCATE grant at all here --
-- RLS would block those anyway, but there's no reason to carry the inert privilege bits.
grant insert on table "public"."play_store_testers" to "anon";

grant select, insert, update, delete on table "public"."play_store_testers" to "authenticated";
grant select, insert, update, delete on table "public"."play_store_testers" to "service_role";

create policy "Anyone can sign up for Play Store testing"
  on "public"."play_store_testers"
  as permissive
  for insert
  to public
  with check (true);

create policy "Admins manage Play Store testers"
  on "public"."play_store_testers"
  as permissive
  for all
  to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin = true
  ));
