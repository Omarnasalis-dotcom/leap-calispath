-- Gate 1 continued: ai_coach_requests rows must survive account deletion
-- instead of vanishing via ON DELETE CASCADE, so a deleted-then-recreated
-- account restoring the same real subscription can have its usage history
-- reclaimed (next migration) rather than starting every counter at zero.
-- rc_original_transaction_id tags each row with the real subscription it
-- belongs to, so apply_revenuecat_entitlement knows which orphaned rows to
-- re-parent onto whichever account currently holds that subscription.
ALTER TABLE public.ai_coach_requests ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.ai_coach_requests DROP CONSTRAINT ai_coach_requests_user_id_fkey;

ALTER TABLE public.ai_coach_requests ADD CONSTRAINT ai_coach_requests_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.ai_coach_requests ADD COLUMN rc_original_transaction_id text;
