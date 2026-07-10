-- Community feature, phase 1: any signed-in user can create a named
-- community with a join code; other users join with that code and get a
-- "my community" filter on the leaderboards (added in later migrations).
-- See the audited plan for full context and precedent citations.
--
-- join_code must never be directly SELECT-able — it's a private invite
-- code, not public data. RLS alone can't express "this row is readable,
-- but only some of its columns" (that's a per-row model), so this uses the
-- same column-level GRANT lockdown already established for profiles' PII
-- columns (20260630190000_lock_down_profiles_pii_columns.sql): row-level
-- access stays open, but join_code is simply never in the granted column
-- list. It's only ever read inside the SECURITY DEFINER join_community
-- RPC (added in a later migration), never via a direct table SELECT.
CREATE TABLE "public"."communities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "join_code" text NOT NULL,
  "created_by" uuid NOT NULL REFERENCES public.profiles(id),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  UNIQUE ("name"),
  UNIQUE ("join_code")
);

ALTER TABLE "public"."communities" ENABLE ROW LEVEL SECURITY;

-- Supabase grants every new public-schema table full CRUD to anon AND
-- authenticated by default (project-level ALTER DEFAULT PRIVILEGES,
-- confirmed via pg_default_acl — not something any migration in this repo
-- sets). Without an explicit REVOKE here, the column-level SELECT lockdown
-- below is silently ineffective: the ambient table-wide default grant lets
-- join_code through regardless of which columns are explicitly granted.
-- anon gets no RLS policy on this table at all (every policy below is
-- `TO authenticated`), so RLS alone would already block it — this REVOKE
-- is defense in depth, removing the unused raw privilege rather than
-- relying solely on RLS to catch it.
REVOKE ALL ON TABLE "public"."communities" FROM "anon";
REVOKE ALL ON TABLE "public"."communities" FROM "authenticated";

-- Any authenticated user can create a community, only as themselves.
GRANT INSERT ON TABLE "public"."communities" TO "authenticated";

CREATE POLICY "Authenticated users can create communities"
  ON "public"."communities"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- Row-level: any authenticated user can read any community (needed to
-- resolve "my community's name" for the leaderboard filter pill, and this
-- isn't sensitive data on its own). Column-level GRANT below is what
-- actually keeps join_code private.
CREATE POLICY "Authenticated users can view communities"
  ON "public"."communities"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT (id, name, created_by, created_at) ON TABLE "public"."communities" TO "authenticated";
