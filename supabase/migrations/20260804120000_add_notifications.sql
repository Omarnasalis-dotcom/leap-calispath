-- Real push notifications. The client already collects and stores an Expo
-- push token on every login (AuthContext.registerPushToken → profiles.push_token)
-- but nothing has ever read it — there was no server-side send path. This adds
-- the in-app notification log/inbox, per-type opt-out preferences, and the
-- RPC that both records a notification and enforces who's allowed to create
-- one for whom.

create table "public"."notifications" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid not null references public.profiles(id) on delete cascade,
  "type" text not null,
  "title" text not null,
  "body" text not null,
  "data" jsonb not null default '{}'::jsonb,
  "read_at" timestamptz,
  "push_sent_at" timestamptz,
  "push_error" text,
  "created_at" timestamptz not null default now(),
  constraint "notifications_pkey" primary key ("id")
);

create index "notifications_user_id_created_at_idx"
  on "public"."notifications" ("user_id", "created_at" desc);

alter table "public"."notifications" enable row level security;

-- Reads/marking-read are direct table operations; creation is not (see
-- create_notification below) — mirrors the arena_attempts split between
-- RPC-gated writes and RLS-scoped reads.
create policy "Users can read own notifications"
  on "public"."notifications" as permissive for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can mark own notifications read"
  on "public"."notifications" as permissive for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on table "public"."notifications" to "authenticated";
grant select, insert, update, delete on table "public"."notifications" to "service_role";
revoke insert, delete on table "public"."notifications" from "authenticated";
revoke all on table "public"."notifications" from "anon";

create table "public"."notification_preferences" (
  "user_id" uuid not null references public.profiles(id) on delete cascade,
  "prefs" jsonb not null default '{}'::jsonb,
  "updated_at" timestamptz not null default now(),
  constraint "notification_preferences_pkey" primary key ("user_id")
);

alter table "public"."notification_preferences" enable row level security;

create policy "Users can read own notification preferences"
  on "public"."notification_preferences" as permissive for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can upsert own notification preferences"
  on "public"."notification_preferences" as permissive for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own notification preferences"
  on "public"."notification_preferences" as permissive for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on table "public"."notification_preferences" to "authenticated";
grant select, insert, update, delete on table "public"."notification_preferences" to "service_role";
revoke all on table "public"."notification_preferences" from "anon";

-- Single write path for notifications. MVP only permits self-notifications
-- (auth.uid() = p_user_id) — every trigger that ships in phase 1 (tier
-- promotion) fires from the recipient's own authenticated session. Coach- or
-- system-initiated notifications to a *different* user (program assigned,
-- arena challenge) need real authorization logic here before that trigger
-- ships — extend the IF below rather than relaxing it to "any authenticated
-- caller", which would let any user spam-notify any other user.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_enabled boolean;
  v_notification_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  IF v_caller <> p_user_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT (prefs->>p_type)::boolean INTO v_enabled
  FROM public.notification_preferences
  WHERE user_id = p_user_id;

  -- No row, or the type isn't in the jsonb yet, means "not opted out" —
  -- preferences are recorded lazily, only when a user actually flips a
  -- toggle, not backfilled for every existing user.
  IF v_enabled IS FALSE THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, p_data)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) TO authenticated;
