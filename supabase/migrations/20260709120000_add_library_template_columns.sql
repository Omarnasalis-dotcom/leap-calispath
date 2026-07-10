-- Adds Workout Templates Library support to program_templates.
-- Purely additive: every new column is nullable or defaulted, so existing
-- coach-authored templates and all current queries are unaffected.

alter table "public"."program_templates"
  add column "status" text default 'draft'
    check ("status" in ('draft', 'published', 'archived')),
  add column "is_library_template" boolean not null default false,
  add column "matching_criteria" jsonb,
  add column "equipment_tags" jsonb not null default '[]'::jsonb,
  add column "published_at" timestamptz;
