# Workout Content — JSON Import Format

This is the file format the admin web panel's **Workout content** page
(`/coaching/workouts` → **Import JSON**) accepts. It creates exactly **one**
Workout or Quick Workout per file, always as a `draft` — review it and flip
its status to `published` when it's ready to appear in the app.

If you're an AI tool generating this file: produce **one JSON object** (not
an array) matching the shape below, output only the JSON (no surrounding
prose or markdown fences), and use real, specific exercise names — they get
matched against the existing exercise library by name, or created new if no
match exists (see "Exercise resolution" below).

Source of truth for this format is the code, not this document:
- Validation: `validateStandaloneWorkoutImport` in `admin-web/src/api/workoutLibrary.ts`
- Import + exercise resolution: `importStandaloneWorkoutFromJson` in the same file
- Write: `save_standalone_workout` (Postgres RPC)

## Top-level shape

```json
{
  "kind": "workout",
  "title": "Push Power Circuit",
  "description": "Advanced single-arm and archer push-up work for athletes who've outgrown standard push-ups.",
  "category": "PUSH",
  "difficulty": "advanced",
  "is_free": false,
  "exercises": [ /* see below */ ]
}
```

| Field | Required | Notes |
|---|---|---|
| `kind` | **yes** | `"workout"` or `"quick_workout"` — anything else is rejected. |
| `title` | **yes** | Non-empty string. |
| `description` | no | Shown on the detail card. Omit or `null` for none. |
| `category` | no | Free text, but the app's own filters expect one of `PULL`, `PUSH`, `LEGS`, `CORE`, `FULL_BODY`. |
| `difficulty` | no | `beginner`, `intermediate`, or `advanced`. |
| `is_free` | no | `true`/`false`, defaults to `false` (Pro-locked) if omitted. |
| `exercises` | **yes** | Non-empty array — see below. Import is rejected if empty or missing. |

### `quick_workout`-only fields

Only meaningful (and only saved) when `"kind": "quick_workout"` — ignored
otherwise:

```json
{
  "kind": "quick_workout",
  "title": "20 Min Push AMRAP",
  "category": "PUSH",
  "difficulty": "intermediate",
  "format": "amrap",
  "duration_minutes": 20,
  "is_free": true,
  "exercises": [ /* ... */ ]
}
```

| Field | Notes |
|---|---|
| `format` | One of `amrap`, `emom`, `fortime`, `tabata`. |
| `duration_minutes` | The time cap, as a plain number. |

## `exercises[]`

```json
{
  "exercise_id": "uuid-or-omit",
  "name": "Archer Push Ups",
  "sets": 4,
  "reps": 6,
  "rest_seconds": 90,
  "hold_seconds": null,
  "work_seconds": null,
  "is_weighted": false,
  "notes": null
}
```

- **`exercise_id`** — omit this for anything generated from scratch. It only
  matters if you're deliberately re-pointing at one specific existing
  exercise_library row and its name might not match exactly.
- **`name`** — this is what you'll use almost always. Matched against the
  exercise library **case-insensitively**; see resolution rules below.
- **`sets` / `reps`** — plain numbers, for rep-based exercises (most
  `workout`-kind content).
- **`hold_seconds`** — for isometric holds instead of reps (e.g. planks,
  L-sits). Leave `null`/omit for rep-based exercises.
- **`work_seconds`** — for timed-work prescriptions in `quick_workout`
  content (AMRAP/EMOM/Tabata-style — "30 seconds of work" instead of a rep
  count). Leave `null`/omit for rep-based exercises.
- **`rest_seconds`** — rest after this exercise, if relevant.
- **`is_weighted`** — `true` if this is a weighted variation. Defaults to
  `false`.
- **`notes`** — free text, optional.

At least one of `exercise_id` / `name` must be present per exercise, or the
whole import is rejected before anything is written — same rule as the
Program-template import format.

## Exercise resolution

Every exercise is resolved to a real `exercise_library` row, in this order
(identical logic to the Program-template importer — see
`docs/features/warrior-program-week-export-import-format.md`):

1. If `exercise_id` is present **and still exists**, it's reused as-is.
2. Otherwise, `name` is matched against `exercise_library` with an exact,
   case-insensitive comparison.
3. If nothing matches, a **new** `exercise_library` entry is created
   automatically (`difficulty: "beginner"`, no category) — this is how you
   can invent a brand-new exercise name with no `exercise_id` at all.

So: to reuse an existing exercise, just use its exact name. Misspell it and
you'll get a brand-new near-duplicate entry instead of a match — check the
exercise library first if you want to guarantee a hit on an existing row.

## What happens on import

1. The file is validated (shape only) and rejected with a specific error if
   anything required is missing — nothing is written until it passes.
2. Every exercise is resolved to a real `exercise_id` per the rules above.
3. One `standalone_workouts` row is created with `status: "draft"` — it
   never appears in the app's public Workout Library until an admin
   explicitly publishes it.
4. Re-importing the same file again creates a **second, separate** workout —
   this format has no "update existing" concept. Edit the workout directly
   in the admin panel instead if you're correcting one already imported.

## Minimal valid import example

```json
{
  "kind": "workout",
  "title": "Pull Day Foundations",
  "category": "PULL",
  "difficulty": "beginner",
  "is_free": true,
  "exercises": [
    { "name": "Ring Rows", "sets": 3, "reps": 12, "rest_seconds": 60 },
    { "name": "Dead Hang", "hold_seconds": 20, "rest_seconds": 60 },
    { "name": "Banded Pulldowns", "sets": 3, "reps": 10, "rest_seconds": 60 }
  ]
}
```
