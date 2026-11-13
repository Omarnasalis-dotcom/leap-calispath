-- send-client-attention-alerts now calls get_coach_reminders_due()
-- (20261113120000). The old "never logged after 3 days" rule is covered by
-- its first pace checkpoint; nothing calls this any more.
DROP FUNCTION IF EXISTS public.get_clients_needing_attention();
