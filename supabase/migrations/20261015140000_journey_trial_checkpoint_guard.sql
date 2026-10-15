-- Journey trial checkpoint guard (2026-10-15, owner report: "the strength
-- trial finished in my journey while it was still locked").
--
-- Cause: a trial passed from the Strength tab left a note on the phone, and
-- the Journey lane then marked the current week's trial checkpoint done
-- (w{N}_trial), unlocked or not; the payout turned that into +100. The app
-- path is removed (1.2.12), but older apps and phone caches can still send
-- such a record, and the table accepted any slot from the client.
--
-- Now a 'done' trial checkpoint is only recorded when it really is open: a
-- trial week (odd) and every day of that week fully logged. Anything else is
-- silently dropped (the app batches several slots in one insert, so raising
-- would also lose the valid ones). Skips are unchanged.
-- Existing records that break the rule are removed, with their points.

CREATE OR REPLACE FUNCTION public.journey_trial_checkpoint_open(p_program uuid, p_week integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_week % 2 = 1
     AND EXISTS (
       SELECT 1 FROM public.warrior_programs wp
       JOIN public.program_blocks pb ON pb.template_id = wp.template_id
       WHERE wp.id = p_program AND COALESCE(pb.week_number, 1) = p_week)
     AND NOT EXISTS (
       SELECT 1 FROM (
         SELECT count(*) AS n_blocks, count(l.finished_at) AS n_logged
         FROM public.warrior_programs wp
         JOIN public.program_blocks pb ON pb.template_id = wp.template_id
         LEFT JOIN LATERAL (
           SELECT max(wl.completed_at) AS finished_at
           FROM public.workout_logs wl
           WHERE wl.warrior_program_id = wp.id AND wl.block_id = pb.id
         ) l ON true
         WHERE wp.id = p_program AND COALESCE(pb.week_number, 1) = p_week
         GROUP BY upper(trim(split_part(pb.name, ' | ', 1)))
       ) d
       WHERE d.n_logged < d.n_blocks);
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_trial_checkpoint_open(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.journey_trial_checkpoint_open(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.journey_quest_slots_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'done' AND NEW.slot_key ~ '_trial$'
     AND NOT public.journey_trial_checkpoint_open(
       NEW.warrior_program_id, substring(NEW.slot_key FROM '^w([0-9]+)_')::integer) THEN
    RETURN NULL;  -- not open yet: drop this row, keep the rest of the insert
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_quest_slots_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS journey_quest_slots_guard ON public.journey_quest_slots;
CREATE TRIGGER journey_quest_slots_guard
  BEFORE INSERT ON public.journey_quest_slots
  FOR EACH ROW EXECUTE FUNCTION public.journey_quest_slots_guard();

-- Cleanup: trial checkpoints marked done while not open, and their points.
WITH bad AS (
  SELECT s.user_id, s.warrior_program_id, s.slot_key
  FROM public.journey_quest_slots s
  WHERE s.status = 'done' AND s.slot_key ~ '_trial$'
    AND NOT public.journey_trial_checkpoint_open(s.warrior_program_id, substring(s.slot_key FROM '^w([0-9]+)_')::integer)
), gone_points AS (
  DELETE FROM public.journey_points jp
  USING bad
  WHERE jp.user_id = bad.user_id AND jp.source = 'trial'
    AND jp.source_key = bad.warrior_program_id || ':' || bad.slot_key
  RETURNING jp.id
)
DELETE FROM public.journey_quest_slots s
USING bad
WHERE s.user_id = bad.user_id AND s.warrior_program_id = bad.warrior_program_id
  AND s.slot_key = bad.slot_key AND s.status = 'done';
