-- Schedules send-client-attention-alerts hourly, same cadence and dispatch
-- mechanism as the 3 existing reminder crons (20260805130000). An extra
-- hourly tick is harmless here too — get_clients_needing_attention()'s own
-- 7-day dedup (scoped per client, with a recency bound) prevents re-firing,
-- the same pattern already proven safe for the other three.
select cron.schedule(
  'send-client-attention-alerts',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://vxscvluyskawegmwaxnh.supabase.co/functions/v1/send-client-attention-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
