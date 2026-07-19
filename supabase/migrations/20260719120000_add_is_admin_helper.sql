-- Admin web control panel, phase 0: single source of truth for "is the
-- caller an admin". Every admin-facing policy and RPC added from here on
-- routes through this helper instead of inlining the profiles EXISTS
-- check, so a future roles/permissions table becomes a one-migration swap
-- (CREATE OR REPLACE of this function) instead of a policy audit.
--
-- SECURITY DEFINER for two reasons: (1) it must keep working after the
-- profiles PII column lockdown (20260630190000) is re-applied — a plain
-- INVOKER function would depend on the caller's column grants; (2) it can
-- be referenced safely from RLS policies on profiles itself without
-- recursive policy evaluation.
--
-- Deliberately NOT STRICT: a STRICT function returns NULL for a NULL uid,
-- and `IF NOT <null> THEN RAISE` silently skips the raise — a guard
-- bypass. EXISTS always yields true/false, never NULL, so callers can use
-- `IF NOT public.is_admin() THEN RAISE` directly.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = uid AND is_admin = true
  );
$$;

-- Supabase's project-level default privileges grant EXECUTE on new
-- functions to anon/authenticated/public. anon has no business calling
-- this (it can only ever return false for an anonymous caller, but the
-- surface shouldn't exist at all). authenticated keeps EXECUTE because
-- RLS policies evaluate the function as the querying user.
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
