# Warrior Program — Week Export/Import JSON Format

This is the file format used by the coach-side **EXPORT WEEK** / **IMPORT WEEK**
buttons (PROGRESS tab → a warrior's history modal). A coach exports one week
of a client's program + logged results as JSON, can hand it to an external AI
tool (or edit it by hand) to propose changes, and re-imports it — the edited
version is always added as a **new week** onto the client's program. Nothing
is ever overwritten or deleted by an import.

Source of truth for this format is the code, not this document:
- Export: `src/lib/ProgramExportBuilder.ts`
- Import validation + write-back: `src/lib/ProgramImportParser.ts`

## Top-level shape

```json
{
  "exported_at": "2026-07-02T00:00:00.000Z",
  "warrior": {
    "id": "uuid",
    "display_name": "Test Warrior",
    "strength_tier": 6
  },
  "program": {
    "template_name": "B-2",
    "week_number": 2
  },
  "coach_week_note": "Free text — the coach's note for this specific week.",
  "bodyweight_trend": [
    { "logged_at": "2026-06-29T08:00:00.000Z", "weight_kg": 78.5 }
  ],
  "blocks": [ /* see below */ ]
}
```

Only `blocks` is required for a re-import to succeed. Everything else
(`warrior`, `program`, `coach_week_note`, `bodyweight_trend`) is context for
whoever/whatever is editing the file — it's read but not written back
anywhere on import.

## `blocks[]`

One entry per workout block (e.g. one day's "Warm-Up", "Strength", etc.).

```json
{
  "block_id": "uuid",
  "day_name": "PULL DAY 1",
  "block_name": "Strength - 1",
  "order_index": 2,
  "metadata": {
    "timing_system": "straight_set",
    "structure": "single"
  },
  "coach_notes": "Free text the coach attached to this block.",
  "exercises": [ /* see below */ ],
  "log": {
    "status": "completed",
    "feel": "strong",
    "rpe": 8,
    "missed_reason": null,
    "missed_detail": null,
    "session_seconds": 620,
    "notes": "",
    "sets": [
      { "set_index": 1, "reps_completed": 10, "weight_used": null, "hold_seconds": null, "exercise_name": "Banded Arm Circles" }
    ]
  }
}
```

- `block_id` is only present so the export is traceable back to the original
  block — **it is not used on import**. A re-imported block is always
  inserted as a brand-new `program_blocks` row.
- `day_name` + `block_name` are combined back into the single `"DAY | BLOCK"`
  name format the app stores internally (e.g. `"PULL DAY 1 | Strength - 1"`).
  If those two fields are missing, a plain `"name"` field is used instead as
  a fallback.
- `metadata` is the parsed `[CONCEPT:{...}]` tag (timing system, structure,
  AMRAP/FOR TIME caps, ladder settings, etc. — see `BlockConceptParser.ts`).
  Preserve this as-is unless you're deliberately changing how the block is
  timed/structured.
- `log` is **read-only historical context** — what the warrior actually did
  last time this block ran. It is never re-imported; only `exercises[]`
  drives what gets written. A block that was never logged has `"log": null`.

## `exercises[]` (inside a block)

```json
{
  "exercise_id": "uuid-or-null",
  "name": "Banded Lat pull down",
  "sets": "4",
  "reps": "15",
  "rest_seconds": "60",
  "hold_seconds": "",
  "is_weighted": false
}
```

Each exercise is resolved to a real `exercise_library` row on import, in this
order:
1. If `exercise_id` is present **and still exists**, it's reused as-is.
2. Otherwise, `name` is matched against `exercise_library` with an exact,
   case-insensitive comparison.
3. If nothing matches, a **new** `exercise_library` entry is created
   automatically (owned by the importing coach) — this is how an AI tool can
   propose a brand-new exercise it invents a name for, with no `exercise_id`
   at all.

So: to keep using an existing exercise, keep its `exercise_id`. To swap in a
different existing exercise, clear `exercise_id` and set `name` to the exact
exercise name. To add something new, omit `exercise_id` and give it any
`name` that isn't already in the library.

At least one of `exercise_id` / `name` must be present per exercise, or the
whole import is rejected before anything is written.

`sets` / `reps` / `rest_seconds` / `hold_seconds` are all parsed as integers
(empty string / omitted → `null`, not zero). `is_weighted` defaults to
`false` if omitted.

## What happens on import

1. The file is validated (shape only — see `validateWeekImportPayload`) and
   rejected with a specific error if anything required is missing, before
   any database write happens.
2. Every exercise across every block is resolved to a real `exercise_id`
   (existing, matched-by-name, or newly created).
3. The whole `blocks[]` array is inserted as **one new week**, appended after
   whatever the client's current highest week number is — via
   `append_weeks_to_client_program`. Existing weeks, their logs, and their
   coach notes are never touched.
4. The master template the coach originally authored is never touched either
   — writes only ever land in the client's own program clone.

## Minimal valid import example

```json
{
  "blocks": [
    {
      "day_name": "PULL DAY 1",
      "block_name": "Strength - 1",
      "order_index": 0,
      "metadata": { "timing_system": "straight_set", "structure": "single" },
      "coach_notes": "",
      "exercises": [
        { "exercise_id": "5b677e6b-73eb-44e8-98f5-e0dd3a581604", "name": "Banded Lat pull down", "sets": "4", "reps": "15", "rest_seconds": "60" },
        { "name": "Ring Muscle-Up Negatives", "sets": "3", "reps": "5", "rest_seconds": "90" }
      ]
    }
  ]
}
```
