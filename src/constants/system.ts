// Fixed profile id for the "Leap" house account — the content owner for
// self-service Workout Templates Library clones where no real coach is
// involved (see supabase/migrations/20260709130000_add_leap_system_profile.sql).
// It is a real profiles row (satisfies program_templates.coach_id /
// warrior_programs.coach_id NOT NULL constraints) but must never appear in
// user-facing rosters, searches, or leaderboards — every query that lists
// profiles broadly should exclude it explicitly.
export const LEAP_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000001';

// Fixed profile id for the "AI Coach" house account — the content owner for
// programs the AI Coach creates/modifies on a user's behalf (see
// supabase/migrations/20260821170000_add_ai_coach_system_profile.sql). Kept
// distinct from LEAP_SYSTEM_PROFILE_ID so AI-authored programs are cleanly
// identifiable via coach_id. Same broad-listing exclusion rule applies.
export const AI_COACH_SYSTEM_PROFILE_ID = '00000000-0000-0000-0000-000000000002';
