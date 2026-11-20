# Coach Test Day — Data, Export and Import Format

How a coach's test items are stored, logged, exported and imported, for an
external tool that reads **EXPORT WEEK** files and writes **IMPORT WEEK**
files. Read [warrior-program-week-export-import-format.md](warrior-program-week-export-import-format.md)
first: a test day uses that same file format, plus the read-only
`test_result` object described in §5.

The code is the source of truth. Anything marked **NOT IMPLEMENTED** does
not exist in the code today.

**Where each part runs.** Server changes are live once their migration is
applied. admin-web changes are live once merged to `main`. App changes reach
athletes and the app's own EXPORT/IMPORT WEEK only with the next app build.
"App: next build" marks those.

Main sources:
- Schema and RPCs: `supabase/migrations/20261114190000_coach_test_week.sql`,
  `supabase/migrations/20261120200000_test_week_notes_pb_coach_clear.sql`
- App logic: `src/lib/testItems.ts` (admin-web copy: `admin-web/src/shared/testItems.ts`)
- Concept tag: `src/lib/BlockConceptParser.ts`
- Export: `ProgramExportBuilder.ts` → `fetchWeekExportPayload`, `buildExportTestResult`
- Import: `ProgramImportParser.ts` → `validateWeekImportPayload`, `testBlockError`, `buildImportBlocksPayload`

The last two exist in `src/lib/` (app) and `admin-web/src/shared/` (admin-web)
with the same logic.

---

## 1. Data model

### A test day is not its own entity

There is no test-day table, day type or block type. The code has **test
items**, and a test item is a normal `program_blocks` row whose `[CONCEPT:{…}]`
tag (stored at the start of `program_blocks.notes`) contains `test_kind`:

```
[CONCEPT:{"timing_system":"straight_set","structure":"single","test_kind":"max_reps","test_movement":"pull_ups"}] Coach instructions here.
```

- `ConceptMetadata.test_kind` / `test_movement`: `src/lib/BlockConceptParser.ts`.
- The app reads it with `getTestItem()` / `isTestBlock()` (`src/lib/testItems.ts`).
- The server reads it with `public._block_concept(notes)`, using the
  non-greedy regex `^\[CONCEPT:(.*?)\]`. The concept JSON must be **flat, with
  no arrays or objects and no `]` in any value**, or the server gets `NULL`
  and the block is not a test. The import now rejects such test blocks (§6).

A **test day** is a day in which every block is a test item:
`isTestDay(day) = day.blocks.length > 0 && day.blocks.every(isTestBlock)` (`src/lib/testItems.ts`).
- The Journey uses it in `src/screens/MilestoneLaneScreen.tsx` → `buildWeekSequence` / `rotationSlotsUsed`:
  a test day gets no side quest after it.
- The workout runner uses it in `src/screens/coaching/WarriorProgramScreen.tsx`:
  the header shows "done/total" instead of moves and minutes.
- The server only counts per **week**: `_test_week_counts(program, template, week)`.

**A day with a Warm-Up or Cool-Down block is not a test day yet**, so the
Journey and the header treat it as a training day. Its test items still work:
they log, they go to their world, and the "test week finished" notice still
fires. Planned for the next app build (§7).

### Linkage

| What | Where it lives |
|---|---|
| Client program | `program_blocks.template_id` → the client's own template (`warrior_programs.template_id`) |
| Week | `program_blocks.week_number` (server uses `COALESCE(week_number, 1)`) |
| Day | the part of `program_blocks.name` before `" \| "`. Export splits it (`fetchWeekExportPayload`); import joins `day_name` + `block_name` (`buildImportBlocksPayload`) |
| Order in the day | `program_blocks.order_index` |
| Item name / demo video | the block's first `block_exercises` row (`ORDER BY order_index NULLS LAST, id`); fallback is the block name after `" \| "` |

### Concept keys

| Key | Values | Required |
|---|---|---|
| `test_kind` | `max_reps`, `one_rm`, `max_hold`, `form_check` | Yes, for the block to be a test |
| `test_movement` | depends on kind, see §3 | `max_reps` and `one_rm`: yes. `max_hold`: optional (missing means any static category). `form_check`: ignored |

The admin-web builder also sets `timing_system: "straight_set"` and
`structure: "single"`, and removes `is_tier_trial` / `tier_trial_tier`
(`ConceptWizard.tsx` → `setTestKind`). The server ignores timing and structure
for test items.

### Table `program_test_results` (results; written only by RPCs)

| Column | Type | Null | Default / check |
|---|---|---|---|
| `id` | uuid PK | no | `gen_random_uuid()` |
| `warrior_program_id` | uuid → `warrior_programs` | yes | `ON DELETE SET NULL` |
| `warrior_id` | uuid → `profiles` | no | `ON DELETE CASCADE` |
| `block_id` | uuid → `program_blocks` | yes | `ON DELETE SET NULL` |
| `week_number` | integer | no | `1` |
| `test_kind` | text | no | one of the 4 kinds |
| `movement_id` | text | yes | world movement tested; for `max_hold`, the progression the athlete picked; `NULL` for form checks |
| `item_name` | text | yes | |
| `status` | text | no | `done`, `skipped` |
| `value` | numeric | yes | `>= 0` |
| `unit` | text | yes | `reps`, `kg`, `seconds` |
| `skip_reason` | text | yes | `cant_do`, `injury`, `no_equipment`, `no_time`, `other` |
| `skip_detail` | text | yes | ≤ 500 chars |
| `note` | text | yes | ≤ 500 chars. The athlete's note (20261120200000) |
| `world_status` | text | no | `none`; one of `saved`, `locked`, `no_world`, `none` |
| `is_new_pb` | boolean | no | `false` |
| `is_matched_pb` | boolean | no | `false`. Equal to the world best (20261120200000) |
| `coach_grade` | text | yes | `pass`, `needs_work` |
| `coach_note` | text | yes | ≤ 1000 chars |
| `graded_by` / `graded_at` | uuid / timestamptz | yes | |
| `created_at` / `updated_at` | timestamptz | no | `now()` |

- Unique `(warrior_program_id, block_id)`: **one result per item**.
- RLS: the athlete, any coach or assistant of the athlete, and admins can SELECT.
  Nobody can write to the table directly.
- `coach_contacts (coach_id, whatsapp)` holds the WhatsApp number used for form checks.

---

## 2. Assignment

- **UI path:** admin-web program builder → block card → "Test item" select
  (`ConceptWizard.tsx`), then a movement select. The same block card is used by the
  master-template and client-program builders.
- **Mobile builder cannot mark a test item: NOT IMPLEMENTED.** It keeps existing
  test keys when it saves (`BlockConfigWizard.tsx`).
- **Slot, not date.** A test item sits in a week / day / order slot like any
  block. **Scheduled date: NOT IMPLEMENTED.**
- **Sources that keep the tag:** assigning a master template, the master-template
  JSON import, the weekly client import (§6), and builder edits.
- **Results only on a real coach's program.** `submit_program_test_item`
  raises `NOT_COACH_PROGRAM` when `warrior_programs.coach_id` is the Leap
  library (`…0001`) or AI Coach (`…0002`) profile, or is not a coach or admin.
  The app shows such blocks as normal blocks (`isCoachAssigned`). The
  admin-web week import warns when test items land on such a program.
- **Edit or reschedule after assigning:** `save_program_template` UPDATEs blocks
  in place, so `block_id` and any result stay linked.
  - Moving a logged item to another week leaves `program_test_results.week_number` at the old week.
  - Changing `test_kind` / `test_movement` on a logged item keeps the old result.
  - A logged item can't be deleted from the builder; its workout log blocks the delete.
- **Clear a result:**
  - **Athlete:** `submit_program_test_item(p_status => 'none')`.
  - **Coach, assistant or admin:** `clear_program_test_item(p_result_id)`, from the admin-web
    Tests panel → "Clear result".

  Both delete the result and the block's workout log, so the athlete can log
  the item again. **A value already sent to a world stays there.**

---

## 3. Test content

One block = one item = one logged number. The exercise's sets / reps / rest /
hold are not used for tests. Exercises resolve by the weekly-import rules
(`resolveImportedExercises`).

| `test_kind` | Metric | `test_movement` | Value rule (server) | World |
|---|---|---|---|---|
| `max_reps` | reps in **60 s** (One Min Max) | `onemm_movements.id`: `pull_ups, dips, push_ups, muscle_ups, hspu, goblet_squats, deadlift, fl_pull_ups, fl_press, planche_push_ups, inverted_row, assisted_pull_ups, bench_dips, knee_push_ups, incline_push_ups, air_squats` | integer, `> 0`, `≤ onemm_movements.max_reps` | One Min Max when the category is unlocked (entry tier 0, main 3, advanced 5) |
| `one_rm` | heaviest single, kg | `pull_up, dip, muscle_up` (added kg), `squat, deadlift` (bar kg) | `>= 0`, `≤` 150 / 200 / 100 / 300 / 500 | Power World at strength tier ≥ 6. Deadlift: `no_world` |
| `max_hold` | hold seconds | `front_lever, back_lever, planche, handstand`, or left out | `> 0`, `≤ static_movements.max_hold_seconds`. The athlete picks the progression, which must be in the category | Static World at strength tier ≥ 1 |
| `form_check` | none: the athlete sends a video on WhatsApp and marks it sent | ignored | no value | none |

- The id lists are in `testMovementIds()` (`testItems.ts`, both copies).
- The 60 s countdown and the hold stopwatch run only in the app, and the athlete taps Stop.
  The server does not check time.

**NOT IMPLEMENTED:** for time, AMRAP in X minutes, open-ended max reps, max load
at an RPE cap, targets or benchmarks, attempt counts, rest rules, and time caps
checked by the server. Re-saving an item overwrites it, so retries are unlimited.

**Strength tier / trials:** no link to `trials.ts`, `RITES_OF_PASSAGE` or
`is_tier_trial`. `submit_program_test_item` only **reads** `strength_tier`, to
decide world unlocks. **A test never changes `strength_tier`.** World values only
go up: power uses `GREATEST`, static writes only a new best, and 1MM takes `MAX(reps)`.

---

## 4. Results / logging

The athlete logs one result per item. App: `TestItemSheet.tsx` → `TestItemService.submit` → RPC:

```
submit_program_test_item(p_warrior_program_id, p_block_id,
  p_status 'done'|'skipped'|'none', p_value, p_movement_id, p_skip_reason, p_skip_detail,
  p_note)
```

`p_note` is optional and new in 20261120200000. Calls without it, from current
apps, still work. The app's Notes field comes with the next build.

Each save writes three things:
1. **`program_test_results`** (upsert).
   - If status, value or movement changed, the coach grade and note are reset.
   - **Changing only the note keeps the grade.**
2. **`workout_logs`**: one row per block, replacing any earlier one.
   - `notes` is the athlete's note when done, or `"[STATUS:MISSED]"` followed by the
     note when skipped.
   - `rating`: always 5.
   - `missed_reason`: `injury` → `injury`, `no_time` → `no_time`, any other reason → `other`.
   - `missed_detail`: the skip detail.
3. **`workout_set_logs`**: one set, only when the item is done, the block has an
   exercise, and the kind has a unit. `source = 'test'`.
   - reps: `reps_completed = value`
   - kg: `reps_completed = 1`, `weight_used = value`
   - seconds: `hold_seconds = value`

| Field | Exists? |
|---|---|
| status | `done` / `skipped` (partial: **NOT IMPLEMENTED**) |
| skip reason + detail | yes |
| athlete note per item | yes on the server and in exports; the app's Notes field comes with the next build |
| RPE, feel | **NOT IMPLEMENTED** |
| video | not stored. Form check opens WhatsApp |
| coach validation | `grade_program_test_item(result_id, 'pass'\|'needs_work'\|NULL, note)` in the admin-web Tests panel |
| server errors | `BAD_STATUS, PROGRAM_NOT_FOUND, NOT_COACH_PROGRAM, BLOCK_NOT_FOUND, NOT_A_TEST, PRO_REQUIRED, BAD_MOVEMENT, BAD_VALUE, VALUE_TOO_HIGH, BAD_REASON`; `clear_program_test_item` raises `RESULT_NOT_FOUND` |

When the last item of a week is saved, the coach is notified once ("Test week
finished") and the RPC returns `week_complete: true`.

**PB flags** (20261120200000) are computed on every save, against the athlete's
world best from before the save:
- `is_new_pb`: the value is higher than that best.
- `is_matched_pb`: the value equals it. One Min Max counts a tie as a PB in its
  own world; the test record does not.
- Only a result that went into its world can be either. Locked worlds and deadlift give false.
- Saving the same value again keeps the item's flags. Any other change recomputes
  them, so a value corrected down loses "New PB".
- Known limit: a typo saved high and then corrected down has already raised the
  world best, so the corrected value isn't flagged even if it beats the athlete's older best.

**What each side sees:**
- **Athlete** (`TestItemCard.tsx`): the value, a world chip, "New PB", and the coach
  grade and note. There is no comparison, and a lower number is never shown as a change.
  A "Matched PB" chip comes with the next build.
- **Coach** (admin-web `TestsPanel.tsx`): the change since the previous result
  (`Delta`, which can be negative), the athlete's note, "PB" or "Matched PB", grading,
  and Clear result.

---

## 5. Export (read)

`fetchWeekExportPayload` (needs `warriorProgramId`) adds a read-only
**`test_result`** next to `log` on every test block. It is built by
`buildExportTestResult` from every `program_test_results` row of the athlete,
across all programs. Non-test blocks have no `test_result` key.

| Field | Meaning |
|---|---|
| `status` | `done`, `skipped`, or `null` if not logged yet |
| `value`, `unit` | the number logged; `null` for form checks and skips |
| `movement_id` | the world movement. For `max_hold`, the progression picked |
| `skip_reason`, `skip_detail` | raw reason (`cant_do`, `injury`, `no_equipment`, `no_time`, `other`) |
| `note` | the athlete's note |
| `is_new_pb`, `is_matched_pb` | see §4 |
| `world_status` | `saved`, `locked`, `no_world`, `none`; `null` if not logged |
| `coach_grade`, `coach_note` | the coach's grade |
| `previous` | the athlete's last done result of the same `test_kind` + movement before this one, in any program, or `null`. `same_program` says whether it came from this program. For an item not logged yet, it is the latest such result; a hold not logged yet has no progression, so `previous` is `null` |

`log` is unchanged. Its `notes` now carries the athlete's note (with the
`[STATUS:MISSED]` prefix when skipped), so read the note from `test_result.note`.

Where this runs: the admin-web export once merged. The app export comes with the next build.

Example: week 5, a test day with a Warm-Up block and four items (one skipped):

```json
{
  "exported_at": "2026-12-04T10:00:00.000Z",
  "warrior": { "id": "7d0c2a7e-3f7e-4b8e-9a51-2f1c0b6d9e11", "display_name": "Test Warrior", "strength_tier": 6 },
  "program": { "template_name": "[CUSTOM] B-2", "week_number": 5 },
  "coach_week_note": "Test week. Rest day before.",
  "bodyweight_trend": [ { "logged_at": "2026-12-01T08:00:00.000Z", "weight_kg": 78.5 } ],
  "blocks": [
    {
      "block_id": "0b5e8c1a-1111-4c55-9a0e-000000000010",
      "day_name": "TEST DAY",
      "block_name": "Warm-Up",
      "order_index": 0,
      "metadata": { "timing_system": "straight_set", "structure": "circuit", "rounds": "2", "rest_after_round": 60 },
      "coach_notes": "Easy pace. Finish 3 min before the first test.",
      "exercises": [
        { "exercise_id": "a1b2c3d4-0000-4000-8000-000000000001", "name": "Wrist swings", "sets": "", "reps": "15", "rest_seconds": "", "hold_seconds": "", "is_weighted": false },
        { "exercise_id": "a1b2c3d4-0000-4000-8000-000000000002", "name": "Scapula Pulls", "sets": "", "reps": "10", "rest_seconds": "", "hold_seconds": "", "is_weighted": false }
      ],
      "log": {
        "status": "completed", "feel": "good", "rpe": 4, "missed_reason": null, "missed_detail": null,
        "session_seconds": 420, "notes": "", "sets": []
      }
    },
    {
      "block_id": "0b5e8c1a-1111-4c55-9a0e-000000000001",
      "day_name": "TEST DAY",
      "block_name": "Pull-ups · max reps",
      "order_index": 1,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "max_reps", "test_movement": "pull_ups" },
      "coach_notes": "Dead hang start, chin over bar.",
      "exercises": [
        { "exercise_id": "5b677e6b-73eb-44e8-98f5-e0dd3a581604", "name": "Pull Ups (Normal Grip)", "sets": "", "reps": "", "rest_seconds": "", "hold_seconds": "", "is_weighted": false }
      ],
      "log": {
        "status": "completed", "feel": null, "rpe": null, "missed_reason": null, "missed_detail": null,
        "session_seconds": null, "notes": "felt grip go at the end",
        "sets": [ { "set_index": 1, "reps_completed": 14, "weight_used": null, "hold_seconds": null, "exercise_name": "Pull Ups (Normal Grip)" } ]
      },
      "test_result": {
        "status": "done", "value": 14, "unit": "reps", "movement_id": "pull_ups",
        "skip_reason": null, "skip_detail": null, "note": "felt grip go at the end",
        "is_new_pb": true, "is_matched_pb": false, "world_status": "saved",
        "coach_grade": null, "coach_note": null,
        "previous": { "value": 11, "unit": "reps", "week_number": 1, "logged_at": "2026-10-09T17:20:00.000Z", "same_program": true }
      }
    },
    {
      "block_id": "0b5e8c1a-1111-4c55-9a0e-000000000002",
      "day_name": "TEST DAY",
      "block_name": "Front lever hold",
      "order_index": 2,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "max_hold", "test_movement": "front_lever" },
      "coach_notes": "Pick the hardest progression you can hold for 5 s or more.",
      "exercises": [
        { "exercise_id": "c4e2b8d1-5f6a-4b3c-9d8e-7f1a2b3c4d50", "name": "Tuck Front Lever Hold", "sets": "", "reps": "", "rest_seconds": "", "hold_seconds": "", "is_weighted": false }
      ],
      "log": {
        "status": "completed", "feel": null, "rpe": null, "missed_reason": null, "missed_detail": null,
        "session_seconds": null, "notes": "",
        "sets": [ { "set_index": 1, "reps_completed": null, "weight_used": null, "hold_seconds": 12, "exercise_name": "Tuck Front Lever Hold" } ]
      },
      "test_result": {
        "status": "done", "value": 12, "unit": "seconds", "movement_id": "tuck_front_lever",
        "skip_reason": null, "skip_detail": null, "note": null,
        "is_new_pb": false, "is_matched_pb": true, "world_status": "saved",
        "coach_grade": null, "coach_note": null,
        "previous": { "value": 12, "unit": "seconds", "week_number": 6, "logged_at": "2026-08-20T16:00:00.000Z", "same_program": false }
      }
    },
    {
      "block_id": "0b5e8c1a-1111-4c55-9a0e-000000000003",
      "day_name": "TEST DAY",
      "block_name": "Back squat 1RM",
      "order_index": 3,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "one_rm", "test_movement": "squat" },
      "coach_notes": "Work up in singles. Log the heaviest clean single.",
      "exercises": [
        { "exercise_id": "9a1d3f20-2b44-4e0f-8c7d-3e6f5a4b2c10", "name": "Back Squat", "sets": "", "reps": "", "rest_seconds": "", "hold_seconds": "", "is_weighted": false }
      ],
      "log": {
        "status": "missed", "feel": null, "rpe": null, "missed_reason": "other", "missed_detail": "Rack was taken",
        "session_seconds": null, "notes": "[STATUS:MISSED] will test it Friday", "sets": []
      },
      "test_result": {
        "status": "skipped", "value": null, "unit": null, "movement_id": "squat",
        "skip_reason": "no_equipment", "skip_detail": "Rack was taken", "note": "will test it Friday",
        "is_new_pb": false, "is_matched_pb": false, "world_status": "none",
        "coach_grade": null, "coach_note": null,
        "previous": { "value": 100, "unit": "kg", "week_number": 1, "logged_at": "2026-10-10T18:00:00.000Z", "same_program": true }
      }
    },
    {
      "block_id": "0b5e8c1a-1111-4c55-9a0e-000000000004",
      "day_name": "TEST DAY",
      "block_name": "Form check",
      "order_index": 4,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "form_check" },
      "coach_notes": "Film one set of 5 from the side.",
      "exercises": [
        { "exercise_id": "e7f8a9b0-1c2d-4e3f-8a9b-0c1d2e3f4a60", "name": "Ring Dips", "sets": "", "reps": "", "rest_seconds": "", "hold_seconds": "", "is_weighted": false }
      ],
      "log": null,
      "test_result": {
        "status": null, "value": null, "unit": null, "movement_id": null,
        "skip_reason": null, "skip_detail": null, "note": null,
        "is_new_pb": false, "is_matched_pb": false, "world_status": null,
        "coach_grade": null, "coach_note": null, "previous": null
      }
    }
  ]
}
```

- `log.sets` still holds the same numbers (reps → `reps_completed`, kg →
  `weight_used` with `reps_completed` 1, seconds → `hold_seconds`).
- `test_result` also covers blocks with no exercise, form checks, and the exact skip reason.
- **Separate test-history file: NOT IMPLEMENTED.** Use `previous`, or read
  `program_test_results` by `warrior_id`.

### Week summary (short, read-only)

admin-web → client progress → **Export summary**. It covers the selected week,
or the 2, 4 or all weeks up to it. Built by `buildWeekSummary`
(`admin-web/src/pages/coaching/weekSummary.ts`) from data the page already loaded.
- One line per exercise: `planned` comes from the program and `done` has one entry per set
  (`"8, 8, 7"`, `"20kg×6, 20kg×5"`, `"30s, 28s"`).
- Test items carry `test` (value, previous, `pb`: `new`/`matched`, note, grade).
- Empty fields are left out.
- About 270 lines for a fully logged week (EXPORT WEEK gives about 4,000).
- **It can't be imported.** IMPORT WEEK needs the full EXPORT WEEK format.

```
{ "type": "leap_week_summary", "version": 1, "exported_at", "warrior": {"name","strength_tier"}, "program",
  "weeks": [ { "week", "coach_week_note"?, "totals": {"done","missed","not_logged"},
               "days": [ { "day", "blocks": [ { "block", "kind", "status": "done"|"missed"|"not_logged",
                           "rpe"?, "feel"?, "minutes"?, "result"?, "notes"?, "missed_reason"?, "missed_detail"?,
                           "exercises"?: [ {"name","planned"?,"done"?,"rpe"?} ],
                           "test"?: {"kind","movement"?,"value"?,"unit"?,"previous"?,"previous_week"?,"pb"?,"world"?,
                                     "skip_reason"?,"skip_detail"?,"note"?,"grade"?,"coach_note"?} } ] } ],
               "other_logs"?: [ {"block","status","notes"?} ] } ],
  "bodyweight": [ {"date","kg"} ] }
```

`other_logs` lists logged blocks that are no longer in the program.

---

## 6. Import (write)

`validateWeekImportPayload` and `buildImportBlocksPayload` accept test days.
- `metadata` is written back with `BlockConceptParser.stringify(metadata, coach_notes)`.
- The week is added as a **new week** (`append_weeks_to_client_program`), which also
  becomes `warrior_programs.current_week`.
- Each exercise is stored with `order_index` = its position in the file, in the week
  import, the master-template import and the library import.

**Test block rules** (`testBlockError`). A block with a `test_kind` is checked,
and the whole file is rejected before anything is written if any rule fails:

| Rule | Error |
|---|---|
| `test_kind` is one of the 4 kinds | `Test block "<name>": test_kind must be max_reps, one_rm, max_hold or form_check.` |
| `max_reps` / `one_rm` have a valid `test_movement` | `Test block "<name>": test_movement must be one of <ids>.` |
| `max_hold` `test_movement`, when given, is a static category | `Test block "<name>": test_movement must be one of front_lever, back_lever, planche, handstand, or left out.` (the ids in the order the code lists them) |
| metadata values are single values | `Test block "<name>": metadata "<key>" must be a single value, not a list or object.` |
| no `]` in a metadata string | `Test block "<name>": metadata "<key>" can't contain "]".` |
| not also a tier trial | `Test block "<name>": a block can't be both a test item and a tier trial.` |
| exactly one exercise | `Test block "<name>" needs exactly one exercise: it names the item and gives the demo video.` |

Blocks without `test_kind` (Warm-Up, Cool-Down, training) are not checked by these rules.

General errors (unchanged):

| Condition | Error |
|---|---|
| not an object | `File is not a valid JSON object.` |
| `blocks` missing or empty | `No blocks found in the file.` |
| block name is whitespace only | `Every block needs a name.` |
| `exercises` not an array | `Block "<name>" is missing its exercises list.` |
| exercise with neither `exercise_id` nor `name` | `An exercise in block "<name>" has neither an exercise_id nor a name to match against.` |
| name still unmatched after the coach's match prompt | `Could not match these exercises: … Fix their exercise_id or name in the file and import again.` |

Writable vs read-only:

| Field | On import |
|---|---|
| `day_name` + `block_name` (or `name`), `order_index`, `metadata`, `coach_notes` | written |
| `exercises[]`: `exercise_id`/`name`, `sets`, `reps`, `rest_seconds`, `hold_seconds`, `is_weighted`, `notes` | written, in file order. Numbers are ignored for tests |
| `coach_week_note` | **written** to `coach_week_notes` for the new week by the admin-web week import (it comes back in the next export); the app's import does this from the next build. Only the program's coach or an admin can save it; otherwise the import says so and the week is still added. **No athlete screen shows week notes yet: NOT IMPLEMENTED** |
| `block_id`, `log`, `test_result`, `warrior` (incl. `strength_tier`), `program`, `bodyweight_trend`, `exported_at` | ignored |
| results | cannot be imported |

### Minimal valid import

```json
{
  "blocks": [
    {
      "day_name": "TEST DAY",
      "block_name": "Pull-ups · max reps",
      "order_index": 0,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "max_reps", "test_movement": "pull_ups" },
      "exercises": [ { "name": "Pull Ups (Normal Grip)" } ]
    }
  ]
}
```

### Full import (test day with Warm-Up)

```json
{
  "coach_week_note": "Test week. Rest day before. Give honest, clean reps.",
  "blocks": [
    {
      "day_name": "TEST DAY",
      "block_name": "Warm-Up",
      "order_index": 0,
      "metadata": { "timing_system": "straight_set", "structure": "circuit", "rounds": "2", "rest_after_round": 60 },
      "coach_notes": "Easy pace, no fatigue. Finish 3 min before the first test.",
      "exercises": [
        { "name": "Wrist swings", "reps": "15" },
        { "name": "Scapula Pulls", "reps": "10" },
        { "name": "Air Squat", "reps": "10" }
      ]
    },
    {
      "day_name": "TEST DAY",
      "block_name": "Pull-ups · max reps",
      "order_index": 1,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "max_reps", "test_movement": "pull_ups" },
      "coach_notes": "Dead hang start, chin over bar. Rest 4 min before the front lever hold.",
      "exercises": [ { "name": "Pull Ups (Normal Grip)" } ]
    },
    {
      "day_name": "TEST DAY",
      "block_name": "Front lever hold",
      "order_index": 2,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "max_hold", "test_movement": "front_lever" },
      "coach_notes": "Pick Tuck Front Lever in the app. Tap Stop when your hips drop. Log only your best hold.",
      "exercises": [ { "name": "Tuck Front Lever Hold" } ]
    },
    {
      "day_name": "TEST DAY",
      "block_name": "Back squat 1RM",
      "order_index": 3,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "one_rm", "test_movement": "squat" },
      "coach_notes": "Safety pins set. Log the heaviest clean single in kg.",
      "exercises": [ { "name": "Back Squat" } ]
    },
    {
      "day_name": "TEST DAY",
      "block_name": "Form check",
      "order_index": 4,
      "metadata": { "timing_system": "straight_set", "structure": "single", "test_kind": "form_check" },
      "coach_notes": "Film one set of 5 from the side.",
      "exercises": [ { "name": "Ring Dips" } ]
    }
  ]
}
```

The export example in §5 can also be imported as it is: `log`, `test_result`
and the other read-only fields are dropped.

---

## 7. Gaps and open decisions

| # | Gap | Status | Next step |
|---|---|---|---|
| 1 | No test-day entity or date; "test day" is derived (`isTestDay`) | open | Keep the block-level tag. Add a date only if coaches ask |
| 2 | Import didn't validate test blocks | **fixed** (`testBlockError`) | — |
| 3 | Export lacked progression, unit, raw skip reason, world status, PB, grade, previous | **fixed** (`test_result`) | — |
| 4 | Value missing from the export when a test block has no exercise | **fixed** (`test_result.value`); import now requires one exercise | — |
| 5 | Exercise order lost on import | **fixed** (`order_index` per exercise) | — |
| 6 | Editing a logged item leaves a stale result; the coach couldn't clear one | **coach clear added** (`clear_program_test_item`) | Warn in the builder when a logged test block is changed |
| 7 | "New PB" stuck after a correction down | **fixed** (computed on every save) | — |
| 8 | 1MM tie counted as a PB | **fixed for tests** (`is_matched_pb`) | App chip "Matched PB" at next build |
| 9 | Coach panel shows negative deltas | by design (coach only) | — |
| 10 | Metric types (for time, AMRAP X min, RPE cap, targets, attempts) | open | Add a `test_kind` only together with a server rule |
| 11 | No RPE, feel or athlete note | **note added** (server + export) | App Notes field at next build; RPE/feel open |
| 12 | A day with a Warm-Up / Cool-Down block isn't a test day | open | App build: count support blocks in `isTestDay` |
| 13 | The mobile builder can't create test items | open | App build |
| 14 | Test tags on Leap / AI Coach programs do nothing | **warned** in the admin-web week import | — |
| 15 | Week note on import | **saved** (admin-web); app at next build | Athlete screen for week notes: not built |
