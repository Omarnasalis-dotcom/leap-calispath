-- Cost-control log for the AI Coach's Claude API calls — real dollars per
-- call, unlike every other rate-limited action in this app so far. Two-layer
-- enforcement is planned to mirror submit-trial-result's cooldown pattern: a
-- fast pre-check in the ai-coach Edge Function, and an authoritative check
-- here in the DB before any expensive/write action actually runs, so a
-- client can't bypass the edge function's limit by calling a write RPC
-- directly. This migration only adds the log table itself; the RPCs that
-- read/enforce against it land with the rest of Phase 3.
--
-- No INSERT/UPDATE/DELETE policy — writes only ever happen from the
-- ai-coach Edge Function via the service-role key (bypasses RLS entirely),
-- same "SELECT-only policy, RPC-only writes" pattern already used for
-- trial_history/static_holds/one_min_max_logs.
CREATE TABLE public.ai_coach_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'create_program', 'append_week')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_coach_requests_user_id_created_at_idx
  ON public.ai_coach_requests (user_id, created_at DESC);

ALTER TABLE public.ai_coach_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own AI coach request log"
  ON public.ai_coach_requests
  FOR SELECT
  USING (auth.uid() = user_id);
