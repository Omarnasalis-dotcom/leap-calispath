-- The original ai_coach_requests CHECK constraint (20260821172000) only
-- allowed ('chat', 'create_program', 'append_week') — 'adjust_program' was
-- decided later (Phase 3 planning) and never added here, which would have
-- made every ai_coach_adjust_program call fail its own logging insert with
-- a constraint violation in production. Caught before adjust_program was
-- ever deployed/used, via local verification against a hand-written test
-- schema that (incorrectly) already included it — this migration brings
-- the real table in line with what ai_coach_adjust_program actually needs.
--
-- Drops whatever the actual CHECK constraint on `kind` is named (Postgres's
-- default auto-generated name wasn't confirmed against production — Docker
-- wasn't available locally to inspect it directly) rather than assuming a
-- specific name, so this can't silently no-op if the guess is wrong.
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.ai_coach_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%kind%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.ai_coach_requests DROP CONSTRAINT %I', v_constraint_name);
  END IF;

  ALTER TABLE public.ai_coach_requests ADD CONSTRAINT ai_coach_requests_kind_check
    CHECK (kind IN ('chat', 'create_program', 'append_week', 'adjust_program'));
END $$;
