-- Admin web control panel, phase 0: minimal audit trail for privileged
-- admin actions. v1 scope is deliberately narrow: only mutating admin RPCs
-- write here (admin_grant_role in the next migrations; tournament CRUD
-- RPCs later). Direct-table admin writes (weekly challenges, exercise
-- library) are not audited yet — they can be folded in when/if those
-- writes move behind RPCs.
CREATE TABLE public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Deliberately no FK to profiles: audit rows must survive account
  -- deletion (delete-user-account edge function removes the auth user and
  -- cascades the profile) — a dangling uuid here is a feature, not a bug.
  actor_id uuid NOT NULL,
  action text NOT NULL,        -- e.g. 'grant_role', 'revoke_role'
  target text,                 -- e.g. affected user id / table+row id
  detail jsonb,                -- action-specific payload
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Same defense-in-depth as communities (20260710140000): Supabase's
-- project-level default privileges grant full CRUD on new tables to
-- anon+authenticated — revoke the raw privilege instead of relying solely
-- on RLS to catch it. Admins read via the SELECT grant + policy below.
-- Nothing gets INSERT/UPDATE/DELETE: rows are written only from
-- SECURITY DEFINER functions, which run as the table owner (postgres) and
-- bypass both grants and RLS. The log is append-only by construction —
-- no client-reachable path can alter or delete a row.
REVOKE ALL ON TABLE public.admin_audit_log FROM anon;
REVOKE ALL ON TABLE public.admin_audit_log FROM authenticated;
GRANT SELECT ON TABLE public.admin_audit_log TO authenticated;

CREATE POLICY "Admins read audit log"
  ON public.admin_audit_log
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE INDEX idx_admin_audit_log_created_at
  ON public.admin_audit_log USING btree (created_at DESC);
