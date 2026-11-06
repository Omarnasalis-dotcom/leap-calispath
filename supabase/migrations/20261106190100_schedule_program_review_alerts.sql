-- Hourly, same mechanism as the reminder crons. Only ever reaches admins, and
-- each review alerts once (program_reviews.overdue_alerted_at).
select cron.schedule(
  'alert-overdue-program-reviews',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://vxscvluyskawegmwaxnh.supabase.co/functions/v1/notify-program-review',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
