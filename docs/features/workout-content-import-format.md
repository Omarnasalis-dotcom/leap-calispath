# Workout Content — Instruction Prompt & JSON Import Format

Use this prompt whenever you want a **single-session workout, built from
ordered blocks/phases** (Warm-Up → Skills → Strength → Cool-Down, same idea
as a real program day — no weeks, no CONCEPT metadata) imported directly
onto the **Workout Content** library page (admin web →
`/coaching/workouts` → **Import JSON**). It creates exactly **one** Workout
or Quick Workout per file, always as a `draft` — review it and flip its
status to `published` when it's ready to appear in the app.

A Workout represents one full training day, so it's built the same way any
other training day in this app is: multiple blocks, each with its own
exercise list. A Quick Workout is effectively flat — AMRAP/EMOM/Tabata
content is one continuous circuit, not phased — so it's usually just one
block.

Companion doc: [single-day-template-import-format.md](./single-day-template-import-format.md)
covers the **other** format — a full-phase single day imported as a Master
Template instead. See "Which format do I want?" below if you're not sure
which one applies — the block structure itself is now the same idea in
both; the real difference is CONCEPT metadata and which import flow it
goes through.

## PROMPT TEMPLATE

Paste this as your message. Fill in only what's known; leave anything
unknown out and the assistant will ask.

```
Build me a Workout Content JSON (not a template) for a
[PULL / PUSH / LEGS / CORE / FULL_BODY] [workout / quick workout].

Level: [beginner / intermediate / advanced]
Free or Pro: [free / pro]
Goal / focus: [e.g. muscle-up prep, handstand, general strength, conditioning]
Equipment: [bar / rings / bands / weights / gym machines]
If quick workout — format and time cap: [amrap / emom / fortime / tabata], [N] minutes

Output format: Workout Content JSON — kind/title/category/difficulty/
blocks[], each block a named phase (Warm-Up, Skills, Strength, Cool-Down,
...) with its own exercises[]. No weeks, no CONCEPT metadata (that's the
Single Day Template format instead).

The "kind" field in the output JSON must be exactly the literal string
"workout" or "quick_workout" (lowercase, underscore, no space) — not
"Workout", not "quick workout". Anything else is rejected on import.

The "category" field, if a full-body day, must be exactly "FULL_BODY"
(underscore, no space) — "FULL BODY" won't match and the item won't show
under any filter chip in the app.

For a Workout (not Quick Workout): include Warm-Up and Cool-Down blocks —
non-negotiable. Add Skills/Strength/Accessories blocks only when relevant
to the requested focus and level. For a Quick Workout: usually just one
block containing the whole circuit.
```

## WHAT THE ASSISTANT WILL DO

1. Ask only for whatever's missing from the fields above (one question at a time).
2. Confirm the assumptions in one line before building.
3. Output a single JSON object — not an array, no surrounding prose or
   markdown fences — matching the shape below.

## Top-level shape

```json
{
  "kind": "workout",
  "title": "Push Power Circuit",
  "description": "Advanced single-arm and archer push-up work for athletes who've outgrown standard push-ups.",
  "category": "PUSH",
  "difficulty": "advanced",
  "is_free": false,
  "blocks": [ /* see below */ ]
}
```

| Field | Required | Notes |
|---|---|---|
| `kind` | **yes** | `"workout"` or `"quick_workout"` — anything else is rejected. |
| `title` | **yes** | Non-empty string. |
| `description` | no | Shown on the detail card. Omit or `null` for none. |
| `category` | no | `PULL`, `PUSH`, `LEGS`, `CORE`, or `FULL_BODY` — matched case-insensitively and normalized to that exact casing on import (the browse page's filter chips do an exact-match query, so a mismatched case would otherwise silently make the item unfilterable). Anything outside that set is accepted as-is (category has no DB constraint) but won't show under any filter chip. |
| `difficulty` | no | `beginner`, `intermediate`, or `advanced` — case-insensitive, but must match one of these three exactly (case aside). The database rejects anything else, so the import is refused up front with a clear error rather than failing after you've already clicked Import. |
| `is_free` | no | `true`/`false`, defaults to `false` (Pro-locked) if omitted. |
| `blocks` | **yes** | Non-empty array — one entry per phase. See below. Import is rejected if empty or missing. |

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
  "blocks": [
    { "name": "Circuit", "exercises": [ /* ... */ ] }
  ]
}
```

| Field | Notes |
|---|---|
| `format` | `amrap`, `emom`, `fortime`, or `tabata` — same case-insensitive-but-must-match-one-of-these rule as `difficulty`. |
| `duration_minutes` | The time cap, as a plain number. |

## `blocks[]`

One entry per phase — `"name"` is the phase label (e.g. `"Warm-Up"`,
`"Skills"`, `"Strength"`, `"Cool-Down"`), rendered as a section header in
the app above its exercises:

```json
{
  "name": "Strength",
  "order_index": 1,
  "exercises": [ /* see below */ ]
}
```

- **`name`** — **required**, non-empty. Missing a name rejects the whole import.
- **`order_index`** — optional; defaults to the block's position in the array. Controls display order.
- **`exercises`** — **required**, non-empty array — see below. A block with no exercises rejects the whole import.

For a `workout`: always include a `"Warm-Up"` and a `"Cool-Down"` block —
non-negotiable. Add `"Skills"` / `"Strength"` / `"Strength - 2"` /
`"Accessories"` / `"Finisher"` blocks only when relevant to the requested
focus and level. For a `quick_workout`: usually a single block (e.g.
`"Circuit"`) holding the whole thing.

## `exercises[]` (inside a block)

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

- **`exercise_id`** — omit this for anything generated from scratch. It
  only matters if you're deliberately re-pointing at one specific existing
  exercise_library row and its name might not match exactly. If you supply
  an `exercise_id` that doesn't exist and don't also give a `name` as a
  fallback, the whole import is rejected with a clear "could not resolve"
  error rather than silently dropping that exercise.
- **`name`** — this is what you'll use almost always. Matched against the
  exercise library **case-insensitively**; see resolution rules below.
- **`sets` / `reps`** — plain numbers, for rep-based exercises (most
  `workout`-kind content). `0` is preserved as `0`, not silently dropped to
  empty — only an actually-empty/omitted value becomes empty.
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
Single Day Template import format.

## Exercise resolution

Every exercise, across every block, is resolved to a real `exercise_library`
row, in this order (identical logic to the Single Day Template importer):

1. If `exercise_id` is present **and still exists**, it's reused as-is.
2. Otherwise, `name` is matched against `exercise_library` with an exact,
   case-insensitive comparison.
3. If nothing matches, a **new** `exercise_library` entry is created
   automatically (`difficulty: "beginner"`, no category) — this is how you
   can invent a brand-new exercise name with no `exercise_id` at all.

**Use exact existing names to reuse a real exercise** — there is no static
reference file listing them (a committed snapshot would go stale
immediately, since the library is a live, growing table). Pull the current
list before generating content instead:
- Admin web: `/coaching/exercises` lists every exercise, searchable.
- Or query `exercise_library` directly if you have DB access.

Misspell an existing name and you'll get a brand-new near-duplicate entry
instead of a match — check the exercise library first if you want to
guarantee a hit on an existing row.

## What happens on import

1. The file is validated (shape — every block named and non-empty, every
   exercise resolvable-in-principle — plus `difficulty`/`format` against
   their exact allowed values) and rejected with a specific error if
   anything's wrong — nothing is written until it passes.
2. Every exercise across every block is resolved to a real `exercise_id`
   per the rules above; if any exercise fails to resolve, the whole import
   is rejected rather than silently saving with fewer exercises than shown
   in the preview.
3. One `standalone_workouts` row is created, with one `standalone_workout_blocks`
   row per block (in order) and its exercises under it, `status: "draft"` —
   it never appears in the app's public Workout Library until an admin
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
  "blocks": [
    {
      "name": "Warm-Up",
      "exercises": [
        { "name": "Arm Circles", "sets": 2, "reps": 15 }
      ]
    },
    {
      "name": "Strength",
      "exercises": [
        { "name": "Ring Rows", "sets": 3, "reps": 12, "rest_seconds": 60 },
        { "name": "Dead Hang", "hold_seconds": 20, "rest_seconds": 60 },
        { "name": "Banded Pulldowns", "sets": 3, "reps": 10, "rest_seconds": 60 }
      ]
    },
    {
      "name": "Cool-Down",
      "exercises": [
        { "name": "Cat-Cow Stretch", "hold_seconds": 30 }
      ]
    }
  ]
}
```

## Which format do I want?

- **This doc (Workout Content)** — the result becomes a single-session
  item on the Workout Content browse page, with no weeks or CONCEPT
  metadata. Use this if the output is meant to be a self-contained "day
  card" someone taps to open in the app's browsable library — this is also
  what the Workouts tab's "build your week" day-picker assembles from
  (each selected workout's own blocks become that day's blocks in the
  generated program).
- **[Single Day Template](./single-day-template-import-format.md)** — the
  result becomes an importable *template* with CONCEPT metadata (timing
  system, structure), going through the same import flow as a full
  multi-week program. Use this if the output should behave like any other
  library template.

Source of truth for this format is the code, not this document:
- Validation: `validateStandaloneWorkoutImport` in `admin-web/src/api/workoutLibrary.ts`
- Import + exercise resolution: `importStandaloneWorkoutFromJson` in the same file
- Write: `save_standalone_workout` (Postgres RPC)
