-- admin_grant_access (20260816100000) and admin_revoke_access (20260818100000)
-- were both created without the standard REVOKE-then-GRANT checklist step
-- every other admin RPC in this codebase follows, so Postgres left EXECUTE
-- open to PUBLIC/anon by default. Both functions already gate on is_admin()
-- (which correctly resolves to false for an anon caller, since auth.uid()
-- is NULL), so this was never actually exploitable — this closes the gap
-- for defense-in-depth consistency with the rest of the admin surface.
REVOKE EXECUTE ON FUNCTION public.admin_grant_access(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_grant_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_access(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_revoke_access(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_access(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_access(uuid) TO authenticated;
