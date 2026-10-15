-- Fair Play (docs/features/FAIR_PLAY_MODERATION_PLAN.md, owner decisions
-- 2026-10-16): detection flags unrealistic results for admin review (nothing
-- changes for anyone until an admin acts), admin leaderboard holds (one area,
-- all boards, permanent), strikes chosen per action, athlete reset / appeal,
-- and an inactive-45-days queue the admin can hide (athlete reveals with a tap).
--
-- Detection never blocks or breaks a submission: every check is wrapped and
-- a failure is swallowed. Results stay visible until the admin decides.

-- ═══ Settings + limits (admin-editable) ════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fair_play_settings (
  key text PRIMARY KEY,
  value numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.fair_play_settings (key, value) VALUES
  ('jump_pct', 50),                 -- new best > +50 % over own previous best
  ('jump_min', 10),                 -- ignored while the previous best is below this
  ('strength_jump_pct', 25),        -- trial time > 25 % faster than own best on the tier
  ('strength_floor_margin_pct', 10),-- trial within 10 % of the tier minimum
  ('burst_per_hour', 10),           -- > 10 results in an hour (per-attempt areas)
  ('weekly_min_entries', 5),
  ('weekly_reps_median_x', 3),      -- reps score > 3 × challenge median
  ('weekly_time_median_frac', 0.4), -- time score < 40 % of challenge median
  ('inactive_days', 45)
ON CONFLICT (key) DO NOTHING;

-- kind: 'abs' (seconds / reps), 'ceiling_fraction' (fraction of the
-- movement's hard ceiling, for movement_id '*'), 'bw_ratio' (× bodyweight,
-- *_kg used when no bodyweight is logged).
CREATE TABLE IF NOT EXISTS public.fair_play_limits (
  area text NOT NULL CHECK (area IN ('static', 'endurance', 'power')),
  movement_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('abs', 'ceiling_fraction', 'bw_ratio')),
  flag_value numeric NOT NULL,
  strong_value numeric NOT NULL,
  flag_kg numeric,
  strong_kg numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (area, movement_id)
);
INSERT INTO public.fair_play_limits (area, movement_id, kind, flag_value, strong_value, flag_kg, strong_kg) VALUES
  ('static', 'tuck_front_lever',       'abs', 45, 90, NULL, NULL),
  ('static', 'straddle_front_lever',   'abs', 25, 45, NULL, NULL),
  ('static', 'full_front_lever',       'abs', 20, 55, NULL, NULL),
  ('static', 'tuck_back_lever',        'abs', 60, 120, NULL, NULL),
  ('static', 'straddle_back_lever',    'abs', 30, 60, NULL, NULL),
  ('static', 'full_back_lever',        'abs', 30, 65, NULL, NULL),
  ('static', 'tuck_planche',           'abs', 25, 45, NULL, NULL),
  ('static', 'straddle_planche',       'abs', 12, 30, NULL, NULL),
  ('static', 'full_planche',           'abs', 10, 40, NULL, NULL),
  ('static', 'freestanding_handstand', 'abs', 90, 180, NULL, NULL),
  ('static', 'wall_handstand',         'abs', 150, 240, NULL, NULL),
  ('static', 'one_arm_handstand',      'abs', 20, 45, NULL, NULL),
  ('static', '*',                      'ceiling_fraction', 0.4, 0.75, NULL, NULL),
  ('endurance', 'push_ups',            'abs', 80, 100, NULL, NULL),
  ('endurance', 'knee_push_ups',       'abs', 85, 95, NULL, NULL),
  ('endurance', 'incline_push_ups',    'abs', 85, 95, NULL, NULL),
  ('endurance', 'inverted_row',        'abs', 50, 70, NULL, NULL),
  ('endurance', 'dips',                'abs', 45, 60, NULL, NULL),
  ('endurance', 'bench_dips',          'abs', 70, 85, NULL, NULL),
  ('endurance', 'air_squats',          'abs', 65, 80, NULL, NULL),
  ('endurance', 'pull_ups',            'abs', 35, 50, NULL, NULL),
  ('endurance', 'assisted_pull_ups',   'abs', 50, 70, NULL, NULL),
  ('endurance', 'muscle_ups',          'abs', 15, 25, NULL, NULL),
  ('endurance', 'hspu',                'abs', 25, 50, NULL, NULL),
  ('endurance', 'planche_push_ups',    'abs', 15, 30, NULL, NULL),
  ('endurance', 'fl_press',            'abs', 15, 30, NULL, NULL),
  ('endurance', 'fl_pull_ups',         'abs', 10, 20, NULL, NULL),
  ('endurance', 'deadlift',            'abs', 50, 75, NULL, NULL),
  ('endurance', '*',                   'ceiling_fraction', 0.7, 0.9, NULL, NULL),
  ('power', 'pullup_1rm',              'bw_ratio', 0.75, 1.2, 60, 100),
  ('power', 'dip_1rm',                 'bw_ratio', 1.0, 1.6, 80, 130),
  ('power', 'muscleup_1rm',            'bw_ratio', 0.3, 0.5, 25, 40),
  ('power', 'squat_1rm',               'bw_ratio', 2.5, 3.2, 200, 260)
ON CONFLICT (area, movement_id) DO NOTHING;

-- ═══ Flags, holds, appeals ═════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.fair_play_flags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  area text NOT NULL CHECK (area IN ('strength', 'static', 'endurance', 'power', 'weekly')),
  source_table text NOT NULL,
  source_id text NOT NULL,            -- the result row (or 'burst:<hour>')
  movement_id text,                   -- movement / lift / tier
  value numeric,
  rule text NOT NULL CHECK (rule IN ('absolute', 'jump', 'burst', 'floor_margin', 'weekly_outlier')),
  severity text NOT NULL CHECK (severity IN ('flag', 'strong')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,  -- e.g. previous value, limit, median (resets use it)
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned', 'reset')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  UNIQUE (source_table, source_id, movement_id, rule, value)
);
CREATE INDEX IF NOT EXISTS fair_play_flags_open_idx ON public.fair_play_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS fair_play_flags_user_idx ON public.fair_play_flags (user_id);

CREATE TABLE IF NOT EXISTS public.leaderboard_holds (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('all', 'strength', 'static', 'power', 'endurance', 'weekly')),
  reason text NOT NULL CHECK (reason IN ('fair_play', 'inactive')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'lifted', 'permanent')),
  counts_as_strike boolean NOT NULL DEFAULT false,
  flag_ids bigint[] NOT NULL DEFAULT '{}',
  admin_note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,        -- the athlete saw the notice
  lifted_at timestamptz,
  lifted_reason text CHECK (lifted_reason IN ('reset', 'appeal_accepted', 'admin', 'returned'))
);
CREATE INDEX IF NOT EXISTS leaderboard_holds_user_idx ON public.leaderboard_holds (user_id) WHERE status <> 'lifted';

CREATE TABLE IF NOT EXISTS public.fair_play_appeals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hold_id bigint NOT NULL UNIQUE REFERENCES public.leaderboard_holds(id) ON DELETE CASCADE,  -- one per action
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  admin_reply text,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);

-- Admins read everything and edit limits / settings directly (admin panel);
-- every other write goes through the SECURITY DEFINER functions below.
-- Athletes read their own state only through my_fair_play_status().
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fair_play_settings', 'fair_play_limits', 'fair_play_flags', 'leaderboard_holds', 'fair_play_appeals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins read %s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Admins read %s" ON public.%I FOR SELECT TO authenticated USING (public.is_admin())', t, t);
  END LOOP;
END $$;
GRANT UPDATE (value, updated_at) ON public.fair_play_settings TO authenticated;
GRANT UPDATE (flag_value, strong_value, flag_kg, strong_kg, updated_at) ON public.fair_play_limits TO authenticated;
DROP POLICY IF EXISTS "Admins edit fair_play_settings" ON public.fair_play_settings;
CREATE POLICY "Admins edit fair_play_settings" ON public.fair_play_settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS "Admins edit fair_play_limits" ON public.fair_play_limits;
CREATE POLICY "Admins edit fair_play_limits" ON public.fair_play_limits FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ═══ Visibility: holds join the opt-out ════════════════════════════════════
-- Shown to others only with no opt-out and no active/permanent hold for 'all'
-- or this board's area. Well-Rounded honours any world's hold (owner rule);
-- the Journey board and the Team / Arena boards only honour 'all'.
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
                 OR h.scope = p_scope
                 OR (p_scope = 'well_rounded' AND h.scope IN ('static', 'power', 'endurance')))
        )
      );
$function$;

-- ═══ Detection ═════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fair_play_setting(p_key text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT value FROM public.fair_play_settings WHERE key = p_key; $function$;

-- 'strong' / 'flag' / NULL for a static, endurance or power value.
CREATE OR REPLACE FUNCTION public.fair_play_level(p_area text, p_movement text, p_value numeric, p_ceiling numeric, p_bodyweight numeric)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l public.fair_play_limits;
  v_flag numeric;
  v_strong numeric;
BEGIN
  SELECT * INTO l FROM public.fair_play_limits WHERE area = p_area AND movement_id = p_movement;
  IF NOT FOUND THEN
    SELECT * INTO l FROM public.fair_play_limits WHERE area = p_area AND movement_id = '*';
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;
  IF l.kind = 'abs' THEN
    v_flag := l.flag_value; v_strong := l.strong_value;
  ELSIF l.kind = 'ceiling_fraction' THEN
    IF p_ceiling IS NULL THEN RETURN NULL; END IF;
    v_flag := l.flag_value * p_ceiling; v_strong := l.strong_value * p_ceiling;
  ELSE -- bw_ratio
    IF p_bodyweight IS NOT NULL AND p_bodyweight > 0 THEN
      v_flag := l.flag_value * p_bodyweight; v_strong := l.strong_value * p_bodyweight;
    ELSE
      v_flag := l.flag_kg; v_strong := l.strong_kg;
    END IF;
  END IF;
  IF v_strong IS NOT NULL AND p_value >= v_strong THEN RETURN 'strong'; END IF;
  IF v_flag IS NOT NULL AND p_value > v_flag THEN RETURN 'flag'; END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fair_play_raise(p_user uuid, p_area text, p_table text, p_source text, p_movement text, p_value numeric, p_rule text, p_severity text, p_detail jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO public.fair_play_flags (user_id, area, source_table, source_id, movement_id, value, rule, severity, detail)
  VALUES (p_user, p_area, p_table, p_source, p_movement, p_value, p_rule, p_severity, COALESCE(p_detail, '{}'::jsonb))
  ON CONFLICT (source_table, source_id, movement_id, rule, value) DO NOTHING;
$function$;

-- Static: one row per athlete + movement (best, updated in place). Flags an
-- improvement; the previous value is kept so a reset can restore it.
CREATE OR REPLACE FUNCTION public.fair_play_check_static()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_prev numeric := CASE WHEN TG_OP = 'UPDATE' THEN OLD.hold_seconds END;
  v_prev_points numeric := CASE WHEN TG_OP = 'UPDATE' THEN OLD.points END;
  v_ceiling numeric;
  v_level text;
  v_detail jsonb;
BEGIN
  BEGIN
    IF v_prev IS NOT NULL AND NEW.hold_seconds <= v_prev THEN RETURN NEW; END IF;
    SELECT max_hold_seconds INTO v_ceiling FROM public.static_movements WHERE id = NEW.movement_id;
    v_detail := jsonb_build_object('prev_value', v_prev, 'prev_points', v_prev_points, 'ceiling', v_ceiling);
    v_level := public.fair_play_level('static', NEW.movement_id, NEW.hold_seconds, v_ceiling, NULL);
    IF v_level IS NOT NULL THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'static', 'static_holds', NEW.id::text, NEW.movement_id, NEW.hold_seconds, 'absolute', v_level, v_detail);
    END IF;
    IF v_prev IS NOT NULL AND v_prev >= public.fair_play_setting('jump_min')
       AND NEW.hold_seconds > v_prev * (1 + public.fair_play_setting('jump_pct') / 100) THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'static', 'static_holds', NEW.id::text, NEW.movement_id, NEW.hold_seconds, 'jump', 'flag', v_detail);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fair_play_check_static: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- Endurance: every attempt. Absolute, jump over own best, burst per hour.
CREATE OR REPLACE FUNCTION public.fair_play_check_onemm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_ceiling numeric;
  v_level text;
  v_prev numeric;
  v_recent integer;
BEGIN
  BEGIN
    SELECT max_reps INTO v_ceiling FROM public.onemm_movements WHERE id = NEW.movement_id;
    v_level := public.fair_play_level('endurance', NEW.movement_id, NEW.reps, v_ceiling, NULL);
    IF v_level IS NOT NULL THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'endurance', 'one_min_max_logs', NEW.id::text, NEW.movement_id, NEW.reps, 'absolute', v_level,
        jsonb_build_object('ceiling', v_ceiling));
    END IF;
    SELECT max(reps) INTO v_prev FROM public.one_min_max_logs
    WHERE user_id = NEW.user_id AND movement_id = NEW.movement_id AND id <> NEW.id AND NOT excluded_from_pb;
    IF v_prev IS NOT NULL AND v_prev >= public.fair_play_setting('jump_min')
       AND NEW.reps > v_prev * (1 + public.fair_play_setting('jump_pct') / 100) THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'endurance', 'one_min_max_logs', NEW.id::text, NEW.movement_id, NEW.reps, 'jump', 'flag',
        jsonb_build_object('prev_value', v_prev));
    END IF;
    SELECT count(*) INTO v_recent FROM public.one_min_max_logs
    WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
    IF v_recent > public.fair_play_setting('burst_per_hour') THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'endurance', 'one_min_max_logs', 'burst:' || NEW.user_id || ':' || date_trunc('hour', now()), NULL, NULL, 'burst', 'flag',
        jsonb_build_object('count', v_recent));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fair_play_check_onemm: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- Power: one row per athlete (current PBs). Each lift that went up is
-- checked against bodyweight (latest logged) or kg; the previous value is
-- kept for a reset.
CREATE OR REPLACE FUNCTION public.fair_play_check_power()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bw numeric;
  lift text;
  v_new numeric;
  v_old numeric;
  v_level text;
  v_detail jsonb;
BEGIN
  BEGIN
    SELECT weight_kg INTO v_bw FROM public.bodyweight_logs WHERE warrior_id = NEW.user_id ORDER BY logged_at DESC LIMIT 1;
    FOREACH lift IN ARRAY ARRAY['pullup_1rm', 'dip_1rm', 'squat_1rm', 'muscleup_1rm'] LOOP
      v_new := (to_jsonb(NEW) ->> lift)::numeric;
      v_old := CASE WHEN TG_OP = 'UPDATE' THEN (to_jsonb(OLD) ->> lift)::numeric END;
      CONTINUE WHEN v_new IS NULL OR v_new <= COALESCE(v_old, 0);
      v_detail := jsonb_build_object('prev_value', v_old, 'bodyweight', v_bw);
      v_level := public.fair_play_level('power', lift, v_new, NULL, v_bw);
      IF v_level IS NOT NULL THEN
        PERFORM public.fair_play_raise(NEW.user_id, 'power', 'power_assessments', NEW.id::text, lift, v_new, 'absolute', v_level, v_detail);
      END IF;
      IF v_old IS NOT NULL AND v_old >= public.fair_play_setting('jump_min')
         AND v_new > v_old * (1 + public.fair_play_setting('jump_pct') / 100) THEN
        PERFORM public.fair_play_raise(NEW.user_id, 'power', 'power_assessments', NEW.id::text, lift, v_new, 'jump', 'flag', v_detail);
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fair_play_check_power: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

-- Strength: completed trials. Near the tier minimum, a big jump over own
-- best on the tier, or a burst of attempts.
CREATE OR REPLACE FUNCTION public.fair_play_check_trial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_floor numeric;
  v_prev numeric;
  v_recent integer;
BEGIN
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

-- Weekly: an outlier against the challenge median (5+ other entries).
CREATE OR REPLACE FUNCTION public.fair_play_check_weekly()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_n integer;
  v_median numeric;
BEGIN
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.score = OLD.score THEN RETURN NEW; END IF;
    SELECT scoring_type INTO v_type FROM public.weekly_challenges WHERE id = NEW.challenge_id;
    SELECT count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY score)
    INTO v_n, v_median
    FROM public.weekly_entries WHERE challenge_id = NEW.challenge_id AND user_id <> NEW.user_id;
    IF v_n >= public.fair_play_setting('weekly_min_entries') AND v_median > 0 AND (
         (v_type = 'time' AND NEW.score < v_median * public.fair_play_setting('weekly_time_median_frac'))
      OR (COALESCE(v_type, 'reps') <> 'time' AND NEW.score > v_median * public.fair_play_setting('weekly_reps_median_x'))
    ) THEN
      PERFORM public.fair_play_raise(NEW.user_id, 'weekly', 'weekly_entries', NEW.id::text, NEW.challenge_id::text, NEW.score, 'weekly_outlier', 'flag',
        jsonb_build_object('median', v_median, 'entries', v_n, 'scoring_type', v_type));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fair_play_check_weekly: %', SQLERRM;
  END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fair_play_check ON public.static_holds;
CREATE TRIGGER fair_play_check AFTER INSERT OR UPDATE OF hold_seconds ON public.static_holds FOR EACH ROW EXECUTE FUNCTION public.fair_play_check_static();
DROP TRIGGER IF EXISTS fair_play_check ON public.one_min_max_logs;
CREATE TRIGGER fair_play_check AFTER INSERT ON public.one_min_max_logs FOR EACH ROW EXECUTE FUNCTION public.fair_play_check_onemm();
DROP TRIGGER IF EXISTS fair_play_check ON public.power_assessments;
CREATE TRIGGER fair_play_check AFTER INSERT OR UPDATE OF pullup_1rm, dip_1rm, squat_1rm, muscleup_1rm ON public.power_assessments FOR EACH ROW EXECUTE FUNCTION public.fair_play_check_power();
DROP TRIGGER IF EXISTS fair_play_check ON public.trial_history;
CREATE TRIGGER fair_play_check AFTER INSERT ON public.trial_history FOR EACH ROW EXECUTE FUNCTION public.fair_play_check_trial();
DROP TRIGGER IF EXISTS fair_play_check ON public.weekly_entries;
CREATE TRIGGER fair_play_check AFTER INSERT OR UPDATE OF score ON public.weekly_entries FOR EACH ROW EXECUTE FUNCTION public.fair_play_check_weekly();

-- ═══ Admin actions (admin only, audited) ═══════════════════════════════════
CREATE OR REPLACE FUNCTION public.fair_play_require_admin()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'NOT_ADMIN' USING ERRCODE = '42501';
  END IF;
  RETURN auth.uid();
END;
$function$;

-- Looks real: close the flags, nothing changes for the athlete.
CREATE OR REPLACE FUNCTION public.admin_fair_play_dismiss(p_flag_ids bigint[], p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  v_n integer;
BEGIN
  UPDATE public.fair_play_flags SET status = 'dismissed', reviewed_by = v_admin, reviewed_at = now()
  WHERE id = ANY(p_flag_ids) AND status = 'open';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_dismiss', 'flags:' || array_to_string(p_flag_ids, ','), jsonb_build_object('note', p_note, 'count', v_n));
  RETURN v_n;
END;
$function$;

-- Hide from one area, all boards, or permanently (all boards, no way back by
-- reset). The flags attached are what an accepted reset removes.
CREATE OR REPLACE FUNCTION public.admin_fair_play_hold(
  p_user uuid, p_scope text, p_flag_ids bigint[], p_counts_as_strike boolean, p_permanent boolean DEFAULT false, p_note text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  v_id bigint;
  v_scope text := CASE WHEN p_permanent THEN 'all' ELSE p_scope END;
BEGIN
  IF v_scope NOT IN ('all', 'strength', 'static', 'power', 'endurance', 'weekly') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.leaderboard_holds (user_id, scope, reason, status, counts_as_strike, flag_ids, admin_note, created_by)
  VALUES (p_user, v_scope, 'fair_play', CASE WHEN p_permanent THEN 'permanent' ELSE 'active' END,
          COALESCE(p_counts_as_strike, false), COALESCE(p_flag_ids, '{}'), p_note, v_admin)
  RETURNING id INTO v_id;
  UPDATE public.fair_play_flags SET status = 'actioned', reviewed_by = v_admin, reviewed_at = now()
  WHERE id = ANY(COALESCE(p_flag_ids, '{}')) AND user_id = p_user;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, CASE WHEN p_permanent THEN 'fair_play_ban' ELSE 'fair_play_hold' END, p_user::text,
          jsonb_build_object('hold_id', v_id, 'scope', v_scope, 'flags', p_flag_ids, 'strike', p_counts_as_strike, 'note', p_note));
  RETURN v_id;
END;
$function$;

-- Lift a hold (admin's own decision, e.g. a mistake).
CREATE OR REPLACE FUNCTION public.admin_fair_play_lift(p_hold_id bigint, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
BEGIN
  UPDATE public.leaderboard_holds SET status = 'lifted', lifted_at = now(), lifted_reason = 'admin'
  WHERE id = p_hold_id AND status <> 'lifted';
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_lift', 'hold:' || p_hold_id, jsonb_build_object('note', p_note));
END;
$function$;

-- Accept: unhide, no reset, the strike no longer counts. Reject: the hold
-- stays and the athlete can still accept the reset.
CREATE OR REPLACE FUNCTION public.admin_fair_play_decide_appeal(p_appeal_id bigint, p_accept boolean, p_reply text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  v_hold bigint;
BEGIN
  UPDATE public.fair_play_appeals
  SET status = CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, admin_reply = p_reply, decided_at = now(), decided_by = v_admin
  WHERE id = p_appeal_id AND status = 'pending'
  RETURNING hold_id INTO v_hold;
  IF v_hold IS NULL THEN RAISE EXCEPTION 'APPEAL_NOT_PENDING' USING ERRCODE = '22023'; END IF;
  IF p_accept THEN
    UPDATE public.leaderboard_holds SET status = 'lifted', lifted_at = now(), lifted_reason = 'appeal_accepted' WHERE id = v_hold;
  END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, CASE WHEN p_accept THEN 'fair_play_appeal_accept' ELSE 'fair_play_appeal_reject' END, 'appeal:' || p_appeal_id,
          jsonb_build_object('hold_id', v_hold, 'reply', p_reply));
END;
$function$;

-- Last activity per athlete: app opens, workouts, and every kind of result.
CREATE OR REPLACE FUNCTION public.fair_play_last_activity(p_user uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    (SELECT max(created_at) FROM public.app_events WHERE user_id = p_user),
    (SELECT max(completed_at) FROM public.workout_logs WHERE warrior_id = p_user),
    (SELECT max(attempted_at) FROM public.trial_history WHERE user_id = p_user),
    (SELECT max(created_at) FROM public.static_holds WHERE user_id = p_user),
    (SELECT max(created_at) FROM public.one_min_max_logs WHERE user_id = p_user),
    (SELECT max(assessed_at) FROM public.power_assessments WHERE user_id = p_user),
    (SELECT max(created_at) FROM public.weekly_entries WHERE user_id = p_user)
  );
$function$;

-- Athletes with results on a board but no activity for `inactive_days`, not
-- already hidden: the admin decides whether to hide them.
CREATE OR REPLACE FUNCTION public.admin_inactive_athletes()
RETURNS TABLE(user_id uuid, display_name text, last_active timestamptz, days_inactive integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_days integer;
BEGIN
  PERFORM public.fair_play_require_admin();
  v_days := COALESCE(public.fair_play_setting('inactive_days'), 45)::integer;
  RETURN QUERY
  WITH ranked AS (
    SELECT DISTINCT r.uid FROM (
      SELECT th.user_id AS uid FROM public.trial_history th WHERE th.completed
      UNION SELECT sh.user_id FROM public.static_holds sh
      UNION SELECT l.user_id FROM public.one_min_max_logs l
      UNION SELECT pa.user_id FROM public.power_assessments pa
      UNION SELECT we.user_id FROM public.weekly_entries we
    ) r
  ), act AS (
    SELECT rk.uid, public.fair_play_last_activity(rk.uid) AS last_at FROM ranked rk
  )
  SELECT a.uid, p.display_name, a.last_at, (EXTRACT(EPOCH FROM now() - a.last_at) / 86400)::integer
  FROM act a JOIN public.profiles p ON p.id = a.uid
  WHERE a.last_at < now() - make_interval(days => v_days)
    AND NOT EXISTS (SELECT 1 FROM public.leaderboard_holds h WHERE h.user_id = a.uid AND h.status IN ('active', 'permanent') AND h.scope = 'all')
  ORDER BY a.last_at;
END;
$function$;

-- Hide an inactive athlete from all boards (no strike, no reset).
CREATE OR REPLACE FUNCTION public.admin_hide_inactive(p_user uuid, p_note text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid := public.fair_play_require_admin();
  v_id bigint;
BEGIN
  INSERT INTO public.leaderboard_holds (user_id, scope, reason, status, counts_as_strike, admin_note, created_by)
  VALUES (p_user, 'all', 'inactive', 'active', false, p_note, v_admin)
  RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_log (actor_id, action, target, detail)
  VALUES (v_admin, 'fair_play_hide_inactive', p_user::text, jsonb_build_object('hold_id', v_id, 'note', p_note));
  RETURN v_id;
END;
$function$;

-- ═══ Athlete side ══════════════════════════════════════════════════════════
-- Your holds (not lifted, plus recently decided appeals), their flagged
-- results and your strike count. The app's notice is built from this.
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
        'id', h.id, 'scope', h.scope, 'reason', h.reason, 'status', h.status,
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

CREATE OR REPLACE FUNCTION public.fair_play_acknowledge(p_hold_id bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  UPDATE public.leaderboard_holds SET acknowledged_at = COALESCE(acknowledged_at, now())
  WHERE id = p_hold_id AND user_id = auth.uid();
$function$;

-- One appeal per action; the hide stays until the admin decides.
CREATE OR REPLACE FUNCTION public.fair_play_appeal(p_hold_id bigint, p_message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leaderboard_holds WHERE id = p_hold_id AND user_id = v_user AND reason = 'fair_play' AND status IN ('active', 'permanent')) THEN
    RAISE EXCEPTION 'HOLD_NOT_FOUND' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.fair_play_appeals (hold_id, user_id, message) VALUES (p_hold_id, v_user, trim(p_message));
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'ALREADY_APPEALED' USING ERRCODE = '22023';
END;
$function$;

-- Accept the reset: only the flagged results are removed (owner rule), bests
-- and points are recomputed, tiers stay, and the hold lifts. Not for a
-- permanent ban. A result already replaced by a newer one is left alone.
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
      IF v_prev IS NULL THEN
        DELETE FROM public.static_holds WHERE id::text = f.source_id AND hold_seconds = f.value;
      ELSE
        UPDATE public.static_holds SET hold_seconds = v_prev, points = COALESCE((f.detail ->> 'prev_points')::numeric, points)
        WHERE id::text = f.source_id AND hold_seconds = f.value;
      END IF;
    ELSIF f.source_table = 'one_min_max_logs' THEN
      UPDATE public.one_min_max_logs SET excluded_from_pb = true WHERE id::text = f.source_id;
    ELSIF f.source_table = 'power_assessments' THEN
      EXECUTE format('UPDATE public.power_assessments SET %I = $1 WHERE id::text = $2 AND %I = $3', f.movement_id, f.movement_id)
      USING COALESCE(v_prev, 0), f.source_id, f.value;
    ELSIF f.source_table = 'trial_history' THEN
      DELETE FROM public.trial_history WHERE id::text = f.source_id;  -- the time leaves the boards; the tier stays
    ELSIF f.source_table = 'weekly_entries' THEN
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

-- Back after being hidden for inactivity: one tap shows you again.
CREATE OR REPLACE FUNCTION public.fair_play_reveal(p_hold_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.leaderboard_holds SET status = 'lifted', lifted_at = now(), lifted_reason = 'returned'
  WHERE id = p_hold_id AND user_id = auth.uid() AND reason = 'inactive' AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'HOLD_NOT_FOUND' USING ERRCODE = '22023'; END IF;
END;
$function$;

-- ═══ Grants ════════════════════════════════════════════════════════════════
DO $$
DECLARE f text;
BEGIN
  -- Internal helpers: no client access.
  FOREACH f IN ARRAY ARRAY[
    'public.fair_play_setting(text)', 'public.fair_play_level(text, text, numeric, numeric, numeric)',
    'public.fair_play_raise(uuid, text, text, text, text, numeric, text, text, jsonb)',
    'public.fair_play_check_static()', 'public.fair_play_check_onemm()', 'public.fair_play_check_power()',
    'public.fair_play_check_trial()', 'public.fair_play_check_weekly()', 'public.fair_play_last_activity(uuid)',
    'public.fair_play_require_admin()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  -- Signed-in callers (admin functions check is_admin themselves).
  FOREACH f IN ARRAY ARRAY[
    'public.admin_fair_play_dismiss(bigint[], text)', 'public.admin_fair_play_hold(uuid, text, bigint[], boolean, boolean, text)',
    'public.admin_fair_play_lift(bigint, text)', 'public.admin_fair_play_decide_appeal(bigint, boolean, text)',
    'public.admin_inactive_athletes()', 'public.admin_hide_inactive(uuid, text)',
    'public.my_fair_play_status()', 'public.fair_play_acknowledge(bigint)', 'public.fair_play_appeal(bigint, text)',
    'public.fair_play_accept_reset(bigint)', 'public.fair_play_reveal(bigint)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;

-- ═══ One-time scan of existing results (flags only, nothing hidden) ═══════
-- The same rules applied to what's already there. Static / power rows hold
-- only the current best, so they get the absolute rule; trials and endurance
-- attempts also get their jump rule against earlier attempts. No burst rule.
DO $$
DECLARE
  r record;
  v_level text;
BEGIN
  -- Static
  FOR r IN SELECT sh.*, sm.max_hold_seconds AS ceiling FROM public.static_holds sh LEFT JOIN public.static_movements sm ON sm.id = sh.movement_id LOOP
    v_level := public.fair_play_level('static', r.movement_id, r.hold_seconds, r.ceiling, NULL);
    IF v_level IS NOT NULL THEN
      PERFORM public.fair_play_raise(r.user_id, 'static', 'static_holds', r.id::text, r.movement_id, r.hold_seconds, 'absolute', v_level,
        jsonb_build_object('prev_value', NULL, 'ceiling', r.ceiling, 'scan', true));
    END IF;
  END LOOP;

  -- Endurance
  FOR r IN SELECT l.*, om.max_reps AS ceiling,
                  (SELECT max(e.reps) FROM public.one_min_max_logs e
                   WHERE e.user_id = l.user_id AND e.movement_id = l.movement_id AND NOT e.excluded_from_pb AND e.created_at < l.created_at) AS prev
           FROM public.one_min_max_logs l LEFT JOIN public.onemm_movements om ON om.id = l.movement_id
           WHERE NOT l.excluded_from_pb LOOP
    v_level := public.fair_play_level('endurance', r.movement_id, r.reps, r.ceiling, NULL);
    IF v_level IS NOT NULL THEN
      PERFORM public.fair_play_raise(r.user_id, 'endurance', 'one_min_max_logs', r.id::text, r.movement_id, r.reps, 'absolute', v_level,
        jsonb_build_object('ceiling', r.ceiling, 'scan', true));
    END IF;
    IF r.prev IS NOT NULL AND r.prev >= public.fair_play_setting('jump_min') AND r.reps > r.prev * (1 + public.fair_play_setting('jump_pct') / 100) THEN
      PERFORM public.fair_play_raise(r.user_id, 'endurance', 'one_min_max_logs', r.id::text, r.movement_id, r.reps, 'jump', 'flag',
        jsonb_build_object('prev_value', r.prev, 'scan', true));
    END IF;
  END LOOP;

  -- Power (current PBs; latest bodyweight)
  FOR r IN SELECT pa.*, (SELECT b.weight_kg FROM public.bodyweight_logs b WHERE b.warrior_id = pa.user_id ORDER BY b.logged_at DESC LIMIT 1) AS bw
           FROM public.power_assessments pa LOOP
    DECLARE lift text; v numeric;
    BEGIN
      FOREACH lift IN ARRAY ARRAY['pullup_1rm', 'dip_1rm', 'squat_1rm', 'muscleup_1rm'] LOOP
        v := (to_jsonb(r) ->> lift)::numeric;
        CONTINUE WHEN v IS NULL OR v <= 0;
        v_level := public.fair_play_level('power', lift, v, NULL, r.bw);
        IF v_level IS NOT NULL THEN
          PERFORM public.fair_play_raise(r.user_id, 'power', 'power_assessments', r.id::text, lift, v, 'absolute', v_level,
            jsonb_build_object('prev_value', NULL, 'bodyweight', r.bw, 'scan', true));
        END IF;
      END LOOP;
    END;
  END LOOP;

  -- Strength (completed trials)
  FOR r IN SELECT th.*,
                  (ARRAY[25, 90, 150, 180, 200, 220, 250, 360, 480, 420])[th.tier_attempted + 1] AS floor,
                  (SELECT min(e.time_seconds) FROM public.trial_history e
                   WHERE e.user_id = th.user_id AND e.tier_attempted = th.tier_attempted AND e.completed AND e.attempted_at < th.attempted_at) AS prev
           FROM public.trial_history th WHERE th.completed AND th.time_seconds IS NOT NULL LOOP
    IF r.floor IS NOT NULL AND r.time_seconds <= r.floor * (1 + public.fair_play_setting('strength_floor_margin_pct') / 100) THEN
      PERFORM public.fair_play_raise(r.user_id, 'strength', 'trial_history', r.id::text, r.tier_attempted::text, r.time_seconds, 'floor_margin', 'flag',
        jsonb_build_object('floor', r.floor, 'scan', true));
    END IF;
    IF r.prev IS NOT NULL AND r.time_seconds < r.prev * (1 - public.fair_play_setting('strength_jump_pct') / 100) THEN
      PERFORM public.fair_play_raise(r.user_id, 'strength', 'trial_history', r.id::text, r.tier_attempted::text, r.time_seconds, 'jump', 'flag',
        jsonb_build_object('prev_value', r.prev, 'scan', true));
    END IF;
  END LOOP;

  -- Weekly (against the challenge median of everyone else)
  FOR r IN SELECT we.*, wc.scoring_type,
                  (SELECT count(*) FROM public.weekly_entries o WHERE o.challenge_id = we.challenge_id AND o.user_id <> we.user_id) AS n,
                  (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY o.score) FROM public.weekly_entries o WHERE o.challenge_id = we.challenge_id AND o.user_id <> we.user_id) AS median
           FROM public.weekly_entries we JOIN public.weekly_challenges wc ON wc.id = we.challenge_id LOOP
    IF r.n >= public.fair_play_setting('weekly_min_entries') AND r.median > 0 AND (
         (r.scoring_type = 'time' AND r.score < r.median * public.fair_play_setting('weekly_time_median_frac'))
      OR (COALESCE(r.scoring_type, 'reps') <> 'time' AND r.score > r.median * public.fair_play_setting('weekly_reps_median_x'))
    ) THEN
      PERFORM public.fair_play_raise(r.user_id, 'weekly', 'weekly_entries', r.id::text, r.challenge_id::text, r.score, 'weekly_outlier', 'flag',
        jsonb_build_object('median', r.median, 'entries', r.n, 'scoring_type', r.scoring_type, 'scan', true));
    END IF;
  END LOOP;
END $$;
