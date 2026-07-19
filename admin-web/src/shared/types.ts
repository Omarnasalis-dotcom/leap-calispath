// Shapes returned by the admin RPCs (supabase/migrations/20260719120300_
// add_admin_read_rpcs.sql) and the tables the panel reads directly.

export interface MyProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  is_admin?: boolean;
  is_coach?: boolean;
}

export interface DashboardOverview {
  total_users: number;
  assessed_users: number;
  coaches: number;
  admins: number;
  active_this_week: number;
  world_participation: {
    strength: number;
    power: number;
    static: number;
    one_mm: number;
  };
  pending_invite_requests: number;
  community_count: number;
  week_start: string;
  next_week_start: string;
  this_week_challenge_groups: number[];
  next_week_challenge_groups: number[];
}

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  strength_tier: number | null;
  power_tier: number | null;
  statics_tier: number | null;
  glory_score: number | null;
  power_points: number | null;
  one_mm_points: number | null;
  streak: number | null;
  is_admin: boolean;
  is_coach: boolean;
  community_id: string | null;
  community_name: string | null;
  country: string | null;
  gender: string | null;
  last_active: string | null;
  created_at: string;
  total_count: number;
}

export interface AdminUserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  strength_tier: number | null;
  power_tier: number | null;
  statics_tier: number | null;
  glory_score: number | null;
  power_points: number | null;
  one_mm_points: number | null;
  streak: number | null;
  is_admin: boolean;
  is_coach: boolean;
  is_public: boolean | null;
  gender: string | null;
  country: string | null;
  timezone: string | null;
  community_id: string | null;
  community_name: string | null;
  assessed_at: string | null;
  power_assessed_at: string | null;
  statics_assessed_at: string | null;
  last_active: string | null;
  access_expires_at: string | null;
  invite_code_used: string | null;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
  best_times: Record<string, unknown> | null;
  power_pbs: Record<string, unknown> | null;
  stats: {
    trials_total: number;
    trials_completed: number;
    weekly_entries: number;
    workout_logs: number;
    static_holds: number;
    one_mm_logs: number;
    power_assessments: number;
  };
}

export interface TrialHistoryRow {
  id: string;
  user_id: string;
  tier_attempted: number;
  completed: boolean;
  time_seconds: number | null;
  attempted_at: string;
}

export interface CommunityRow {
  id: string;
  name: string;
  join_code: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  member_count: number;
}

export interface InviteRequestRow {
  id: string;
  name: string;
  email: string;
  instagram: string | null;
  experience: string | null;
  why_join: string | null;
  phone: string | null;
  status: string | null;
  created_at: string;
}

export interface TournamentConfigRow {
  id: string;
  title: string;
  type: string;
  payout_gp: number | null;
  bracket_size: number | null;
  min_participants: number | null;
  allowed_tiers: number[] | null;
  created_at: string;
}

export interface TournamentSessionRow {
  id: string;
  config_id: string | null;
  status: string | null;
  current_round: number | null;
  start_time: string | null;
  created_at: string;
}

export interface InviteCodeRow {
  id: string;
  code: string;
  type: string;
  expires_at: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
}

export interface TierLeaderboardRow {
  user_id: string;
  display_name: string | null;
  best_time: number | null;
  achieved_at: string | null;
  rank?: number;
}

export interface WellRoundedRow {
  user_id: string;
  display_name: string | null;
  total_points: number | null;
  rank?: number;
  [key: string]: unknown;
}
