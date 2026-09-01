# Single Day Build — Instruction Prompt

Use this prompt whenever you want **one standalone training day** — Pull,
Push, Legs, Skills, Full Body, or Weighted Strength — imported as a
**Master Template** (the same JSON import used for full multi-week
programs: mobile Coaching Center → LIBRARY tab → Import, or admin web →
Program builder → Library tab → Import), just scoped to one day. No code
change is needed for this — the importer has no minimum day/week count, so
a `blocks[]` array containing only one day's blocks imports exactly like a
full program does.

Companion doc: [workout-content-import-format.md](./workout-content-import-format.md)
covers the **other** format — a single-day `standalone_workouts` entry for
the Workout Content library page instead of a template. Its block shape is
now the same idea as this one (day_name/block_name/metadata/coach_notes),
minus `week_number`. See "Which format do I want?" below if you're not
sure which one applies.

## PROMPT TEMPLATE

Paste this as your message. Fill in only what's known; leave anything
unknown out and the assistant will ask.

```
Build me ONE [PULL / PUSH / LEGS / SKILLS / FULL BODY / WEIGHTED STRENGTH] day.

Level: [beginner / intermediate / advanced]
Goal / focus: [e.g. muscle-up prep, handstand, general strength, trial prep]
Equipment: [bar / rings / bands / weights / gym machines]
Anything to avoid or emphasize: [injuries, weak points, optional]

Output format: single-day Master Template JSON (one day_name, week_number: 1,
order_index starting at 0, full phase order — Warm-Up through Cool-Down).
Not a full program, not the Workout Content format.
```

## WHAT THE ASSISTANT WILL DO

1. Ask only for whatever's missing from the fields above (one question at a time).
2. Confirm the assumptions in one line before building.
3. Output **Master Template JSON** — same block/exercise shape as a full
   program — but containing **only the one requested day**:

```json
{
  "template_name": "[Focus] Day — [Level]",
  "description": "One sentence — who it's for and what it builds.",
  "blocks": [
    { "day_name": "PUSH DAY 1", "block_name": "Warm-Up", "week_number": 1, "order_index": 0, "exercises": [ /* ... */ ] },
    { "day_name": "PUSH DAY 1", "block_name": "Skills",  "week_number": 1, "order_index": 1, "exercises": [ /* ... */ ] },
    { "day_name": "PUSH DAY 1", "block_name": "Strength - 1", "week_number": 1, "order_index": 2, "exercises": [ /* ... */ ] },
    { "day_name": "PUSH DAY 1", "block_name": "Accessories",  "week_number": 1, "order_index": 3, "exercises": [ /* ... */ ] },
    { "day_name": "PUSH DAY 1", "block_name": "Cool-Down",    "week_number": 1, "order_index": 4, "exercises": [ /* ... */ ] }
  ]
}
```

- Warm-Up and Cool-Down are always included — non-negotiable.
- Mobility / Skills / Strength-2 / Strength-3 / Finisher are included only
  when relevant to the requested focus and level.
- `order_index` restarts at 0 for this single day (no need to continue
  numbering from a larger program).
- Each exercise inside `exercises[]` follows the standard shape:
  `{ "name": "...", "sets": 4, "reps": 6, "rest_seconds": 90, "hold_seconds": null, "is_weighted": false, "notes": "" }`
  — see "Exercise names" below for how these get matched.
- This is still a **Master Template** import (not a Workout Content import) —
  it goes through the same "Import Template from JSON" flow as a full
  program, just with one day's blocks in it. It always lands as a `draft`;
  set a tier range/goal and publish when ready, same as any library
  template.

## Exercise names

There is no static `exercise_library.md` reference file in this repo — the
exercise library is a live, growing table, so a committed snapshot would go
stale immediately. Before generating content, pull the **current** list
instead:
- Admin web: `/coaching/exercises` lists every exercise, searchable.
- Or query `exercise_library` directly (`select name from exercise_library
  order by name`) if you have DB access.

Matching happens in this order on import: an `exercise_id` you supply is
reused if it still exists; otherwise `name` is matched case-insensitively;
if nothing matches, a **new** exercise_library row is created automatically.
So: use an exact existing name to reuse a real exercise, or any new name to
invent one — just know a near-miss spelling creates a duplicate rather than
matching.

## Which format do I want?

- **This doc (Master Template)** — the result becomes an importable
  *template* someone assigns/starts as their program, with weeks, day/block
  structure, and CONCEPT metadata (timing system, structure). Use this if
  the output should behave like any other library template.
- **[Workout Content](./workout-content-import-format.md)** — the result
  becomes a single-session item on the Workout Content browse page
  (`/coaching/workouts`, `standalone_workouts` table), never part of a
  multi-week program. For `kind: "workout"` it now supports the same
  block/CONCEPT-metadata shape as this doc, just without `week_number`. Use
  this if the output is meant to be a self-contained "day card" someone
  taps to open in the app's browsable library — this is also what the
  Workouts tab's "build your week" day-picker assembles from.

If you're not sure, say so explicitly in your message — e.g. "Build me a
Workout Content JSON (not a template) for a PUSH day, intermediate, flat
exercise list, no phases."
