-- "Tournament service can update rewards" was `using(true) with check(true)`
-- for any authenticated user on ANY profiles row, with no ownership check
-- at all. Verified exploitable locally in an earlier audit pass: an
-- unrelated authenticated user could overwrite another user's
-- display_name, best_times, assessed_at, etc. (any column not covered by
-- the guard_profile_protected_fields trigger). It turns out this policy
-- was unnecessary in the first place: the only thing it could plausibly
-- have existed for is payout_tournament, which is SECURITY DEFINER and
-- already bypasses RLS entirely. Dropping it closes the cross-user write
-- hole with no loss of legitimate functionality.
drop policy "Tournament service can update rewards" on "public"."profiles";

-- "Allow participants to update each other" was the tournament_participants
-- analog of the same problem: `using(true) with check(true)` for any
-- authenticated user, letting anyone set final_rank/is_eliminated/scores/
-- total_score on ANY participant row, not just their own. The legitimate
-- cross-user need this existed for (marking other participants eliminated,
-- assigning final_rank for the whole field at tournament conclusion) moves
-- to SECURITY DEFINER RPCs in the next migration, which bypass RLS as their
-- owner. Self-submission of scores/total_score/trials_used/last_trial_at
-- remains covered by the existing "Warriors can update own scores" policy
-- (auth.uid() = user_id) - unaffected by this change.
drop policy "Allow participants to update each other" on "public"."tournament_participants";

-- Column-level backstop, mirroring guard_profile_protected_fields on
-- profiles: row-level RLS alone isn't enough, because "Warriors can update
-- own scores" only checks row ownership, not which columns changed - a
-- participant could otherwise set their OWN final_rank/is_eliminated
-- directly (e.g. final_rank = 1) even after the cross-user policy above is
-- gone. final_rank and is_eliminated should only ever be written by the new
-- conclude_*/eliminate_* RPCs (which run as SECURITY DEFINER, bypassing
-- this trigger via the same current_user bypass already used for profiles).
CREATE OR REPLACE FUNCTION public.guard_tournament_participant_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;

    IF NEW.final_rank IS DISTINCT FROM OLD.final_rank OR
       NEW.is_eliminated IS DISTINCT FROM OLD.is_eliminated
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected tournament participant fields directly.';
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE TRIGGER enforce_protected_tournament_participant_fields
  BEFORE UPDATE ON public.tournament_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_participant_protected_fields();
