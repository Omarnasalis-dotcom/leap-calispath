-- Tracks which published library template a self-service clone came from,
-- so switching back to a template a warrior has already selected before can
-- reactivate their previous clone (and its logged history) instead of
-- silently cloning a fresh, empty copy every time.
alter table "public"."program_templates"
  add column "source_library_template_id" uuid references "public"."program_templates"("id") on delete set null;
