# Weekly Coaching Export — Complete Data Schema

Source-of-truth technical spec for the JSON export/import systems in the Leap coaching module. Written directly from the app's source code and Supabase migrations as they exist today (repo `leap-calispath-mobile`, `main` branch, 2026-07-06). Nothing here is aspirational — every field, type, table, and rule below is implemented and in production use.

This document is **not mentioned anywhere in `CLAUDE.md`** — the feature exists but is undocumented at the project level.

## 0. System Inventory

The app has **three** related JSON/RPC transfer subsystems for coaching programs. This document fully specs the first two (**A** and **B**); the third (**C**) is summarized only, since it never produces a portable file.

| | Name | Entry point (UI) | Builder/parser code | Scope |
|---|---|---|---|---|
| **A** | **Week export/import** | `ProgressTrackingScreen.tsx` — `EXPORT WEEK {n}` / `IMPORT WEEK` buttons | `src/lib/ProgramExportBuilder.ts`, `src/lib/ProgramImportParser.ts` | One warrior's one week: prescribed structure **+** that week's logged results, bodyweight trend, coach note |
| **B** | **Master Template export/import** | `ProgramBuilderScreen.tsx` → `BuilderMasterSelector` (export/import props) | `src/lib/MasterTemplateTransfer.ts` (reuses `ProgramImportParser`'s validator) | Every week of a reusable template. No warrior, no logs |
| **C** | **Client-program transfer** (out of scope below §12) | `MyClientsScreen.tsx` → `applyTemplateToExistingClient` | `src/lib/ClientProgramWriter.ts` | Copies a master template onto an existing client via RPC. Payload never leaves the app as a file |

There is also an unrelated **CSV** import/export for the exercise catalog only (`ExerciseLibraryScreen.tsx`, "DOWNLOAD TEMPLATE CSV" / "UPLOAD CSV FILE") — not a program/week export, not covered here.

---

## 1. Export Structure

### (A) Week Export (`WeekExportPayload`)

```
WeekExportPayload
 ├── exported_at                     (ISO timestamp, generation time)
 ├── warrior                         (the athlete this week belongs to)
 │     ├── id
 │     ├── display_name
 │     └── strength_tier
 ├── program
 │     ├── template_name
 │     └── week_number
 ├── coach_week_note                 (free text, one per warrior_program+week)
 ├── bodyweight_trend[]               (up to 12 most recent bodyweight_logs rows for this warrior)
 │     ├── logged_at
 │     └── weight_kg
 └── blocks[]                        (WeekExportBlock — one per program_blocks row in this template+week)
       ├── block_id
       ├── day_name                  (derived — see §7)
       ├── block_name                (derived — see §7)
       ├── order_index
       ├── metadata                  (ConceptMetadata — parsed out of program_blocks.notes)
       ├── coach_notes                (the human-text remainder of program_blocks.notes)
       ├── exercises[]                (prescribed structure, from block_exercises + exercise_library)
       │     ├── exercise_id
       │     ├── name
       │     ├── sets                (string)
       │     ├── reps                (string)
       │     ├── rest_seconds        (string)
       │     ├── hold_seconds        (string)
       │     └── is_weighted
       └── log                       (nullable — the warrior's actual result, or null if never logged)
             ├── status              ('completed' | 'missed')
             ├── feel
             ├── rpe
             ├── missed_reason
             ├── missed_detail
             ├── session_seconds
             ├── notes
             └── sets[]              (ExportSetLog — per-set/round results, from workout_set_logs)
                   ├── set_index
                   ├── reps_completed
                   ├── weight_used
                   ├── hold_seconds
                   └── exercise_name
```

**Important structural fact**: there is no `Week` or `Day` object/table in the database. "Week" is the integer column `program_blocks.week_number`. "Day" is not stored at all — it's synthesized at export time by splitting `program_blocks.name` on the literal substring `' | '` (see §7). A parser consuming this export should treat `blocks[]` as a flat list, each already carrying its own resolved `day_name`/`block_name`, not as a nested Day→Block tree that exists anywhere server-side.

### (B) Master Template Export (`MasterTemplateExportPayload`)

```
MasterTemplateExportPayload
 ├── exported_at
 ├── template_name
 ├── description
 └── blocks[]                        (MasterTemplateExportBlock — every block, every week, template-wide)
       ├── day_name
       ├── block_name
       ├── week_number                (present per-block, since this spans ALL weeks)
       ├── order_index
       ├── metadata
       ├── coach_notes
       └── exercises[]                (prescribed structure only — no logs, no is_weighted field)
             ├── exercise_id
             ├── name
             ├── sets
             ├── reps
             ├── rest_seconds
             └── hold_seconds
```

Differences from (A): no `warrior`, no `log` (ever — this format has no concept of a logged result), no `coach_week_note`, no `bodyweight_trend`, exercises omit `is_weighted`. `week_number` moves from the payload's `program` object (A) down onto each block (B), because a single Master Template export spans every week at once.

---

## 2. Every Object

### (A) Week Export objects

| Object | Purpose | Parent | Children |
|---|---|---|---|
| `WeekExportPayload` | Top-level export document for one warrior's one week | — (root) | `warrior`, `program`, `bodyweight_trend[]`, `blocks[]` |
| `warrior` (inline) | Identifies the athlete the export is for | `WeekExportPayload` | — |
| `program` (inline) | Identifies which template/week this is | `WeekExportPayload` | — |
| `bodyweight_trend[]` entry | One bodyweight check-in | `WeekExportPayload` | — |
| `WeekExportBlock` | One prescribed workout block for this week, merged with its log | `WeekExportPayload.blocks[]` | `exercises[]`, `log` |
| exercise entry (in `WeekExportBlock.exercises[]`) | One prescribed exercise inside a block | `WeekExportBlock` | — |
| `log` (nullable, inline in `WeekExportBlock`) | The warrior's actual logged result for this block | `WeekExportBlock` | `sets[]` (`ExportSetLog`) |
| `ExportSetLog` | One logged set/round (reps, weight, or hold time) | `WeekExportBlock.log.sets[]` | — |

### (B) Master Template Export objects

| Object | Purpose | Parent | Children |
|---|---|---|---|
| `MasterTemplateExportPayload` | Top-level export document for an entire reusable template | — (root) | `blocks[]` |
| `MasterTemplateExportBlock` | One block belonging to one week of the template | `MasterTemplateExportPayload.blocks[]` | `exercises[]` |
| exercise entry (in `MasterTemplateExportBlock.exercises[]`) | One prescribed exercise | `MasterTemplateExportBlock` | — |

### Underlying database tables (both formats are views over these)

| Table | Purpose | Referenced by |
|---|---|---|
| `program_templates` | A coach-authored reusable template (or a client's own clone of one) | `program` / `template_name` |
| `program_blocks` | One block; `name` encodes `"{day} \| {block}"`; `notes` encodes `[CONCEPT:{json}] {text}`; carries `week_number` | `blocks[]` |
| `block_exercises` | One prescribed exercise inside a block | `exercises[]` |
| `exercise_library` | Shared exercise catalog (name, category, difficulty, video) | `exercises[].name` |
| `warrior_programs` | One coach→warrior assignment of a template | `warrior` object (via join) |
| `workout_logs` | One logged attempt at a block on a given day | `log` object |
| `workout_set_logs` | Per-set/round breakdown of one `workout_logs` row | `log.sets[]` |
| `bodyweight_logs` | Weekly bodyweight check-ins | `bodyweight_trend[]` |
| `coach_week_notes` | One coach note per `(warrior_program, week_number)` | `coach_week_note` |
| `program_week_archive` | Marks a `(template, week_number)` hidden from the warrior's active view (does **not** affect export) | — |

---

## 3. Every Field

### 3.1 `WeekExportPayload` (top level)

| Field | Type | Nullable | Required | Possible values | Example | Description | Source |
|---|---|---|---|---|---|---|---|
| `exported_at` | string (ISO 8601) | No | Yes | any valid timestamp | `"2026-07-06T14:32:10.512Z"` | Moment the export was generated | `new Date().toISOString()`, `ProgramExportBuilder.ts:167` |
| `warrior.id` | string (UUID) | No | Yes | any `profiles.id` | `"3f2c1a90-..."` | Warrior's user id | `params.warriorId`, caller-supplied from `warrior_programs` join |
| `warrior.display_name` | string | No | Yes | any | `"Marcus"` | Warrior's display name | `profiles.display_name` |
| `warrior.strength_tier` | integer | No | Yes | 0–9 | `6` | Warrior's current strength tier at export time | `profiles.strength_tier` |
| `program.template_name` | string | No | Yes | any | `"Spartan Push Block"` | Name of the program template | `program_templates.name` |
| `program.week_number` | integer | No | Yes | ≥ 1 | `3` | Which week of the template this export covers | `program_blocks.week_number` (filter value) |
| `coach_week_note` | string | No | Yes (may be empty string) | any | `"Focus on tempo this week."` | Coach's free-text note for this week | `coach_week_notes.note` |
| `bodyweight_trend` | array | No | Yes (may be `[]`) | — | see below | Up to 12 most recent bodyweight entries for the warrior (**not** scoped to this week — a general trend) | `bodyweight_logs`, caller-supplied |
| `bodyweight_trend[].logged_at` | string (ISO 8601) | No | Yes | any timestamp | `"2026-07-01T08:00:00Z"` | When the weight was logged | `bodyweight_logs.logged_at` |
| `bodyweight_trend[].weight_kg` | number | No | Yes | > 0 | `78.5` | Bodyweight in kilograms | `bodyweight_logs.weight_kg` |
| `blocks` | array | No | Yes (may be `[]`) | — | see below | All blocks for this template+week | `program_blocks` rows |

### 3.2 `WeekExportBlock`

| Field | Type | Nullable | Required | Possible values | Example | Description | Source |
|---|---|---|---|---|---|---|---|
| `block_id` | string (UUID) | No | Yes | any `program_blocks.id` | `"9a1e..."` | Unique block identifier | `program_blocks.id` |
| `day_name` | string | No | Yes | any | `"Monday"` | Day label, split out of `program_blocks.name` on `' | '` | derived, `ProgramExportBuilder.ts:126-132` |
| `block_name` | string | No | Yes | any; defaults to `"WORKOUT ROUTINE"` if the split found no `' | '` | `"Push Superset"` | Block label | derived, same lines |
| `order_index` | integer | No | Yes | ≥ 0 | `2` | Display/sort order among blocks in the same day | `program_blocks.order_index` |
| `metadata` | object (`ConceptMetadata`) | No | Yes (may be `{}`) | see §5 | `{"timing_system":"amrap","time_cap_min":10}` | Structured workout concept (timing, structure, ladder, tier-trial link, focus tag) | parsed from `program_blocks.notes` by `BlockConceptParser.parse`, §6 |
| `coach_notes` | string | No | Yes (may be `""`) | any | `"Keep elbows tucked."` | Free-text coach notes, with the `[CONCEPT:...]` prefix stripped | `BlockConceptParser.parse` `cleanNotes` |
| `exercises` | array | No | Yes (may be `[]`) | — | see below | Prescribed exercises for this block | `block_exercises` joined to `exercise_library` |
| `log` | object or `null` | **Yes** | No | — | see below | The warrior's actual result, or `null` if never logged this week | `workout_logs` + `workout_set_logs`, caller-supplied |

#### `WeekExportBlock.exercises[]` (prescribed)

| Field | Type | Nullable | Required | Possible values | Example | Description | Source |
|---|---|---|---|---|---|---|---|
| `exercise_id` | string (UUID) | No | Yes | any `exercise_library.id` | `"c412..."` | Which catalog exercise | `block_exercises.exercise_id` |
| `name` | string | No | Yes | any; `"UNNAMED EXERCISE"` if the join misses | `"Pull-Up"` | Exercise display name | `exercise_library.name` |
| `sets` | **string** | No | Yes | numeric string, or `""` | `"4"` | Prescribed set count — **stringified**, source column is `integer` | `String(ex.sets ?? '')`, `ProgramExportBuilder.ts:147` |
| `reps` | **string** | No | Yes | numeric string, or `""` | `"8"` | Prescribed reps — stringified | same pattern |
| `rest_seconds` | **string** | No | Yes | numeric string, or `""` | `"60"` | Rest between sets, seconds — stringified | same pattern |
| `hold_seconds` | **string** | No | Yes | numeric string, or `""` | `""` (when column is `null`) | Isometric hold duration — stringified; empty string, not `"null"`, when the DB value is `null` | same pattern |
| `is_weighted` | boolean | No | Yes | `true`/`false` | `false` | Whether external weight is added | `!!ex.is_weighted`, `block_exercises.is_weighted` |

#### `WeekExportBlock.log` (nullable object)

| Field | Type | Nullable | Required | Possible values | Example | Description | Source |
|---|---|---|---|---|---|---|---|
| `status` | string enum | No | Yes (when `log` present) | `'completed'` \| `'missed'` | `"completed"` | Derived from `workout_logs.notes` prefix, **not** a DB column — see §5/§9 | `get_warrior_progress` RPC, `notes LIKE '[STATUS:MISSED]%'` |
| `feel` | string enum or `null` | Yes | No | `'hard'`\|`'ok'`\|`'good'`\|`'strong'`\|`'beast'`\|`null` | `"good"` | Subjective post-workout feel | `workout_logs.feel` |
| `rpe` | integer or `null` | Yes | No | 1–10 or `null` | `7` | Rate of Perceived Exertion | `workout_logs.rpe` (DB CHECK-constrained) |
| `missed_reason` | string enum or `null` | Yes | No | `'no_time'`\|`'too_tired'`\|`'injury'`\|`'other'`\|`null` | `null` | Why the block was missed (only meaningful when `status === 'missed'`) | `workout_logs.missed_reason` |
| `missed_detail` | string or `null` | Yes | No | any free text | `null` | Free-text elaboration on the missed reason | `workout_logs.missed_detail` |
| `session_seconds` | integer or `null` | Yes | No | ≥ 0 or `null` | `2100` | Total session duration in seconds | `workout_logs.session_seconds` |
| `notes` | string | No | Yes (may be `""`) | any; may literally be `"[STATUS:MISSED]"` if the block was toggled missed with no detailed log | `"Felt strong today"` | Warrior's free-text session notes, **or the raw status sentinel** — see §9 | `workout_logs.notes` |
| `sets` | array (`ExportSetLog[]`) | No | Yes (may be `[]`) | — | see below | Per-set/round breakdown | `workout_set_logs` |

#### `ExportSetLog`

| Field | Type | Nullable | Required | Possible values | Example | Description | Source |
|---|---|---|---|---|---|---|---|
| `set_index` | integer | No | Yes | ≥ 0 (0-based, ordinal within the block) | `0` | Which set/round this is | `workout_set_logs.set_index` |
| `reps_completed` | integer or `null` | Yes | No | ≥ 0 or `null` | `10` | Reps actually performed | `workout_set_logs.reps_completed` |
| `weight_used` | number or `null` | Yes | No | ≥ 0 or `null` | `20.5` | External weight used, if any | `workout_set_logs.weight_used` |
| `hold_seconds` | number or `null` | Yes | No | ≥ 0 or `null` | `null` | Hold duration for isometric sets | `workout_set_logs.hold_seconds` |
| `exercise_name` | string or `null` | Yes | No | any | `"Pull-Up"` | Denormalized exercise name for this set, resolved via `block_exercises → exercise_library` | `get_warrior_progress` RPC join |

Note: unlike the prescribed-exercise `sets`/`reps`/etc., **`ExportSetLog` fields stay numeric (or `null`)** — they are never stringified. This asymmetry (prescribed = string, logged = number) is a real serialization boundary a parser must handle.

### 3.3 `MasterTemplateExportPayload` (top level)

| Field | Type | Nullable | Required | Possible values | Example | Description | Source |
|---|---|---|---|---|---|---|---|
| `exported_at` | string (ISO 8601) | No | Yes | any timestamp | `"2026-07-06T14:40:00.000Z"` | Generation time | `MasterTemplateTransfer.ts:104` |
| `template_name` | string | No | Yes | any | `"12-Week Strength Base"` | Template name | `program_templates.name` (caller-supplied) |
| `description` | string | No | Yes (may be `""`) | any | `"Foundational block for tiers 3-5"` | Template description | `program_templates.description` (`|| ''`) |
| `blocks` | array | No | Yes (may be `[]`) | — | see below | Every block across every week | `program_blocks`, ordered by `week_number` then `order_index` |

### 3.4 `MasterTemplateExportBlock`

Identical to `WeekExportBlock` (§3.2) **except**:
- adds `week_number: integer` (required, ≥ 1, source `program_blocks.week_number || 1`) — since one export spans all weeks, each block must self-identify its week
- has **no** `log` field (this format never carries logs)
- its `exercises[]` entries have **no** `is_weighted` field (present in A, absent in B — confirmed by reading `MasterTemplateExportBlock`'s exercise type, `MasterTemplateTransfer.ts:18-25`, against `WeekExportBlock`'s, `ProgramExportBuilder.ts:35-43`)

### 3.5 Backing database tables (verbatim schema)

`program_templates` (`supabase/migrations/20260614102615_remote_schema.sql:243-249`):
```sql
create table "public"."program_templates" (
    "id" uuid not null default gen_random_uuid(),
    "coach_id" uuid not null,
    "name" text not null,
    "description" text,
    "created_at" timestamp with time zone default now()
);
```
*(Inference: `coach_id` is not shown with an explicit inline `FOREIGN KEY` in this pg_dump-style migration, but every RLS policy and RPC in the codebase treats it as `profiles.id`.)*

`program_blocks` (`20260614102615_remote_schema.sql:229-236`):
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

`block_exercises` (`20260614102615_remote_schema.sql:58-68`):
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

`exercise_library` (`20260614102615_remote_schema.sql:95-102`):
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

`warrior_programs` (`20260614102615_remote_schema.sql:370-376`):
```sql
create table "public"."warrior_programs" (
    "id" uuid not null default gen_random_uuid(),
    "template_id" uuid not null,
    "warrior_id" uuid not null,
    "coach_id" uuid not null,
    "status" text default 'active'::text,
    "assigned_at" timestamp with time zone default now()
);
```

`workout_logs` — base (`20260614102615_remote_schema.sql:414-421`) plus detail columns added later (`20260701170000_add_detailed_workout_logging.sql:12-29`):
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

`workout_set_logs` (`20260701170000_add_detailed_workout_logging.sql:33-47`):
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
create index "workout_set_logs_workout_log_id_idx" on "public"."workout_set_logs" using btree (workout_log_id);
```

`bodyweight_logs` (`20260701170000_add_detailed_workout_logging.sql:95-101`):
```sql
create table "public"."bodyweight_logs" (
  "id" uuid not null default gen_random_uuid(),
  "warrior_id" uuid not null references public.profiles(id) on delete cascade,
  "warrior_program_id" uuid references public.warrior_programs(id) on delete set null,
  "weight_kg" numeric not null,
  "logged_at" timestamp with time zone not null default now()
);
create index "bodyweight_logs_warrior_id_logged_at_idx" on "public"."bodyweight_logs" using btree (warrior_id, logged_at desc);
```

`coach_week_notes` (`20260702130000_add_coach_week_notes.sql:7-15`):
```sql
CREATE TABLE "public"."coach_week_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "warrior_program_id" uuid NOT NULL REFERENCES public.warrior_programs(id) ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "coach_id" uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  "note" text NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE ("warrior_program_id", "week_number")
);
```

`program_week_archive` (`20260702140000_add_program_week_archive.sql:11-16`):
```sql
CREATE TABLE "public"."program_week_archive" (
  "template_id" uuid NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "archived_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("template_id", "week_number")
);
```

---

## 4. Relationships

```
profiles (Athlete / Warrior)
  │  1
  │
  │  N
warrior_programs  ───────────────► program_templates  (template_id)
  │  N                                  │ 1
  │ 1                                   │
  │                                     │ N
coach_week_notes            program_blocks  (week_number = "Week", name-split = "Day")
  (warrior_program_id,                  │ 1
   week_number)                         │
                                         │ N
                                   block_exercises ───────► exercise_library (exercise_id)
                                         │
                                         │ (block_exercises.id referenced optionally)
                                         │
workout_logs ◄─────── block_id ─────────┘
  │ 1                    (program_blocks.id)
  │
  │ N
workout_set_logs ───► block_exercises (block_exercise_id, nullable, ON DELETE SET NULL)

profiles ──1───N── bodyweight_logs ──N───1── warrior_programs (nullable FK)

program_templates ──1───N── program_week_archive (template_id, week_number)
```

- **Athlete ↔ Program**: one `warrior_programs` row per (coach, warrior, template) assignment. A warrior's actual programmed content always lives in **their own clone** of a template (`warrior_programs.template_id`), never in the coach's original master template directly — copying/appending/overwriting a client's program (system C) always targets this clone.
- **Program ↔ Week**: a "week" is not a row — it's the value of `program_blocks.week_number` for a given `template_id`. There is no table enumerating which weeks exist; the set of weeks for a template is simply `SELECT DISTINCT week_number FROM program_blocks WHERE template_id = ...`.
- **Week ↔ Day**: a "day" is not stored anywhere. It's encoded inside `program_blocks.name` as `"{day} | {block}"` and reconstructed by string-splitting on `' | '` at read/export time (`ProgramExportBuilder.ts:126-132`, `MasterTemplateTransfer.ts:75-81`, and mirrored in the builder UI, `useProgramBuilder.ts`). Multiple `program_blocks` rows can share the same day name — the "day" grouping is purely a client-side re-grouping by that string prefix, not a foreign key.
- **Day ↔ Workout Block**: as above — one-to-many by shared `day_name` string, not by ID.
- **Workout Block ↔ Exercise**: `block_exercises.block_id → program_blocks.id`, `block_exercises.exercise_id → exercise_library.id`. Many-to-many in effect (an exercise can appear in many blocks; a block has many exercises), realized via the `block_exercises` join table which also carries the block-specific prescription (sets/reps/rest/hold/weighted).
- **Workout Block ↔ Exercise Log**: `workout_logs.block_id → program_blocks.id` (nullable FK, no `ON DELETE` behavior specified in the dump — i.e., **deleting a block does not cascade-delete its logs**; this is exactly why `save_program_template` must catch `foreign_key_violation` and refuse to delete such blocks, see §6/§9). `workout_set_logs.workout_log_id → workout_logs.id` (`ON DELETE CASCADE`) and `workout_set_logs.block_exercise_id → block_exercises.id` (`ON DELETE SET NULL` — a set log survives even if the exercise prescription it was logged against is later deleted, but loses the link, hence `get_warrior_progress`'s `LEFT JOIN`).
- **Bodyweight**: `bodyweight_logs.warrior_id → profiles.id` (`ON DELETE CASCADE`), `warrior_program_id` nullable (`ON DELETE SET NULL`) — a bodyweight entry is fundamentally the warrior's, only loosely associated with whichever program they were on at the time.
- **Notes**: exist at three distinct levels with three distinct storage strategies — (1) per-block prescription notes embedded in `program_blocks.notes` alongside the `[CONCEPT:...]` JSON, (2) per-log free-text in `workout_logs.notes` (which doubles as the completion-status sentinel, see §9), (3) per-week coach commentary in `coach_week_notes.note`. These are never merged; a parser must keep them separate.
- **RPE**: lives only on `workout_logs.rpe`, integer 1–10, DB-enforced. Also back-derives the legacy `rating` (1–5) column via `COALESCE(round(p_rpe / 2.0), 5)` in `log_block_with_sets` — i.e. `rating` is a **derived/legacy-compat** field, not an independent input.
- **Completion / Missed Sessions**: no `status` column exists. `workout_logs.notes LIKE '[STATUS:MISSED]%'` is the sole test, applied identically client-side (`WarriorProgramScreen.tsx`) and server-side (`get_warrior_progress` RPC).
- **Goals**: **confirmed absent** — no table, column, or type anywhere in the schema represents a "goal" distinct from a tier/program assignment.
- **Assessments**: **confirmed absent from this domain** — `power_assessments`, `static_hold_attempts`, and the tier-trial (`RITES_OF_PASSAGE`) system are a *separate, unrelated* feature (strength-tier progression), not part of the coaching-program export. The only cross-link is `ConceptMetadata.is_tier_trial`/`tier_trial_tier`, which lets a coach flag a block as *representing* a tier trial — the trial's actual content still comes from `src/lib/trials.ts`, not from the export.
- **Equipment**: **confirmed absent** — no table or field anywhere models equipment.

---

## 5. Enumerations

All are TypeScript string-literal unions (the codebase does not use the `enum` keyword anywhere in this domain).

**`ConceptMetadata.timing_system`** (`src/lib/BlockConceptParser.ts:2`)
`'amrap'` | `'fortime'` | `'straight_set'` | `'tabata'`

**`ConceptMetadata.structure`** (`BlockConceptParser.ts:4`)
`'single'` | `'superset'` | `'circuit'` | `'ladder'`

**`ConceptMetadata.ladder_direction`** (`BlockConceptParser.ts:8`)
`'down'` | `'up'`

**`ConceptMetadata.type`** (legacy, `BlockConceptParser.ts:19`)
`'single'` | `'superset'` | `'circuit'` | `'amrap'` | `'fortime'` — superseded by `timing_system`/`structure` but still read for backward compatibility (`BlockConceptParser.getStructureBadge` falls back to it).

**`ConceptMetadata.focus_tag`** (`BlockConceptParser.ts:16`, duplicated as `ProgramDay.focusTag`)
`'PULL'` | `'PUSH'` | `'LEGS'` | `'FULL_BODY'` | `'CORE'` | `'NONE'`

**Completion status** — `'completed'` | `'missed'` (export/log-history types); UI-only third state `'none'` (`WarriorProgramScreen.tsx` `ProgramBlock.completedStatus`, meaning "not logged at all today"). Not DB-enforced — derived from a string prefix (§9).

**`feel`** (`workout_logs.feel`, DB-enforced via CHECK) — `'hard'` | `'ok'` | `'good'` | `'strong'` | `'beast'` | `null`

**`missed_reason`** (`workout_logs.missed_reason`, DB-enforced via CHECK) — `'no_time'` | `'too_tired'` | `'injury'` | `'other'` | `null`

**`rpe`** — plain integer, DB-enforced range **1–10** inclusive, or `null`. No TS union — just `number | null`.

**`warrior_programs.status`** — client-typed as `'active'` | `'paused'` | `'completed'` (`MyClientsScreen.tsx:40`) but the DB column is plain `text default 'active'` with **no CHECK constraint** — not actually enforced.

**`exercise_library.category`** — client-typed inconsistently: full list `'push'|'pull'|'legs'|'core'|'skill'|'flexibility'|'strength'|'mobility'` (`ExerciseLibraryScreen.tsx:28`) vs. the builder's narrower filter list `['all','push','pull','legs','core','skill']` (`useProgramBuilder.ts:150`). DB column is plain `text`, unconstrained.

**`exercise_library.difficulty`** — `'beginner'` | `'intermediate'` | `'advanced'` (`ExerciseLibraryScreen.tsx:29`), plain `text` column, unconstrained.

**`ClientProgramWriteMode`** (system C only, `ClientProgramWriter.ts:3`) — `'append'` | `'archive'` | `'overwrite'`. Not persisted anywhere; purely selects which of three RPCs to call.

---

## 6. Validation Rules Already Present

**No zod/yup or any schema-validation library is used anywhere in the repo.** Confirmed absent from `package.json` and via source grep.

### 6.1 Import payload validation — `validateWeekImportPayload` (`src/lib/ProgramImportParser.ts:12-36`, verbatim)

```ts
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

This is used, unmodified, for **both** Week import and Master Template import (the Master Template importer explicitly reuses it — `MasterTemplateTransfer.ts:141-142` comment). Checks enforced: payload is a non-null object; `blocks` is a non-empty array; every block has a non-empty string name (`block_name` or `name`); every block has an `exercises` array (may be empty); every exercise has either a non-empty string `exercise_id` or a non-empty string `name`.

**Not validated by this function** (and not validated anywhere else either): `sets`/`reps`/`rest_seconds`/`hold_seconds` ranges or types, `metadata` shape, `coach_notes`/`notes` content, `day_name`, `order_index`, duplicate `exercise_id`s within a block, `week_number` bounds.

### 6.2 Postgres CHECK constraints (the only DB-level validation in this domain)

```sql
alter table "public"."workout_logs" add constraint "workout_logs_feel_check"
  check (feel is null or feel in ('hard', 'ok', 'good', 'strong', 'beast'));
alter table "public"."workout_logs" add constraint "workout_logs_rpe_check"
  check (rpe is null or (rpe between 1 and 10));
alter table "public"."workout_logs" add constraint "workout_logs_missed_reason_check"
  check (missed_reason is null or missed_reason in ('no_time', 'too_tired', 'injury', 'other'));
```
(`supabase/migrations/20260701170000_add_detailed_workout_logging.sql:19-29`)

No min/max constraints exist on `sets`, `reps`, `rest_seconds`, or `hold_seconds` — these are unconstrained integers with only defaults (`sets default 3`, `reps default 10`, `rest_seconds default 60`; `hold_seconds` has no default, nullable).

### 6.3 Client-side ad hoc guards (`useProgramBuilder.ts`, builder save flow, not import/export specific)

Template name is required before save; every non-empty week must have every day contain at least one block; at least one valid week must exist. These are inline `if`/error-message checks, not a reusable schema.

### 6.4 Exercise-resolution fallback (import-time, `resolveImportedExercises`, `ProgramImportParser.ts:42-99`)

For every exercise referenced in an import file: (1) if `exercise_id` is present and still exists in `exercise_library`, reuse it; (2) else, case-insensitive exact match on `name` against existing `exercise_library` rows; (3) else, auto-create a new `exercise_library` row owned by the importing coach with `difficulty: 'beginner'`, `category: ''` (chosen specifically so `ExerciseLibraryScreen`'s `ex.difficulty.toUpperCase()` doesn't crash on `null`).

### 6.5 Server-side write-time guard (`save_program_template` RPC, `20260704130400_fix_save_program_template_exercise_wipe.sql`)

A block cannot be deleted if `workout_logs.block_id` still references it — the delete is attempted inside a `BEGIN...EXCEPTION WHEN foreign_key_violation` guard; on violation, the block (and its exercises) are left intact and its id is returned in `undeletable_block_ids` in the RPC's response, rather than the save silently failing or losing data.

---

## 7. Export Rules

### (A) Week export — `fetchWeekExportPayload` (`src/lib/ProgramExportBuilder.ts:91-181`)

1. Query `program_blocks` where `template_id = params.templateId AND week_number = params.weekNumber`, selecting `id, name, notes, order_index`, ordered by `order_index ascending`.
2. Collect the resulting block ids; if any, query `block_exercises` where `block_id IN (...)`, selecting `id, block_id, exercise_id, sets, reps, rest_seconds, hold_seconds, is_weighted, order_index` plus the joined `exercise_library(name)`, ordered by `order_index ascending`. Group results into a `Record<block_id, exercise[]>` map.
3. Build a `Map<block_id, log>` from `params.logs` (an `ExportSourceLog[]` the **caller** supplies — this function does not itself query `workout_logs`; the caller, `ProgressTrackingScreen.handleExportWeek`, already has this data loaded from the `get_warrior_progress` RPC and passes the subset relevant to `visibleLogs` for the selected week).
4. For each block: parse `notes` via `BlockConceptParser.parse()` → `{ metadata, cleanNotes }`. Split `name` on the literal `' | '`: if present, `parts[0]` → `day_name`, `parts.slice(1).join(' | ')` → `block_name`; if absent, the whole `name` becomes `day_name` and `block_name` defaults to `'WORKOUT ROUTINE'`. Attach the matching exercises (stringifying `sets`/`reps`/`rest_seconds`/`hold_seconds`, coercing `is_weighted` to boolean) and the matching log entry (or `null`).
5. Assemble the top-level payload: `exported_at = new Date().toISOString()`, `warrior`/`program` from caller-supplied params, `coach_week_note` and `bodyweight_trend` passed through as-is from the caller.
6. Caller (`ProgressTrackingScreen.handleExportWeek`, lines 341-372) supplies `logs` as `visibleLogs.map(...)` — i.e. only the logs already loaded/filtered for the currently-selected week in the UI — and `bodyweightTrend` from the same `get_warrior_progress` response (this is **not** re-filtered to the week; it's the general 12-entry trend).

### (B) Master Template export — `fetchMasterTemplateExportPayload` (`src/lib/MasterTemplateTransfer.ts:38-109`)

Same two-query shape as (A) (`program_blocks` → `block_exercises` joined to `exercise_library`), except: no `week_number` filter on the first query — pulls every block for the `template_id`; ordered by `week_number ascending, order_index ascending`; the `block_exercises` select omits `is_weighted`; no log-merging step at all (this format has no per-log data); each output block carries its own `week_number` (`block.week_number || 1`).

### Ordering guarantee (both formats)

Block order within the output array follows the SQL `ORDER BY` clauses above — `order_index` within a week (A), or `week_number` then `order_index` (B). There is no separate "day order" — since day membership is a derived string prefix, two blocks on the same synthesized day are ordered purely by their own `order_index`, and different days are effectively interleaved in whatever order their blocks' `order_index`/`week_number` happen to sort to (a parser reconstructing a Day→Block tree must group by `day_name` after receiving the flat, already-ordered `blocks[]` array — the file does not guarantee all of one day's blocks are contiguous).

### Write path — `shareWeekExportPayload` / `shareMasterTemplateExportPayload` (`ProgramExportBuilder.ts:185-209`, `MasterTemplateTransfer.ts:112-139`, identical logic)

1. `JSON.stringify(payload, null, 2)` (pretty-printed, 2-space indent).
2. Filename: `fileNameHint` (e.g. `"{warrior_display_name}_week{n}"` for A, template name for B), sanitized via `.replace(/[^a-z0-9]+/gi, '_').toLowerCase()`, falling back to `'week_export'` / `'master_template'` if the sanitized result is empty. Extension `.json` appended.
3. **Web**: build a `Blob`, create an object URL, synthesize an `<a download>` click, then revoke the URL — triggers a browser file download.
4. **Native**: write the JSON to `FileSystem.documentDirectory + filename` via `expo-file-system/legacy`, then invoke `expo-sharing`'s share sheet (`dialogTitle: 'Export Week'` or `'Export Master Template'`) if available on-device.

---

## 8. Import Rules

### (A) Week import — `ProgressTrackingScreen.handleImportWeek` (`src/screens/coaching/ProgressTrackingScreen.tsx:379-426`)

1. User picks a file via `expo-document-picker` (`type: 'application/json'`); cancel exits silently.
2. Read the file as text (web: `fetch(uri).then(r => r.text())`; native: `expo-file-system` `readAsStringAsync`, `utf8`).
3. `JSON.parse` — on failure, alert `"That file is not valid JSON."` and stop. **Nothing else is attempted on parse failure.**
4. `validateWeekImportPayload(parsed)` (§6.1) — on failure, alert the specific validation error and stop.
5. `resolveImportedExercises(parsed.blocks, coachId)` (§6.4) — resolves/creates every referenced exercise, returns a `Map<"id:{uuid}" | "name:{lowercased}", exercise_library.id>`.
6. `buildImportBlocksPayload(parsed, resolved)` (`ProgramImportParser.ts:105-136`) — for each block: recompute `notes` as `BlockConceptParser.stringify(metadata, coach_notes)` if `metadata` is present, else fall back to `coach_notes || notes || ''`; recompute `name` as `"{day_name} | {block_name}"` if both present, else `name || block_name || "IMPORTED BLOCK {n}"`; **force `week_number: 1`** for every block regardless of what the file said (a file is always treated as exactly one week's worth of content relative to the target); map each exercise to `{ exercise_id: resolved lookup, sets/reps/rest_seconds/hold_seconds: parseInt(...) || null, is_weighted: boolean, notes }`, then **drop any exercise whose `exercise_id` failed to resolve** (`.filter(ex => !!ex.exercise_id)`).
7. Call RPC `append_weeks_to_client_program(p_warrior_program_id, p_blocks)`. This RPC (§8.3) computes `week_offset = MAX(existing week_number for this template)`, then inserts every incoming block at `week_offset + block.week_number` (i.e. `week_offset + 1` for everything, since step 6 forced `week_number: 1`) — **the import is always additive, appended as a brand-new week after whatever weeks already exist. It never overwrites or archives.**
8. On success, alert `"Added {blockCount} block(s) as a new week."` and reload the history view.

**Mandatory fields for a valid import file**: `blocks` (non-empty array); each block needs a resolvable name (`block_name`/`name`) and an `exercises` array (may be empty); each exercise needs `exercise_id` or `name`. Everything else (`metadata`, `coach_notes`, `order_index`, `day_name`, prescribed `sets`/`reps`/etc., `log`, `coach_week_note`, `bodyweight_trend`, `warrior`, `program`) is optional/ignored on import — **the importer only reads `data.blocks[].{block_name|name, day_name, order_index, metadata, coach_notes|notes, exercises[]}`. Nothing about `log`, `warrior`, `coach_week_note`, or `bodyweight_trend` is ever re-imported — those are export-only, read-side fields.**

**IDs — preserved vs. regenerated**: `exercise_id` is *preserved* if it still resolves to a live `exercise_library` row (reused as-is); otherwise a *new* `exercise_library.id` is generated. `block_id` is **never** preserved from the file — every imported block becomes a brand-new `program_blocks` row with a fresh server-generated UUID (the RPC's `INSERT ... RETURNING id`, `_insert_client_program_blocks`, `20260702141000_add_client_program_write_functions.sql:33-41`). There is no concept of "the same block, updated" via import — re-importing the same file twice creates two separate new weeks with two separate sets of block ids.

### (B) Master Template import (`ProgramBuilderScreen.tsx` → `useProgramBuilder.ts:handleImportMasterTemplate`, `MasterTemplateTransfer.ts:buildMasterTemplateBlocksPayload`)

Same file-pick → parse → `validateWeekImportPayload` → `resolveImportedExercises` pipeline as (A). Differs at the payload-build step: `buildMasterTemplateBlocksPayload` (`MasterTemplateTransfer.ts:147-178`) **preserves `week_number` from the file as-is** (`block.week_number || 1`) rather than forcing `1` — because this import creates a **brand new, standalone template from scratch** spanning however many weeks the file declares, not an addition to an existing assignment. Also sets `db_id: null` explicitly on every block (always an insert, never an update). Result is passed to RPC `save_program_template(p_template_id: null, p_name, p_description, p_blocks)` (§6.5/§8.3), which — because `p_template_id` is `null` — takes the `INSERT INTO program_templates` branch and creates a new template owned by `auth.uid()`.

### RPC contracts referenced above (verbatim)

`append_weeks_to_client_program` / `overwrite_client_program` / `archive_and_append_client_program` all accept the same `p_blocks` jsonb shape (documented in the migration header, `20260702141000_add_client_program_write_functions.sql:9-12`):
```
[{ "name": text, "notes": text, "order_index": int, "week_number": int (1-based within this source),
   "exercises": [{ "exercise_id": uuid, "sets": int, "reps": int, "rest_seconds": int,
                    "hold_seconds": int|null, "is_weighted": bool, "notes": text }] }]
```
All three are `SECURITY DEFINER`, and all three check `auth.uid() = warrior_programs.coach_id OR profiles.is_admin` before touching anything — `append_weeks_to_client_program` is purely additive (offsets by current max week); `overwrite_client_program` deletes `workout_logs`, `coach_week_notes`, `block_exercises`, `program_blocks`, and `program_week_archive` for the template before re-inserting at week 1 (destructive); `archive_and_append_client_program` inserts every current `(template_id, week_number)` into `program_week_archive` (hiding them from the warrior's active view only — nothing is deleted) then appends new weeks after the current max, same offset logic as append.

`save_program_template(p_template_id, p_name, p_description, p_blocks)` — upserts `program_templates`; if `p_template_id` is non-null, only pre-wipes `block_exercises` for blocks whose `db_id` reappears in the payload, then attempts to delete any previously-existing block *not* in the payload inside a `foreign_key_violation`-guarded sub-transaction (returning undeletable ones in `undeletable_block_ids` rather than losing data); then for every incoming block, updates (if `db_id` present) or inserts (if not) `program_blocks`, and inserts its `block_exercises` fresh.

---

## 9. Edge Cases

- **Block never logged this week** → `WeekExportBlock.log` is `null`. The prescribed `exercises[]` is still included, so a consumer can distinguish "assigned but skipped entirely" from "not assigned this week at all."
- **Null RPE / feel / missed_reason / missed_detail / session_seconds** → all independently nullable; a `status: 'missed'` log can have `missed_reason: null` (the warrior toggled "missed" via the simple checkbox path — `toggle_block_status` RPC — rather than the detailed logging modal, which is the only path that collects `missed_reason`).
- **`notes` field doubling as a status sentinel** — when a block is toggled "missed" via `toggle_block_status` or `log_block_with_sets` with no free-text note, `workout_logs.notes` is set to the **literal string `'[STATUS:MISSED]'`**, which then appears verbatim as `log.notes` in the export. A parser must not treat this string as meaningful warrior-authored content — check `log.status === 'missed'` instead (which is itself derived from this exact prefix — see below).
- **Deleted exercise referenced on import** — if an imported `exercise_id` no longer exists in `exercise_library`, `resolveImportedExercises` falls back to a case-insensitive name match, and if that also fails, silently creates a new `exercise_library` row (`difficulty: 'beginner'`, `category: ''`). An exercise with neither a resolvable id nor a usable name is **dropped from the block** entirely (`buildImportBlocksPayload`'s `.filter(ex => !!ex.exercise_id)`) — it does not raise an error, it just vanishes from the imported block's exercise list.
- **Empty `exercises` array on a block** — explicitly allowed by `validateWeekImportPayload` (only checks `Array.isArray`, not non-empty). Produces a block with a name/metadata but zero exercises.
- **Empty `blocks` array on the whole file** — explicitly **rejected**: `validateWeekImportPayload` requires `data.blocks.length > 0`.
- **Block name without the `' | '` separator** — the whole `name` string becomes `day_name`, and `block_name` defaults to the literal `'WORKOUT ROUTINE'` (both on export, `ProgramExportBuilder.ts:126-132`/`MasterTemplateTransfer.ts:75-81`, and mirrored on import when reconstructing `name` from `day_name`+`block_name`).
- **Partially completed workouts** — there is no partial-completion state in `workout_logs` itself; a block is either fully "completed" (a `workout_logs` row with no missed prefix) or "missed." Partial completion is only visible one level down, in `workout_set_logs` — e.g. 2 of 4 prescribed sets logged — which the export's `log.sets[]` array will simply show as having fewer entries than `exercises[].sets` prescribes. A parser must compare `sets.length` against the prescribed `sets` count itself to detect partial completion; there's no explicit flag for it.
- **Multiple notes** — never merged. Block-level coach notes (`program_blocks.notes` → `coach_notes`), warrior's session notes (`workout_logs.notes` → `log.notes`), and the weekly coach note (`coach_week_notes.note` → `coach_week_note`) are three separate fields at three separate nesting levels.
- **Duplicate logs / duplicate set logs** — **not prevented at the database level.** `workout_set_logs` has no unique constraint on `(workout_log_id, set_index)` — nothing stops two rows with the same `set_index` for the same log (the app's own write path, `log_block_with_sets`, always deletes-then-reinserts the parent `workout_logs` row first, which cascades to delete old `workout_set_logs` via `ON DELETE CASCADE`, so in normal app usage duplicates don't accumulate — but a hand-crafted import or a race outside that path could produce them). At the `workout_logs` level, `toggle_block_status`/`log_block_with_sets` both delete any existing row for `(warrior_id, block_id, completed_at >= start_of_today)` before inserting, so **the app enforces at most one log per block per calendar day** procedurally, not via a DB constraint.
- **Missing bodyweight** — `bodyweight_trend` is always an array, defaulting to `[]` (via `COALESCE(..., '[]'::jsonb)` in `get_warrior_progress`), never `null`, even when the warrior has no `bodyweight_logs` rows at all.
- **Undeletable blocks on template save** — if a coach removes a block from the builder UI and saves, but that block still has `workout_logs` pointing at it (FK), `save_program_template` catches the `foreign_key_violation`, leaves the block and its exercises in place, and returns its id in `undeletable_block_ids` — the save otherwise succeeds for every other block. This is invisible to the export functions (they'd simply still see that block next time), so a coach may find a block reappearing after they thought they deleted it.
- **Archived weeks still export** — `program_week_archive` only filters the warrior's own `WarriorProgramScreen` week list. `ProgressTrackingScreen` (the export UI) and both export builders deliberately ignore this table (explicit comment, `20260702140000_add_program_week_archive.sql:8-9`) — an archived week's blocks, logs, and notes remain fully exportable by the coach.
- **`is_weighted` present only in system A** — a Master Template export/import round-trip silently drops any `is_weighted` flag the exercises had (the type doesn't carry it, §3.4), even though the underlying `block_exercises.is_weighted` column exists and is used by system A/C.

---

## 10. Sample Export

### 10.1 Annotated `WeekExportPayload` sample

```jsonc
{
  // Generation timestamp — set at export time via new Date().toISOString().
  "exported_at": "2026-07-06T14:32:10.512Z",

  "warrior": {
    "id": "3f2c1a90-6b1d-4e2a-9c31-8a7d5e001122",   // profiles.id
    "display_name": "Marcus",                        // profiles.display_name
    "strength_tier": 6                                // profiles.strength_tier at export time
  },

  "program": {
    "template_name": "Spartan Push Block",  // program_templates.name
    "week_number": 3                        // program_blocks.week_number this export is scoped to
  },

  // Free-text coach commentary for the week as a whole. One row per (warrior_program, week) in coach_week_notes.
  "coach_week_note": "Great progress on dips this week — push tempo next cycle.",

  // General bodyweight trend (last 12 entries), NOT filtered to this week specifically.
  "bodyweight_trend": [
    { "logged_at": "2026-07-01T08:00:00.000Z", "weight_kg": 78.5 },
    { "logged_at": "2026-06-24T08:00:00.000Z", "weight_kg": 79.0 }
  ],

  "blocks": [
    {
      "block_id": "9a1e2b30-0000-0000-0000-000000000001",  // program_blocks.id
      "day_name": "Monday",                                  // left half of "Monday | Push Superset"
      "block_name": "Push Superset",                         // right half
      "order_index": 0,                                      // sort position among Monday's blocks
      "metadata": {                                           // parsed out of the "[CONCEPT:{...}]" prefix in program_blocks.notes
        "timing_system": "straight_set",
        "structure": "superset",
        "rounds": 3,
        "focus_tag": "PUSH"
      },
      "coach_notes": "Full range of motion on dips.",         // the human text AFTER the [CONCEPT:...] prefix
      "exercises": [
        {
          "exercise_id": "c4120000-0000-0000-0000-000000000001",
          "name": "Dip",
          "sets": "4",              // STRING even though block_exercises.sets is an integer column
          "reps": "8",
          "rest_seconds": "60",
          "hold_seconds": "",        // empty string, not "null" or null, when the DB column is null
          "is_weighted": true
        },
        {
          "exercise_id": "c4120000-0000-0000-0000-000000000002",
          "name": "Pike Push-Up",
          "sets": "3",
          "reps": "10",
          "rest_seconds": "45",
          "hold_seconds": "",
          "is_weighted": false
        }
      ],
      // The warrior's actual result for THIS block, or null if never logged. Present here since Marcus did it.
      "log": {
        "status": "completed",       // derived from workout_logs.notes NOT starting with "[STATUS:MISSED]"
        "feel": "good",              // workout_logs.feel — CHECK-constrained to hard/ok/good/strong/beast
        "rpe": 7,                    // workout_logs.rpe — CHECK-constrained 1-10
        "missed_reason": null,       // only meaningful when status === "missed"
        "missed_detail": null,
        "session_seconds": 1380,     // 23 minutes
        "notes": "Felt strong, added 5kg to dips.",
        "sets": [                    // per-set breakdown, from workout_set_logs — NUMERIC here, unlike the prescribed side
          { "set_index": 0, "reps_completed": 8, "weight_used": 20, "hold_seconds": null, "exercise_name": "Dip" },
          { "set_index": 1, "reps_completed": 8, "weight_used": 20, "hold_seconds": null, "exercise_name": "Dip" },
          { "set_index": 2, "reps_completed": 7, "weight_used": 20, "hold_seconds": null, "exercise_name": "Dip" },
          { "set_index": 3, "reps_completed": 10, "weight_used": 0, "hold_seconds": null, "exercise_name": "Pike Push-Up" }
        ]
      }
    },
    {
      "block_id": "9a1e2b30-0000-0000-0000-000000000002",
      "day_name": "Wednesday",
      "block_name": "Core Circuit",
      "order_index": 0,
      "metadata": { "timing_system": "amrap", "time_cap_min": 10 },
      "coach_notes": "",
      "exercises": [
        {
          "exercise_id": "c4120000-0000-0000-0000-000000000003",
          "name": "Hollow Hold",
          "sets": "1",
          "reps": "0",
          "rest_seconds": "0",
          "hold_seconds": "30",
          "is_weighted": false
        }
      ],
      // Marcus skipped this one entirely this week — never logged, so log is null.
      // Note the prescribed exercises above are still included.
      "log": null
    },
    {
      "block_id": "9a1e2b30-0000-0000-0000-000000000003",
      "day_name": "Friday",
      "block_name": "Pull Ladder",
      "order_index": 0,
      "metadata": { "structure": "ladder", "ladder_start": 10, "ladder_sub": 2, "ladder_direction": "down", "rounds": 5 },
      "coach_notes": "",
      "exercises": [
        {
          "exercise_id": "c4120000-0000-0000-0000-000000000004",
          "name": "Pull-Up",
          "sets": "5",
          "reps": "10,8,6,4,2",
          "rest_seconds": "90",
          "hold_seconds": "",
          "is_weighted": false
        }
      ],
      // Marcus marked this one missed via the simple checkbox toggle — no detailed log modal was used,
      // so feel/rpe/missed_reason/missed_detail/session_seconds/sets are all null/empty, and notes is
      // the literal DB sentinel string — NOT a warrior-authored note.
      "log": {
        "status": "missed",
        "feel": null,
        "rpe": null,
        "missed_reason": null,
        "missed_detail": null,
        "session_seconds": null,
        "notes": "[STATUS:MISSED]",
        "sets": []
      }
    }
  ]
}
```

### 10.2 Annotated `MasterTemplateExportPayload` sample

```jsonc
{
  "exported_at": "2026-07-06T14:40:00.000Z",
  "template_name": "12-Week Strength Base",     // program_templates.name
  "description": "Foundational block for tiers 3-5",

  "blocks": [
    {
      "day_name": "Monday",
      "block_name": "Push Superset",
      "week_number": 1,                          // present on EVERY block, since this format spans all weeks at once
      "order_index": 0,
      "metadata": { "structure": "superset", "rounds": 3 },
      "coach_notes": "",
      // No "is_weighted" field on these exercises — Master Template exercises omit it (unlike system A).
      "exercises": [
        { "exercise_id": "c4120000-0000-0000-0000-000000000001", "name": "Dip", "sets": "4", "reps": "8", "rest_seconds": "60", "hold_seconds": "" }
      ]
      // No "log" key at all anywhere in this format — Master Templates never carry logged results.
    },
    {
      "day_name": "Monday",
      "block_name": "Push Superset",
      "week_number": 2,                          // same day/block name, next week — a distinct program_blocks row
      "order_index": 0,
      "metadata": { "structure": "superset", "rounds": 4 },
      "coach_notes": "Add a 4th round this week.",
      "exercises": [
        { "exercise_id": "c4120000-0000-0000-0000-000000000001", "name": "Dip", "sets": "4", "reps": "10", "rest_seconds": "60", "hold_seconds": "" }
      ]
    }
  ]
}
```

---

## 11. Type-Duplication Note

There is **no single canonical `Program`/`Week`/`Day`/`Block`/`Exercise` TypeScript type** reused across the app. The same conceptual shapes are independently declared, with slightly different fields, in at least four places:
- Builder-canonical: `SelectedExercise`/`ProgramBlock`/`ProgramDay`, `src/hooks/coaching/useProgramBuilder.ts:44-78`
- Warrior-view: `ExerciseDetail`/`ProgramBlock`/`ProgramDay`, `src/screens/coaching/WarriorProgramScreen.tsx:52-77`
- Copy-modal-local: a third, separately-declared `SelectedExercise`/`ProgramBlock`/`ProgramDay`, `src/components/coaching/CopyBlockModal.tsx:16-45`
- `WarriorExerciseRow.tsx:7-16` declares its own second copy of `ExerciseDetail`

The one genuinely shared, single-source type is `ConceptMetadata` (`src/lib/BlockConceptParser.ts:1-22`). A parser/consumer built from this spec should treat the **export payload shapes in §3** (which come from the single source files `ProgramExportBuilder.ts`/`MasterTemplateTransfer.ts`) as authoritative for the wire format — not any of the in-app UI-state types, which diverge from each other and from the export shape in minor ways (e.g. string vs. number typing of `sets`/`reps` differs by file).

---

## 12. Related but Out of Scope — System (C): Client-Program Transfer

`src/lib/ClientProgramWriter.ts` copies a master template's blocks onto an **existing** client assignment. It builds an in-memory `BlockPayload[]` — never written to a file or shared:

```ts
export type ClientProgramWriteMode = 'append' | 'archive' | 'overwrite';

interface BlockPayloadExercise {
  exercise_id: string;
  sets: number | null;
  reps: number | null;
  rest_seconds: number | null;
  hold_seconds: number | null;
  is_weighted: boolean;
  notes: string;
}

interface BlockPayload {
  name: string;
  notes: string;
  order_index: number;
  week_number: number;
  exercises: BlockPayloadExercise[];
}
```

`fetchTemplateBlocksPayload(templateId)` queries `program_blocks`/`block_exercises` (all weeks, no log merge, no `BlockConceptParser` parsing — `notes` stays raw, including any `[CONCEPT:...]` prefix) and returns this shape directly. `applyTemplateToExistingClient(mode, warriorProgramId, sourceTemplateId)` then calls one of the three RPCs from §8.3 (`append_weeks_to_client_program` / `archive_and_append_client_program` / `overwrite_client_program`) based on `mode`. This is purely an in-app coach action (from `MyClientsScreen.tsx`) — there is no export button, no JSON file, and no import validation step, because nothing ever leaves the app's own database.
