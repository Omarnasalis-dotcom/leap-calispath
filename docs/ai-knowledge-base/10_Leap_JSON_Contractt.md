# 10 Leap JSON Contract

## Purpose

This document is the authoritative, code-verified contract between an AI system and the Leap platform's data model. It is written so that an AI can generate JSON that **imports into Leap without any manual editing or conversion**.

Every field, table, type, and rule below is extracted directly from the codebase (`leap-calispath-mobile`, `main` branch, as of 2026-07-06) — Supabase Postgres migrations under `supabase/migrations/*.sql`, and TypeScript source under `src/`. Nothing is invented, simplified, or renamed. Where a concept requested of this document (e.g. "Movement Pattern," "sleep tracking," a working AI-generation endpoint) **does not exist in the codebase**, this document says so explicitly rather than filling the gap with a plausible-sounding field — an AI reading this contract must never invent such a field either.

**The two concrete JSON import surfaces this contract targets** are the Week Export/Import format and the Master Template Export/Import format (§14 — Import/Export). Both are already-shipped, working features. Notably, the Week-export code itself documents the intended AI-in-the-loop workflow verbatim:

> `// Picks an AI-edited (or hand-edited) week JSON file, validates it, resolves each exercise to a real exercise_library row, and always adds it as a new week onto the client's program...`
> — `src/screens/coaching/ProgressTrackingScreen.tsx:371-374`

That is: a coach exports a week to JSON, a human or an AI edits it, and it is re-imported. **This document exists to make that loop reliable for an AI editor.**

A second, separate AI feature (`CoachScreen.tsx`, a Gemini chat coach) also exists in the codebase but is **dead/unreachable and server-gated** — documented honestly in §9 rather than presented as available.

---

## 1. Athlete Models

### 1.1 `profiles` table (the Athlete/Coach/Admin record — one table serves all three roles)

Full schema, defined once and never structurally altered since (`supabase/migrations/20260614102615_remote_schema.sql:184-223`; confirmed via exhaustive grep of every `ALTER TABLE ... profiles ... ADD COLUMN` variant across all 49+ migration files — zero incremental column additions exist):

```sql
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
```

**Indexes**: `idx_profiles_coach_id` (btree, `coach_id`), `idx_profiles_gender` (btree, `gender`), `profiles_pkey` (unique, `id`), `unique_display_name` (unique, `display_name`).

**Constraints**:
- `profiles_pkey` PRIMARY KEY (`id`)
- `profiles_coach_id_fkey`: FOREIGN KEY (`coach_id`) REFERENCES `public.profiles(id)` ON DELETE SET NULL — **self-referencing**: an athlete's `coach_id` points to another row in the same table (their assigned coach).
- `profiles_id_fkey`: FOREIGN KEY (`id`) REFERENCES `auth.users(id)` ON DELETE CASCADE — 1:1 with Supabase Auth.
- `unique_display_name` UNIQUE (`display_name`)
- **No CHECK constraints exist on this table at all.** All value validation (bounds, gender values, etc.) happens in application code / RPC functions, not the schema.

**Field reference:**

| Field | Type | Nullable | Default | Description | Notes |
|---|---|---|---|---|---|
| `id` | uuid | No | — | Primary key; equals `auth.users.id` | |
| `email` | text | Yes | — | | |
| `display_name` | text | Yes | — | Globally unique | UNIQUE constraint |
| `strength_tier` | integer | Yes | `0` | 0-9, maps to `TIER_NAMES` (§1.3) | Write-protected (see trigger below) |
| `power_tier` | integer | Yes | — | 1-3, maps to `POWER_TIER_NAMES` | Write-protected |
| `statics_tier` | numeric | Yes | — | Static World tier/points | Write-protected |
| `glory_score` | integer | Yes | `0` | Clash/tournament score | Write-protected |
| `streak` | integer | Yes | `0` | Consecutive-day activity streak | Write-protected; computed by `get_weekly_activity_stats()` RPC |
| `last_active` | timestamptz | Yes | `now()` | | |
| `assessed_at` | timestamptz | Yes | — | When the strength-tier assessment was completed | Null = unassessed → app redirects to `/assessment` |
| `assessment_locked_until` | timestamptz | Yes | — | Cooldown before re-assessment allowed | |
| `power_assessed_at` | timestamptz | Yes | — | | |
| `statics_assessed_at` | timestamptz | Yes | — | | |
| `best_times` | jsonb | Yes | `'{}'` | Strength-tier trial best times, keyed by tier | |
| `trials_attempted` | integer | Yes | `0` | Write-protected | |
| `trials_passed` | integer | Yes | `0` | Write-protected | |
| `is_public` | boolean | Yes | `true` | Leaderboard visibility | |
| `push_token` | text | Yes | — | Not readable cross-user (see RLS history) | |
| `timezone` | text | Yes | `'UTC'` | | |
| `updated_at` | timestamptz | Yes | `now()` | | |
| `power_pbs` | jsonb | Yes | `'{}'` | Per-movement power PBs | |
| `power_points` | numeric | Yes | `0` | Write-protected | |
| `is_admin` | boolean | Yes | `false` | Write-protected via trigger | |
| `is_searching_clash` | boolean | Yes | `false` | **Missing from TS `Profile` interface** — see §1.2 | |
| `tournament_gp` | integer | Yes | `0` | Write-protected; **missing from TS interface** | |
| `clash_win_streak` | integer | Yes | `0` | Write-protected | |
| `one_mm_points` | numeric | Yes | `0` | Write-protected | |
| `one_mm_rank` | integer | Yes | — | **Missing from TS interface** | |
| `coach_beta_access` | boolean | Yes | `false` | Coach-feature gate flag (no RPC in migrations sets it — set out-of-band) | |
| `access_granted_at` | timestamptz | Yes | — | Invite-code access window start | |
| `access_expires_at` | timestamptz | Yes | — | Invite-code access window end | |
| `invite_code_used` | text | Yes | — | | |
| `is_coach` | boolean | Yes | `false` | Write-protected via trigger | |
| `coach_id` | uuid | Yes | — | Self-FK to `profiles.id`; **missing from TS interface** | |
| `gender` | text | Yes | — | Free text, no CHECK constraint | |
| `country` | text | Yes | — | | |
| `first_name` | text | Yes | — | Not readable cross-user | |
| `last_name` | text | Yes | — | Not readable cross-user | |

### 1.2 TypeScript `Profile` interface (`src/types/index.ts:3-39`, verbatim)

```typescript
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  strength_tier: number;
  power_tier: number | null;
  statics_tier: number | null;
  gender: string | null;
  country: string | null;
  first_name: string | null;
  last_name: string | null;
  glory_score: number;
  streak: number;
  last_active: string;
  assessed_at: string | null;
  assessment_locked_until: string | null;
  power_assessed_at: string | null;
  statics_assessed_at: string | null;
  best_times: Record<string, number>;
  power_pbs: Record<string, number>;
  power_points: number;
  one_mm_points: number;
  trials_attempted: number;
  trials_passed: number;
  is_public: boolean;
  push_token: string | null;
  timezone: string;
  updated_at: string;
  is_admin?: boolean;
  is_coach?: boolean;
  coach_beta_access: boolean;
  clash_win_streak: number;
  access_expires_at?: string | null;
  access_granted_at?: string | null;
  invite_code_used?: string | null;
  created_at?: string;
}
```

**Confirmed DB ↔ TS drift** — an AI generating a "profile" JSON object must be aware of this:
- **Missing from the TS type entirely** (real DB columns): `is_searching_clash`, `tournament_gp`, `one_mm_rank`, `coach_id`.
- **`created_at?: string` exists in the TS type but there is no such DB column.** `profiles` has no `created_at` column at all — only `last_active` and `updated_at`. A generated object should never rely on `profiles.created_at` existing at read time.

### 1.3 Tier enumerations (`src/types/index.ts:41-72`, verbatim)

```typescript
export type TierRank =
  | 'Helot'          // Tier 0
  | 'Neos'           // Tier 1
  | 'Ephebe'         // Tier 2
  | 'Hoplite'        // Tier 3
  | 'Spartan'        // Tier 4
  | 'Lochagos'       // Tier 5
  | 'Strategos'      // Tier 6
  | 'Olympian'       // Tier 7
  | 'Demigod'        // Tier 8
  | 'Eternity'       // Tier 9

export const TIER_NAMES = [
  'Helot', 'Neos', 'Ephebe', 'Hoplite', 'Spartan',
  'Lochagos', 'Strategos', 'Olympian', 'Demigod', 'Eternity'
];

// Power World tier names (different from Strength) - 9 tiers total  <-- comment is STALE, see note below
export const POWER_TIER_NAMES = [
  'Voltaic',  // Level 0 (unused — levels start at 1)
  'Voltaic',  // Level 1
  'Ampere',   // Level 2
  'Tesla',    // Level 3
];
```

**Source-code inconsistency, flagged explicitly**: the comment above `POWER_TIER_NAMES` says "9 tiers total" but the array has only 4 entries (indices 0-3, with 0 unused/duplicate). The real Power World has exactly 3 usable tiers (1-3: Voltaic/Ampere/Tesla), consistent with `POWER_TIER_REQUIREMENTS` (§1.4) and `POWER_LEVELS` in `powerLogic.ts` (§9.2). **An AI must use only tiers 1-3 for Power World — the "9 tiers" comment is dead documentation, not a real range.**

### 1.4 `src/constants/Progression.ts` (full file, verbatim)

```typescript
import { TIER_NAMES, POWER_TIER_NAMES } from '../types';

export const TIER_HARD_FLOORS: Record<number, number> = {
  0: 25, 1: 90, 2: 150, 3: 180, 4: 200,
  5: 220, 6: 250, 7: 360, 8: 480,
  9: 600, // Eternity Protocol: 12-labor trial, minimum 10 minutes
};

export const TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  0: { desc: 'Helot: Master the basics — Rows, Squats, Bench Dips, Knee Push-ups', difficulty: 1 },
  1: { desc: 'Neos: Build the foundation — Assisted movements and volume', difficulty: 2 },
  2: { desc: 'Ephebe: Develop strength — Push-ups, Squats, Dips mastery', difficulty: 3 },
  3: { desc: 'Hoplite: Vertical mastery — Parallel Bar Dips, Pull-up preparation', difficulty: 4 },
  4: { desc: 'Spartan: The Rite of Passage — Strict Pull-ups and Banded Muscle-ups', difficulty: 5 },
  5: { desc: 'Lochagos: Elite Strength — Strict Muscle-ups and high volume', difficulty: 6 },
  6: { desc: 'Strategos: Advanced Mastery — Complex unbroken sequences', difficulty: 7 },
  7: { desc: 'Olympian: Peak Performance — The limit of the physical assessment', difficulty: 8 },
  8: { desc: 'Demigod: Beyond Assessment — Proven through the Rite of Passage', difficulty: 9 },
  9: { desc: 'Eternity: Ascension — The final 12-Labor Protocol', difficulty: 9 },
};

export const POWER_TIER_REQUIREMENTS: Record<number, { desc: string; difficulty: number }> = {
  1: { desc: 'Voltaic: Entry level — 0+ pts. Master the weighted movements.', difficulty: 3 },
  2: { desc: 'Ampere: Intermediate — 100+ pts. Consistent weighted performance.', difficulty: 6 },
  3: { desc: 'Tesla: Elite — 250+ pts. Peak weighted strength mastery.', difficulty: 9 },
};
```

`TIER_HARD_FLOORS` is a client-side cache of the server-authoritative `tier_hard_floors` table (§9.5) — both must stay in sync per an explicit migration comment; they are confirmed identical.

### 1.5 Privilege-escalation protection (relevant to what an AI-generated profile update may legally contain)

`profiles` has a `BEFORE UPDATE` trigger, `guard_profile_protected_fields` (`supabase/migrations/20260614102615_remote_schema.sql:4066-4091`, verbatim):

```sql
CREATE OR REPLACE FUNCTION public.guard_profile_protected_fields()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
        RETURN NEW;
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin OR
       NEW.is_coach IS DISTINCT FROM OLD.is_coach OR
       NEW.strength_tier IS DISTINCT FROM OLD.strength_tier OR
       NEW.power_tier IS DISTINCT FROM OLD.power_tier OR
       NEW.statics_tier IS DISTINCT FROM OLD.statics_tier OR
       NEW.glory_score IS DISTINCT FROM OLD.glory_score OR
       NEW.streak IS DISTINCT FROM OLD.streak OR
       NEW.trials_passed IS DISTINCT FROM OLD.trials_passed OR
       NEW.power_points IS DISTINCT FROM OLD.power_points OR
       NEW.one_mm_points IS DISTINCT FROM OLD.one_mm_points OR
       NEW.clash_win_streak IS DISTINCT FROM OLD.clash_win_streak OR
       NEW.tournament_gp IS DISTINCT FROM OLD.tournament_gp
    THEN
        RAISE EXCEPTION 'Privilege Escalation Detected: You cannot modify protected profile fields directly.';
    END IF;
    RETURN NEW;
END;
$function$;
```

**These 11 fields can never be set directly via a client/AI-generated UPDATE to `profiles`** — they are only mutated by SECURITY DEFINER RPCs (`submit_power_assessment`, `submit_trial_result`, etc.), which run as `postgres`/`service_role` and bypass the guard. An AI producing a "profile update" payload must route tier/score changes through the relevant RPC, never a raw table write.

### 1.6 Read-access scope (what an AI reading "the athlete's profile" can actually see)

As of the latest migration (`20260701000000_restore_authenticated_profiles_select.sql:21`), any `authenticated` user has table-wide `SELECT` on `profiles` (a prior column-level PII lockdown, `20260630190000_lock_down_profiles_pii_columns.sql`, was reverted to fix a PostgREST `select=*` bug — the lockdown is dormant, not active). `anon` has no SELECT access at all. A `get_my_profile()` SECURITY DEFINER RPC also exists as the sanctioned "read my own full row" path.

---

## 2. Workout Program Models

Full hierarchy: **Program → Week → Day → Exercise Block → Exercise → Set → Notes.**

**Critical structural fact, stated once here and assumed throughout this document**: there is **no `Week` or `Day` database table.** "Week" is the integer column `program_blocks.week_number`. "Day" does not exist as data at all — it is encoded as a string convention inside `program_blocks.name`, formatted `"{DAY_NAME} | {BLOCK_NAME}"`, and split on the literal substring `' | '` at read time. "Rep" is likewise never a standalone entity — it is always an integer count field (`block_exercises.reps`, or `workout_set_logs.reps_completed`), never a list of individual rep records.

### 2.1 Object hierarchy

```
Program (program_templates)
 └── Week (program_blocks.week_number — an integer, not a row)
       └── Day (program_blocks.name, split on " | " — a string convention, not a row)
             └── Exercise Block (program_blocks row)
                   ├── metadata (ConceptMetadata, embedded in program_blocks.notes)
                   ├── coach_notes (embedded in program_blocks.notes)
                   └── Exercise (block_exercises row, joined to exercise_library)
                         ├── sets (integer count)
                         ├── reps (integer count)
                         ├── rest_seconds / hold_seconds
                         ├── is_weighted
                         └── Exercise Log (workout_logs row, one per block per day attempted)
                               ├── status (derived from notes prefix, not a column)
                               ├── feel / rpe / missed_reason / missed_detail / session_seconds
                               ├── notes (free text — may ALSO be the status sentinel)
                               └── Set Log[] (workout_set_logs rows)
                                     ├── set_index
                                     ├── reps_completed / weight_used / hold_seconds
```

### 2.2 `program_templates` (Program)

```sql
create table "public"."program_templates" (
    "id" uuid not null default gen_random_uuid(),
    "coach_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now()
);
```
FK: `program_templates_coach_id_fkey` → `profiles(id)` ON DELETE SET NULL. One row per reusable template (coach-authored master) **or** per client's own clone of one (`warrior_programs.template_id` always points at the client's clone, never the master directly).

### 2.3 `program_blocks` (Week + Day + Exercise Block, combined)

```sql
create table "public"."program_blocks" (
    "id" uuid not null default gen_random_uuid(),
    "template_id" uuid not null,
    "name" text not null,
    "notes" text,
    "order_index" integer default 0,
    "created_at" timestamp with time zone default now(),
    "week_number" integer default 1
);
```

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | uuid | No | Block identifier |
| `template_id` | uuid | No | → `program_templates.id` |
| `name` | text | No | Encodes `"{day_name} \| {block_name}"` — see §2.1 |
| `notes` | text | Yes | Encodes `"[CONCEPT:{json}] {clean notes}"` — see §2.4 |
| `order_index` | integer | Yes (default 0) | Sort order among blocks sharing the same day |
| `week_number` | integer | Yes (default 1) | The "Week" — a plain integer, no separate week table/row |

Day-name decoding rule (`src/lib/ProgramExportBuilder.ts:126-132`, identical in `MasterTemplateTransfer.ts:75-81`): split `name` on the literal `' | '`. If found, `parts[0].trim()` → day name, `parts.slice(1).join(' | ').trim()` → block name. If not found, the whole string is the day name and block name defaults to the literal `'WORKOUT ROUTINE'`.

### 2.4 `ConceptMetadata` — the block's "workout concept," embedded in `program_blocks.notes`

Single canonical source (`src/lib/BlockConceptParser.ts:1-22`, verbatim):

```typescript
export interface ConceptMetadata {
  timing_system?: 'amrap' | 'fortime' | 'straight_set' | 'tabata';
  time_cap_min?: string | number;
  structure?: 'single' | 'superset' | 'circuit' | 'ladder';
  rounds?: string | number;
  ladder_start?: string | number;
  ladder_sub?: string | number;
  ladder_direction?: 'down' | 'up';
  tabata_work_seconds?: string | number;
  tabata_rest_seconds?: string | number;
  tabata_rounds?: string | number;
  is_weighted?: boolean;
  rest_after_round?: string | number;
  is_tier_trial?: boolean;
  tier_trial_tier?: number;
  focus_tag?: 'PULL' | 'PUSH' | 'LEGS' | 'FULL_BODY' | 'CORE' | 'NONE';

  // Legacy support for older blocks
  type?: 'single' | 'superset' | 'circuit' | 'amrap' | 'fortime';
  timer_seconds?: string | number;
  previous_log_from_block_id?: string | number;
}
```

Wire format (`BlockConceptParser.ts:129-131`): `` `[CONCEPT:${JSON.stringify(metadata)}] ${cleanNotes}`.trim() ``. Parse regex: `/^\[CONCEPT:(.*?)\](.*)$/s` (`BlockConceptParser.ts:33`). If `notes` doesn't match this pattern, `metadata = {}` and the entire string is `cleanNotes`.

### 2.5 `block_exercises` (Exercise, as prescribed inside a block)

```sql
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
```
FKs (from later migrations): `workout_set_logs.block_exercise_id` references this table `ON DELETE SET NULL`. No CHECK constraints on `sets`/`reps`/`rest_seconds`/`hold_seconds` — unconstrained integers with only defaults. **`reps` is always a single integer count** — there is no per-rep data model anywhere.

### 2.6 Exercise Log and Set Log — see §4 (Workout Log Models), which covers `workout_logs`/`workout_set_logs` in full field-by-field detail, including the `[STATUS:MISSED]` convention.

### 2.7 Program Builder in-app UI types (distinct from, and slightly divergent from, the wire format)

See §7 (Program Builder Models) — these are internal editor state shapes, not the authoritative import/export JSON contract (§14 is authoritative for wire format).

---

## 3. Exercise Library Models

### 3.1 `exercise_library` — full and complete schema (7 columns, never altered)

```sql
create table "public"."exercise_library" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "youtube_url" text,
    "category" text,
    "difficulty" text,
    "created_by" uuid,
    "created_at" timestamp with time zone default now()
);
```
FK: `exercise_library_created_by_fkey` → `profiles(id)` ON DELETE SET NULL.

**This is the entire schema.** Confirmed via exhaustive grep of every `ALTER TABLE ... exercise_library ...` across all migrations — the only alterations ever made are RLS/ownership policy changes (`20260628196000_restrict_exercise_library_ownership.sql`), never a column addition.

| Field | Type | Nullable | Required | Possible values | Description |
|---|---|---|---|---|---|
| `id` | uuid | No | Yes | — | Primary key |
| `name` | text | No | Yes | any | Exercise display name |
| `youtube_url` | text | Yes | No | any URL or null | Demo video |
| `category` | text | Yes | No | **unconstrained free text** — see below for observed values | |
| `difficulty` | text | Yes | No | **unconstrained free text** — see below | |
| `created_by` | uuid | Yes | No | → `profiles.id`, or null (legacy rows) | |
| `created_at` | timestamptz | Yes | No | `now()` | |

**Observed `category` values** (application-code convention only — **no DB CHECK constraint exists**): the exercise-library screen's full picker list is `'push'|'pull'|'legs'|'core'|'skill'|'flexibility'|'strength'|'mobility'` (`src/screens/coaching/ExerciseLibraryScreen.tsx:28`), while the program builder's own filter list is the narrower, **inconsistent** `['all','push','pull','legs','core','skill']` (`src/hooks/coaching/useProgramBuilder.ts:150`). An AI generating exercises should prefer the fuller 8-value list but must not assume the database will reject anything else — it won't, because there's no constraint.

**Observed `difficulty` values**: `'beginner' | 'intermediate' | 'advanced'` (`ExerciseLibraryScreen.tsx:29`) — also unconstrained free text at the DB level. When an import auto-creates a missing exercise, it defaults to `difficulty: 'beginner'`, `category: ''` (§13).

### 3.2 Concepts explicitly confirmed **NOT to exist** for exercises

Exhaustively grepped (case-insensitive) across the entire repository — **zero hits for every one of these**:

- **Movement Pattern** — no `movement_pattern` / `movementPattern` column, field, or type exists anywhere for exercises. (A same-named-in-spirit `pattern_id` exists only on the unrelated `onemm_movements` assessment-reference table, §9.4 — do not conflate the two.)
- **Skill Family** — no `skill_family` / `skillFamily` concept exists anywhere.
- **Equipment** — no equipment attribute of any kind exists anywhere in this codebase, for exercises or otherwise.
- **Tags** — no tagging system (`tags`, `tag_id`) exists anywhere.

**An AI generating an exercise object must only populate `{ id/exercise_id, name, youtube_url, category, difficulty }` (plus whatever block-level prescription fields apply — sets/reps/rest/hold/is_weighted, which live on `block_exercises`, not on the exercise itself). Any `movement_pattern`, `equipment`, `tags`, or `skill_family` field would be an invented field with nowhere to be stored.**

---

## 4. Workout Log Models

### 4.1 `workout_logs` — base + detail columns (added across two migrations)

Base (`20260614102615_remote_schema.sql:414-421`):
```sql
create table "public"."workout_logs" (
    "id" uuid not null default gen_random_uuid(),
    "warrior_program_id" uuid not null,
    "warrior_id" uuid not null,
    "block_id" uuid,
    "completed_at" timestamp with time zone default now(),
    "notes" text,
    "rating" integer
);
```

Detail columns added later (`20260701170000_add_detailed_workout_logging.sql:12-29`):
```sql
alter table "public"."workout_logs"
  add column "feel" text,
  add column "rpe" integer,
  add column "missed_reason" text,
  add column "missed_detail" text,
  add column "session_seconds" integer;

alter table "public"."workout_logs" add constraint "workout_logs_feel_check"
  check (feel is null or feel in ('hard', 'ok', 'good', 'strong', 'beast'));
alter table "public"."workout_logs" add constraint "workout_logs_rpe_check"
  check (rpe is null or (rpe between 1 and 10));
alter table "public"."workout_logs" add constraint "workout_logs_missed_reason_check"
  check (missed_reason is null or missed_reason in ('no_time', 'too_tired', 'injury', 'other'));
```

| Field | Type | Nullable | DB-Enforced values | Description |
|---|---|---|---|---|
| `id` | uuid | No | — | |
| `warrior_program_id` | uuid | No | → `warrior_programs.id` | |
| `warrior_id` | uuid | No | → athlete's `profiles.id` | |
| `block_id` | uuid | Yes | → `program_blocks.id`, no cascade behavior specified (deleting a block does **not** cascade-delete its logs — this is why `save_program_template` must guard against FK violations, §12) | |
| `completed_at` | timestamptz | Yes | default `now()` | |
| `notes` | text | Yes | — | Free-text session notes, **or the literal sentinel string `'[STATUS:MISSED]'`** — see §4.3 |
| `rating` | integer | Yes | no CHECK | Legacy 1-5 rating; when written via `log_block_with_sets`, derived as `COALESCE(round(p_rpe / 2.0), 5)` — i.e. it is a **derived/legacy-compat field**, not an independent AI-settable input |
| `feel` | text | Yes | `'hard'│'ok'│'good'│'strong'│'beast'` or null | Subjective feel |
| `rpe` | integer | Yes | `1`–`10` or null | Rate of Perceived Exertion |
| `missed_reason` | text | Yes | `'no_time'│'too_tired'│'injury'│'other'` or null | Only meaningful when the block was missed |
| `missed_detail` | text | Yes | any free text or null | |
| `session_seconds` | integer | Yes | no CHECK | Total session duration |

### 4.2 `workout_set_logs`

```sql
create table "public"."workout_set_logs" (
  "id" uuid not null default gen_random_uuid(),
  "workout_log_id" uuid not null references public.workout_logs(id) on delete cascade,
  "block_exercise_id" uuid references public.block_exercises(id) on delete set null,
  "set_index" integer not null,
  "reps_completed" integer,
  "weight_used" numeric,
  "hold_seconds" numeric,
  "created_at" timestamp with time zone not null default now()
);
```
| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | uuid | No | |
| `workout_log_id` | uuid | No | → `workout_logs.id`, cascades on delete |
| `block_exercise_id` | uuid | Yes | → `block_exercises.id`, `ON DELETE SET NULL` — a set log survives even if the exercise prescription is later deleted |
| `set_index` | integer | No | 0-based ordinal within the block |
| `reps_completed` | integer | Yes | |
| `weight_used` | numeric | Yes | |
| `hold_seconds` | numeric | Yes | |

**No unique constraint exists on `(workout_log_id, set_index)`** — duplicate set-index rows are not prevented at the DB level (see Edge Cases, §12).

### 4.3 Completion status — the `[STATUS:MISSED]` convention

**There is no `status` column anywhere.** Both `toggle_block_status` and `log_block_with_sets` RPCs write the literal string `'[STATUS:MISSED]'` into `workout_logs.notes` when a block is marked missed with no detail; every reader (client `WarriorProgramScreen.tsx`, and the `get_warrior_progress` RPC) derives status as:
```sql
CASE WHEN wl.notes LIKE '[STATUS:MISSED]%' THEN 'missed' ELSE 'completed' END
```
An AI generating a "missed" log must set `notes` to exactly `'[STATUS:MISSED]'` (or a string with that exact prefix) for the missed state to be recognized — there is no separate boolean or enum field to set instead. This sentinel value is **not** warrior-authored content, even though it lives in the free-text `notes` field.

### 4.4 Write RPCs (the only legitimate write path — direct table INSERT is not how the app writes logs)

`toggle_block_status(p_warrior_id, p_warrior_program_id, p_block_id, p_next_status, p_start_of_today)` — simple checkbox path; deletes any existing log for `(warrior_id, block_id, completed_at >= start_of_today)` then inserts fresh (fixed `rating: 5`, `notes = '[STATUS:MISSED]'` if missed else `''`).

`log_block_with_sets(p_warrior_id, p_warrior_program_id, p_block_id, p_status, p_feel, p_rpe, p_missed_reason, p_missed_detail, p_notes, p_session_seconds, p_start_of_today, p_sets)` — full detailed-logging path; same delete-then-reinsert, then bulk-inserts `p_sets` (a jsonb array of `{ block_exercise_id, set_index, reps_completed, weight_used, hold_seconds }`) into `workout_set_logs`. Both RPCs enforce **at most one log per block per calendar day** procedurally (delete-then-insert), not via a DB unique constraint.

---

## 5. Weekly Check-in Models

**Confirmed, not inferred: the only periodic athlete check-in mechanism in this entire codebase is bodyweight.** An exhaustive case-insensitive grep across all of `src/` and `supabase/migrations/` for sleep, recovery-quality (as athlete wellness — distinct from Supabase Auth's unrelated password-recovery flow), pain/soreness (beyond two motivational-copy strings, e.g. `"The pain of discipline is temporary..."` in `AuthScreen.tsx`), energy level, stress, mood, wellness, HRV, and subjective-readiness (distinct from an unrelated tournament-lobby "ready-up" toggle) returned **zero relevant hits** for every single term.

### 5.1 `bodyweight_logs` — the entire "check-in" data model

```sql
create table "public"."bodyweight_logs" (
  "id" uuid not null default gen_random_uuid(),
  "warrior_id" uuid not null references public.profiles(id) on delete cascade,
  "warrior_program_id" uuid references public.warrior_programs(id) on delete set null,
  "weight_kg" numeric not null,
  "logged_at" timestamp with time zone not null default now()
);
```

| Field | Type | Nullable | Description |
|---|---|---|---|
| `id` | uuid | No | |
| `warrior_id` | uuid | No | → `profiles.id`, cascades |
| `warrior_program_id` | uuid | Yes | → `warrior_programs.id`, `ON DELETE SET NULL` — the entry belongs fundamentally to the warrior, only loosely to whichever program they were on |
| `weight_kg` | numeric | No | |
| `logged_at` | timestamptz | No | default `now()` |

Surfaced in the UI as `BodyweightCheckInModal.tsx` ("WEEKLY CHECK-IN"), wired into `WarriorProgramScreen.tsx` as an optional, skippable weekly prompt. **This is the entirety of the check-in model — there are no other columns, no other table.**

### 5.2 What else exists that is adjacent but distinct

The per-session `feel` / `rpe` / `missed_reason` fields on `workout_logs` (§4.1) are the only other subjective/wellness-adjacent inputs in the app — but they are scoped to one workout session, not a periodic/weekly check-in, and they are documented fully in §4.

**An AI must never generate `sleep_hours`, `recovery_score`, `pain_level`, `energy_level`, `stress_level`, `mood`, `hrv`, or any similarly-named field for import — none of these have any backing column, table, or code path in Leap today.**

---

## 6. Coach Models

### 6.1 No dedicated "Coach" table exists

A coach is simply a `profiles` row with `is_coach = true` (optionally also `is_admin = true`, which bypasses ownership checks everywhere). Confirmed via exhaustive `CREATE TABLE` grep — no `coaches`/`coach_profiles` table exists anywhere.

### 6.2 Every table carrying a `coach_id` column

| Table | Column | FK behavior |
|---|---|---|
| `profiles` | `coach_id uuid` (nullable, self-FK — the *athlete's* assigned coach) | `ON DELETE SET NULL` |
| `program_templates` | `coach_id uuid not null` | `ON DELETE SET NULL` |
| `warrior_programs` | `coach_id uuid not null` | `ON DELETE SET NULL` |
| `coach_week_notes` | `coach_id uuid NOT NULL REFERENCES profiles(id)` | `ON DELETE CASCADE` |

`program_week_archive` has no `coach_id` column of its own — ownership is derived transitively through `program_templates.coach_id`.

### 6.3 The recurring coach-ownership check pattern (used in every coach-authored-data RPC)

```sql
SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
IF auth.uid() IS NULL OR (auth.uid() != v_coach_id AND NOT COALESCE(v_is_admin, false)) THEN
  RAISE EXCEPTION 'Not authorized to modify this client''s program';
END IF;
```
Applied in: `get_warrior_progress`, `append_weeks_to_client_program`, `overwrite_client_program`, `archive_and_append_client_program`, `assign_program_template` (after an IDOR fix), `delete_coach_week_data`, `delete_coach_client_data`. The `auth.uid() IS NULL` check is explicit and required — `NULL != v_coach_id` evaluates to `NULL`, which is falsy in `plpgsql`, so an unauthenticated caller would otherwise silently pass.

Coach-role RLS also gates `exercise_library` writes directly: `WHERE profiles.id = auth.uid() AND (profiles.is_coach = true OR profiles.is_admin = true)`.

### 6.4 `invite_codes` — an access paywall, **not** a coach-role grant

```sql
create table "public"."invite_codes" (
    "id" uuid not null default gen_random_uuid(),
    "code" text not null,
    "type" text not null,
    "expires_at" timestamp with time zone,
    "used_by" uuid,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone default now()
);
```
FK: `used_by` → `profiles(id) ON DELETE SET NULL`. Unique: `code`.

`redeem_invite_code(p_code, p_user_id)` maps `type` to an access duration:
```sql
CASE v_type
  WHEN 'trial_14' THEN v_duration := interval '14 days';
  WHEN 'member_30' THEN v_duration := interval '30 days';
  WHEN 'member_90' THEN v_duration := interval '90 days';
  WHEN 'lifetime' THEN v_duration := interval '100 years';
  ELSE v_duration := interval '7 days';
END CASE;
```
and writes only `profiles.access_granted_at` / `access_expires_at` / `invite_code_used`. **It never touches `is_coach` or `coach_id`.** There is no `type = 'coach'` value referenced anywhere. The actual coach-feature gate is the separate `profiles.coach_beta_access` boolean, which no migration-defined RPC sets (presumably granted manually/via admin tooling — out of scope of the code available to this contract).

An IDOR was fixed here (`20260704130200_fix_redeem_invite_code_idor.sql`): the RPC now requires `auth.uid() = p_user_id`, since previously any authenticated user could redeem a code against someone else's account.

---

## 7. Program Builder Models

These are **in-app editor UI-state types**, not the authoritative wire/import format (§14 is authoritative for JSON an AI should generate for import). They are documented here because an AI reasoning about "how a coach builds a program" should understand this shape, but should target the export/import payload shapes in §14 when producing actual import JSON.

### 7.1 Builder-canonical types (`src/hooks/coaching/useProgramBuilder.ts:44-78`, verbatim)

```typescript
export interface SelectedExercise {
  id: string; // client-side unique key
  exercise_id: string | number;
  name: string;
  youtube_url: string;
  sets: string;
  reps: string;
  rest_seconds: string;
  hold_seconds: string;
  notes: string;
  is_weighted?: boolean;
}

export interface ProgramBlock {
  id: string; // client-side unique key
  db_id?: string | number;
  name: string;
  notes: string;
  exercises: SelectedExercise[];
  metadata?: ConceptMetadata;
  week_number?: number;
  previous_log_from_block_id?: string | number;
}

export interface ProgramDay {
  id: string; // client-side unique key
  name: string; // E.g. "Saturday"
  blocks: ProgramBlock[];
  focusTag?: 'PULL' | 'PUSH' | 'LEGS' | 'FULL_BODY' | 'CORE' | 'NONE';
}
```
A "week" in the builder's own in-memory state is `Record<number, ProgramDay[]>` — again, not a table, purely a client-side grouping keyed by the integer that becomes `program_blocks.week_number` on save.

### 7.2 Type duplication warning

The same conceptual `Program`/`Day`/`Block`/`Exercise` shapes are **independently declared with slightly different fields in at least four places** in this codebase: the builder-canonical version above, a warrior-view version (`WarriorProgramScreen.tsx:52-77`, adds `completedStatus`), a third copy local to `CopyBlockModal.tsx:16-45`, and a second copy of `ExerciseDetail` in `WarriorExerciseRow.tsx:7-16`. **None of these four is "more correct" than another — they are simply four separate declarations that happen to overlap.** The one genuinely single-source type is `ConceptMetadata` (§2.4). Do not treat any in-app UI-state type as the wire contract; use §14.

### 7.3 Save RPC — `save_program_template`

Accepts `p_template_id` (null = create new), `p_name`, `p_description`, `p_blocks` (jsonb array of `{ db_id?, name, notes, order_index, week_number, exercises: [{ exercise_id, sets, reps, rest_seconds, hold_seconds, notes, order_index }] }`). On update, only pre-wipes `block_exercises` for blocks reappearing in the payload; blocks being removed are deleted inside a `foreign_key_violation`-guarded sub-transaction — if a `workout_logs` row still references a block, the delete is skipped and the block id is returned in `undeletable_block_ids` rather than silently losing data.

---

## 8. Assessment Models

Four independent logging subsystems exist, each pairing a **reference/config table** (read-only seed data) with a **current-PB table** and/or a **full-history log table**. None of these tables model "coaching programs" — they are the strength-tier/power/static/1MM progression systems, cross-linked to programs only via `ConceptMetadata.is_tier_trial`/`tier_trial_tier` (§2.4).

### 8.1 Power Assessment

`power_assessments` (current PB, one row per user, upserted via `GREATEST`):
```sql
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
```
FK: `user_id` → `profiles(id) ON DELETE CASCADE`. No INSERT/UPDATE RLS policy exists — the only write path is `submit_power_assessment()`.

`power_assessment_log` (full history, one row per validated submission — added later since the PB table alone can't answer "points earned this week"):
```sql
create table "public"."power_assessment_log" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid,
  "pullup_1rm" numeric not null,
  "dip_1rm" numeric not null,
  "squat_1rm" numeric not null,
  "muscleup_1rm" numeric not null,
  "created_at" timestamp with time zone not null default now()
);
```
FK: `user_id` → `auth.users(id) ON DELETE CASCADE` (note: this points at `auth.users`, not `profiles`, unlike the sibling table above — a real inconsistency in the schema).

`submit_power_assessment(p_pullup, p_dip, p_squat, p_muscleup)` bounds: `pullup ≤ 150`, `dip ≤ 200`, `squat ≤ 300`, `muscleup ≤ 100`; 30-second cooldown between submissions per user; scoring `points = pullup + dip + squat + (muscleup * 2)`; tier cutoffs `≥250 → 3`, `≥100 → 2`, else `1`.

Client-side mirror (`src/lib/powerLogic.ts`, full file, verbatim):
```typescript
export interface PowerMovement { id: string; name: string; multiplier: number; }
export const POWER_MOVEMENTS: PowerMovement[] = [
  { id: 'pull_up', name: 'Weighted Pull-up', multiplier: 1 },
  { id: 'dip', name: 'Weighted Dip', multiplier: 1 },
  { id: 'squat', name: 'Weighted Squat', multiplier: 1 },
  { id: 'muscle_up', name: 'Weighted Muscle-up', multiplier: 2 },
];
export interface PowerLevel { id: 1 | 2 | 3; name: string; subtitle: string; minPoints: number; }
export const POWER_LEVELS: Record<number, PowerLevel> = {
  1: { id: 1, name: 'VOLTAIC', subtitle: 'The Current', minPoints: 0 },
  2: { id: 2, name: 'AMPERE', subtitle: 'The Charge', minPoints: 100 },
  3: { id: 3, name: 'TESLA', subtitle: 'The Mastery', minPoints: 250 },
};
export function calculateTotalPowerScore(pbs: Record<string, number>): number {
  return POWER_MOVEMENTS.reduce((total, m) => total + (pbs[m.id] || 0) * m.multiplier, 0);
}
export function getPowerLevel(totalPoints: number): PowerLevel {
  if (totalPoints >= POWER_LEVELS[3].minPoints) return POWER_LEVELS[3];
  if (totalPoints >= POWER_LEVELS[2].minPoints) return POWER_LEVELS[2];
  return POWER_LEVELS[1];
}
export function isPowerWorldUnlocked(strengthTier: number): boolean {
  return strengthTier >= 6; // Strategos threshold
}
```
Client formula/thresholds are confirmed identical to the server RPC.

### 8.2 Static Assessment

`static_holds` (current PB, unique per `(user_id, movement_id)`):
```sql
create table "public"."static_holds" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "movement_id" text not null,
    "hold_seconds" numeric not null,
    "points" numeric not null,
    "logged_at" timestamp with time zone default now(),
    "created_at" timestamp with time zone default now()
);
```
FK: `user_id` → `auth.users(id) ON DELETE CASCADE` (again `auth.users`, not `profiles`). Unique: `(user_id, movement_id)`.

`static_hold_attempts` (full per-attempt history, `accepted` flags whether it was a PB):
```sql
create table "public"."static_hold_attempts" (
  "id" uuid not null default gen_random_uuid(),
  "user_id" uuid,
  "movement_id" text not null,
  "hold_seconds" numeric not null,
  "accepted" boolean not null,
  "created_at" timestamp with time zone not null default now()
);
```

`static_movements` (read-only reference table, seeded, 12 rows):
```sql
create table "public"."static_movements" (
  "id" text not null,
  "category" text not null,
  "multiplier" numeric not null,
  "max_hold_seconds" numeric not null,
  "created_at" timestamp with time zone default now()
);
alter table "public"."static_movements" add constraint "static_movements_category_check"
  check (category in ('handstand', 'front_lever', 'back_lever', 'planche'));
alter table "public"."static_movements" add constraint "static_movements_multiplier_check" check (multiplier > 0);
alter table "public"."static_movements" add constraint "static_movements_max_hold_seconds_check" check (max_hold_seconds > 0);
```
Seed rows (id / category / multiplier / max_hold_seconds): `wall_handstand`/handstand/0.5/300, `freestanding_handstand`/handstand/2.0/240, `one_arm_handstand`/handstand/8.0/120, `tuck_front_lever`/front_lever/0.25/300, `straddle_front_lever`/front_lever/1.0/280, `full_front_lever`/front_lever/6.0/240, `tuck_planche`/planche/1.0/300, `straddle_planche`/planche/2.0/240, `full_planche`/planche/8.0/120, `tuck_back_lever`/back_lever/0.25/300, `straddle_back_lever`/back_lever/1.0/280, `full_back_lever`/back_lever/3.0/240.

Client mirror (`src/lib/staticLogic.ts`, full file, verbatim):
```typescript
export interface StaticMovement { id: string; name: string; multiplier: number; level: 1 | 2 | 3; category: 'handstand' | 'front_lever' | 'back_lever' | 'planche'; }
export const STATIC_MOVEMENTS: StaticMovement[] = [
  { id: 'wall_handstand', name: 'Wall Handstand', multiplier: 0.5, level: 1, category: 'handstand' },
  { id: 'freestanding_handstand', name: 'Freestanding Handstand', multiplier: 2, level: 2, category: 'handstand' },
  { id: 'one_arm_handstand', name: 'One Arm Handstand', multiplier: 8, level: 3, category: 'handstand' },
  { id: 'tuck_front_lever', name: 'Tuck Front Lever', multiplier: 0.25, level: 1, category: 'front_lever' },
  { id: 'straddle_front_lever', name: 'Straddle Front Lever', multiplier: 1, level: 2, category: 'front_lever' },
  { id: 'full_front_lever', name: 'Full Front Lever', multiplier: 6, level: 3, category: 'front_lever' },
  { id: 'tuck_planche', name: 'Tuck Planche', multiplier: 1, level: 1, category: 'planche' },
  { id: 'straddle_planche', name: 'Straddle Planche', multiplier: 2, level: 2, category: 'planche' },
  { id: 'full_planche', name: 'Full Planche', multiplier: 8, level: 3, category: 'planche' },
  { id: 'tuck_back_lever', name: 'Tuck Back Lever', multiplier: 0.25, level: 1, category: 'back_lever' },
  { id: 'straddle_back_lever', name: 'Straddle Back Lever', multiplier: 1, level: 2, category: 'back_lever' },
  { id: 'full_back_lever', name: 'Full Back Lever', multiplier: 3, level: 3, category: 'back_lever' },
];
export const STATIC_LEVELS = {
  1: { name: 'STONE', subtitle: 'The Foundation', minPoints: 0 },
  2: { name: 'IRON', subtitle: 'The Control', minPoints: 150 },
  3: { name: 'TITAN', subtitle: 'The Mastery', minPoints: 400 },
};
export function calculatePoints(movementId: string, seconds: number): number {
  const movement = STATIC_MOVEMENTS.find(m => m.id === movementId);
  return movement ? seconds * movement.multiplier : 0;
}
export function isStaticWorldUnlocked(strengthTier: number): boolean {
  return strengthTier >= 1;
}
```
Multipliers confirmed identical between client and server.

### 8.3 1-Minute-Max (1MM) Assessment

`one_min_max_logs` — **this table is both the full history AND the PB source simultaneously** (no separate PB table exists for 1MM; the max is computed via query, not stored separately):
```sql
create table "public"."one_min_max_logs" (
    "id" uuid not null default extensions.uuid_generate_v4(),
    "user_id" uuid,
    "movement_id" text not null,
    "category_id" text not null,
    "reps" integer not null,
    "points" numeric not null,
    "created_at" timestamp with time zone default now()
);
alter table "public"."one_min_max_logs" add constraint "one_min_max_logs_reps_check" CHECK ((reps >= 0)) not valid;
```
FK: `user_id` → `profiles(id) ON DELETE CASCADE`.

`onemm_movements` (read-only reference table, seeded, 16 rows):
```sql
create table "public"."onemm_movements" (
  "id" text not null,
  "category_id" text not null,
  "pattern_id" text not null,
  "multiplier" numeric not null,
  "max_reps" integer not null,
  "created_at" timestamp with time zone default now()
);
alter table "public"."onemm_movements" add constraint "onemm_movements_category_check"
  check (category_id in ('entry', 'main', 'advanced'));
alter table "public"."onemm_movements" add constraint "onemm_movements_multiplier_check" check (multiplier > 0);
alter table "public"."onemm_movements" add constraint "onemm_movements_max_reps_check" check (max_reps > 0);
```
`pattern_id` values include `push, pull, dip, squat, deadlift, muscle_up, hspu, fl_press, fl_pull, planche`. Representative seed rows: `knee_push_ups` (entry/push, 0.25×, max 100 reps), `push_ups` (main/push, 0.5×, max 105), `muscle_ups` (advanced/muscle_up, 5.0×, max 40), `planche_push_ups` (advanced/planche, 5.0×, max 60).

**No separate `onemm_attempts` table exists by design** — an explicit migration comment states `one_min_max_logs` already records every validated submission, making a separate attempts log redundant.

### 8.4 Strength-Tier Trials ("Rite of Passage")

`trial_history` (one row per attempt, pass or fail):
```sql
create table "public"."trial_history" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "tier_attempted" integer not null,
    "completed" boolean default false,
    "time_seconds" integer,
    "attempted_at" timestamp with time zone default now()
);
```
FK: `user_id` → `profiles(id) ON DELETE CASCADE`. **No direct-INSERT RLS policy exists** (deliberately removed, `20260630151000_remove_trial_history_direct_insert_policy.sql`, to prevent clients bypassing the hard-floor/cooldown checks) — the only write path is a Supabase Edge Function + RPC that enforces `tier_hard_floors` (§8.5).

`RITES_OF_PASSAGE` — full trial definitions, all 10 entries, tiers 0-9 (`src/lib/trials.ts`, verbatim):
```typescript
export interface TrialMovement { name: string; reps: number; completed?: boolean; }
export interface Trial { tier: number; name: string; movements: TrialMovement[]; }

export const RITES_OF_PASSAGE: Trial[] = [
  { tier: 0, name: "Helot Trial", movements: [
      { name: "Inverted Row", reps: 10 }, { name: "Squats", reps: 10 },
      { name: "Bench Dips", reps: 10 }, { name: "Knee Push-ups", reps: 10 },
  ]},
  { tier: 1, name: "Neos Trial", movements: [
      { name: "2 Inv Row + 4 Inc Push-ups", reps: 1 }, { name: "Squats", reps: 10 },
      { name: "Knee Push-up Negatives", reps: 10 }, { name: "4 Inv Row + 6 Inc Push-ups", reps: 1 },
      { name: "Lunges", reps: 15 }, { name: "Bench Dips", reps: 12 },
      { name: "6 Inv Row + 8 Inc Push-ups", reps: 1 }, { name: "Inverted Row", reps: 10 },
      { name: "Knee Raises", reps: 5 },
  ]},
  { tier: 2, name: "Ephebe Trial", movements: [
      { name: "2 Assist Pull + 4 Bench Dips", reps: 1 }, { name: "Squats", reps: 15 },
      { name: "Knee Push-ups", reps: 15 }, { name: "4 Assist Pull + 6 Bench Dips", reps: 1 },
      { name: "Lunges", reps: 20 }, { name: "Knee Push-ups", reps: 20 },
      { name: "6 Assist Pull + 8 Bench Dips", reps: 1 }, { name: "Inverted Row", reps: 10 },
      { name: "Knee Raises", reps: 8 }, { name: "Jump Muscle-ups", reps: 5 },
  ]},
  { tier: 3, name: "Hoplite Trial", movements: [
      { name: "2 Assist Pull + 2 Bar Dips + 2 Knee Raise", reps: 1 }, { name: "Squats", reps: 20 },
      { name: "4 Assist Pull + 4 Bar Dips + 4 Knee Raise", reps: 1 }, { name: "Lunges", reps: 25 },
      { name: "Push-ups", reps: 20 }, { name: "6 Assist Pull + 6 Bar Dips + 6 Knee Raise", reps: 1 },
      { name: "Bar Dips", reps: 8 }, { name: "Assist Pull-ups", reps: 10 },
      { name: "Jump Muscle-ups", reps: 8 },
  ]},
  { tier: 4, name: "Spartan Trial", movements: [
      { name: "Banded Muscle-ups", reps: 5 }, { name: "4 Pull-ups + 3 Bar Dips", reps: 1 },
      { name: "Squats", reps: 20 }, { name: "Push-ups", reps: 20 },
      { name: "5 Pull-ups + 5 Bar Dips", reps: 1 }, { name: "Lunges", reps: 25 },
      { name: "Bar Dips", reps: 20 }, { name: "6 Pull-ups + 7 Bar Dips", reps: 1 },
      { name: "Bar Dips", reps: 10 },
  ]},
  { tier: 5, name: "Lochagos Trial", movements: [
      { name: "1 Banded MU + 3 Bar Dips + 3 Pull-ups", reps: 1 }, { name: "Squats", reps: 20 },
      { name: "Push-ups", reps: 25 }, { name: "2 Banded MU + 4 Bar Dips + 4 Pull-ups", reps: 1 },
      { name: "Lunges", reps: 25 }, { name: "Bar Dips", reps: 25 },
      { name: "3 Banded MU + 5 Bar Dips + 5 Pull-ups", reps: 1 }, { name: "Pull-ups", reps: 10 },
  ]},
  { tier: 6, name: "Strategos Trial", movements: [
      { name: "2 Muscle-ups + 2 Bar Dips + 2 Pull-ups", reps: 1 }, { name: "Squats", reps: 20 },
      { name: "Push-ups", reps: 20 }, { name: "4 Muscle-ups + 4 Bar Dips + 4 Pull-ups", reps: 1 },
      { name: "Lunges", reps: 30 }, { name: "Bar Dips", reps: 30 },
      { name: "6 Muscle-ups + 6 Bar Dips + 6 Pull-ups", reps: 1 },
  ]},
  { tier: 7, name: "Olympian Trial", movements: [
      { name: "3 Muscle-ups + 3 Bar Dips + 3 Pull-ups", reps: 1 }, { name: "Squats", reps: 30 },
      { name: "Push-ups", reps: 30 }, { name: "5 Muscle-ups + 5 Bar Dips + 5 Pull-ups", reps: 1 },
      { name: "Lunges", reps: 40 }, { name: "Bar Dips", reps: 40 },
      { name: "8 Muscle-ups + 8 Bar Dips + 8 Pull-ups", reps: 1 }, { name: "Muscle-ups", reps: 10 },
  ]},
  { tier: 8, name: "Demigod Trial", movements: [
      { name: "3 Muscle-ups + 3 Bar Dips + 3 Pull-ups", reps: 1 }, { name: "Squats (+20 kg)", reps: 30 },
      { name: "Push-ups", reps: 30 }, { name: "5 Muscle-ups + 5 Bar Dips + 5 Pull-ups", reps: 1 },
      { name: "Lunges (+20 kg)", reps: 40 }, { name: "Bar Dips (+20 kg)", reps: 40 },
      { name: "8 Muscle-ups + 8 Bar Dips + 8 Pull-ups", reps: 1 }, { name: "Pull-ups (+10 kg)", reps: 14 },
      { name: "Muscle-ups (+5 kg)", reps: 10 },
  ]},
  { tier: 9, name: "Eternity Protocol", movements: [
      { name: "(1 Pull-up + 1 MU) Unbroken", reps: 2 }, { name: "Dips (+20 kg)", reps: 10 },
      { name: "Squat (+20 kg)", reps: 10 }, { name: "Muscle-ups (+10 kg)", reps: 4 },
      { name: "(1 Pull-up + 1 MU) Unbroken", reps: 2 }, { name: "Dips (+10 kg)", reps: 20 },
      { name: "Squat (+10 kg)", reps: 20 }, { name: "Muscle-ups (+5 kg)", reps: 6 },
      { name: "(1 Pull-up + 1 MU) Unbroken", reps: 2 }, { name: "Dips (Bodyweight)", reps: 30 },
      { name: "Squat (Bodyweight)", reps: 30 }, { name: "Muscle-ups (Bodyweight)", reps: 8 },
  ]},
];
```

### 8.5 Server-authoritative trial floor: `tier_hard_floors`

```sql
create table "public"."tier_hard_floors" (
  "tier" integer not null,
  "floor_seconds" integer not null,
  constraint "tier_hard_floors_pkey" primary key ("tier"),
  constraint "tier_hard_floors_tier_check" check (tier >= 0 and tier <= 9),
  constraint "tier_hard_floors_floor_seconds_check" check (floor_seconds > 0)
);
```
Seeded with the same 10 values as client-side `TIER_HARD_FLOORS` (§1.4) — enforced server-side inside the trial-submission RPC as the authoritative minimum trial duration.

### 8.6 Dead/dropped tables — confirmed removed, must not appear as live schema

`statics_assessments` and `one_mm_scores` were both dropped (`20260630180000_drop_orphaned_tables.sql`) — orphaned from an earlier design, zero remaining references in code or RPCs. **Do not generate JSON targeting either table; they no longer exist.**

---

## 9. AI Related Models

### 9.1 The one AI/LLM feature in this codebase — status: dead code, server-gated

`src/screens/CoachScreen.tsx` (comment: `// AI Coach - Gemini enabled`) implements a Gemini-powered chat coach. **Confirmed via exhaustive grep: this component is never imported or routed to from anywhere else in the app.** There is no `app/coach.tsx` route; `ProfileScreen.tsx`'s coaching-center entry point routes to `CoachingHubScreen` (the program-management hub, §7), not this chat screen. **The entire feature — UI, prompt, edge-function call — is unreachable in the shipped app.**

Even if reached, the backing edge function server-gates it:

`supabase/functions/chat-gemini/index.ts:34-49` (verbatim):
```javascript
// Admin gate check for V1
const supabaseAdmin = createClient(...)
const { data: profile, error: profileError } = await supabaseAdmin
  .from('profiles').select('is_admin').eq('id', user.id).single()

if (profileError || !profile?.is_admin) {
  return new Response(JSON.stringify({ error: 'Forbidden', message: 'AI Coach is coming in Season 2.' }), {
    status: 403, ...
  })
}
```

**Request shape** (native Gemini `generateContent` format, not OpenAI-style), sent to `supabase.functions.invoke('chat-gemini', ...)`:
```javascript
{
  contents: [
    { role: 'user', parts: [{ text: `INSTRUCTIONS: ${buildSystemPrompt(profile)}` }] },
    { role: 'model', parts: [{ text: 'Understood. I am the Leap Arena Mentor. Speak, Warrior.' }] },
    { role: 'user', parts: [{ text: 'Begin session' }] }
  ],
  generationConfig: { maxOutputTokens: 150, temperature: 0.7 }
}
```
Follow-up messages remap the last 6 chat turns as `{ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }`.

**System prompt template** (`CoachScreen.tsx:44-87`, condensed but verbatim structure):
```
You are the elite Leap Arena Mentor. You analyze calisthenics data and give sharp, specific, and direct advice. You use "tough love" to push the warrior to excellence, but you NEVER insult, demean, or call them names (no words like coward, peasant, or disgrace).

ARENA KNOWLEDGE (HOW IT WORKS):
- The Arena has 3 Main Worlds: Power World, Static World, 1MM.
- Global Rank accumulates points across all 3 worlds, plus Glory Score from Clashes.

WARRIOR DATA:
- Name: ${profile.display_name}
- Strength Tier: ${profile.strength_tier} (${tierName})
- Glory Score: ${profile.glory_score}
- Clash Win Streak: ${profile.clash_win_streak}
- Trials: ${profile.trials_passed} passed / ${profile.trials_attempted} attempted
- Power Points / Static Points / 1MM Points: ${...}
...

STRICT RULES:
1. Keep every response under 60 words.
...
8. If off-topic, reply: "I only analyze warrior performance. Ask me about the Arena."
```

**Response shape** — treated as raw free text, never structured JSON:
```javascript
const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
```
No `responseSchema`/`response_mime_type: application/json` is requested anywhere. This feature has **no JSON-output contract at all** — it is purely conversational.

### 9.2 `EXPO_PUBLIC_GEMINI_KEY` is vestigial

CLAUDE.md documents this env var as "only needed for AI-assisted coach features," but it is **never read anywhere in client code** — confirmed via grep of `src/`/`app/`. A code comment in `CoachScreen.tsx:189` confirms it was deliberately superseded: `// Removed local API key check since we rely on the Edge Function now`. The actual key that matters is the server-side `GEMINI_API_KEY` Deno environment variable, used only inside `supabase/functions/chat-gemini/index.ts` (model: `gemini-flash-lite-latest`).

**No other AI/LLM integration exists anywhere in the codebase** — no OpenAI/Anthropic client library, no other prompt-construction code. `src/lib/AssessmentEngine.ts`'s `generateRecommendations()` and the "SMART RECOMMENDATION BANNER" UI are **pure deterministic rule-based logic** (tier thresholds, PB-staleness checks, weakest-world math) — they never call any AI/LLM. This is a red herring for "AI-generated recommendation" and must not be conflated with a real AI feature.

### 9.3 The real, production AI-relevant contract: the Week-export edit loop

The genuinely active AI-relevant mechanism in this codebase is **not** an in-app API call — it's the file-based loop already quoted in the Purpose section: a coach exports a week's JSON (§14), a human or an AI edits the file externally, and the coach re-imports it via the existing, unmodified importer. **This is precisely the workflow this entire document exists to support.** See §14 for the exact, complete Export/Import contract this loop depends on.

---

## 10. Enumerations — Master List

### 10.1 Confirmed to exist

| Enum | Values | Enforcement | Source |
|---|---|---|---|
| `TierRank` / `TIER_NAMES` | Helot, Neos, Ephebe, Hoplite, Spartan, Lochagos, Strategos, Olympian, Demigod, Eternity (tiers 0-9) | App convention only | `src/types/index.ts:41-63` |
| `POWER_TIER_NAMES` | Voltaic (0, unused), Voltaic (1), Ampere (2), Tesla (3) | App convention only | `src/types/index.ts:66-71` |
| `ConceptMetadata.timing_system` | `'amrap'` \| `'fortime'` \| `'straight_set'` \| `'tabata'` | App convention only | `BlockConceptParser.ts:2` |
| `ConceptMetadata.structure` | `'single'` \| `'superset'` \| `'circuit'` \| `'ladder'` | App convention only | `BlockConceptParser.ts:4` |
| `ConceptMetadata.ladder_direction` | `'down'` \| `'up'` | App convention only | `BlockConceptParser.ts:8` |
| `ConceptMetadata.type` (legacy) | `'single'` \| `'superset'` \| `'circuit'` \| `'amrap'` \| `'fortime'` | App convention only | `BlockConceptParser.ts:19` |
| `ConceptMetadata.focus_tag` / `ProgramDay.focusTag` | `'PULL'` \| `'PUSH'` \| `'LEGS'` \| `'FULL_BODY'` \| `'CORE'` \| `'NONE'` | App convention only | `BlockConceptParser.ts:16` |
| Completion status | `'completed'` \| `'missed'` (+ UI-only `'none'` = not logged today) | Derived from `notes` prefix `[STATUS:MISSED]`, **not a column** | §4.3 |
| `feel` | `'hard'` \| `'ok'` \| `'good'` \| `'strong'` \| `'beast'` \| null | **DB CHECK constraint** | `workout_logs_feel_check` |
| `missed_reason` | `'no_time'` \| `'too_tired'` \| `'injury'` \| `'other'` \| null | **DB CHECK constraint** | `workout_logs_missed_reason_check` |
| `rpe` | integer 1-10 or null | **DB CHECK constraint** | `workout_logs_rpe_check` |
| `static_movements.category` | `'handstand'` \| `'front_lever'` \| `'back_lever'` \| `'planche'` | **DB CHECK constraint** | `static_movements_category_check` |
| `onemm_movements.category_id` | `'entry'` \| `'main'` \| `'advanced'` | **DB CHECK constraint** | `onemm_movements_category_check` |
| `exercise_library.category` | observed: `'push'\|'pull'\|'legs'\|'core'\|'skill'\|'flexibility'\|'strength'\|'mobility'` | **Unconstrained free text** | `ExerciseLibraryScreen.tsx:28` |
| `exercise_library.difficulty` | `'beginner'` \| `'intermediate'` \| `'advanced'` | **Unconstrained free text** | `ExerciseLibraryScreen.tsx:29` |
| `warrior_programs.status` | `'active'` \| `'paused'` \| `'completed'` | **Unconstrained free text**, default `'active'` | `MyClientsScreen.tsx:40` |
| `ClientProgramWriteMode` | `'append'` \| `'archive'` \| `'overwrite'` | App-level dispatch only, not persisted | `ClientProgramWriter.ts:3` |
| `Feel` (UI type alias) | same 5 values as `feel` | — | `FeelRpePicker.tsx:4` |
| `MissedReason` (UI type alias) | same 4 values as `missed_reason` | — | `MissedReasonPicker.tsx:4` |

### 10.2 Explicitly requested but confirmed NOT to exist

| Requested enum | Finding |
|---|---|
| `TrainingType` | Not found under this or any equivalent name anywhere. |
| `MovementPattern` | Not found for exercises. (`onemm_movements.pattern_id` is an unrelated assessment-reference concept — see §3.2.) |
| `Equipment` | No equipment concept exists anywhere in the codebase. |
| `WorkoutStatus` | Not found; no `workout_status` column exists. |
| `SkillType` | Not found; no `skill_type` column exists. |
| `BlockType` | Not found; `program_blocks`/`block_exercises` have no type/category discriminator column at all. |
| `CompletionStatus` (as a named type) | Confirmed to be purely the `[STATUS:MISSED]` notes-prefix convention — no additional named type, no additional states beyond completed/missed/(not-logged). |
| `Difficulty` (as a named/exported type) | No standalone type exists — only the inline literal union on `exercise_library.difficulty` (§3.1). |

**An AI must not invent or populate any field expecting these enums to exist as typed columns — they would have nowhere to be stored, and any DB write referencing them would either be silently dropped (extra JSON keys are simply ignored by the importer, §14) or fail if forced into a non-existent column.**

---

## 11. Relationships

```
profiles (Athlete AND/OR Coach AND/OR Admin — one table, role flags)
  │ self-FK: profiles.coach_id → profiles.id  (athlete's assigned coach)
  │
  ├──1:N──► warrior_programs (coach_id, warrior_id both → profiles.id)
  │            │ N:1
  │            ▼
  │         program_templates (coach_id → profiles.id)
  │            │ 1:N
  │            ▼
  │         program_blocks (week_number = "Week"; name split = "Day")
  │            │ 1:N
  │            ▼
  │         block_exercises ──N:1──► exercise_library (exercise_id)
  │            │
  │            │ (block_exercises.id referenced optionally, ON DELETE SET NULL)
  │            ▼
  ├──1:N──► workout_logs ──block_id──► program_blocks
  │            │ 1:N
  │            ▼
  │         workout_set_logs ──block_exercise_id (nullable)──► block_exercises
  │
  ├──1:N──► bodyweight_logs (also loosely → warrior_programs, nullable)
  │
  ├──1:N (via warrior_programs)──► coach_week_notes (warrior_program_id, week_number, coach_id)
  │
  ├──1:N──► power_assessments / power_assessment_log
  ├──1:N──► static_holds / static_hold_attempts
  ├──1:N──► one_min_max_logs
  └──1:N──► trial_history

program_templates ──1:N──► program_week_archive (template_id, week_number — hides a week from the athlete's active view; does NOT delete or exclude it from exports)

Reference/config tables (read-only, parameterize scoring — not owned by any athlete/coach):
  static_movements, onemm_movements, tier_hard_floors
```

**Explicitly absent relationships** (do not model these): no `Goal` entity or table exists anywhere. No `Equipment` entity. No `Assessment` table distinct from the four subsystems in §8 (these ARE "the" assessment models — there is no separate generic "Assessment" table). No relationship between `exercise_library` and any tagging/movement-pattern/skill-family table, because none of those tables exist.

---

## 12. Validation Rules Already Present

**No zod/yup or any schema-validation library exists anywhere in this codebase** — confirmed absent from `package.json` and via source grep.

### 12.1 The one manual JS validator — `validateWeekImportPayload` (`src/lib/ProgramImportParser.ts:12-36`, verbatim)

```typescript
export function validateWeekImportPayload(data: any): ImportValidationResult {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not a valid JSON object.' };
  }
  if (!Array.isArray(data.blocks) || data.blocks.length === 0) {
    return { valid: false, error: 'No blocks found in the file.' };
  }
  for (const block of data.blocks) {
    const blockName = block?.block_name || block?.name || 'UNNAMED BLOCK';
    if (!block || typeof blockName !== 'string' || !blockName.trim()) {
      return { valid: false, error: 'Every block needs a name.' };
    }
    if (!Array.isArray(block.exercises)) {
      return { valid: false, error: `Block "${blockName}" is missing its exercises list.` };
    }
    for (const ex of block.exercises) {
      const hasId = typeof ex?.exercise_id === 'string' && ex.exercise_id.length > 0;
      const hasName = typeof ex?.name === 'string' && ex.name.trim().length > 0;
      if (!hasId && !hasName) {
        return { valid: false, error: `An exercise in block "${blockName}" has neither an exercise_id nor a name to match against.` };
      }
    }
  }
  return { valid: true, blockCount: data.blocks.length };
}
```
This is the exact and only gate an AI-generated Week or Master Template import JSON must pass. **See §14.3 for the minimal-required-field checklist derived from this function.**

### 12.2 Every Postgres CHECK constraint touched by this contract

```sql
-- workout_logs
check (feel is null or feel in ('hard', 'ok', 'good', 'strong', 'beast'))
check (rpe is null or (rpe between 1 and 10))
check (missed_reason is null or missed_reason in ('no_time', 'too_tired', 'injury', 'other'))

-- static_movements
check (category in ('handstand', 'front_lever', 'back_lever', 'planche'))
check (multiplier > 0)
check (max_hold_seconds > 0)

-- onemm_movements
check (category_id in ('entry', 'main', 'advanced'))
check (multiplier > 0)
check (max_reps > 0)

-- tier_hard_floors
check (tier >= 0 and tier <= 9)
check (floor_seconds > 0)

-- one_min_max_logs
check (reps >= 0)
```
No CHECK constraints exist on `profiles`, `exercise_library`, `program_blocks`, `block_exercises`, `warrior_programs`, or `workout_set_logs` — those tables rely entirely on application-code/RPC-level validation.

### 12.3 RPC-level validation

- `submit_power_assessment`: bounds `pullup ≤150, dip ≤200, squat ≤300, muscleup ≤100`; 30-second cooldown.
- Trial submission (Edge Function + RPC): enforces `tier_hard_floors` minimum duration server-side (client's `TIER_HARD_FLOORS` check is UX-only, not authoritative).
- `save_program_template`: guards block deletion against `foreign_key_violation` (a block with existing `workout_logs` cannot be deleted; save otherwise succeeds).
- `redeem_invite_code`: requires `auth.uid() = p_user_id` (IDOR fix).
- Every coach-authored-data RPC: `auth.uid() != coach_id AND NOT is_admin → reject` (§6.3).

### 12.4 Row-level trigger validation

`guard_profile_protected_fields` (§1.5) — blocks direct client writes to 11 named `profiles` columns, regardless of RLS.

---

## 13. Serialization

**No `toJSON`/`fromJSON`/formal serialization framework exists anywhere in this codebase.** The word "serialize" appears exactly once, as a local variable name (`useProgramBuilder.ts:988`, `serializedNotes`), not a reusable utility.

The actual DB-row ↔ app-JSON conversion logic that matters for import/export lives entirely in five files, already fully specified in §14: `src/lib/ProgramExportBuilder.ts`, `ProgramImportParser.ts`, `MasterTemplateTransfer.ts`, `ClientProgramWriter.ts`, `BlockConceptParser.ts`.

Elsewhere in the app, several **read-only, display-only** row-mapper functions exist in leaderboard/service files (`src/services/LeaderboardService.ts`, `src/lib/leaderboard.ts`, `src/services/PowerService.ts`, `src/services/StaticService.ts`, `src/services/OneMMService.ts`) that rename abbreviated RPC columns to full field names, compute ranks from array position, and occasionally merge two queries (e.g. backfilling `gender` from a second `profiles` lookup). **These are not part of any importable contract** — they only ever produce data for on-screen display, never accept AI-generated input, and are mentioned here only for completeness.

**Exercise-resolution logic on import** (`resolveImportedExercises`, `ProgramImportParser.ts:42-99`) is the one place a genuine "generate or match" transformation happens on the way into the database: for each exercise reference, it (1) reuses `exercise_id` if it still resolves to a live row, else (2) matches by case-insensitive exact `name`, else (3) auto-creates a new `exercise_library` row (`difficulty: 'beginner'`, `category: ''`) owned by the importing coach.

---

## 14. Import / Export — The Authoritative Wire Contract

This section is the exact JSON shape an AI must produce for its output to import into Leap **without modification**. Two formats exist; a third mechanism (C) never leaves the app as a file and is mentioned only for completeness.

### 14.1 Format A — Week Export/Import (`WeekExportPayload`)

**Full TypeScript shape** (`src/lib/ProgramExportBuilder.ts:5-73`, verbatim):
```typescript
export interface ExportSetLog {
  set_index: number;
  reps_completed: number | null;
  weight_used: number | null;
  hold_seconds: number | null;
  exercise_name: string | null;
}

export interface WeekExportBlock {
  block_id: string;
  day_name: string;
  block_name: string;
  order_index: number;
  metadata: Record<string, any>;      // ConceptMetadata, §2.4
  coach_notes: string;
  exercises: {
    exercise_id: string;
    name: string;
    sets: string;            // STRINGIFIED even though the DB column is integer
    reps: string;             // STRINGIFIED
    rest_seconds: string;     // STRINGIFIED
    hold_seconds: string;     // STRINGIFIED, "" (empty string) when DB value is null
    is_weighted: boolean;
  }[];
  log: {
    status: 'completed' | 'missed';
    feel: string | null;
    rpe: number | null;
    missed_reason: string | null;
    missed_detail: string | null;
    session_seconds: number | null;
    notes: string;
    sets: ExportSetLog[];      // numeric fields here, NOT stringified — asymmetric with exercises[] above
  } | null;
}

export interface WeekExportPayload {
  exported_at: string;
  warrior: { id: string; display_name: string; strength_tier: number; };
  program: { template_name: string; week_number: number; };
  coach_week_note: string;
  bodyweight_trend: { logged_at: string; weight_kg: number }[];
  blocks: WeekExportBlock[];
}
```

### 14.2 Format B — Master Template Export/Import (`MasterTemplateExportPayload`)

```typescript
export interface MasterTemplateExportBlock {
  day_name: string;
  block_name: string;
  week_number: number;   // present per-block, since this spans ALL weeks at once
  order_index: number;
  metadata: Record<string, any>;
  coach_notes: string;
  exercises: {
    exercise_id: string; name: string;
    sets: string; reps: string; rest_seconds: string; hold_seconds: string;
    // NOTE: no is_weighted field in this format, unlike Format A
  }[];
}

export interface MasterTemplateExportPayload {
  exported_at: string;
  template_name: string;
  description: string;
  blocks: MasterTemplateExportBlock[];
}
```
No `warrior`, no `log` (this format never carries results), no `coach_week_note`, no `bodyweight_trend`.

### 14.3 Minimal-required-field checklist for a Leap-importable JSON (derived directly from §12.1's validator)

To import successfully (either format, since both share the same validator), the JSON **must**:
1. Be a JSON object with a `blocks` array containing at least 1 entry.
2. Every block must resolve a non-empty string name via `block_name` or `name`.
3. Every block must have an `exercises` array (may be empty `[]`).
4. Every exercise must have either a non-empty string `exercise_id`, or a non-empty string `name` (used for case-insensitive matching/auto-creation).

Everything else is optional and/or ignored by the importer: `metadata`, `coach_notes`/`notes`, `order_index`, `day_name`, prescribed `sets`/`reps`/`rest_seconds`/`hold_seconds`, `is_weighted`. **`log`, `warrior`, `coach_week_note`, and `bodyweight_trend` are export-only fields — the importer never reads them back.** An AI editing an exported Week JSON to produce a new prescribed week does not need to preserve or regenerate these fields at all.

### 14.4 Export generation (how the JSON is produced — for context on how re-imported data will look on a subsequent export)

`fetchWeekExportPayload` queries `program_blocks` (filtered by `template_id` + `week_number`, ordered by `order_index`), joins `block_exercises` → `exercise_library`, parses each block's `notes` via `BlockConceptParser.parse()`, splits `name` on `' | '` for `day_name`/`block_name` (defaulting `block_name` to `'WORKOUT ROUTINE'` if no separator is found), and merges in caller-supplied logs/bodyweight/coach-note. `fetchMasterTemplateExportPayload` is identical minus the week filter and log-merging, ordered by `week_number` then `order_index`.

Write path: `JSON.stringify(payload, null, 2)`, sanitized filename, web Blob-download or native `expo-file-system` + `expo-sharing`.

### 14.5 Import processing (exact pipeline an AI-generated file will go through)

1. File picked (`.json`) → read as text → `JSON.parse` (invalid JSON → hard stop, alert).
2. `validateWeekImportPayload(parsed)` (§12.1) → invalid → hard stop, alert with the specific reason.
3. `resolveImportedExercises(parsed.blocks, coachId)` — resolves/creates every referenced exercise (§13).
4. **Format A**: `buildImportBlocksPayload` forces every block's `week_number` to `1` (relative to this import) and recomputes `name`/`notes` from `day_name`+`block_name`/`metadata`+`coach_notes`; exercises with unresolvable `exercise_id` are silently **dropped** from the block. Calls RPC `append_weeks_to_client_program` — **always additive, appends as a brand-new week after whatever weeks already exist; never overwrites, never archives.**
5. **Format B**: `buildMasterTemplateBlocksPayload` **preserves `week_number` from the file as-is** (this format legitimately spans multiple weeks) and calls `save_program_template(p_template_id: null, ...)`, always creating a **brand-new standalone template**.
6. IDs: `exercise_id` is preserved if still resolvable, else a new one is generated. **`block_id` is never preserved from the file** — every imported block becomes a fresh server-generated UUID; re-importing the same file twice creates two separate new weeks/templates.

### 14.6 Edge cases an AI-generated file may legitimately encounter or produce

- A block with no logged result → `log: null` (still include the prescribed `exercises[]`).
- `hold_seconds` on a prescribed exercise is `""` (empty string), never `"null"` or absent, when the underlying value is null.
- A missed block with no detail logged has `log.notes === "[STATUS:MISSED]"` literally — this is a sentinel, not athlete-authored text.
- A block name without `' | '` becomes entirely the `day_name`; `block_name` defaults to `'WORKOUT ROUTINE'`.
- Multiple distinct notes fields exist at three levels (block-level `coach_notes`, log-level `notes`, week-level `coach_week_note`) — never merge them into one field.
- `bodyweight_trend` is always an array (possibly empty `[]`), never `null`.
- An empty `exercises: []` on a block is valid; an empty `blocks: []` on the whole payload is **not** valid (rejected by §12.1's validator).

### 14.7 Format C — Client-Program Transfer (out of scope for file-based JSON; mentioned for completeness)

`src/lib/ClientProgramWriter.ts` copies a master template onto an existing client assignment via one of three RPCs (`append_weeks_to_client_program` / `archive_and_append_client_program` / `overwrite_client_program`), using an in-memory `BlockPayload[]` shape identical in spirit to Formats A/B's exercise fields but numeric (not stringified) and never written to a file:
```typescript
interface BlockPayloadExercise {
  exercise_id: string; sets: number | null; reps: number | null;
  rest_seconds: number | null; hold_seconds: number | null;
  is_weighted: boolean; notes: string;
}
interface BlockPayload {
  name: string; notes: string; order_index: number; week_number: number;
  exercises: BlockPayloadExercise[];
}
```
An AI producing import JSON for a human coach to use through the app's file-picker UI should target Format A or B (§14.1/§14.2) — Format C has no export button and no file at all.

---

## Appendix: Companion Document

A more exhaustive treatment of Formats A and B — including a fully-annotated sample export for each, and a longer edge-case enumeration — already exists at `docs/technical-audit/weekly-coaching-export-schema.md` in this repository. This document (`10_Leap_JSON_Contract.md`) is the broader, platform-wide contract; that document is the deep-dive on the Program/Week/Day/Block/Exercise/Log export/import system specifically.
