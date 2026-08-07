-- Schedules the 3 reminder Edge Functions on pg_cron, dispatched via
-- pg_net. All three run hourly (on the hour) — the daily reminder needs
-- that granularity to catch each user's own 19:00 local hour, and the two
-- weekly-challenge jobs piggyback on the same cadence since their own
-- dedup columns (started_notification_sent_at / ending_reminder_sent_at)
-- make an extra tick harmless, just a no-op.
--
-- The shared x-cron-secret header value is intentionally NOT in this file —
-- it's pulled from Supabase Vault by name at call time (vault.create_secret
-- run once, out of band, against each environment; see project notes).
-- Committing the literal secret here would put it in git history.
select cron.schedule(
  'send-daily-workout-reminders',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://vxscvluyskawegmwaxnh.supabase.co/functions/v1/send-daily-workout-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'send-weekly-challenge-started',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://vxscvluyskawegmwaxnh.supabase.co/functions/v1/send-weekly-challenge-started',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'send-weekly-challenge-ending-reminder',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://vxscvluyskawegmwaxnh.supabase.co/functions/v1/send-weekly-challenge-ending-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
