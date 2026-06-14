create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

drop extension if exists "pg_net";


  create table "public"."arena_attempts" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "phase_id" text not null,
    "time_in_seconds" integer not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."arena_attempts" enable row level security;


  create table "public"."arena_competitions" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "description" text,
    "difficulty_tier" integer default 1,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."arena_competitions" enable row level security;


  create table "public"."arena_phases" (
    "id" text not null,
    "competition_id" uuid,
    "name" text not null,
    "order_index" integer not null,
    "pro_benchmark_time" integer not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."arena_phases" enable row level security;


  create table "public"."arena_pro_results" (
    "id" uuid not null default gen_random_uuid(),
    "phase_id" text not null,
    "athlete_name" text not null,
    "time_in_seconds" integer not null,
    "official_rank" integer not null,
    "created_at" timestamp with time zone not null default timezone('utc'::text, now())
      );


alter table "public"."arena_pro_results" enable row level security;


  create table "public"."block_exercises" (
    "id" uuid not null default gen_random_uuid(),
    "block_id" uuid not null,
    "exercise_id" uuid not null,
    "sets" integer default 3,
    "reps" integer default 10,
    "rest_seconds" integer default 60,
    "notes" text,
    "order_index" integer default 0,
    "hold_seconds" integer,
    "is_weighted" boolean default false
      );


alter table "public"."block_exercises" enable row level security;


  create table "public"."clash_sessions" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "sender_id" uuid,
    "receiver_id" uuid,
    "status" text default 'pending'::text,
    "bracket" text,
    "workout_protocol" jsonb not null,
    "start_time" timestamp with time zone,
    "winner_id" uuid,
    "sender_finish_time" integer,
    "receiver_finish_time" integer,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "finished_at" timestamp with time zone
      );


alter table "public"."clash_sessions" enable row level security;


  create table "public"."exercise_library" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "youtube_url" text,
    "category" text,
    "difficulty" text,
    "created_by" uuid,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."exercise_library" enable row level security;


  create table "public"."invite_codes" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "type" text not null,
    "expires_at" timestamp with time zone,
    "used_by" uuid,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."invite_codes" enable row level security;


  create table "public"."invite_requests" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "email" text not null,
    "instagram" text,
    "experience" text,
    "why_join" text,
    "status" text default 'pending'::text,
    "created_at" timestamp with time zone default now(),
    "phone" text
      );


alter table "public"."invite_requests" enable row level security;


  create table "public"."one_min_max_logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "movement_id" text not null,
    "category_id" text not null,
    "reps" integer not null,
    "points" numeric not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."one_min_max_logs" enable row level security;


  create table "public"."one_mm_scores" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "movement_id" text not null,
    "category_id" text not null,
    "pattern_id" text not null,
    "reps" integer not null,
    "multiplier" integer not null default 1,
    "points" integer not null,
    "recorded_at" timestamp with time zone not null default now()
      );


alter table "public"."one_mm_scores" enable row level security;


  create table "public"."power_assessments" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "pullup_1rm" numeric,
    "dip_1rm" numeric,
    "squat_1rm" numeric,
    "muscleup_1rm" numeric,
    "power_tier" integer,
    "assessed_at" timestamp with time zone default now()
      );


alter table "public"."power_assessments" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "email" text,
    "display_name" text,
    "strength_tier" integer default 0,
    "power_tier" integer,
    "statics_tier" numeric,
    "glory_score" integer default 0,
    "streak" integer default 0,
    "last_active" timestamp with time zone default now(),
    "assessed_at" timestamp with time zone,
    "assessment_locked_until" timestamp with time zone,
    "power_assessed_at" timestamp with time zone,
    "statics_assessed_at" timestamp with time zone,
    "best_times" jsonb default '{}'::jsonb,
    "trials_attempted" integer default 0,
    "trials_passed" integer default 0,
    "is_public" boolean default true,
    "push_token" text,
    "timezone" text default 'UTC'::text,
    "updated_at" timestamp with time zone default now(),
    "power_pbs" jsonb default '{}'::jsonb,
    "power_points" numeric default 0,
    "is_admin" boolean default false,
    "is_searching_clash" boolean default false,
    "tournament_gp" integer default 0,
    "clash_win_streak" integer default 0,
    "one_mm_points" numeric default 0,
    "one_mm_rank" integer,
    "coach_beta_access" boolean default false,
    "access_granted_at" timestamp with time zone,
    "access_expires_at" timestamp with time zone,
    "invite_code_used" text,
    "is_coach" boolean default false,
    "coach_id" uuid,
    "gender" text,
    "country" text,
    "first_name" text,
    "last_name" text
      );


alter table "public"."profiles" enable row level security;


  create table "public"."program_blocks" (
    "id" uuid not null default gen_random_uuid(),
    "template_id" uuid not null,
    "name" text not null,
    "notes" text,
    "order_index" integer default 0,
    "created_at" timestamp with time zone default now(),
    "week_number" integer default 1
      );


alter table "public"."program_blocks" enable row level security;


  create table "public"."program_templates" (
    "id" uuid not null default gen_random_uuid(),
    "coach_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."program_templates" enable row level security;


  create table "public"."static_holds" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "movement_id" text not null,
    "hold_seconds" numeric not null,
    "points" numeric not null,
    "logged_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now()
      );


alter table "public"."static_holds" enable row level security;


  create table "public"."statics_assessments" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "handstand_variant" text,
    "handstand_hold" integer,
    "front_lever_variant" text,
    "front_lever_hold" integer,
    "back_lever_variant" text,
    "back_lever_hold" integer,
    "planche_variant" text,
    "planche_hold" integer,
    "statics_tier" integer,
    "assessed_at" timestamp with time zone default now()
      );


alter table "public"."statics_assessments" enable row level security;


  create table "public"."tournament_configs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "title" text not null default 'Weekend Gauntlet'::text,
    "type" text not null default 'knockout'::text,
    "payout_gp" integer default 150,
    "workout_config" jsonb not null,
    "created_at" timestamp with time zone default now(),
    "bracket_size" integer,
    "window_time_min" integer,
    "max_trials" integer,
    "cooldown_min" integer,
    "min_participants" integer,
    "allowed_tiers" integer[] default '{0,1,2,3,4,5,6,7,8}'::integer[]
      );


alter table "public"."tournament_configs" enable row level security;


  create table "public"."tournament_matches" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tournament_id" uuid,
    "day" integer not null,
    "user_a" uuid,
    "user_b" uuid,
    "winner_id" uuid,
    "is_ghost_match" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."tournament_matches" enable row level security;


  create table "public"."tournament_participants" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "tournament_id" uuid,
    "user_id" uuid,
    "tier_at_start" integer not null,
    "is_eliminated" boolean default false,
    "scores" jsonb default '{}'::jsonb,
    "joined_at" timestamp with time zone default now(),
    "is_ready" boolean default false,
    "final_rank" integer,
    "total_score" integer default 0,
    "trials_used" integer default 0,
    "last_trial_at" timestamp with time zone
      );


alter table "public"."tournament_participants" enable row level security;


  create table "public"."tournament_sessions" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "config_id" uuid,
    "status" text default 'registration'::text,
    "start_time" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "expires_at" timestamp with time zone default (now() + '12:00:00'::interval),
    "current_round" integer default 1,
    "round_deadline" timestamp with time zone,
    "is_advancing" boolean default false
      );


alter table "public"."tournament_sessions" enable row level security;


  create table "public"."trial_history" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "tier_attempted" integer not null,
    "completed" boolean default false,
    "time_seconds" integer,
    "attempted_at" timestamp with time zone default now()
      );


alter table "public"."trial_history" enable row level security;


  create table "public"."warrior_programs" (
    "id" uuid not null default gen_random_uuid(),
    "template_id" uuid not null,
    "warrior_id" uuid not null,
    "coach_id" uuid not null,
    "status" text default 'active'::text,
    "assigned_at" timestamp with time zone default now()
      );


alter table "public"."warrior_programs" enable row level security;


  create table "public"."weekly_challenges" (
    "id" uuid not null default gen_random_uuid(),
    "week_start" date not null,
    "group_id" integer not null,
    "title" text not null,
    "description" text,
    "scoring_type" text not null,
    "movements" jsonb not null default '[]'::jsonb,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "time_limit" integer
      );


alter table "public"."weekly_challenges" enable row level security;


  create table "public"."weekly_entries" (
    "id" uuid not null default gen_random_uuid(),
    "challenge_id" uuid,
    "user_id" uuid not null,
    "score" numeric not null,
    "submitted_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now(),
    "metadata" jsonb default '{}'::jsonb
      );


alter table "public"."weekly_entries" enable row level security;


  create table "public"."workout_logs" (
    "id" uuid not null default gen_random_uuid(),
    "warrior_program_id" uuid not null,
    "warrior_id" uuid not null,
    "block_id" uuid,
    "completed_at" timestamp with time zone default now(),
    "notes" text,
    "rating" integer
      );


alter table "public"."workout_logs" enable row level security;

CREATE UNIQUE INDEX arena_attempts_pkey ON public.arena_attempts USING btree (id);

CREATE UNIQUE INDEX arena_competitions_pkey ON public.arena_competitions USING btree (id);

CREATE UNIQUE INDEX arena_phases_pkey ON public.arena_phases USING btree (id);

CREATE UNIQUE INDEX arena_pro_results_pkey ON public.arena_pro_results USING btree (id);

CREATE UNIQUE INDEX block_exercises_pkey ON public.block_exercises USING btree (id);

CREATE UNIQUE INDEX clash_sessions_pkey ON public.clash_sessions USING btree (id);

CREATE UNIQUE INDEX exercise_library_pkey ON public.exercise_library USING btree (id);

CREATE INDEX idx_1mm_movement ON public.one_min_max_logs USING btree (movement_id, reps DESC);

CREATE INDEX idx_1mm_user ON public.one_min_max_logs USING btree (user_id);

CREATE INDEX idx_invite_requests_email ON public.invite_requests USING btree (email);

CREATE INDEX idx_one_mm_scores_movement ON public.one_mm_scores USING btree (movement_id);

CREATE INDEX idx_one_mm_scores_user ON public.one_mm_scores USING btree (user_id);

CREATE INDEX idx_power_assessments_tier ON public.power_assessments USING btree (power_tier);

CREATE INDEX idx_profiles_coach_id ON public.profiles USING btree (coach_id);

CREATE INDEX idx_profiles_gender ON public.profiles USING btree (gender);

CREATE INDEX idx_static_holds_movement ON public.static_holds USING btree (movement_id);

CREATE INDEX idx_static_holds_movement_points ON public.static_holds USING btree (movement_id, points DESC);

CREATE INDEX idx_trial_history_tier ON public.trial_history USING btree (tier_attempted, completed);

CREATE INDEX idx_trial_history_user ON public.trial_history USING btree (user_id);

CREATE INDEX idx_weekly_challenges_active ON public.weekly_challenges USING btree (is_active, week_start DESC);

CREATE INDEX idx_weekly_challenges_group_week ON public.weekly_challenges USING btree (group_id, week_start, is_active);

CREATE INDEX idx_weekly_entries_challenge ON public.weekly_entries USING btree (challenge_id, score);

CREATE INDEX idx_weekly_entries_user ON public.weekly_entries USING btree (user_id);

CREATE UNIQUE INDEX invite_codes_code_key ON public.invite_codes USING btree (code);

CREATE UNIQUE INDEX invite_codes_pkey ON public.invite_codes USING btree (id);

CREATE UNIQUE INDEX invite_requests_email_key ON public.invite_requests USING btree (email);

CREATE UNIQUE INDEX invite_requests_pkey ON public.invite_requests USING btree (id);

CREATE UNIQUE INDEX one_min_max_logs_pkey ON public.one_min_max_logs USING btree (id);

CREATE UNIQUE INDEX one_mm_scores_pkey ON public.one_mm_scores USING btree (id);

CREATE UNIQUE INDEX one_mm_scores_user_id_movement_id_key ON public.one_mm_scores USING btree (user_id, movement_id);

CREATE UNIQUE INDEX power_assessments_pkey ON public.power_assessments USING btree (id);

CREATE UNIQUE INDEX power_assessments_user_id_unique ON public.power_assessments USING btree (user_id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX program_blocks_pkey ON public.program_blocks USING btree (id);

CREATE UNIQUE INDEX program_templates_pkey ON public.program_templates USING btree (id);

CREATE UNIQUE INDEX static_holds_pkey ON public.static_holds USING btree (id);

CREATE UNIQUE INDEX static_holds_user_id_movement_id_key ON public.static_holds USING btree (user_id, movement_id);

CREATE UNIQUE INDEX statics_assessments_pkey ON public.statics_assessments USING btree (id);

CREATE UNIQUE INDEX tournament_configs_pkey ON public.tournament_configs USING btree (id);

CREATE UNIQUE INDEX tournament_matches_pkey ON public.tournament_matches USING btree (id);

CREATE UNIQUE INDEX tournament_participants_pkey ON public.tournament_participants USING btree (id);

CREATE UNIQUE INDEX tournament_participants_tournament_id_user_id_key ON public.tournament_participants USING btree (tournament_id, user_id);

CREATE UNIQUE INDEX tournament_sessions_pkey ON public.tournament_sessions USING btree (id);

CREATE UNIQUE INDEX trial_history_pkey ON public.trial_history USING btree (id);

CREATE UNIQUE INDEX unique_active_challenge_per_week ON public.weekly_challenges USING btree (group_id, week_start);

CREATE UNIQUE INDEX unique_display_name ON public.profiles USING btree (display_name);

CREATE UNIQUE INDEX warrior_programs_pkey ON public.warrior_programs USING btree (id);

CREATE UNIQUE INDEX weekly_challenges_pkey ON public.weekly_challenges USING btree (id);

CREATE UNIQUE INDEX weekly_entries_challenge_id_user_id_key ON public.weekly_entries USING btree (challenge_id, user_id);

CREATE UNIQUE INDEX weekly_entries_pkey ON public.weekly_entries USING btree (id);

CREATE UNIQUE INDEX workout_logs_pkey ON public.workout_logs USING btree (id);

alter table "public"."arena_attempts" add constraint "arena_attempts_pkey" PRIMARY KEY using index "arena_attempts_pkey";

alter table "public"."arena_competitions" add constraint "arena_competitions_pkey" PRIMARY KEY using index "arena_competitions_pkey";

alter table "public"."arena_phases" add constraint "arena_phases_pkey" PRIMARY KEY using index "arena_phases_pkey";

alter table "public"."arena_pro_results" add constraint "arena_pro_results_pkey" PRIMARY KEY using index "arena_pro_results_pkey";

alter table "public"."block_exercises" add constraint "block_exercises_pkey" PRIMARY KEY using index "block_exercises_pkey";

alter table "public"."clash_sessions" add constraint "clash_sessions_pkey" PRIMARY KEY using index "clash_sessions_pkey";

alter table "public"."exercise_library" add constraint "exercise_library_pkey" PRIMARY KEY using index "exercise_library_pkey";

alter table "public"."invite_codes" add constraint "invite_codes_pkey" PRIMARY KEY using index "invite_codes_pkey";

alter table "public"."invite_requests" add constraint "invite_requests_pkey" PRIMARY KEY using index "invite_requests_pkey";

alter table "public"."one_min_max_logs" add constraint "one_min_max_logs_pkey" PRIMARY KEY using index "one_min_max_logs_pkey";

alter table "public"."one_mm_scores" add constraint "one_mm_scores_pkey" PRIMARY KEY using index "one_mm_scores_pkey";

alter table "public"."power_assessments" add constraint "power_assessments_pkey" PRIMARY KEY using index "power_assessments_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."program_blocks" add constraint "program_blocks_pkey" PRIMARY KEY using index "program_blocks_pkey";

alter table "public"."program_templates" add constraint "program_templates_pkey" PRIMARY KEY using index "program_templates_pkey";

alter table "public"."static_holds" add constraint "static_holds_pkey" PRIMARY KEY using index "static_holds_pkey";

alter table "public"."statics_assessments" add constraint "statics_assessments_pkey" PRIMARY KEY using index "statics_assessments_pkey";

alter table "public"."tournament_configs" add constraint "tournament_configs_pkey" PRIMARY KEY using index "tournament_configs_pkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_pkey" PRIMARY KEY using index "tournament_matches_pkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_pkey" PRIMARY KEY using index "tournament_participants_pkey";

alter table "public"."tournament_sessions" add constraint "tournament_sessions_pkey" PRIMARY KEY using index "tournament_sessions_pkey";

alter table "public"."trial_history" add constraint "trial_history_pkey" PRIMARY KEY using index "trial_history_pkey";

alter table "public"."warrior_programs" add constraint "warrior_programs_pkey" PRIMARY KEY using index "warrior_programs_pkey";

alter table "public"."weekly_challenges" add constraint "weekly_challenges_pkey" PRIMARY KEY using index "weekly_challenges_pkey";

alter table "public"."weekly_entries" add constraint "weekly_entries_pkey" PRIMARY KEY using index "weekly_entries_pkey";

alter table "public"."workout_logs" add constraint "workout_logs_pkey" PRIMARY KEY using index "workout_logs_pkey";

alter table "public"."arena_attempts" add constraint "arena_attempts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."arena_attempts" validate constraint "arena_attempts_user_id_fkey";

alter table "public"."arena_phases" add constraint "arena_phases_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES public.arena_competitions(id) ON DELETE CASCADE not valid;

alter table "public"."arena_phases" validate constraint "arena_phases_competition_id_fkey";

alter table "public"."block_exercises" add constraint "block_exercises_block_id_fkey" FOREIGN KEY (block_id) REFERENCES public.program_blocks(id) ON DELETE CASCADE not valid;

alter table "public"."block_exercises" validate constraint "block_exercises_block_id_fkey";

alter table "public"."block_exercises" add constraint "block_exercises_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercise_library(id) ON DELETE CASCADE not valid;

alter table "public"."block_exercises" validate constraint "block_exercises_exercise_id_fkey";

alter table "public"."clash_sessions" add constraint "clash_sessions_bracket_check" CHECK ((bracket = ANY (ARRAY['developing'::text, 'elite'::text]))) not valid;

alter table "public"."clash_sessions" validate constraint "clash_sessions_bracket_check";

alter table "public"."clash_sessions" add constraint "clash_sessions_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."clash_sessions" validate constraint "clash_sessions_receiver_id_fkey";

alter table "public"."clash_sessions" add constraint "clash_sessions_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."clash_sessions" validate constraint "clash_sessions_sender_id_fkey";

alter table "public"."clash_sessions" add constraint "clash_sessions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'active'::text, 'finished'::text, 'cancelled'::text]))) not valid;

alter table "public"."clash_sessions" validate constraint "clash_sessions_status_check";

alter table "public"."clash_sessions" add constraint "clash_sessions_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."clash_sessions" validate constraint "clash_sessions_winner_id_fkey";

alter table "public"."exercise_library" add constraint "exercise_library_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."exercise_library" validate constraint "exercise_library_created_by_fkey";

alter table "public"."invite_codes" add constraint "invite_codes_code_key" UNIQUE using index "invite_codes_code_key";

alter table "public"."invite_codes" add constraint "invite_codes_used_by_fkey" FOREIGN KEY (used_by) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."invite_codes" validate constraint "invite_codes_used_by_fkey";

alter table "public"."invite_requests" add constraint "invite_requests_email_key" UNIQUE using index "invite_requests_email_key";

alter table "public"."invite_requests" add constraint "invite_requests_experience_check" CHECK ((experience = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))) not valid;

alter table "public"."invite_requests" validate constraint "invite_requests_experience_check";

alter table "public"."invite_requests" add constraint "invite_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text]))) not valid;

alter table "public"."invite_requests" validate constraint "invite_requests_status_check";

alter table "public"."one_min_max_logs" add constraint "one_min_max_logs_reps_check" CHECK ((reps >= 0)) not valid;

alter table "public"."one_min_max_logs" validate constraint "one_min_max_logs_reps_check";

alter table "public"."one_min_max_logs" add constraint "one_min_max_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."one_min_max_logs" validate constraint "one_min_max_logs_user_id_fkey";

alter table "public"."one_mm_scores" add constraint "one_mm_scores_category_id_check" CHECK ((category_id = ANY (ARRAY['entry'::text, 'main'::text, 'advanced'::text]))) not valid;

alter table "public"."one_mm_scores" validate constraint "one_mm_scores_category_id_check";

alter table "public"."one_mm_scores" add constraint "one_mm_scores_reps_check" CHECK ((reps > 0)) not valid;

alter table "public"."one_mm_scores" validate constraint "one_mm_scores_reps_check";

alter table "public"."one_mm_scores" add constraint "one_mm_scores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."one_mm_scores" validate constraint "one_mm_scores_user_id_fkey";

alter table "public"."one_mm_scores" add constraint "one_mm_scores_user_id_movement_id_key" UNIQUE using index "one_mm_scores_user_id_movement_id_key";

alter table "public"."power_assessments" add constraint "power_assessments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."power_assessments" validate constraint "power_assessments_user_id_fkey";

alter table "public"."power_assessments" add constraint "power_assessments_user_id_unique" UNIQUE using index "power_assessments_user_id_unique";

alter table "public"."profiles" add constraint "profiles_coach_id_fkey" FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."profiles" validate constraint "profiles_coach_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "unique_display_name" UNIQUE using index "unique_display_name";

alter table "public"."program_blocks" add constraint "program_blocks_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.program_templates(id) ON DELETE CASCADE not valid;

alter table "public"."program_blocks" validate constraint "program_blocks_template_id_fkey";

alter table "public"."program_templates" add constraint "program_templates_coach_id_fkey" FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."program_templates" validate constraint "program_templates_coach_id_fkey";

alter table "public"."static_holds" add constraint "static_holds_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."static_holds" validate constraint "static_holds_user_id_fkey";

alter table "public"."static_holds" add constraint "static_holds_user_id_movement_id_key" UNIQUE using index "static_holds_user_id_movement_id_key";

alter table "public"."statics_assessments" add constraint "statics_assessments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."statics_assessments" validate constraint "statics_assessments_user_id_fkey";

alter table "public"."tournament_configs" add constraint "tournament_configs_type_check" CHECK ((type = ANY (ARRAY['knockout'::text, 'ranking'::text, 'rank_based'::text]))) not valid;

alter table "public"."tournament_configs" validate constraint "tournament_configs_type_check";

alter table "public"."tournament_matches" add constraint "tournament_matches_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournament_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_tournament_id_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_user_a_fkey" FOREIGN KEY (user_a) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_user_a_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_user_b_fkey" FOREIGN KEY (user_b) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_user_b_fkey";

alter table "public"."tournament_matches" add constraint "tournament_matches_winner_id_fkey" FOREIGN KEY (winner_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."tournament_matches" validate constraint "tournament_matches_winner_id_fkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournament_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_participants" validate constraint "tournament_participants_tournament_id_fkey";

alter table "public"."tournament_participants" add constraint "tournament_participants_tournament_id_user_id_key" UNIQUE using index "tournament_participants_tournament_id_user_id_key";

alter table "public"."tournament_participants" add constraint "tournament_participants_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."tournament_participants" validate constraint "tournament_participants_user_id_fkey";

alter table "public"."tournament_sessions" add constraint "tournament_sessions_config_id_fkey" FOREIGN KEY (config_id) REFERENCES public.tournament_configs(id) not valid;

alter table "public"."tournament_sessions" validate constraint "tournament_sessions_config_id_fkey";

alter table "public"."tournament_sessions" add constraint "tournament_sessions_status_check" CHECK ((status IS NOT NULL)) not valid;

alter table "public"."tournament_sessions" validate constraint "tournament_sessions_status_check";

alter table "public"."trial_history" add constraint "trial_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."trial_history" validate constraint "trial_history_user_id_fkey";

alter table "public"."warrior_programs" add constraint "warrior_programs_coach_id_fkey" FOREIGN KEY (coach_id) REFERENCES public.profiles(id) ON DELETE SET NULL not valid;

alter table "public"."warrior_programs" validate constraint "warrior_programs_coach_id_fkey";

alter table "public"."warrior_programs" add constraint "warrior_programs_template_id_fkey" FOREIGN KEY (template_id) REFERENCES public.program_templates(id) not valid;

alter table "public"."warrior_programs" validate constraint "warrior_programs_template_id_fkey";

alter table "public"."warrior_programs" add constraint "warrior_programs_warrior_id_fkey" FOREIGN KEY (warrior_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."warrior_programs" validate constraint "warrior_programs_warrior_id_fkey";

alter table "public"."weekly_challenges" add constraint "unique_active_challenge_per_week" UNIQUE using index "unique_active_challenge_per_week";

alter table "public"."weekly_challenges" add constraint "weekly_challenges_group_id_check" CHECK ((group_id = ANY (ARRAY[1, 2, 3]))) not valid;

alter table "public"."weekly_challenges" validate constraint "weekly_challenges_group_id_check";

alter table "public"."weekly_challenges" add constraint "weekly_challenges_scoring_type_check" CHECK ((scoring_type = ANY (ARRAY['time'::text, 'reps'::text]))) not valid;

alter table "public"."weekly_challenges" validate constraint "weekly_challenges_scoring_type_check";

alter table "public"."weekly_entries" add constraint "weekly_entries_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES public.weekly_challenges(id) ON DELETE CASCADE not valid;

alter table "public"."weekly_entries" validate constraint "weekly_entries_challenge_id_fkey";

alter table "public"."weekly_entries" add constraint "weekly_entries_challenge_id_user_id_key" UNIQUE using index "weekly_entries_challenge_id_user_id_key";

alter table "public"."weekly_entries" add constraint "weekly_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."weekly_entries" validate constraint "weekly_entries_user_id_fkey";

alter table "public"."workout_logs" add constraint "workout_logs_block_id_fkey" FOREIGN KEY (block_id) REFERENCES public.program_blocks(id) not valid;

alter table "public"."workout_logs" validate constraint "workout_logs_block_id_fkey";

alter table "public"."workout_logs" add constraint "workout_logs_warrior_id_fkey" FOREIGN KEY (warrior_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."workout_logs" validate constraint "workout_logs_warrior_id_fkey";

alter table "public"."workout_logs" add constraint "workout_logs_warrior_program_id_fkey" FOREIGN KEY (warrior_program_id) REFERENCES public.warrior_programs(id) not valid;

alter table "public"."workout_logs" validate constraint "workout_logs_warrior_program_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assign_program_template(p_coach_id uuid, p_warrior_id uuid, p_template_id uuid, p_custom_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_new_template_id UUID;
    v_old_block RECORD;
    v_new_block_id UUID;
    v_old_exercise RECORD;
BEGIN
    -- 1. Create the new template
    INSERT INTO program_templates (name, description, coach_id)
    SELECT p_custom_name, description, p_coach_id
    FROM program_templates
    WHERE id = p_template_id
    RETURNING id INTO v_new_template_id;

    -- 2. Loop through blocks
    FOR v_old_block IN 
        SELECT * FROM program_blocks WHERE template_id = p_template_id ORDER BY order_index ASC
    LOOP
        -- Insert new block
        INSERT INTO program_blocks (template_id, name, notes, order_index, week_number)
        VALUES (v_new_template_id, v_old_block.name, v_old_block.notes, v_old_block.order_index, v_old_block.week_number)
        RETURNING id INTO v_new_block_id;

        -- 3. Loop through exercises for this block
        FOR v_old_exercise IN
            SELECT * FROM block_exercises WHERE block_id = v_old_block.id ORDER BY order_index ASC
        LOOP
            INSERT INTO block_exercises (block_id, exercise_id, sets, reps, rest_seconds, notes, order_index)
            VALUES (v_new_block_id, v_old_exercise.exercise_id, v_old_exercise.sets, v_old_exercise.reps, v_old_exercise.rest_seconds, v_old_exercise.notes, v_old_exercise.order_index);
        END LOOP;
    END LOOP;

    -- 4. Assign to warrior_programs
    -- Deactivate any previous active programs for this warrior
    UPDATE warrior_programs SET status = 'completed' WHERE warrior_id = p_warrior_id AND status = 'active';

    INSERT INTO warrior_programs (coach_id, warrior_id, template_id, status)
    VALUES (p_coach_id, p_warrior_id, v_new_template_id, 'active');

    RETURN v_new_template_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_glory(s_tier integer, p_tier integer, st_tier integer, pullups integer, pushups integer, dips integer, mu integer, streak integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RETURN (
    COALESCE(s_tier,0)*200 + COALESCE(p_tier,0)*150 + COALESCE(st_tier,0)*150 +
    COALESCE(pullups,0)*4 + COALESCE(pushups,0)*2 + COALESCE(dips,0)*3 +
    COALESCE(mu,0)*12 + COALESCE(streak,0)*5
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_username_available(username text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM profiles WHERE LOWER(display_name) = LOWER(username)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_clash_victory(session_id uuid, claiming_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  updated_rows INTEGER;
BEGIN
  UPDATE public.clash_sessions
  SET 
    status = 'finished',
    winner_id = claiming_user_id,
    finished_at = NOW()
  WHERE id = session_id
    AND status IN ('active', 'accepted');
  
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  
  RETURN updated_rows > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_tournament_advance_lock(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  updated_count INT;
BEGIN
  -- Only one person can set is_advancing to TRUE at a time
  UPDATE tournament_sessions
  SET is_advancing = TRUE
  WHERE id = p_session_id
    AND is_advancing = FALSE
    AND status = 'active';
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_coach_client_data(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template_id UUID;
  v_template_name TEXT;
  v_warrior_id UUID;
BEGIN
  -- Get assignment details
  SELECT template_id, warrior_id INTO v_template_id, v_warrior_id
  FROM public.warrior_programs
  WHERE id = p_assignment_id;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  -- A. Delete all workout logs associated with this program
  DELETE FROM public.workout_logs
  WHERE warrior_program_id = p_assignment_id;

  -- B. Delete the assignment connecting the client to the template
  DELETE FROM public.warrior_programs
  WHERE id = p_assignment_id;

  -- C. Check if template is custom
  SELECT name INTO v_template_name
  FROM public.program_templates
  WHERE id = v_template_id;

  -- D. If it's a custom template, completely wipe it
  IF v_template_name LIKE '[CUSTOM]%' THEN
    -- Delete block exercises
    DELETE FROM public.block_exercises
    WHERE block_id IN (
      SELECT id FROM public.program_blocks WHERE template_id = v_template_id
    );

    -- Delete blocks
    DELETE FROM public.program_blocks
    WHERE template_id = v_template_id;

    -- Delete template
    DELETE FROM public.program_templates
    WHERE id = v_template_id;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_coach_week_data(p_template_id uuid, p_week_number integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- A. Delete workout logs mapped to the blocks of this week
  DELETE FROM public.workout_logs
  WHERE block_id IN (
    SELECT id FROM public.program_blocks 
    WHERE template_id = p_template_id AND week_number = p_week_number
  );

  -- B. Delete block exercises mapped to the blocks of this week
  DELETE FROM public.block_exercises
  WHERE block_id IN (
    SELECT id FROM public.program_blocks 
    WHERE template_id = p_template_id AND week_number = p_week_number
  );

  -- C. Delete the program blocks themselves
  DELETE FROM public.program_blocks
  WHERE template_id = p_template_id AND week_number = p_week_number;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.finish_clash_session(p_session_id uuid, p_user_id uuid, p_time_seconds integer, p_is_sender boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_session record;
  v_winner_id uuid;
  v_both_finished boolean := false;
BEGIN
  -- 1. LOCK THE ROW: Prevents any other process from touching this session until we are done
  SELECT * FROM clash_sessions 
  WHERE id = p_session_id 
  FOR UPDATE INTO v_session;
  -- 2. IDEMPOTENCY CHECK: If a winner is already crowned, stop immediately
  IF v_session.winner_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Session already finalized',
      'winner_id', v_session.winner_id,
      'both_finished', true
    );
  END IF;
  -- 3. Check if user already submitted (prevent double-submit from same user)
  IF (p_is_sender AND v_session.sender_finish_time IS NOT NULL) OR
     (NOT p_is_sender AND v_session.receiver_finish_time IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Score already recorded');
  END IF;
  -- 4. Record the score
  IF p_is_sender THEN
    UPDATE clash_sessions SET sender_finish_time = p_time_seconds WHERE id = p_session_id;
    v_session.sender_finish_time := p_time_seconds;
  ELSE
    UPDATE clash_sessions SET receiver_finish_time = p_time_seconds WHERE id = p_session_id;
    v_session.receiver_finish_time := p_time_seconds;
  END IF;
  -- 5. Check if both are now finished
  IF v_session.sender_finish_time IS NOT NULL AND v_session.receiver_finish_time IS NOT NULL THEN
    v_both_finished := true;
    
    -- Determine winner
    IF v_session.sender_finish_time < v_session.receiver_finish_time THEN
      v_winner_id := v_session.sender_id;
    ELSIF v_session.receiver_finish_time < v_session.sender_finish_time THEN
      v_winner_id := v_session.receiver_id;
    ELSE
      v_winner_id := NULL; -- Draw (optional handling)
    END IF;
    -- Finalize session
    UPDATE clash_sessions SET 
      winner_id = v_winner_id,
      status = 'finished'
    WHERE id = p_session_id;
    -- Award Glory Points to winner
    IF v_winner_id IS NOT NULL THEN
      UPDATE profiles SET glory_score = glory_score + 10 WHERE id = v_winner_id;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'winner_id', v_winner_id,
    'both_finished', v_both_finished
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_arena_worldwide_rankings(p_phase_id text, p_user_id uuid)
 RETURNS TABLE(display_name text, completion_time integer, is_user_entry boolean, calculated_rank bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH combined_results AS (
        -- Professional Benchmarks
        SELECT 
            apr.athlete_name::TEXT as display_name,
            apr.time_in_seconds as completion_time,
            false as is_user_entry
        FROM public.arena_pro_results apr
        WHERE apr.phase_id = p_phase_id

        UNION ALL

        -- User Best Attempts (using display_name from profiles)
        SELECT 
            COALESCE(p.display_name, 'Warrior')::TEXT as display_name,
            MIN(aa.time_in_seconds) as completion_time,
            true as is_user_entry
        FROM public.arena_attempts aa
        LEFT JOIN public.profiles p ON aa.user_id = p.id
        WHERE aa.phase_id = p_phase_id
        GROUP BY p.id, p.display_name
    )
    SELECT 
        cr.display_name,
        cr.completion_time,
        cr.is_user_entry,
        RANK() OVER (ORDER BY cr.completion_time ASC) as calculated_rank
    FROM combined_results cr
    ORDER BY cr.completion_time ASC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_global_well_rounded_leaderboard()
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, country text, static_pts numeric, power_pts numeric, endurance_pts numeric, total_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        ROW_NUMBER() OVER (ORDER BY (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) DESC) as rank,
        id as user_id,
        profiles.display_name,
        profiles.country,
        COALESCE(statics_tier, 0) as static_pts,
        COALESCE(power_points, 0) as power_pts,
        COALESCE(one_mm_points, 0) as endurance_pts,
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) as total_score
    FROM 
        public.profiles
    WHERE 
        (COALESCE(statics_tier, 0) + COALESCE(power_points, 0) + COALESCE(one_mm_points, 0)) > 0
    ORDER BY 
        total_score DESC
    LIMIT 100;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_onemm_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, country text, t_score numeric, rnk bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH pattern_peaks AS (
        SELECT 
            omml.user_id,
            CASE 
                WHEN omml.movement_id IN ('knee_push_ups', 'incline_push_ups', 'push_ups') THEN 'push'
                WHEN omml.movement_id IN ('inverted_row', 'assisted_pull_ups', 'pull_ups') THEN 'pull'
                WHEN omml.movement_id IN ('bench_dips', 'dips') THEN 'dip'
                WHEN omml.movement_id IN ('air_squats', 'goblet_squats') THEN 'squat'
                WHEN omml.movement_id IN ('deadlift') THEN 'deadlift'
                WHEN omml.movement_id IN ('muscle_ups') THEN 'muscle_up'
                WHEN omml.movement_id IN ('hspu') THEN 'hspu'
                WHEN omml.movement_id IN ('fl_press') THEN 'fl_press'
                WHEN omml.movement_id IN ('fl_pull_ups') THEN 'fl_pull'
                WHEN omml.movement_id IN ('planche_push_ups') THEN 'planche'
            END as pattern_id,
            MAX(omml.points) as best_points
        FROM public.one_min_max_logs omml
        GROUP BY omml.user_id, pattern_id
    ),
    user_totals AS (
        SELECT 
            pp.user_id,
            SUM(pp.best_points) as total_score
        FROM pattern_peaks pp
        WHERE pp.pattern_id IS NOT NULL
        GROUP BY pp.user_id
    )
    SELECT 
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        p.country as country,
        ut.total_score::NUMERIC as t_score,
        DENSE_RANK() OVER (ORDER BY ut.total_score DESC) as rnk
    FROM user_totals ut
    JOIN public.profiles p ON ut.user_id = p.id
    ORDER BY t_score DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_static_level_leaderboard(l_id integer, m_ids text[])
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, total_points numeric, movement_times jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY SUM(sh.points) DESC) as rank,
    sh.user_id, 
    COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    SUM(sh.points) as total_points,
    jsonb_object_agg(sh.movement_id, sh.hold_seconds) as movement_times
  FROM public.static_holds sh 
  JOIN public.profiles p ON sh.user_id = p.id
  WHERE sh.movement_id = ANY(m_ids) 
  GROUP BY sh.user_id, p.display_name, p.email
  ORDER BY total_points DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_static_movement_leaderboard(m_id text)
 RETURNS TABLE(rank bigint, user_id uuid, display_name text, best_time_seconds numeric, points numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT ROW_NUMBER() OVER (ORDER BY sh.points DESC, sh.created_at ASC) as rank,
    sh.user_id, COALESCE(p.display_name, split_part(p.email, '@', 1)) as display_name,
    sh.hold_seconds as best_time_seconds, sh.points
  FROM public.static_holds sh JOIN public.profiles p ON sh.user_id = p.id
  WHERE sh.movement_id = m_id ORDER BY sh.points DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_static_well_rounded_leaderboard()
 RETURNS TABLE(u_id uuid, d_name text, hs_pts numeric, fl_pts numeric, bl_pts numeric, pl_pts numeric, t_score numeric, rnk bigint, country text, gender text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    WITH best_per_category AS (
        SELECT 
            sh.user_id,
            CASE 
                WHEN sh.movement_id IN ('wall_handstand', 'freestanding_handstand', 'one_arm_handstand') THEN 'handstand'
                WHEN sh.movement_id IN ('tuck_front_lever', 'straddle_front_lever', 'full_front_lever') THEN 'front_lever'
                WHEN sh.movement_id IN ('tuck_back_lever', 'straddle_back_lever', 'full_back_lever') THEN 'back_lever'
                WHEN sh.movement_id IN ('tuck_planche', 'straddle_planche', 'full_planche') THEN 'planche'
            END as category,
            MAX(sh.points) as best_points
        FROM public.static_holds sh
        GROUP BY sh.user_id, category
    ),
    pivoted AS (
        SELECT 
            bpc.user_id,
            MAX(CASE WHEN bpc.category = 'handstand' THEN bpc.best_points ELSE 0 END) as hs_pts,
            MAX(CASE WHEN bpc.category = 'front_lever' THEN bpc.best_points ELSE 0 END) as fl_pts,
            MAX(CASE WHEN bpc.category = 'back_lever' THEN bpc.best_points ELSE 0 END) as bl_pts,
            MAX(CASE WHEN bpc.category = 'planche' THEN bpc.best_points ELSE 0 END) as pl_pts
        FROM best_per_category bpc
        WHERE bpc.category IS NOT NULL
        GROUP BY bpc.user_id
    )
    SELECT 
        p.id as u_id,
        COALESCE(p.display_name, split_part(p.email, '@', 1)) as d_name,
        pv.hs_pts,
        pv.fl_pts,
        pv.bl_pts,
        pv.pl_pts,
        (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) as t_score,
        DENSE_RANK() OVER (ORDER BY (pv.hs_pts + pv.fl_pts + pv.bl_pts + pv.pl_pts) DESC) as rnk,
        p.country,
        p.gender
    FROM pivoted pv
    JOIN public.profiles p ON pv.user_id = p.id
    ORDER BY t_score DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tier_leaderboard(tier_num integer)
 RETURNS TABLE(user_id uuid, display_name text, best_time integer, total_attempts bigint, country text, gender text)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  SELECT 
    th.user_id,
    p.display_name,
    MIN(th.time_seconds) as best_time,
    COUNT(th.id) as total_attempts,
    p.country,
    p.gender
  FROM trial_history th
  JOIN profiles p ON p.id = th.user_id
  WHERE th.tier_attempted = tier_num 
    AND th.completed = true
  GROUP BY th.user_id, p.display_name, p.country, p.gender
  ORDER BY best_time ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_clash_bracket(user_tier integer)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Tier 3, 4, 5 are now Developing
    IF user_tier >= 3 AND user_tier <= 5 THEN
        RETURN 'developing';
    -- Tier 6, 7, 8 are Elite
    ELSIF user_tier >= 6 AND user_tier <= 8 THEN
        RETURN 'elite';
    ELSE
        -- Tiers 0, 1, 2 are locked
        RETURN 'none';
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Allow system/Postgres roles and the admin service_role to bypass this check
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;

    -- If a normal authenticated user is trying to update, check if protected fields changed
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
       NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
       NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
       NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
       NEW.glory_score IS DISTINCT FROM OLD.glory_score OR
       NEW.streak IS DISTINCT FROM OLD.streak OR
       NEW.trials_passed IS DISTINCT FROM OLD.trials_passed OR
       NEW.power_points IS DISTINCT FROM OLD.power_points OR
       NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_clash_victory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        -- Case: Clear Winner
        IF NEW.winner_id IS NOT NULL THEN
            UPDATE profiles SET glory_score = glory_score + 25 WHERE id = NEW.winner_id;
            
            IF NEW.winner_id = NEW.sender_id THEN
                UPDATE profiles SET glory_score = GREATEST(0, glory_score - 15) WHERE id = NEW.receiver_id;
            ELSE
                UPDATE profiles SET glory_score = GREATEST(0, glory_score - 15) WHERE id = NEW.sender_id;
            END IF;
        
        -- Case: Draw (Split Glory)
        ELSIF NEW.sender_finish_time IS NOT NULL AND NEW.receiver_finish_time IS NOT NULL THEN
            UPDATE profiles SET glory_score = glory_score + 5 WHERE id IN (NEW.sender_id, NEW.receiver_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Insert the new user into the profiles table, mapping all metadata correctly
  INSERT INTO public.profiles (
    id, 
    email, 
    first_name, 
    last_name, 
    display_name, 
    gender, 
    country, 
    timezone, 
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'country',
    COALESCE(NEW.raw_user_meta_data->>'timezone', 'UTC'),
    NOW()
  );
  
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.payout_tournament(p_user_id uuid, p_gp_reward integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF p_gp_reward <= 0 THEN
        RETURN;
    END IF;
    
    UPDATE public.profiles
    SET tournament_gp = COALESCE(tournament_gp, 0) + p_gp_reward,
        glory_score = COALESCE(glory_score, 0) + p_gp_reward
    WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_power_tier_spoofing()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only block if the authenticated user is actively trying to alter (change) the tier value
  IF auth.role() = 'authenticated' AND (NEW.power_tier IS DISTINCT FROM OLD.power_tier) THEN
    RAISE EXCEPTION 'Cannot modify power_tier directly';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_tier_modification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- 'authenticated' and 'anon' are the database roles used by client-side REST calls.
  -- SECURITY DEFINER RPCs run as the 'postgres' role, which bypasses this block safely.
  IF current_user IN ('authenticated', 'anon') AND (
      NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
      NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
      NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
      NEW.power_points IS DISTINCT FROM OLD.power_points OR
      NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points OR
      NEW.glory_score IS DISTINCT FROM OLD.glory_score
  ) THEN
      RAISE EXCEPTION 'Cannot modify restricted progression columns directly.';
  END IF;
  RETURN NEW;
END;
$function$
;

create or replace view "public"."public_leaderboard" as  SELECT id,
    display_name,
    strength_tier,
    power_tier,
    statics_tier,
    glory_score,
    streak,
    trials_passed,
    last_active,
    is_public
   FROM public.profiles
  WHERE (is_public = true)
  ORDER BY glory_score DESC;


CREATE OR REPLACE FUNCTION public.redeem_invite_code(p_code text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_id uuid;
  v_type text;
  v_duration interval;
BEGIN
  -- Finalize the claim. We only need to check if used_by IS NULL 
  -- because the frontend has already acquired the timestamp lock for this flow.
  UPDATE invite_codes
  SET used_by = p_user_id, used_at = now()
  WHERE code ILIKE p_code
    AND used_by IS NULL
  RETURNING id, type INTO v_code_id, v_type;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found or already used');
  END IF;

  CASE v_type
    WHEN 'trial_14' THEN v_duration := interval '14 days';
    WHEN 'member_30' THEN v_duration := interval '30 days';
    WHEN 'member_90' THEN v_duration := interval '90 days';
    WHEN 'lifetime' THEN v_duration := interval '100 years';
    ELSE v_duration := interval '7 days';
  END CASE;

  UPDATE profiles
  SET
    access_granted_at = now(),
    access_expires_at = now() + v_duration,
    invite_code_used = p_code
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_invite_code(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Release the lock by clearing used_at, 
  -- but ONLY if a user hasn't successfully claimed it yet
  UPDATE invite_codes
  SET used_at = NULL
  WHERE code ILIKE p_code
    AND used_by IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_tournament_advance_lock(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE tournament_sessions
  SET is_advancing = FALSE
  WHERE id = p_session_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_invite_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_code_id uuid;
BEGIN
  -- Atomically claim the code by setting used_at, 
  -- but allow it if both used_by AND used_at are null,
  -- OR if the lock is older than 10 minutes (expired reservation)
  UPDATE invite_codes
  SET used_at = now()
  WHERE code ILIKE p_code
    AND used_by IS NULL
    AND (used_at IS NULL OR used_at < now() - interval '10 minutes')
  RETURNING id INTO v_code_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Code not found, invalid, or currently being claimed');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_clash_challenge(receiver_display_name text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    sender_profile profiles%ROWTYPE;
    receiver_profile profiles%ROWTYPE;
    new_clash_id UUID;
    v_bracket TEXT;
BEGIN
    -- Get sender profile
    SELECT * INTO sender_profile FROM profiles WHERE id = auth.uid();
    
    -- Get receiver profile
    SELECT * INTO receiver_profile FROM profiles WHERE display_name = receiver_display_name LIMIT 1;
    
    IF receiver_profile.id IS NULL THEN
        RAISE EXCEPTION 'Warrior not found.';
    END IF;
    
    -- Check Brackets
    v_bracket := get_user_clash_bracket(sender_profile.strength_tier);
    IF v_bracket = 'none' THEN
        RAISE EXCEPTION 'You must be at least Tier 3 to start a clash.';
    END IF;
    
    -- Ensure both warriors are in the same bracket
    IF v_bracket != get_user_clash_bracket(receiver_profile.strength_tier) THEN
        RAISE EXCEPTION 'Opponent is not in your battle bracket.';
    END IF;

    -- Create Clash Session
    INSERT INTO clash_sessions (sender_id, receiver_id, bracket, workout_protocol)
    VALUES (sender_profile.id, receiver_profile.id, v_bracket, '{"movements": []}')
    RETURNING id INTO new_clash_id;

    RETURN new_clash_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_initial_assessment(p_tier integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_locked_until TIMESTAMPTZ;
  v_current_locked_until TIMESTAMPTZ;
BEGIN
  -- Check if user is currently under active assessment lockout
  SELECT assessment_locked_until INTO v_current_locked_until
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF v_current_locked_until IS NOT NULL AND v_current_locked_until > NOW() THEN
    RAISE EXCEPTION 'ASSESSMENT_LOCKED: You must wait 72 hours between assessments.';
  END IF;

  -- Set new lockout timestamp
  v_locked_until := NOW() + INTERVAL '72 hours';
  
  -- Execute profile update securely
  UPDATE public.profiles
  SET strength_tier = p_tier,
      assessed_at = NOW(),
      assessment_locked_until = v_locked_until,
      updated_at = NOW()
  WHERE id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_onemm_log(p_movement_id text, p_reps integer)
 RETURNS TABLE(is_new_pb boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_multiplier NUMERIC;
    v_category_id TEXT;
    v_points NUMERIC;
    v_current_max INT := 0;
    v_is_new_pb BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Validate reps (reasonable constraint: max 150 reps in 1 min)
    IF p_reps < 0 OR p_reps > 150 THEN
        RAISE EXCEPTION 'Rep count exceeds realistic human capability.';
    END IF;

    -- Map movement to category and multiplier
    CASE p_movement_id
        WHEN 'knee_push_ups', 'inverted_row', 'bench_dips', 'air_squats', 'incline_push_ups', 'assisted_pull_ups' THEN
            v_category_id := 'entry';
            v_multiplier := 0.25;
        WHEN 'push_ups', 'pull_ups', 'dips', 'goblet_squats', 'deadlift' THEN
            v_category_id := 'main';
            v_multiplier := 0.5;
        WHEN 'muscle_ups', 'hspu', 'fl_press', 'fl_pull_ups', 'planche_push_ups' THEN
            v_category_id := 'advanced';
            v_multiplier := 5.0;
        ELSE
            RAISE EXCEPTION 'Invalid movement ID.';
    END CASE;

    -- Get current max reps for PB comparison
    SELECT COALESCE(MAX(reps), 0) INTO v_current_max
    FROM public.one_min_max_logs
    WHERE user_id = v_user_id AND movement_id = p_movement_id;

    IF p_reps >= v_current_max THEN
        v_is_new_pb := true;
    END IF;

    v_points := p_reps * v_multiplier;

    -- Insert log
    INSERT INTO public.one_min_max_logs (
        user_id,
        movement_id,
        category_id,
        reps,
        points,
        created_at
    )
    VALUES (
        v_user_id,
        p_movement_id,
        v_category_id,
        p_reps,
        v_points,
        NOW()
    );

    -- Sync profile points
    PERFORM public.sync_onemm_points(v_user_id);

    RETURN QUERY SELECT v_is_new_pb;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_power_assessment(p_pullup numeric, p_dip numeric, p_squat numeric, p_muscleup numeric)
 RETURNS TABLE(is_new_pb boolean, is_promotion boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_current_pullup NUMERIC := 0.0;
    v_current_dip NUMERIC := 0.0;
    v_current_squat NUMERIC := 0.0;
    v_current_muscleup NUMERIC := 0.0;
    v_old_points NUMERIC := 0.0;
    v_new_points NUMERIC := 0.0;
    v_old_tier INT := 0;
    v_new_tier INT := 0;
    v_is_new_pb BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Validate bounds (realistic constraints)
    IF p_pullup < 0 OR p_pullup > 150 OR
       p_dip < 0 OR p_dip > 200 OR
       p_squat < 0 OR p_squat > 300 OR
       p_muscleup < 0 OR p_muscleup > 100
    THEN
        RAISE EXCEPTION 'Assessment values exceed realistic physical limits.';
    END IF;

    -- Get current assessment
    SELECT 
        pullup_1rm,
        dip_1rm,
        squat_1rm,
        muscleup_1rm
    INTO
        v_current_pullup,
        v_current_dip,
        v_current_squat,
        v_current_muscleup
    FROM public.power_assessments
    WHERE user_id = v_user_id;

    -- Coalesce explicitly after select since 0 rows overwrites default with NULL
    v_current_pullup := COALESCE(v_current_pullup, 0.0);
    v_current_dip := COALESCE(v_current_dip, 0.0);
    v_current_squat := COALESCE(v_current_squat, 0.0);
    v_current_muscleup := COALESCE(v_current_muscleup, 0.0);

    -- Check if any is a new PB
    IF p_pullup > v_current_pullup OR 
       p_dip > v_current_dip OR 
       p_squat > v_current_squat OR 
       p_muscleup > v_current_muscleup 
    THEN
        v_is_new_pb := true;
    END IF;

    -- Determine new PBs (always keep the max)
    v_current_pullup := GREATEST(v_current_pullup, p_pullup);
    v_current_dip := GREATEST(v_current_dip, p_dip);
    v_current_squat := GREATEST(v_current_squat, p_squat);
    v_current_muscleup := GREATEST(v_current_muscleup, p_muscleup);

    -- Calculate points and level
    v_old_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);
    v_new_points := v_current_pullup + v_current_dip + v_current_squat + (v_current_muscleup * 2);

    -- Volt: 0, Ampere: 100, Tesla: 250
    IF v_old_points >= 250 THEN v_old_tier := 3;
    ELSIF v_old_points >= 100 THEN v_old_tier := 2;
    ELSE v_old_tier := 1;
    END IF;

    IF v_new_points >= 250 THEN v_new_tier := 3;
    ELSIF v_new_points >= 100 THEN v_new_tier := 2;
    ELSE v_new_tier := 1;
    END IF;

    -- Upsert power_assessments
    INSERT INTO public.power_assessments (
        user_id,
        pullup_1rm,
        dip_1rm,
        squat_1rm,
        muscleup_1rm,
        power_tier,
        assessed_at
    )
    VALUES (
        v_user_id,
        v_current_pullup,
        v_current_dip,
        v_current_squat,
        v_current_muscleup,
        v_new_tier,
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE
    SET 
        pullup_1rm = EXCLUDED.pullup_1rm,
        dip_1rm = EXCLUDED.dip_1rm,
        squat_1rm = EXCLUDED.squat_1rm,
        muscleup_1rm = EXCLUDED.muscleup_1rm,
        power_tier = EXCLUDED.power_tier,
        assessed_at = EXCLUDED.assessed_at;

    -- Sync to profile
    UPDATE public.profiles
    SET power_points = v_new_points,
        power_tier = v_new_tier,
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN QUERY SELECT v_is_new_pb, (v_new_tier > v_old_tier);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_static_hold(p_movement_id text, p_hold_seconds numeric)
 RETURNS TABLE(is_new_pb boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_multiplier NUMERIC;
    v_points NUMERIC;
    v_current_hold NUMERIC := 0.0;
    v_is_new_pb BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Validate hold time
    IF p_hold_seconds < 0 OR p_hold_seconds > 300 THEN
        RAISE EXCEPTION 'Hold time exceeds realistic human limits.';
    END IF;

    -- Map movement to multiplier
    CASE p_movement_id
        WHEN 'wall_handstand' THEN v_multiplier := 0.5;
        WHEN 'freestanding_handstand' THEN v_multiplier := 2.0;
        WHEN 'one_arm_handstand' THEN v_multiplier := 8.0;
        
        WHEN 'tuck_front_lever' THEN v_multiplier := 0.25;
        WHEN 'straddle_front_lever' THEN v_multiplier := 1.0;
        WHEN 'full_front_lever' THEN v_multiplier := 6.0;
        
        WHEN 'tuck_planche' THEN v_multiplier := 1.0;
        WHEN 'straddle_planche' THEN v_multiplier := 2.0;
        WHEN 'full_planche' THEN v_multiplier := 8.0;
        
        WHEN 'tuck_back_lever' THEN v_multiplier := 0.25;
        WHEN 'straddle_back_lever' THEN v_multiplier := 1.0;
        WHEN 'full_back_lever' THEN v_multiplier := 3.0;
        ELSE
            RAISE EXCEPTION 'Invalid movement ID.';
    END CASE;

    -- Get current PB
    SELECT hold_seconds INTO v_current_hold
    FROM public.static_holds
    WHERE user_id = v_user_id AND movement_id = p_movement_id;

    -- Coalesce explicitly after select since 0 rows overwrites default with NULL
    v_current_hold := COALESCE(v_current_hold, 0.0);

    IF p_hold_seconds > v_current_hold THEN
        v_is_new_pb := true;
        v_points := p_hold_seconds * v_multiplier;

        INSERT INTO public.static_holds (
            user_id,
            movement_id,
            hold_seconds,
            points,
            created_at
        )
        VALUES (
            v_user_id,
            p_movement_id,
            p_hold_seconds,
            v_points,
            NOW()
        )
        ON CONFLICT (user_id, movement_id) DO UPDATE
        SET 
            hold_seconds = EXCLUDED.hold_seconds,
            points = EXCLUDED.points,
            created_at = EXCLUDED.created_at;

        PERFORM public.sync_static_points(v_user_id);
    END IF;

    RETURN QUERY SELECT v_is_new_pb;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_weekly_score(p_challenge_id uuid, p_score numeric, p_metadata jsonb)
 RETURNS TABLE(is_better boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_user_id UUID;
    v_scoring_type TEXT;
    v_current_score NUMERIC;
    v_is_better BOOLEAN := false;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated.';
    END IF;

    -- Fetch challenge scoring type
    SELECT scoring_type INTO v_scoring_type
    FROM public.weekly_challenges
    WHERE id = p_challenge_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active challenge not found.';
    END IF;

    -- Validate score bounds
    IF p_score <= 0 OR p_score > 10000 THEN
        RAISE EXCEPTION 'Submitted score exceeds realistic limits.';
    END IF;

    -- Fetch existing entry score
    SELECT score INTO v_current_score
    FROM public.weekly_entries
    WHERE challenge_id = p_challenge_id AND user_id = v_user_id;

    IF v_current_score IS NULL THEN
        v_is_better := true;
    ELSE
        IF v_scoring_type = 'time' THEN
            IF p_score < v_current_score THEN
                v_is_better := true;
            END IF;
        ELSE
            IF p_score > v_current_score THEN
                v_is_better := true;
            END IF;
        END IF;
    END IF;

    IF v_is_better THEN
        INSERT INTO public.weekly_entries (
            challenge_id,
            user_id,
            score,
            metadata,
            submitted_at
        )
        VALUES (
            p_challenge_id,
            v_user_id,
            p_score,
            p_metadata,
            NOW()
        )
        ON CONFLICT (challenge_id, user_id) DO UPDATE
        SET 
            score = EXCLUDED.score,
            metadata = EXCLUDED.metadata,
            submitted_at = EXCLUDED.submitted_at;
    END IF;

    RETURN QUERY SELECT v_is_better;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_onemm_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_total NUMERIC := 0.0;
BEGIN
  WITH pattern_peaks AS (
    SELECT 
      CASE 
        WHEN movement_id IN ('knee_push_ups', 'incline_push_ups', 'push_ups') THEN 'push'
        WHEN movement_id IN ('inverted_row', 'assisted_pull_ups', 'pull_ups') THEN 'pull'
        WHEN movement_id IN ('bench_dips', 'dips') THEN 'dip'
        WHEN movement_id IN ('air_squats', 'goblet_squats') THEN 'squat'
        WHEN movement_id IN ('deadlift') THEN 'deadlift'
        WHEN movement_id IN ('muscle_ups') THEN 'muscle_up'
        WHEN movement_id IN ('hspu') THEN 'hspu'
        WHEN movement_id IN ('fl_press') THEN 'fl_press'
        WHEN movement_id IN ('fl_pull_ups') THEN 'fl_pull'
        WHEN movement_id IN ('planche_push_ups') THEN 'planche'
      END as pattern_id,
      MAX(points) as best_points
    FROM public.one_min_max_logs
    WHERE user_id = p_user_id
    GROUP BY pattern_id
  )
  SELECT COALESCE(SUM(best_points), 0.0) INTO v_total
  FROM pattern_peaks
  WHERE pattern_id IS NOT NULL;

  UPDATE public.profiles SET one_mm_points = v_total WHERE id = p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_power_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_points NUMERIC;
  v_tier INT;
  v_claims TEXT;
BEGIN
  SELECT 
    (COALESCE(pullup_1rm, 0) + COALESCE(dip_1rm, 0) + COALESCE(squat_1rm, 0) + (COALESCE(muscleup_1rm, 0) * 2))::NUMERIC
  INTO v_points
  FROM public.power_assessments
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    v_points := 0.0;
    v_tier := 0;
  ELSE
    IF v_points >= 250 THEN
      v_tier := 3;
    ELSIF v_points >= 100 THEN
      v_tier := 2;
    ELSE
      v_tier := 1;
    END IF;
  END IF;

  -- Update power_assessments to keep values matching
  UPDATE public.power_assessments
  SET power_tier = v_tier
  WHERE user_id = p_user_id;

  v_claims := COALESCE(current_setting('request.jwt.claims', true), '');
  PERFORM set_config('request.jwt.claims', '', true);

  UPDATE public.profiles
  SET power_points = v_points,
      power_tier = v_tier,
      updated_at = NOW()
  WHERE id = p_user_id;

  IF v_claims <> '' THEN
    PERFORM set_config('request.jwt.claims', v_claims, true);
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_static_points(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_handstand_peak NUMERIC := 0.0;
  v_front_lever_peak NUMERIC := 0.0;
  v_back_lever_peak NUMERIC := 0.0;
  v_planche_peak NUMERIC := 0.0;
  v_total NUMERIC := 0.0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT 
      CASE 
        WHEN movement_id IN ('wall_handstand', 'freestanding_handstand', 'one_arm_handstand') THEN 'handstand'
        WHEN movement_id IN ('tuck_front_lever', 'straddle_front_lever', 'full_front_lever') THEN 'front_lever'
        WHEN movement_id IN ('tuck_back_lever', 'straddle_back_lever', 'full_back_lever') THEN 'back_lever'
        WHEN movement_id IN ('tuck_planche', 'straddle_planche', 'full_planche') THEN 'planche'
      END as category,
      points
    FROM public.static_holds 
    WHERE user_id = p_user_id
  LOOP
    IF rec.category = 'handstand'    AND rec.points > v_handstand_peak    THEN v_handstand_peak    := rec.points; END IF;
    IF rec.category = 'front_lever'  AND rec.points > v_front_lever_peak  THEN v_front_lever_peak  := rec.points; END IF;
    IF rec.category = 'back_lever'   AND rec.points > v_back_lever_peak   THEN v_back_lever_peak   := rec.points; END IF;
    IF rec.category = 'planche'      AND rec.points > v_planche_peak      THEN v_planche_peak      := rec.points; END IF;
  END LOOP;

  v_total := v_handstand_peak + v_front_lever_peak + v_back_lever_peak + v_planche_peak;

  UPDATE public.profiles SET statics_tier = v_total WHERE id = p_user_id;
END;
$function$
;

grant delete on table "public"."arena_attempts" to "anon";

grant insert on table "public"."arena_attempts" to "anon";

grant references on table "public"."arena_attempts" to "anon";

grant select on table "public"."arena_attempts" to "anon";

grant trigger on table "public"."arena_attempts" to "anon";

grant truncate on table "public"."arena_attempts" to "anon";

grant update on table "public"."arena_attempts" to "anon";

grant delete on table "public"."arena_attempts" to "authenticated";

grant insert on table "public"."arena_attempts" to "authenticated";

grant references on table "public"."arena_attempts" to "authenticated";

grant select on table "public"."arena_attempts" to "authenticated";

grant trigger on table "public"."arena_attempts" to "authenticated";

grant truncate on table "public"."arena_attempts" to "authenticated";

grant update on table "public"."arena_attempts" to "authenticated";

grant delete on table "public"."arena_attempts" to "service_role";

grant insert on table "public"."arena_attempts" to "service_role";

grant references on table "public"."arena_attempts" to "service_role";

grant select on table "public"."arena_attempts" to "service_role";

grant trigger on table "public"."arena_attempts" to "service_role";

grant truncate on table "public"."arena_attempts" to "service_role";

grant update on table "public"."arena_attempts" to "service_role";

grant delete on table "public"."arena_competitions" to "anon";

grant insert on table "public"."arena_competitions" to "anon";

grant references on table "public"."arena_competitions" to "anon";

grant select on table "public"."arena_competitions" to "anon";

grant trigger on table "public"."arena_competitions" to "anon";

grant truncate on table "public"."arena_competitions" to "anon";

grant update on table "public"."arena_competitions" to "anon";

grant delete on table "public"."arena_competitions" to "authenticated";

grant insert on table "public"."arena_competitions" to "authenticated";

grant references on table "public"."arena_competitions" to "authenticated";

grant select on table "public"."arena_competitions" to "authenticated";

grant trigger on table "public"."arena_competitions" to "authenticated";

grant truncate on table "public"."arena_competitions" to "authenticated";

grant update on table "public"."arena_competitions" to "authenticated";

grant delete on table "public"."arena_competitions" to "service_role";

grant insert on table "public"."arena_competitions" to "service_role";

grant references on table "public"."arena_competitions" to "service_role";

grant select on table "public"."arena_competitions" to "service_role";

grant trigger on table "public"."arena_competitions" to "service_role";

grant truncate on table "public"."arena_competitions" to "service_role";

grant update on table "public"."arena_competitions" to "service_role";

grant delete on table "public"."arena_phases" to "anon";

grant insert on table "public"."arena_phases" to "anon";

grant references on table "public"."arena_phases" to "anon";

grant select on table "public"."arena_phases" to "anon";

grant trigger on table "public"."arena_phases" to "anon";

grant truncate on table "public"."arena_phases" to "anon";

grant update on table "public"."arena_phases" to "anon";

grant delete on table "public"."arena_phases" to "authenticated";

grant insert on table "public"."arena_phases" to "authenticated";

grant references on table "public"."arena_phases" to "authenticated";

grant select on table "public"."arena_phases" to "authenticated";

grant trigger on table "public"."arena_phases" to "authenticated";

grant truncate on table "public"."arena_phases" to "authenticated";

grant update on table "public"."arena_phases" to "authenticated";

grant delete on table "public"."arena_phases" to "service_role";

grant insert on table "public"."arena_phases" to "service_role";

grant references on table "public"."arena_phases" to "service_role";

grant select on table "public"."arena_phases" to "service_role";

grant trigger on table "public"."arena_phases" to "service_role";

grant truncate on table "public"."arena_phases" to "service_role";

grant update on table "public"."arena_phases" to "service_role";

grant delete on table "public"."arena_pro_results" to "anon";

grant insert on table "public"."arena_pro_results" to "anon";

grant references on table "public"."arena_pro_results" to "anon";

grant select on table "public"."arena_pro_results" to "anon";

grant trigger on table "public"."arena_pro_results" to "anon";

grant truncate on table "public"."arena_pro_results" to "anon";

grant update on table "public"."arena_pro_results" to "anon";

grant delete on table "public"."arena_pro_results" to "authenticated";

grant insert on table "public"."arena_pro_results" to "authenticated";

grant references on table "public"."arena_pro_results" to "authenticated";

grant select on table "public"."arena_pro_results" to "authenticated";

grant trigger on table "public"."arena_pro_results" to "authenticated";

grant truncate on table "public"."arena_pro_results" to "authenticated";

grant update on table "public"."arena_pro_results" to "authenticated";

grant delete on table "public"."arena_pro_results" to "service_role";

grant insert on table "public"."arena_pro_results" to "service_role";

grant references on table "public"."arena_pro_results" to "service_role";

grant select on table "public"."arena_pro_results" to "service_role";

grant trigger on table "public"."arena_pro_results" to "service_role";

grant truncate on table "public"."arena_pro_results" to "service_role";

grant update on table "public"."arena_pro_results" to "service_role";

grant delete on table "public"."block_exercises" to "anon";

grant insert on table "public"."block_exercises" to "anon";

grant references on table "public"."block_exercises" to "anon";

grant select on table "public"."block_exercises" to "anon";

grant trigger on table "public"."block_exercises" to "anon";

grant truncate on table "public"."block_exercises" to "anon";

grant update on table "public"."block_exercises" to "anon";

grant delete on table "public"."block_exercises" to "authenticated";

grant insert on table "public"."block_exercises" to "authenticated";

grant references on table "public"."block_exercises" to "authenticated";

grant select on table "public"."block_exercises" to "authenticated";

grant trigger on table "public"."block_exercises" to "authenticated";

grant truncate on table "public"."block_exercises" to "authenticated";

grant update on table "public"."block_exercises" to "authenticated";

grant delete on table "public"."block_exercises" to "service_role";

grant insert on table "public"."block_exercises" to "service_role";

grant references on table "public"."block_exercises" to "service_role";

grant select on table "public"."block_exercises" to "service_role";

grant trigger on table "public"."block_exercises" to "service_role";

grant truncate on table "public"."block_exercises" to "service_role";

grant update on table "public"."block_exercises" to "service_role";

grant delete on table "public"."clash_sessions" to "anon";

grant insert on table "public"."clash_sessions" to "anon";

grant references on table "public"."clash_sessions" to "anon";

grant select on table "public"."clash_sessions" to "anon";

grant trigger on table "public"."clash_sessions" to "anon";

grant truncate on table "public"."clash_sessions" to "anon";

grant update on table "public"."clash_sessions" to "anon";

grant delete on table "public"."clash_sessions" to "authenticated";

grant insert on table "public"."clash_sessions" to "authenticated";

grant references on table "public"."clash_sessions" to "authenticated";

grant select on table "public"."clash_sessions" to "authenticated";

grant trigger on table "public"."clash_sessions" to "authenticated";

grant truncate on table "public"."clash_sessions" to "authenticated";

grant update on table "public"."clash_sessions" to "authenticated";

grant delete on table "public"."clash_sessions" to "service_role";

grant insert on table "public"."clash_sessions" to "service_role";

grant references on table "public"."clash_sessions" to "service_role";

grant select on table "public"."clash_sessions" to "service_role";

grant trigger on table "public"."clash_sessions" to "service_role";

grant truncate on table "public"."clash_sessions" to "service_role";

grant update on table "public"."clash_sessions" to "service_role";

grant delete on table "public"."exercise_library" to "anon";

grant insert on table "public"."exercise_library" to "anon";

grant references on table "public"."exercise_library" to "anon";

grant select on table "public"."exercise_library" to "anon";

grant trigger on table "public"."exercise_library" to "anon";

grant truncate on table "public"."exercise_library" to "anon";

grant update on table "public"."exercise_library" to "anon";

grant delete on table "public"."exercise_library" to "authenticated";

grant insert on table "public"."exercise_library" to "authenticated";

grant references on table "public"."exercise_library" to "authenticated";

grant select on table "public"."exercise_library" to "authenticated";

grant trigger on table "public"."exercise_library" to "authenticated";

grant truncate on table "public"."exercise_library" to "authenticated";

grant update on table "public"."exercise_library" to "authenticated";

grant delete on table "public"."exercise_library" to "service_role";

grant insert on table "public"."exercise_library" to "service_role";

grant references on table "public"."exercise_library" to "service_role";

grant select on table "public"."exercise_library" to "service_role";

grant trigger on table "public"."exercise_library" to "service_role";

grant truncate on table "public"."exercise_library" to "service_role";

grant update on table "public"."exercise_library" to "service_role";

grant delete on table "public"."invite_codes" to "anon";

grant insert on table "public"."invite_codes" to "anon";

grant references on table "public"."invite_codes" to "anon";

grant select on table "public"."invite_codes" to "anon";

grant trigger on table "public"."invite_codes" to "anon";

grant truncate on table "public"."invite_codes" to "anon";

grant update on table "public"."invite_codes" to "anon";

grant delete on table "public"."invite_codes" to "authenticated";

grant insert on table "public"."invite_codes" to "authenticated";

grant references on table "public"."invite_codes" to "authenticated";

grant select on table "public"."invite_codes" to "authenticated";

grant trigger on table "public"."invite_codes" to "authenticated";

grant truncate on table "public"."invite_codes" to "authenticated";

grant update on table "public"."invite_codes" to "authenticated";

grant delete on table "public"."invite_codes" to "service_role";

grant insert on table "public"."invite_codes" to "service_role";

grant references on table "public"."invite_codes" to "service_role";

grant select on table "public"."invite_codes" to "service_role";

grant trigger on table "public"."invite_codes" to "service_role";

grant truncate on table "public"."invite_codes" to "service_role";

grant update on table "public"."invite_codes" to "service_role";

grant delete on table "public"."invite_requests" to "anon";

grant insert on table "public"."invite_requests" to "anon";

grant references on table "public"."invite_requests" to "anon";

grant select on table "public"."invite_requests" to "anon";

grant trigger on table "public"."invite_requests" to "anon";

grant truncate on table "public"."invite_requests" to "anon";

grant update on table "public"."invite_requests" to "anon";

grant delete on table "public"."invite_requests" to "authenticated";

grant insert on table "public"."invite_requests" to "authenticated";

grant references on table "public"."invite_requests" to "authenticated";

grant select on table "public"."invite_requests" to "authenticated";

grant trigger on table "public"."invite_requests" to "authenticated";

grant truncate on table "public"."invite_requests" to "authenticated";

grant update on table "public"."invite_requests" to "authenticated";

grant delete on table "public"."invite_requests" to "service_role";

grant insert on table "public"."invite_requests" to "service_role";

grant references on table "public"."invite_requests" to "service_role";

grant select on table "public"."invite_requests" to "service_role";

grant trigger on table "public"."invite_requests" to "service_role";

grant truncate on table "public"."invite_requests" to "service_role";

grant update on table "public"."invite_requests" to "service_role";

grant delete on table "public"."one_min_max_logs" to "anon";

grant insert on table "public"."one_min_max_logs" to "anon";

grant references on table "public"."one_min_max_logs" to "anon";

grant select on table "public"."one_min_max_logs" to "anon";

grant trigger on table "public"."one_min_max_logs" to "anon";

grant truncate on table "public"."one_min_max_logs" to "anon";

grant update on table "public"."one_min_max_logs" to "anon";

grant delete on table "public"."one_min_max_logs" to "authenticated";

grant insert on table "public"."one_min_max_logs" to "authenticated";

grant references on table "public"."one_min_max_logs" to "authenticated";

grant select on table "public"."one_min_max_logs" to "authenticated";

grant trigger on table "public"."one_min_max_logs" to "authenticated";

grant truncate on table "public"."one_min_max_logs" to "authenticated";

grant update on table "public"."one_min_max_logs" to "authenticated";

grant delete on table "public"."one_min_max_logs" to "service_role";

grant insert on table "public"."one_min_max_logs" to "service_role";

grant references on table "public"."one_min_max_logs" to "service_role";

grant select on table "public"."one_min_max_logs" to "service_role";

grant trigger on table "public"."one_min_max_logs" to "service_role";

grant truncate on table "public"."one_min_max_logs" to "service_role";

grant update on table "public"."one_min_max_logs" to "service_role";

grant delete on table "public"."one_mm_scores" to "anon";

grant insert on table "public"."one_mm_scores" to "anon";

grant references on table "public"."one_mm_scores" to "anon";

grant select on table "public"."one_mm_scores" to "anon";

grant trigger on table "public"."one_mm_scores" to "anon";

grant truncate on table "public"."one_mm_scores" to "anon";

grant update on table "public"."one_mm_scores" to "anon";

grant delete on table "public"."one_mm_scores" to "authenticated";

grant insert on table "public"."one_mm_scores" to "authenticated";

grant references on table "public"."one_mm_scores" to "authenticated";

grant select on table "public"."one_mm_scores" to "authenticated";

grant trigger on table "public"."one_mm_scores" to "authenticated";

grant truncate on table "public"."one_mm_scores" to "authenticated";

grant update on table "public"."one_mm_scores" to "authenticated";

grant delete on table "public"."one_mm_scores" to "service_role";

grant insert on table "public"."one_mm_scores" to "service_role";

grant references on table "public"."one_mm_scores" to "service_role";

grant select on table "public"."one_mm_scores" to "service_role";

grant trigger on table "public"."one_mm_scores" to "service_role";

grant truncate on table "public"."one_mm_scores" to "service_role";

grant update on table "public"."one_mm_scores" to "service_role";

grant delete on table "public"."power_assessments" to "anon";

grant insert on table "public"."power_assessments" to "anon";

grant references on table "public"."power_assessments" to "anon";

grant select on table "public"."power_assessments" to "anon";

grant trigger on table "public"."power_assessments" to "anon";

grant truncate on table "public"."power_assessments" to "anon";

grant update on table "public"."power_assessments" to "anon";

grant delete on table "public"."power_assessments" to "authenticated";

grant insert on table "public"."power_assessments" to "authenticated";

grant references on table "public"."power_assessments" to "authenticated";

grant select on table "public"."power_assessments" to "authenticated";

grant trigger on table "public"."power_assessments" to "authenticated";

grant truncate on table "public"."power_assessments" to "authenticated";

grant update on table "public"."power_assessments" to "authenticated";

grant delete on table "public"."power_assessments" to "service_role";

grant insert on table "public"."power_assessments" to "service_role";

grant references on table "public"."power_assessments" to "service_role";

grant select on table "public"."power_assessments" to "service_role";

grant trigger on table "public"."power_assessments" to "service_role";

grant truncate on table "public"."power_assessments" to "service_role";

grant update on table "public"."power_assessments" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."program_blocks" to "anon";

grant insert on table "public"."program_blocks" to "anon";

grant references on table "public"."program_blocks" to "anon";

grant select on table "public"."program_blocks" to "anon";

grant trigger on table "public"."program_blocks" to "anon";

grant truncate on table "public"."program_blocks" to "anon";

grant update on table "public"."program_blocks" to "anon";

grant delete on table "public"."program_blocks" to "authenticated";

grant insert on table "public"."program_blocks" to "authenticated";

grant references on table "public"."program_blocks" to "authenticated";

grant select on table "public"."program_blocks" to "authenticated";

grant trigger on table "public"."program_blocks" to "authenticated";

grant truncate on table "public"."program_blocks" to "authenticated";

grant update on table "public"."program_blocks" to "authenticated";

grant delete on table "public"."program_blocks" to "service_role";

grant insert on table "public"."program_blocks" to "service_role";

grant references on table "public"."program_blocks" to "service_role";

grant select on table "public"."program_blocks" to "service_role";

grant trigger on table "public"."program_blocks" to "service_role";

grant truncate on table "public"."program_blocks" to "service_role";

grant update on table "public"."program_blocks" to "service_role";

grant delete on table "public"."program_templates" to "anon";

grant insert on table "public"."program_templates" to "anon";

grant references on table "public"."program_templates" to "anon";

grant select on table "public"."program_templates" to "anon";

grant trigger on table "public"."program_templates" to "anon";

grant truncate on table "public"."program_templates" to "anon";

grant update on table "public"."program_templates" to "anon";

grant delete on table "public"."program_templates" to "authenticated";

grant insert on table "public"."program_templates" to "authenticated";

grant references on table "public"."program_templates" to "authenticated";

grant select on table "public"."program_templates" to "authenticated";

grant trigger on table "public"."program_templates" to "authenticated";

grant truncate on table "public"."program_templates" to "authenticated";

grant update on table "public"."program_templates" to "authenticated";

grant delete on table "public"."program_templates" to "service_role";

grant insert on table "public"."program_templates" to "service_role";

grant references on table "public"."program_templates" to "service_role";

grant select on table "public"."program_templates" to "service_role";

grant trigger on table "public"."program_templates" to "service_role";

grant truncate on table "public"."program_templates" to "service_role";

grant update on table "public"."program_templates" to "service_role";

grant delete on table "public"."static_holds" to "anon";

grant insert on table "public"."static_holds" to "anon";

grant references on table "public"."static_holds" to "anon";

grant select on table "public"."static_holds" to "anon";

grant trigger on table "public"."static_holds" to "anon";

grant truncate on table "public"."static_holds" to "anon";

grant update on table "public"."static_holds" to "anon";

grant delete on table "public"."static_holds" to "authenticated";

grant insert on table "public"."static_holds" to "authenticated";

grant references on table "public"."static_holds" to "authenticated";

grant select on table "public"."static_holds" to "authenticated";

grant trigger on table "public"."static_holds" to "authenticated";

grant truncate on table "public"."static_holds" to "authenticated";

grant update on table "public"."static_holds" to "authenticated";

grant delete on table "public"."static_holds" to "service_role";

grant insert on table "public"."static_holds" to "service_role";

grant references on table "public"."static_holds" to "service_role";

grant select on table "public"."static_holds" to "service_role";

grant trigger on table "public"."static_holds" to "service_role";

grant truncate on table "public"."static_holds" to "service_role";

grant update on table "public"."static_holds" to "service_role";

grant delete on table "public"."statics_assessments" to "anon";

grant insert on table "public"."statics_assessments" to "anon";

grant references on table "public"."statics_assessments" to "anon";

grant select on table "public"."statics_assessments" to "anon";

grant trigger on table "public"."statics_assessments" to "anon";

grant truncate on table "public"."statics_assessments" to "anon";

grant update on table "public"."statics_assessments" to "anon";

grant delete on table "public"."statics_assessments" to "authenticated";

grant insert on table "public"."statics_assessments" to "authenticated";

grant references on table "public"."statics_assessments" to "authenticated";

grant select on table "public"."statics_assessments" to "authenticated";

grant trigger on table "public"."statics_assessments" to "authenticated";

grant truncate on table "public"."statics_assessments" to "authenticated";

grant update on table "public"."statics_assessments" to "authenticated";

grant delete on table "public"."statics_assessments" to "service_role";

grant insert on table "public"."statics_assessments" to "service_role";

grant references on table "public"."statics_assessments" to "service_role";

grant select on table "public"."statics_assessments" to "service_role";

grant trigger on table "public"."statics_assessments" to "service_role";

grant truncate on table "public"."statics_assessments" to "service_role";

grant update on table "public"."statics_assessments" to "service_role";

grant delete on table "public"."tournament_configs" to "anon";

grant insert on table "public"."tournament_configs" to "anon";

grant references on table "public"."tournament_configs" to "anon";

grant select on table "public"."tournament_configs" to "anon";

grant trigger on table "public"."tournament_configs" to "anon";

grant truncate on table "public"."tournament_configs" to "anon";

grant update on table "public"."tournament_configs" to "anon";

grant delete on table "public"."tournament_configs" to "authenticated";

grant insert on table "public"."tournament_configs" to "authenticated";

grant references on table "public"."tournament_configs" to "authenticated";

grant select on table "public"."tournament_configs" to "authenticated";

grant trigger on table "public"."tournament_configs" to "authenticated";

grant truncate on table "public"."tournament_configs" to "authenticated";

grant update on table "public"."tournament_configs" to "authenticated";

grant delete on table "public"."tournament_configs" to "service_role";

grant insert on table "public"."tournament_configs" to "service_role";

grant references on table "public"."tournament_configs" to "service_role";

grant select on table "public"."tournament_configs" to "service_role";

grant trigger on table "public"."tournament_configs" to "service_role";

grant truncate on table "public"."tournament_configs" to "service_role";

grant update on table "public"."tournament_configs" to "service_role";

grant delete on table "public"."tournament_matches" to "anon";

grant insert on table "public"."tournament_matches" to "anon";

grant references on table "public"."tournament_matches" to "anon";

grant select on table "public"."tournament_matches" to "anon";

grant trigger on table "public"."tournament_matches" to "anon";

grant truncate on table "public"."tournament_matches" to "anon";

grant update on table "public"."tournament_matches" to "anon";

grant delete on table "public"."tournament_matches" to "authenticated";

grant insert on table "public"."tournament_matches" to "authenticated";

grant references on table "public"."tournament_matches" to "authenticated";

grant select on table "public"."tournament_matches" to "authenticated";

grant trigger on table "public"."tournament_matches" to "authenticated";

grant truncate on table "public"."tournament_matches" to "authenticated";

grant update on table "public"."tournament_matches" to "authenticated";

grant delete on table "public"."tournament_matches" to "service_role";

grant insert on table "public"."tournament_matches" to "service_role";

grant references on table "public"."tournament_matches" to "service_role";

grant select on table "public"."tournament_matches" to "service_role";

grant trigger on table "public"."tournament_matches" to "service_role";

grant truncate on table "public"."tournament_matches" to "service_role";

grant update on table "public"."tournament_matches" to "service_role";

grant delete on table "public"."tournament_participants" to "anon";

grant insert on table "public"."tournament_participants" to "anon";

grant references on table "public"."tournament_participants" to "anon";

grant select on table "public"."tournament_participants" to "anon";

grant trigger on table "public"."tournament_participants" to "anon";

grant truncate on table "public"."tournament_participants" to "anon";

grant update on table "public"."tournament_participants" to "anon";

grant delete on table "public"."tournament_participants" to "authenticated";

grant insert on table "public"."tournament_participants" to "authenticated";

grant references on table "public"."tournament_participants" to "authenticated";

grant select on table "public"."tournament_participants" to "authenticated";

grant trigger on table "public"."tournament_participants" to "authenticated";

grant truncate on table "public"."tournament_participants" to "authenticated";

grant update on table "public"."tournament_participants" to "authenticated";

grant delete on table "public"."tournament_participants" to "service_role";

grant insert on table "public"."tournament_participants" to "service_role";

grant references on table "public"."tournament_participants" to "service_role";

grant select on table "public"."tournament_participants" to "service_role";

grant trigger on table "public"."tournament_participants" to "service_role";

grant truncate on table "public"."tournament_participants" to "service_role";

grant update on table "public"."tournament_participants" to "service_role";

grant delete on table "public"."tournament_sessions" to "anon";

grant insert on table "public"."tournament_sessions" to "anon";

grant references on table "public"."tournament_sessions" to "anon";

grant select on table "public"."tournament_sessions" to "anon";

grant trigger on table "public"."tournament_sessions" to "anon";

grant truncate on table "public"."tournament_sessions" to "anon";

grant update on table "public"."tournament_sessions" to "anon";

grant delete on table "public"."tournament_sessions" to "authenticated";

grant insert on table "public"."tournament_sessions" to "authenticated";

grant references on table "public"."tournament_sessions" to "authenticated";

grant select on table "public"."tournament_sessions" to "authenticated";

grant trigger on table "public"."tournament_sessions" to "authenticated";

grant truncate on table "public"."tournament_sessions" to "authenticated";

grant update on table "public"."tournament_sessions" to "authenticated";

grant delete on table "public"."tournament_sessions" to "service_role";

grant insert on table "public"."tournament_sessions" to "service_role";

grant references on table "public"."tournament_sessions" to "service_role";

grant select on table "public"."tournament_sessions" to "service_role";

grant trigger on table "public"."tournament_sessions" to "service_role";

grant truncate on table "public"."tournament_sessions" to "service_role";

grant update on table "public"."tournament_sessions" to "service_role";

grant delete on table "public"."trial_history" to "anon";

grant insert on table "public"."trial_history" to "anon";

grant references on table "public"."trial_history" to "anon";

grant select on table "public"."trial_history" to "anon";

grant trigger on table "public"."trial_history" to "anon";

grant truncate on table "public"."trial_history" to "anon";

grant update on table "public"."trial_history" to "anon";

grant delete on table "public"."trial_history" to "authenticated";

grant insert on table "public"."trial_history" to "authenticated";

grant references on table "public"."trial_history" to "authenticated";

grant select on table "public"."trial_history" to "authenticated";

grant trigger on table "public"."trial_history" to "authenticated";

grant truncate on table "public"."trial_history" to "authenticated";

grant update on table "public"."trial_history" to "authenticated";

grant delete on table "public"."trial_history" to "service_role";

grant insert on table "public"."trial_history" to "service_role";

grant references on table "public"."trial_history" to "service_role";

grant select on table "public"."trial_history" to "service_role";

grant trigger on table "public"."trial_history" to "service_role";

grant truncate on table "public"."trial_history" to "service_role";

grant update on table "public"."trial_history" to "service_role";

grant delete on table "public"."warrior_programs" to "anon";

grant insert on table "public"."warrior_programs" to "anon";

grant references on table "public"."warrior_programs" to "anon";

grant select on table "public"."warrior_programs" to "anon";

grant trigger on table "public"."warrior_programs" to "anon";

grant truncate on table "public"."warrior_programs" to "anon";

grant update on table "public"."warrior_programs" to "anon";

grant delete on table "public"."warrior_programs" to "authenticated";

grant insert on table "public"."warrior_programs" to "authenticated";

grant references on table "public"."warrior_programs" to "authenticated";

grant select on table "public"."warrior_programs" to "authenticated";

grant trigger on table "public"."warrior_programs" to "authenticated";

grant truncate on table "public"."warrior_programs" to "authenticated";

grant update on table "public"."warrior_programs" to "authenticated";

grant delete on table "public"."warrior_programs" to "service_role";

grant insert on table "public"."warrior_programs" to "service_role";

grant references on table "public"."warrior_programs" to "service_role";

grant select on table "public"."warrior_programs" to "service_role";

grant trigger on table "public"."warrior_programs" to "service_role";

grant truncate on table "public"."warrior_programs" to "service_role";

grant update on table "public"."warrior_programs" to "service_role";

grant delete on table "public"."weekly_challenges" to "anon";

grant insert on table "public"."weekly_challenges" to "anon";

grant references on table "public"."weekly_challenges" to "anon";

grant select on table "public"."weekly_challenges" to "anon";

grant trigger on table "public"."weekly_challenges" to "anon";

grant truncate on table "public"."weekly_challenges" to "anon";

grant update on table "public"."weekly_challenges" to "anon";

grant delete on table "public"."weekly_challenges" to "authenticated";

grant insert on table "public"."weekly_challenges" to "authenticated";

grant references on table "public"."weekly_challenges" to "authenticated";

grant select on table "public"."weekly_challenges" to "authenticated";

grant trigger on table "public"."weekly_challenges" to "authenticated";

grant truncate on table "public"."weekly_challenges" to "authenticated";

grant update on table "public"."weekly_challenges" to "authenticated";

grant delete on table "public"."weekly_challenges" to "service_role";

grant insert on table "public"."weekly_challenges" to "service_role";

grant references on table "public"."weekly_challenges" to "service_role";

grant select on table "public"."weekly_challenges" to "service_role";

grant trigger on table "public"."weekly_challenges" to "service_role";

grant truncate on table "public"."weekly_challenges" to "service_role";

grant update on table "public"."weekly_challenges" to "service_role";

grant delete on table "public"."weekly_entries" to "anon";

grant insert on table "public"."weekly_entries" to "anon";

grant references on table "public"."weekly_entries" to "anon";

grant select on table "public"."weekly_entries" to "anon";

grant trigger on table "public"."weekly_entries" to "anon";

grant truncate on table "public"."weekly_entries" to "anon";

grant update on table "public"."weekly_entries" to "anon";

grant delete on table "public"."weekly_entries" to "authenticated";

grant insert on table "public"."weekly_entries" to "authenticated";

grant references on table "public"."weekly_entries" to "authenticated";

grant select on table "public"."weekly_entries" to "authenticated";

grant trigger on table "public"."weekly_entries" to "authenticated";

grant truncate on table "public"."weekly_entries" to "authenticated";

grant update on table "public"."weekly_entries" to "authenticated";

grant delete on table "public"."weekly_entries" to "service_role";

grant insert on table "public"."weekly_entries" to "service_role";

grant references on table "public"."weekly_entries" to "service_role";

grant select on table "public"."weekly_entries" to "service_role";

grant trigger on table "public"."weekly_entries" to "service_role";

grant truncate on table "public"."weekly_entries" to "service_role";

grant update on table "public"."weekly_entries" to "service_role";

grant delete on table "public"."workout_logs" to "anon";

grant insert on table "public"."workout_logs" to "anon";

grant references on table "public"."workout_logs" to "anon";

grant select on table "public"."workout_logs" to "anon";

grant trigger on table "public"."workout_logs" to "anon";

grant truncate on table "public"."workout_logs" to "anon";

grant update on table "public"."workout_logs" to "anon";

grant delete on table "public"."workout_logs" to "authenticated";

grant insert on table "public"."workout_logs" to "authenticated";

grant references on table "public"."workout_logs" to "authenticated";

grant select on table "public"."workout_logs" to "authenticated";

grant trigger on table "public"."workout_logs" to "authenticated";

grant truncate on table "public"."workout_logs" to "authenticated";

grant update on table "public"."workout_logs" to "authenticated";

grant delete on table "public"."workout_logs" to "service_role";

grant insert on table "public"."workout_logs" to "service_role";

grant references on table "public"."workout_logs" to "service_role";

grant select on table "public"."workout_logs" to "service_role";

grant trigger on table "public"."workout_logs" to "service_role";

grant truncate on table "public"."workout_logs" to "service_role";

grant update on table "public"."workout_logs" to "service_role";


  create policy "Users can insert own arena attempts"
  on "public"."arena_attempts"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can read all arena attempts"
  on "public"."arena_attempts"
  as permissive
  for select
  to public
using (true);



  create policy "Users can update own arena attempts"
  on "public"."arena_attempts"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Public Read Competitions"
  on "public"."arena_competitions"
  as permissive
  for select
  to public
using (true);



  create policy "Public Read Phases"
  on "public"."arena_phases"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can insert pro results"
  on "public"."arena_pro_results"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Admins can update pro results"
  on "public"."arena_pro_results"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Anyone can read pro results"
  on "public"."arena_pro_results"
  as permissive
  for select
  to public
using (true);



  create policy "Admin manages all block exercises"
  on "public"."block_exercises"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Coaches manage block exercises"
  on "public"."block_exercises"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM (public.program_blocks pb
     JOIN public.program_templates pt ON ((pt.id = pb.template_id)))
  WHERE ((pb.id = block_exercises.block_id) AND (pt.coach_id = auth.uid())))));



  create policy "Warriors can read their block exercises"
  on "public"."block_exercises"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.program_blocks pb
     JOIN public.warrior_programs wp ON ((wp.template_id = pb.template_id)))
  WHERE ((pb.id = block_exercises.block_id) AND (wp.warrior_id = auth.uid()) AND (wp.status = 'active'::text)))));



  create policy "Users can create their own clashes"
  on "public"."clash_sessions"
  as permissive
  for insert
  to public
with check ((auth.uid() = sender_id));



  create policy "Users can update their own received/sent clashes v2"
  on "public"."clash_sessions"
  as permissive
  for update
  to public
using (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)))
with check ((((status = 'accepted'::text) AND (auth.uid() = receiver_id)) OR ((status = 'declined'::text) AND (auth.uid() = receiver_id)) OR ((status = 'cancelled'::text) AND (auth.uid() = sender_id)) OR ((status = 'active'::text) AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id)))));



  create policy "Users can view their own clashes"
  on "public"."clash_sessions"
  as permissive
  for select
  to public
using (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));



  create policy "Anyone can view exercises"
  on "public"."exercise_library"
  as permissive
  for select
  to public
using (true);



  create policy "Coaches and admin can manage exercises"
  on "public"."exercise_library"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.is_coach = true) OR (profiles.is_admin = true))))));



  create policy "Admins can do everything"
  on "public"."invite_codes"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Users can validate codes"
  on "public"."invite_codes"
  as permissive
  for select
  to public
using (((used_by IS NULL) OR (used_by = auth.uid())));



  create policy "Admins manage invite requests"
  on "public"."invite_requests"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Anyone can submit invite requests"
  on "public"."invite_requests"
  as permissive
  for insert
  to public
with check (true);



  create policy "Anyone can view 1 min max logs"
  on "public"."one_min_max_logs"
  as permissive
  for select
  to public
using (true);



  create policy "Users can insert their own scores"
  on "public"."one_mm_scores"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users can read all scores"
  on "public"."one_mm_scores"
  as permissive
  for select
  to public
using (true);



  create policy "Users can update their own scores"
  on "public"."one_mm_scores"
  as permissive
  for update
  to public
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Users can read all power assessments"
  on "public"."power_assessments"
  as permissive
  for select
  to public
using (true);



  create policy "Allow tournament rewards update"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((auth.uid() = id))
with check ((auth.uid() = id));



  create policy "Public profiles are viewable by everyone"
  on "public"."profiles"
  as permissive
  for select
  to public
using (true);



  create policy "Tournament service can update rewards"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Warriors can update own profile"
  on "public"."profiles"
  as permissive
  for update
  to public
using ((( SELECT auth.uid() AS uid) = id));



  create policy "Warriors can update their own searching status"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((auth.uid() = id));



  create policy "Warriors can view all profiles"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Warriors delete own profile"
  on "public"."profiles"
  as permissive
  for delete
  to authenticated
using ((( SELECT auth.uid() AS uid) = id));



  create policy "Warriors insert own profile"
  on "public"."profiles"
  as permissive
  for insert
  to authenticated
with check ((( SELECT auth.uid() AS uid) = id));



  create policy "Warriors manage own profile"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using ((( SELECT auth.uid() AS uid) = id));



  create policy "Admin manages all blocks"
  on "public"."program_blocks"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Anyone authenticated can view blocks"
  on "public"."program_blocks"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Coaches can delete blocks"
  on "public"."program_blocks"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.program_templates t
  WHERE ((t.id = program_blocks.template_id) AND (t.coach_id = auth.uid())))));



  create policy "Coaches can insert blocks"
  on "public"."program_blocks"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.program_templates t
  WHERE ((t.id = program_blocks.template_id) AND (t.coach_id = auth.uid())))));



  create policy "Coaches can update blocks"
  on "public"."program_blocks"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.program_templates t
  WHERE ((t.id = program_blocks.template_id) AND (t.coach_id = auth.uid())))))
with check ((EXISTS ( SELECT 1
   FROM public.program_templates t
  WHERE ((t.id = program_blocks.template_id) AND (t.coach_id = auth.uid())))));



  create policy "Coaches manage blocks"
  on "public"."program_blocks"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.program_templates
  WHERE ((program_templates.id = program_blocks.template_id) AND (program_templates.coach_id = auth.uid())))));



  create policy "Warriors can read their program blocks"
  on "public"."program_blocks"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.warrior_programs wp
  WHERE ((wp.template_id = program_blocks.template_id) AND (wp.warrior_id = auth.uid()) AND (wp.status = 'active'::text)))));



  create policy "Admin manages all templates"
  on "public"."program_templates"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Anyone authenticated can view templates"
  on "public"."program_templates"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Coaches can delete templates"
  on "public"."program_templates"
  as permissive
  for delete
  to authenticated
using ((coach_id = auth.uid()));



  create policy "Coaches can insert templates"
  on "public"."program_templates"
  as permissive
  for insert
  to authenticated
with check ((coach_id = auth.uid()));



  create policy "Coaches can update templates"
  on "public"."program_templates"
  as permissive
  for update
  to authenticated
using ((coach_id = auth.uid()))
with check ((coach_id = auth.uid()));



  create policy "Coaches manage own templates"
  on "public"."program_templates"
  as permissive
  for all
  to public
using ((coach_id = auth.uid()));



  create policy "Anyone can read holds"
  on "public"."static_holds"
  as permissive
  for select
  to public
using (true);



  create policy "Warriors manage own statics assessments"
  on "public"."statics_assessments"
  as permissive
  for all
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));



  create policy "Only omarnasalis can manage configs"
  on "public"."tournament_configs"
  as permissive
  for all
  to public
using (((auth.jwt() ->> 'email'::text) = 'omarnasalis@outlook.com'::text));



  create policy "Public Read Configs"
  on "public"."tournament_configs"
  as permissive
  for select
  to public
using (true);



  create policy "Admins can delete matches"
  on "public"."tournament_matches"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Allow all insert"
  on "public"."tournament_matches"
  as permissive
  for insert
  to public
with check (true);



  create policy "Allow all select"
  on "public"."tournament_matches"
  as permissive
  for select
  to public
using (true);



  create policy "Allow all update"
  on "public"."tournament_matches"
  as permissive
  for update
  to public
using (true);



  create policy "Public Read Matches"
  on "public"."tournament_matches"
  as permissive
  for select
  to public
using (true);



  create policy "Allow participants to update each other"
  on "public"."tournament_participants"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "Anyone can view participants"
  on "public"."tournament_participants"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Public Read Participants"
  on "public"."tournament_participants"
  as permissive
  for select
  to public
using (true);



  create policy "Warriors can join tournaments"
  on "public"."tournament_participants"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = user_id));



  create policy "Warriors can update own scores"
  on "public"."tournament_participants"
  as permissive
  for update
  to authenticated
using ((auth.uid() = user_id));



  create policy "Admins manage tournament sessions"
  on "public"."tournament_sessions"
  as permissive
  for all
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Allow authenticated users to update sessions"
  on "public"."tournament_sessions"
  as permissive
  for update
  to public
using ((auth.role() = 'authenticated'::text));



  create policy "Anyone can view tournament sessions"
  on "public"."tournament_sessions"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Public Read Sessions"
  on "public"."tournament_sessions"
  as permissive
  for select
  to public
using (true);



  create policy "Warriors can ignite tournament"
  on "public"."tournament_sessions"
  as permissive
  for update
  to authenticated
using ((status = 'registration'::text))
with check ((status = 'active'::text));



  create policy "Warriors insert own trials"
  on "public"."trial_history"
  as permissive
  for insert
  to public
with check ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Warriors see own trials"
  on "public"."trial_history"
  as permissive
  for select
  to public
using ((( SELECT auth.uid() AS uid) = user_id));



  create policy "Admin manages all assignments"
  on "public"."warrior_programs"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Coaches can delete warrior programs"
  on "public"."warrior_programs"
  as permissive
  for delete
  to authenticated
using ((coach_id = auth.uid()));



  create policy "Coaches can insert warrior programs"
  on "public"."warrior_programs"
  as permissive
  for insert
  to authenticated
with check ((coach_id = auth.uid()));



  create policy "Coaches manage their assignments"
  on "public"."warrior_programs"
  as permissive
  for all
  to public
using ((coach_id = auth.uid()));



  create policy "Users can update warrior programs"
  on "public"."warrior_programs"
  as permissive
  for update
  to authenticated
using (((coach_id = auth.uid()) OR (warrior_id = auth.uid())))
with check (((coach_id = auth.uid()) OR (warrior_id = auth.uid())));



  create policy "Users can view warrior programs"
  on "public"."warrior_programs"
  as permissive
  for select
  to authenticated
using (((coach_id = auth.uid()) OR (warrior_id = auth.uid())));



  create policy "Warriors view own programs"
  on "public"."warrior_programs"
  as permissive
  for select
  to public
using ((warrior_id = auth.uid()));



  create policy "Admins can insert challenges"
  on "public"."weekly_challenges"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Admins can update challenges"
  on "public"."weekly_challenges"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Admins manage challenges"
  on "public"."weekly_challenges"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Anyone can read challenges"
  on "public"."weekly_challenges"
  as permissive
  for select
  to public
using (true);



  create policy "Anyone can read entries"
  on "public"."weekly_entries"
  as permissive
  for select
  to public
using (true);



  create policy "Admin views all logs"
  on "public"."workout_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));



  create policy "Coaches view warrior logs"
  on "public"."workout_logs"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.warrior_programs wp
  WHERE ((wp.id = workout_logs.warrior_program_id) AND (wp.coach_id = auth.uid())))));



  create policy "Users can view relevant workout logs"
  on "public"."workout_logs"
  as permissive
  for select
  to authenticated
using (((auth.uid() = warrior_id) OR (EXISTS ( SELECT 1
   FROM public.warrior_programs wp
  WHERE ((wp.warrior_id = wp.warrior_id) AND (wp.coach_id = auth.uid()))))));



  create policy "Warriors can delete their own workout logs"
  on "public"."workout_logs"
  as permissive
  for delete
  to authenticated
using ((auth.uid() = warrior_id));



  create policy "Warriors can insert their own workout logs"
  on "public"."workout_logs"
  as permissive
  for insert
  to authenticated
with check ((auth.uid() = warrior_id));



  create policy "Warriors can update their own workout logs"
  on "public"."workout_logs"
  as permissive
  for update
  to authenticated
using ((auth.uid() = warrior_id))
with check ((auth.uid() = warrior_id));



  create policy "Warriors manage own logs"
  on "public"."workout_logs"
  as permissive
  for all
  to public
using ((warrior_id = auth.uid()));


CREATE TRIGGER on_clash_finished AFTER UPDATE ON public.clash_sessions FOR EACH ROW EXECUTE FUNCTION public.handle_clash_victory();

CREATE TRIGGER prevent_power_tier_spoofing BEFORE UPDATE ON public.power_assessments FOR EACH ROW EXECUTE FUNCTION public.prevent_power_tier_spoofing();

CREATE TRIGGER enforce_protected_profile_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_fields();

CREATE TRIGGER prevent_tier_spoofing BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_tier_modification();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


