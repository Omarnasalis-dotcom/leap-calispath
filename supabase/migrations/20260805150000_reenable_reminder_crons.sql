-- Re-enables the 3 reminder cron jobs after the 2026-08-05 incident
-- (see 20260805140000_fix_weekly_challenge_pending_recency_bound.sql for
-- the root-cause fix). They were unscheduled via an ad-hoc query against
-- prod during containment, not through a migration, so this also brings
-- migration history back in sync with actual state — a fresh `db reset`
-- replaying history from scratch should end up scheduled, same as prod is
-- about to be.
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
