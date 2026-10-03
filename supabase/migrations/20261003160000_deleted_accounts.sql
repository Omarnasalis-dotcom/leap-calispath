-- Deleted-account history (owner request 2026-10-03). Deleting an account
-- removed everything (auth user → profile, app_events… cascade) and left no
-- trace, so churn couldn't be measured. Each deletion now leaves one
-- ANONYMOUS row: no user id, email, name or username — only facts about the
-- account, plus the optional reason the user picked.
--
-- Flow (delete-user-account Edge Function, service role):
--   1. account_deletion_snapshot(user_id) → jsonb of the facts below
--   2. auth.admin.deleteUser(user_id)
--   3. insert the snapshot (+ platform, reason, note) into deleted_accounts
--      — only after the delete succeeded, so a failed delete leaves no row.
-- Clients can neither read nor write the table; admins read it through
-- admin_get_deleted_accounts.

CREATE TABLE IF NOT EXISTS public.deleted_accounts (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  deleted_at       timestamptz NOT NULL DEFAULT now(),
  signed_up_at     timestamptz,
  platform         text CHECK (platform IN ('ios', 'android', 'web')),
  plan             text,          -- paid tier with active access, else 'free'
  strength_tier    integer,
  onboarded        boolean,
  last_active_at   timestamptz,   -- latest app_events row
  workouts_logged  integer,       -- non-missed workout_logs
  country          text,
  reason           text CHECK (reason IN ('not_using', 'too_expensive', 'missing_features', 'privacy', 'other')),
  reason_note      text CHECK (char_length(reason_note) <= 500)
);

ALTER TABLE public.deleted_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_accounts FROM PUBLIC, anon, authenticated;

-- 1. Snapshot, read before the user is deleted. Service role only.
CREATE OR REPLACE FUNCTION public.account_deletion_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'signed_up_at', u.created_at,
    'plan', CASE
              WHEN p.subscription_tier IS NOT NULL AND p.subscription_tier <> 'free'
                   AND (p.access_expires_at IS NULL OR p.access_expires_at > now())
                THEN p.subscription_tier
              ELSE 'free'
            END,
    'strength_tier', p.strength_tier,
    'onboarded', p.onboarding_completed_at IS NOT NULL,
    'last_active_at', (SELECT max(e.created_at) FROM app_events e WHERE e.user_id = u.id),
    'workouts_logged', (SELECT count(*) FROM workout_logs w
                        WHERE w.warrior_id = u.id
                          AND COALESCE(w.notes, '') NOT LIKE '[STATUS:MISSED]%'),
    'country', p.country
  )
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE u.id = p_user_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_deletion_snapshot(uuid) TO service_role;

-- 2. Admin read: recent rows, weekly counts and reason counts for a range.
CREATE OR REPLACE FUNCTION public.admin_get_deleted_accounts(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_since timestamptz := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 90), 3650)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'days', p_days,
    'total', (SELECT count(*) FROM deleted_accounts WHERE deleted_at >= v_since),
    'weekly', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('week_start', w.wk, 'deletions', w.n) ORDER BY w.wk)
      FROM (SELECT date_trunc('week', deleted_at)::date AS wk, count(*) AS n
            FROM deleted_accounts WHERE deleted_at >= v_since GROUP BY 1) w
    ), '[]'::jsonb),
    'reasons', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('reason', r.reason, 'deletions', r.n) ORDER BY r.n DESC)
      FROM (SELECT COALESCE(reason, 'none') AS reason, count(*) AS n
            FROM deleted_accounts WHERE deleted_at >= v_since GROUP BY 1) r
    ), '[]'::jsonb),
    'rows', COALESCE((
      SELECT jsonb_agg(to_jsonb(d) - 'id' ORDER BY d.deleted_at DESC)
      FROM (SELECT * FROM deleted_accounts WHERE deleted_at >= v_since
            ORDER BY deleted_at DESC LIMIT 200) d
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_get_deleted_accounts(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_deleted_accounts(integer) TO authenticated;
