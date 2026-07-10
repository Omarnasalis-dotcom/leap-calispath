// Fixed profile id for the "Leap" house account — the content owner for
// self-service Workout Templates Library clones where no real coach is
// involved (see supabase/migrations/20260709130000_add_leap_system_profile.sql).
// It is a real profiles row (satisfies program_templates.coach_id /
// warrior_programs.coach_id NOT NULL constraints) but must never appear in
// user-facing rosters, searches, or leaderboards — every query that lists
// profiles broadly should exclude it explicitly.
export const LEAP_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000001';
