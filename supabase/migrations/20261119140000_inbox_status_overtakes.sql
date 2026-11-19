-- Notifications "Needs you": a Defend card leaves once the person is back
-- ahead of whoever passed them (review 2026-11-19, #2). Until now an overtake
-- stayed up for 7 days even after the person had won their place back.
--
-- get_inbox_status() now also answers leaderboard_overtaken, by comparing the
-- person's current result with the overtaker's (found by the name saved in
-- data.by_name; names are unique). Same measures the boards rank by:
--   time  → best_times[tier], lower wins
--   Power World → power_points, Static World → statics_tier, 1MM → one_mm_points
--   Well-Rounded → statics_tier + power_points + one_mm_points
-- No name, unknown board or a missing result → null (the app keeps its own
-- 7-day / tapped rule). Everything else is unchanged from 20261119100000.

CREATE OR REPLACE FUNCTION public.get_inbox_status(p_ids uuid[])
RETURNS TABLE(id uuid, resolved boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT n.id,
    CASE
      WHEN n.type = 'week_complete_nudge'
        AND n.data->>'program_id' ~ '^[0-9a-f-]{36}$' AND n.data->>'week' ~ '^\d+$' THEN
        coalesce((
          SELECT wp.current_week > (n.data->>'week')::int
              OR EXISTS (
                SELECT 1 FROM program_blocks b
                WHERE b.template_id = wp.template_id
                  AND coalesce(b.week_number, 1) = (n.data->>'week')::int + 1)
          FROM warrior_programs wp
          WHERE wp.id = (n.data->>'program_id')::uuid
            AND wp.warrior_id = auth.uid()
            AND wp.status = 'active'
        ), true)  -- program ended or replaced: nothing left to build
      WHEN n.type = 'weekly_challenge_started' AND n.data ? 'challenge_name' THEN
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM weekly_challenges c
            WHERE c.title = n.data->>'challenge_name'
              AND c.week_start BETWEEN (n.created_at AT TIME ZONE 'utc')::date - 2 AND (n.created_at AT TIME ZONE 'utc')::date
          ) THEN n.created_at < now() - interval '7 days'
          ELSE NOT EXISTS (
              SELECT 1 FROM weekly_challenges c
              WHERE c.title = n.data->>'challenge_name'
                AND c.week_start BETWEEN (n.created_at AT TIME ZONE 'utc')::date - 2 AND (n.created_at AT TIME ZONE 'utc')::date
                AND c.is_active
                AND c.week_start + 7 > CURRENT_DATE)
            OR EXISTS (
              SELECT 1 FROM weekly_challenges c
              JOIN weekly_entries e ON e.challenge_id = c.id AND e.user_id = auth.uid()
              WHERE c.title = n.data->>'challenge_name'
                AND c.week_start BETWEEN (n.created_at AT TIME ZONE 'utc')::date - 2 AND (n.created_at AT TIME ZONE 'utc')::date)
        END
      WHEN n.type = 'leaderboard_overtaken' AND n.data ? 'by_name' THEN
        (
          SELECT CASE
            WHEN n.data->>'kind' = 'time' AND n.data->>'tier' ~ '^\d$' THEN
              (me.best_times->>(n.data->>'tier'))::numeric < (them.best_times->>(n.data->>'tier'))::numeric
            WHEN n.data->>'board_name' = 'Power World' THEN
              me.power_points > them.power_points
            WHEN n.data->>'board_name' = 'Static World' THEN
              coalesce(me.statics_tier, 0) > coalesce(them.statics_tier, 0)
            WHEN n.data->>'board_name' = '1MM' THEN
              coalesce(me.one_mm_points, 0) > coalesce(them.one_mm_points, 0)
            WHEN n.data->>'board_name' = 'Well-Rounded' THEN
              coalesce(me.statics_tier, 0) + coalesce(me.power_points, 0) + coalesce(me.one_mm_points, 0)
                > coalesce(them.statics_tier, 0) + coalesce(them.power_points, 0) + coalesce(them.one_mm_points, 0)
          END
          FROM profiles me, profiles them
          WHERE me.id = auth.uid()
            AND them.display_name = n.data->>'by_name'
            AND them.id <> me.id
          LIMIT 1
        )
      ELSE NULL
    END
  FROM notifications n
  WHERE n.id = ANY(p_ids)
    AND n.user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_inbox_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_inbox_status(uuid[]) TO authenticated;
