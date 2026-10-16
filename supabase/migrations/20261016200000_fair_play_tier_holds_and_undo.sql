-- Fair Play, part 2 (owner decisions 2026-10-16):
-- 1. A Strength hide covers only the tiers of the selected trials
--    (leaderboard_holds.tiers; NULL = every tier, as before).
-- 2. Undo a wrong decision:
--    - lift a hold as "looks real" (its flags dismissed) or "decide again"
--      (its flags reopen); a pending appeal on it is accepted;
--    - reopen a dismissed flag, or one whose hold was lifted;
--    - restore what an accepted reset removed (backed up from now on).
--    An admin lift or restore also clears that hold's strike.

-- ═══ Per-tier Strength holds ═══════════════════════════════════════════════
ALTER TABLE public.leaderboard_holds ADD COLUMN IF NOT EXISTS tiers integer[];
ALTER TABLE public.leaderboard_holds ADD COLUMN IF NOT EXISTS restored_at timestamptz;
ALTER TABLE public.leaderboard_holds DROP CONSTRAINT IF EXISTS leaderboard_holds_tiers_check;
ALTER TABLE public.leaderboard_holds ADD CONSTRAINT leaderboard_holds_tiers_check
  CHECK (tiers IS NULL OR (scope = 'strength' AND cardinality(tiers) > 0 AND tiers <@ ARRAY[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));

-- A tier-only Strength hold doesn't hide from Strength as a whole; the tier
-- boards ask leaderboard_visible_tier.
CREATE OR REPLACE FUNCTION public.leaderboard_visible(p_user uuid, p_scope text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_user = auth.uid()
      OR (
        NOT COALESCE((SELECT leaderboard_hidden FROM public.profiles WHERE id = p_user), false)
        AND NOT EXISTS (
          SELECT 1 FROM public.leaderboard_holds h
          WHERE h.user_id = p_user AND h.status IN ('active', 'permanent')
            AND (h.scope = 'all'
                 OR (h.scope = p_scope AND h.tiers IS NULL)
                 OR (p_scope = 'well_rounded' AND h.scope IN ('static', 'power', 'endurance')))
        )
      );
$function$;

CREATE OR REPLACE FUNCTION public.leaderboard_visible_tier(p_user uuid, p_tier integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_user = auth.uid()
      OR (
        public.leaderboard_visible(p_user, 'strength')
        AND NOT EXISTS (
          SELECT 1 FROM public.leaderboard_holds h
          WHERE h.user_id = p_user AND h.status IN ('active', 'permanent')
            AND h.scope = 'strength' AND p_tier = ANY(h.tiers)
        )
      );
$function$;
REVOKE EXECUTE ON FUNCTION public.leaderboard_visible_tier(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leaderboard_visible_tier(uuid, integer) TO authenticated, service_role;

-- Same as 20261016100000, with the per-tier check.
CREATE OR REPLACE FUNCTION public.get_tier_leaderboard(tier_num integer, p_community_id uuid DEFAULT NULL, p_include_me boolean DEFAULT false)
RETURNS TABLE(user_id uuid, display_name text, best_time integer, total_attempts bigint, country text, gender text, rank bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT th.user_id, p.display_name, MIN(th.time_seconds) AS best_time, COUNT(th.id) AS total_attempts, p.country, p.gender
    FROM public.trial_history th
    JOIN public.profiles p ON p.id = th.user_id
    WHERE th.tier_attempted = tier_num
      AND th.completed = true
      AND (p_community_id IS NULL OR p.community_id = p_community_id)
      AND public.leaderboard_visible_tier(p.id, tier_num)
    GROUP BY th.user_id, p.display_name, p.country, p.gender
  ), ranked AS (
    SELECT base.*, ROW_NUMBER() OVER (ORDER BY base.best_time ASC) AS rank FROM base
  )
  SELECT r.user_id, r.display_name, r.best_time, r.total_attempts, r.country, r.gender, r.rank
  FROM ranked r
  WHERE r.rank <= 100 OR (p_include_me AND r.user_id = auth.uid())
  ORDER BY r.rank;
$function$;

-- New p_tiers parameter (Strength only).
DROP FUNCTION IF EXISTS public.admin_fair_play_hold(uuid, text, bigint[], boolean, boolean, text);
CREATE OR REPLACE FUNCTION public.admin_fair_play_hold(
  p_user uuid, p_scope text, p_flag_ids bigint[], p_counts_as_strike boolean, p_permanent boolean DEFAULT false, p_note text DEFAULT NULL,
  p_tiers integer[] DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  v_id bigint;
  v_scope text := CASE WHEN p_permanent THEN 'all' ELSE p_scope END;
  v_tiers integer[] := CASE WHEN p_permanent THEN NULL
                            ELSE (SELECT array_agg(DISTINCT t ORDER BY t) FROM unnest(p_tiers) t WHERE t IS NOT NULL) END;
BEGIN
  IF v_scope NOT IN ('all', 'strength', 'static', 'power', 'endurance', 'weekly') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF v_tiers IS NOT NULL AND (v_scope <> 'strength' OR NOT v_tiers <@ ARRAY[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) THEN
    RAISE EXCEPTION 'INVALID_TIERS' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.leaderboard_holds (user_id, scope, tiers, reason, status, counts_as_strike, flag_ids, admin_note, created_by)
  VALUES (p_user, v_scope, v_tiers, 'fair_play', CASE WHEN p_permanent THEN 'permanent' ELSE 'active' END,
          COALESCE(p_counts_as_strike, false), COALESCE(p_flag_ids, '{}'), p_note, v_admin)
  RETURNING id INTO v_id;
  UPDATE public.fair_play_flags SET status = 'actioned', reviewed_by = v_admin, reviewed_at = now()
  WHERE id = ANY(COALESCE(p_flag_ids, '{}')) AND user_id = p_user;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, CASE WHEN p_permanent THEN 'fair_play_ban' ELSE 'fair_play_hold' END, p_user::text,
          jsonb_build_object('hold_id', v_id, 'scope', v_scope, 'tiers', v_tiers, 'flags', p_flag_ids, 'strike', p_counts_as_strike, 'note', p_note));
  RETURN v_id;
END;
$function$;

-- The athlete's notice now names the tiers.
CREATE OR REPLACE FUNCTION public.my_fair_play_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'strikes', (SELECT count(*) FROM public.leaderboard_holds
                WHERE user_id = v_user AND counts_as_strike AND COALESCE(lifted_reason, '') <> 'appeal_accepted'),
    'holds', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', h.id, 'scope', h.scope, 'tiers', h.tiers, 'reason', h.reason, 'status', h.status,
        'counts_as_strike', h.counts_as_strike, 'admin_note', h.admin_note,
        'created_at', h.created_at, 'acknowledged_at', h.acknowledged_at,
        'flags', COALESCE((SELECT jsonb_agg(jsonb_build_object('area', f.area, 'movement_id', f.movement_id, 'value', f.value, 'rule', f.rule, 'created_at', f.created_at) ORDER BY f.created_at)
                           FROM public.fair_play_flags f WHERE f.id = ANY(h.flag_ids)), '[]'::jsonb),
        'appeal', (SELECT jsonb_build_object('status', a.status, 'message', a.message, 'admin_reply', a.admin_reply, 'decided_at', a.decided_at)
                   FROM public.fair_play_appeals a WHERE a.hold_id = h.id)
      ) ORDER BY h.created_at DESC)
      FROM public.leaderboard_holds h
      WHERE h.user_id = v_user AND h.status IN ('active', 'permanent')), '[]'::jsonb)
  );
END;
$function$;

-- ═══ Undo: lift with a choice, reopen flags ════════════════════════════════
-- p_reopen false: the results look real (flags dismissed). true: decide
-- again (flags back in the queue). Either way the strike is cleared and a
-- pending appeal on the hold is accepted (the athlete is visible again).
DROP FUNCTION IF EXISTS public.admin_fair_play_lift(bigint, text);
CREATE OR REPLACE FUNCTION public.admin_fair_play_lift(p_hold_id bigint, p_note text DEFAULT NULL, p_reopen boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  h public.leaderboard_holds;
BEGIN
  SELECT * INTO h FROM public.leaderboard_holds WHERE id = p_hold_id AND status <> 'lifted' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HOLD_NOT_FOUND' USING ERRCODE = '22023'; END IF;
  UPDATE public.leaderboard_holds SET status = 'lifted', lifted_at = now(), lifted_reason = 'admin', counts_as_strike = false
  WHERE id = p_hold_id;
  IF p_reopen THEN
    UPDATE public.fair_play_flags SET status = 'open', reviewed_by = NULL, reviewed_at = NULL
    WHERE id = ANY(h.flag_ids) AND status = 'actioned';
  ELSE
    UPDATE public.fair_play_flags SET status = 'dismissed', reviewed_by = v_admin, reviewed_at = now()
    WHERE id = ANY(h.flag_ids) AND status = 'actioned';
  END IF;
  UPDATE public.fair_play_appeals SET status = 'accepted', decided_at = now(), decided_by = v_admin
  WHERE hold_id = p_hold_id AND status = 'pending';
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_lift', 'hold:' || p_hold_id,
          jsonb_build_object('note', p_note, 'reopen', p_reopen, 'strike_cleared', h.counts_as_strike, 'user', h.user_id));
END;
$function$;

-- Back to the queue: a dismissed flag, or one whose hold is no longer in
-- force (lifted by you or by an accepted appeal). Not a reset flag (restore).
CREATE OR REPLACE FUNCTION public.admin_fair_play_reopen_flags(p_flag_ids bigint[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  v_n integer;
BEGIN
  UPDATE public.fair_play_flags f SET status = 'open', reviewed_by = NULL, reviewed_at = NULL
  WHERE f.id = ANY(p_flag_ids)
    AND (f.status = 'dismissed'
         OR (f.status = 'actioned' AND NOT EXISTS (
               SELECT 1 FROM public.leaderboard_holds h WHERE f.id = ANY(h.flag_ids) AND h.status IN ('active', 'permanent'))));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_reopen', 'flags:' || array_to_string(p_flag_ids, ','), jsonb_build_object('count', v_n));
  RETURN v_n;
END;
$function$;

-- ═══ Undo a reset: back up, then restore ═══════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fair_play_reset_backups (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hold_id bigint NOT NULL REFERENCES public.leaderboard_holds(id) ON DELETE CASCADE,
  flag_id bigint NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  movement_id text,
  row_before jsonb NOT NULL,          -- the result row as it was before the reset
  created_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz
);
CREATE INDEX IF NOT EXISTS fair_play_reset_backups_hold_idx ON public.fair_play_reset_backups (hold_id);
ALTER TABLE public.fair_play_reset_backups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fair_play_reset_backups FROM anon, authenticated;
GRANT SELECT ON public.fair_play_reset_backups TO authenticated;
DROP POLICY IF EXISTS "Admins read fair_play_reset_backups" ON public.fair_play_reset_backups;
CREATE POLICY "Admins read fair_play_reset_backups" ON public.fair_play_reset_backups FOR SELECT TO authenticated USING (public.is_admin());

-- Same as 20261016120000, plus a backup of every row it changes.
CREATE OR REPLACE FUNCTION public.fair_play_accept_reset(p_hold_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  h public.leaderboard_holds;
  f public.fair_play_flags;
  v_prev numeric;
BEGIN
  SELECT * INTO h FROM public.leaderboard_holds WHERE id = p_hold_id AND user_id = v_user FOR UPDATE;
  IF NOT FOUND OR h.reason <> 'fair_play' OR h.status <> 'active' THEN
    RAISE EXCEPTION 'RESET_NOT_AVAILABLE' USING ERRCODE = '22023';
  END IF;
  -- Newest first: undoing the latest flagged value can expose an older one
  -- that's flagged too (static and power keep one row, updated in place).
  FOR f IN SELECT * FROM public.fair_play_flags WHERE id = ANY(h.flag_ids) AND user_id = v_user AND source_id NOT LIKE 'burst:%' ORDER BY id DESC LOOP
    v_prev := (f.detail ->> 'prev_value')::numeric;
    IF f.source_table = 'static_holds' THEN
      INSERT INTO public.fair_play_reset_backups (hold_id, flag_id, user_id, source_table, movement_id, row_before)
      SELECT h.id, f.id, v_user, f.source_table, f.movement_id, to_jsonb(s) FROM public.static_holds s WHERE s.id::text = f.source_id AND s.hold_seconds = f.value;
      IF v_prev IS NULL THEN
        DELETE FROM public.static_holds WHERE id::text = f.source_id AND hold_seconds = f.value;
      ELSE
        UPDATE public.static_holds SET hold_seconds = v_prev, points = COALESCE((f.detail ->> 'prev_points')::numeric, points)
        WHERE id::text = f.source_id AND hold_seconds = f.value;
      END IF;
    ELSIF f.source_table = 'one_min_max_logs' THEN
      INSERT INTO public.fair_play_reset_backups (hold_id, flag_id, user_id, source_table, movement_id, row_before)
      SELECT h.id, f.id, v_user, f.source_table, f.movement_id, to_jsonb(l) FROM public.one_min_max_logs l WHERE l.id::text = f.source_id AND NOT l.excluded_from_pb;
      UPDATE public.one_min_max_logs SET excluded_from_pb = true WHERE id::text = f.source_id;
    ELSIF f.source_table = 'power_assessments' THEN
      INSERT INTO public.fair_play_reset_backups (hold_id, flag_id, user_id, source_table, movement_id, row_before)
      SELECT h.id, f.id, v_user, f.source_table, f.movement_id, to_jsonb(pa) FROM public.power_assessments pa
      WHERE pa.id::text = f.source_id AND (to_jsonb(pa) ->> f.movement_id)::numeric = f.value;
      EXECUTE format('UPDATE public.power_assessments SET %I = $1 WHERE id::text = $2 AND %I = $3', f.movement_id, f.movement_id)
      USING COALESCE(v_prev, 0), f.source_id, f.value;
    ELSIF f.source_table = 'trial_history' THEN
      INSERT INTO public.fair_play_reset_backups (hold_id, flag_id, user_id, source_table, movement_id, row_before)
      SELECT h.id, f.id, v_user, f.source_table, f.movement_id, to_jsonb(th) FROM public.trial_history th WHERE th.id::text = f.source_id;
      DELETE FROM public.trial_history WHERE id::text = f.source_id;  -- the time leaves the boards; the tier stays
    ELSIF f.source_table = 'weekly_entries' THEN
      INSERT INTO public.fair_play_reset_backups (hold_id, flag_id, user_id, source_table, movement_id, row_before)
      SELECT h.id, f.id, v_user, f.source_table, f.movement_id, to_jsonb(we) FROM public.weekly_entries we WHERE we.id::text = f.source_id;
      DELETE FROM public.weekly_entries WHERE id::text = f.source_id;
    END IF;
  END LOOP;
  PERFORM public.sync_static_points(v_user);
  PERFORM public.sync_onemm_points(v_user);
  PERFORM public.sync_power_points(v_user);
  UPDATE public.fair_play_flags SET status = 'reset' WHERE id = ANY(h.flag_ids);
  UPDATE public.leaderboard_holds SET status = 'lifted', lifted_at = now(), lifted_reason = 'reset', acknowledged_at = COALESCE(acknowledged_at, now())
  WHERE id = p_hold_id;
END;
$function$;

-- The reset was a mistake: put the results back, oldest change last undone
-- first. A result the athlete has since beaten is left as it is; a removed
-- trial / weekly entry comes back unless something now takes its place.
-- Flags become dismissed (the results are real) and the strike is cleared.
-- Returns how many results came back.
CREATE OR REPLACE FUNCTION public.admin_fair_play_restore_reset(p_hold_id bigint)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  h public.leaderboard_holds;
  b public.fair_play_reset_backups;
  v_val numeric;
  v_n integer;
  v_restored integer := 0;
BEGIN
  SELECT * INTO h FROM public.leaderboard_holds WHERE id = p_hold_id AND lifted_reason = 'reset' AND restored_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOTHING_TO_RESTORE' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fair_play_reset_backups WHERE hold_id = p_hold_id AND restored_at IS NULL) THEN
    RAISE EXCEPTION 'NOTHING_TO_RESTORE' USING ERRCODE = '22023';
  END IF;
  -- Re-inserted trials must not count as a new burst.
  PERFORM set_config('fair_play.restoring', 'on', true);

  FOR b IN SELECT * FROM public.fair_play_reset_backups WHERE hold_id = p_hold_id AND restored_at IS NULL ORDER BY id DESC LOOP
    v_n := 0;
    IF b.source_table = 'static_holds' THEN
      INSERT INTO public.static_holds SELECT (jsonb_populate_record(NULL::public.static_holds, b.row_before)).*
      ON CONFLICT (user_id, movement_id) DO UPDATE SET hold_seconds = EXCLUDED.hold_seconds, points = EXCLUDED.points
        WHERE static_holds.hold_seconds < EXCLUDED.hold_seconds;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF b.source_table = 'one_min_max_logs' THEN
      UPDATE public.one_min_max_logs SET excluded_from_pb = false WHERE id::text = b.row_before ->> 'id' AND excluded_from_pb;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF b.source_table = 'power_assessments' THEN
      v_val := (b.row_before ->> b.movement_id)::numeric;
      EXECUTE format('UPDATE public.power_assessments SET %I = $1 WHERE user_id = $2 AND COALESCE(%I, 0) < $1', b.movement_id, b.movement_id)
      USING v_val, b.user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF b.source_table = 'trial_history' THEN
      INSERT INTO public.trial_history SELECT (jsonb_populate_record(NULL::public.trial_history, b.row_before)).*
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    ELSIF b.source_table = 'weekly_entries' THEN
      INSERT INTO public.weekly_entries SELECT (jsonb_populate_record(NULL::public.weekly_entries, b.row_before)).*
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    END IF;
    v_restored := v_restored + v_n;
    UPDATE public.fair_play_reset_backups SET restored_at = now() WHERE id = b.id;
  END LOOP;

  PERFORM set_config('fair_play.restoring', 'off', true);
  PERFORM public.sync_static_points(h.user_id);
  PERFORM public.sync_onemm_points(h.user_id);
  PERFORM public.sync_power_points(h.user_id);
  UPDATE public.fair_play_flags SET status = 'dismissed', reviewed_by = v_admin, reviewed_at = now()
  WHERE id = ANY(h.flag_ids) AND status = 'reset';
  -- A put-back value can trip a check again (e.g. a static jump); now() is
  -- this transaction's start, so this catches exactly those flags.
  UPDATE public.fair_play_flags SET status = 'dismissed', reviewed_by = v_admin, reviewed_at = now()
  WHERE user_id = h.user_id AND status = 'open' AND created_at = now();
  UPDATE public.leaderboard_holds SET restored_at = now(), counts_as_strike = false WHERE id = p_hold_id;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_restore_reset', 'hold:' || p_hold_id,
          jsonb_build_object('user', h.user_id, 'restored', v_restored, 'strike_cleared', h.counts_as_strike));
  RETURN v_restored;
END;
$function$;

-- Same as 20261016120000, skipped while a reset is being restored.
CREATE OR REPLACE FUNCTION public.fair_play_check_trial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_floor numeric;
  v_prev numeric;
  v_recent integer;
BEGIN
  IF current_setting('fair_play.restoring', true) = 'on' THEN RETURN NEW; END IF;
  BEGIN
    IF NOT NEW.completed OR NEW.time_seconds IS NULL THEN RETURN NEW; END IF;
    -- TIER_HARD_FLOORS (src/constants/Progression.ts), tiers 0–9.
    v_floor := (ARRAY[25, 90, 150, 180, 200, 220, 250, 360, 480, 420])[NEW.tier_attempted + 1];
    IF v_floor IS NOT NULL AND NEW.time_seconds <= v_floor * (1 + public.fair_play_setting('strength_floor_margin_pct') / 100) THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'strength', 'trial_history', NEW.id::text, NEW.tier_attempted::text, NEW.time_seconds, 'floor_margin', 'flag',
        jsonb_build_object('floor', v_floor));
    END IF;
    SELECT min(time_seconds) INTO v_prev FROM public.trial_history
    WHERE user_id = NEW.user_id AND tier_attempted = NEW.tier_attempted AND completed AND id <> NEW.id;
    IF v_prev IS NOT NULL AND NEW.time_seconds < v_prev * (1 - public.fair_play_setting('strength_jump_pct') / 100) THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'strength', 'trial_history', NEW.id::text, NEW.tier_attempted::text, NEW.time_seconds, 'jump', 'flag',
        jsonb_build_object('prev_value', v_prev));
    END IF;
    SELECT count(*) INTO v_recent FROM public.trial_history
    WHERE user_id = NEW.user_id AND attempted_at > now() - interval '1 hour';
    IF v_recent > public.fair_play_setting('burst_per_hour') THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'strength', 'trial_history', 'burst:' || NEW.user_id || ':' || date_trunc('hour', now()), NULL, NULL, 'burst', 'flag',
        jsonb_build_object('count', v_recent));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fair_play_check_trial: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- ═══ Grants ════════════════════════════════════════════════════════════════
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_fair_play_hold(uuid, text, bigint[], boolean, boolean, text, integer[])',
    'public.admin_fair_play_lift(bigint, text, boolean)',
    'public.admin_fair_play_reopen_flags(bigint[])',
    'public.admin_fair_play_restore_reset(bigint)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
