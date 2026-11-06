-- These helpers run inside the review functions, as their owner. On Supabase a
-- new public function is also granted to authenticated directly, so the
-- REVOKE FROM PUBLIC in 20261106190000 didn't reach it: a signed-in user could
-- call them, and _review_notify could write a notification to anyone.
REVOKE EXECUTE ON FUNCTION
  public._review_row(public.block_exercises),
  public._block_structure(text),
  public._program_week_snapshot(uuid, integer),
  public._cancel_stale_program_reviews(),
  public._review_notify(uuid, text, text, text, text, text, jsonb)
FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
