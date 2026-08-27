# Quick Workout — Timing Pattern Reference

How to author each of the 4 `format` values correctly, against what's
actually stored (`standalone_workouts` + `standalone_workout_blocks` +
`standalone_workout_exercises`) and what the live timer engine
(`src/components/workoutLibrary/QuickWorkoutTimerModal.tsx`,
`buildIntervalPlan`) actually does. All 4 patterns are fully supported as
of 20260827040000 — this document previously flagged 3 of them as
unbuilt; that gap is closed.

## Fields that matter for timing

| Field | Level | Purpose |
|---|---|---|
| `format` | workout | `amrap` \| `emom` \| `fortime` \| `tabata` |
| `duration_minutes` | workout | AMRAP: the countdown cap. EMOM/Tabata: total session length, used to derive round count. For Time: an *optional* hard cap, not the primary display. |
| `interval_seconds` | workout | **EMOM only.** Seconds per round. `NULL` → 60. |
| `rounds` | workout | **Tabata**: total work/rest cycles, `NULL` → derived from `duration_minutes ÷ 30`. **For Time**: target round count, `NULL` → uncapped stopwatch, no round counter. Unused by AMRAP/EMOM. |
| `reps` / `sets` | exercise | Rep target, shown under the clock |
| `work_seconds` | exercise | **Tabata only.** That exercise's work duration. `NULL` → 20s. |
| `rest_seconds` | exercise | **Tabata only.** That exercise's rest duration. `NULL` → 10s. |
| `order_index` | exercise | Order within the block — for EMOM, this is also rotation order |

---

## 1. AMRAP

One countdown from `duration_minutes`. Every exercise in the block is
shown as the round to repeat, unchanged, for the whole session — the app
doesn't track how many rounds the athlete actually completes (no
completion logging in v1, by design).

```json
{
  "kind": "quick_workout",
  "format": "amrap",
  "duration_minutes": 7,
  "blocks": [{
    "name": "Circuit", "order_index": 0,
    "exercises": [
      { "name": "Dips", "reps": 15, "order_index": 0 },
      { "name": "Air Squat", "reps": 20, "order_index": 1 },
      { "name": "Push Ups", "reps": 5, "order_index": 2 }
    ]
  }]
}
```

Timer shows: `AMRAP` · counts down from `7:00`.

---

## 2. EMOM

Rotates one exercise per round, in `order_index` order, wrapping around.
A single-exercise block is the degenerate case — every round shows the
same exercise, which is exactly the "same movement every minute" pattern.
`interval_seconds` controls round length (default 60s); the round label
("ROUND X OF Y") counts full *cycles* of the rotation, not raw intervals —
a 3-exercise block run for 9 minutes at the default 60s is 3 cycles, not
9 "rounds."

**Same exercise every round** (interval_seconds omitted → 60s):

```json
{
  "kind": "quick_workout", "format": "emom", "duration_minutes": 12,
  "blocks": [{ "name": "Circuit", "order_index": 0,
    "exercises": [{ "name": "Burpees", "reps": 10, "order_index": 0 }] }]
}
```

**Rotating exercise per round** — minute 1 = Pull-ups, minute 2 = Dips,
minute 3 = Squats, repeating for 3 full cycles (9 minutes):

```json
{
  "kind": "quick_workout", "format": "emom", "duration_minutes": 9,
  "blocks": [{ "name": "EMOM Rotation", "order_index": 0,
    "exercises": [
      { "name": "Pull Ups (Normal Grip)", "reps": 15, "order_index": 0 },
      { "name": "Dips", "reps": 15, "order_index": 1 },
      { "name": "Air Squat", "reps": 20, "order_index": 2 }
    ]
  }]
}
```

**Custom round length** ("every 2 min for 10 min") — set `interval_seconds`:

```json
{
  "kind": "quick_workout", "format": "emom", "duration_minutes": 10,
  "interval_seconds": 120,
  "blocks": [{ "name": "Circuit", "order_index": 0,
    "exercises": [
      { "name": "Dips", "reps": 10, "order_index": 0 },
      { "name": "Pull Ups (Normal Grip)", "reps": 5, "order_index": 1 }
    ]
  }]
}
```

Timer shows: `ROUND X OF Y` · the active exercise's name and rep target
displayed prominently · the full block below, with the active exercise's
row highlighted in the accent color.

---

## 3. Tabata

For each of `rounds` cycles, runs every exercise in the block once (work,
then rest), using **that exercise's own** `work_seconds`/`rest_seconds` —
not a single global split. Omit them for the real, universal 20s work /
10s rest convention; set them per-exercise for anything else (e.g. 40s
work / 20s rest). `rounds` defaults to `duration_minutes*60 ÷ 30` if
omitted, matching the classic-Tabata-timing assumption.

```json
{
  "kind": "quick_workout", "format": "tabata", "duration_minutes": 6,
  "rounds": 3,
  "blocks": [{ "name": "Circuit", "order_index": 0,
    "exercises": [
      { "name": "High Plank", "work_seconds": 40, "rest_seconds": 20, "order_index": 0 },
      { "name": "Air Squat", "work_seconds": 40, "rest_seconds": 20, "order_index": 1 }
    ]
  }]
}
```

Timer shows: `ROUND X OF Y` · `WORK`/`REST` label · the active exercise's
name during WORK intervals.

---

## 4. For Time

Not an interval countdown — a **stopwatch counting up**, athlete-paced
(the app can't detect reps done). If `rounds` is set, shows "ROUND X OF N"
with a "COMPLETE ROUND" button the athlete taps themselves after each
round; the last round's button reads "FINISH" instead. If `rounds` is
omitted, it's a plain uncapped stopwatch with a single "FINISH" button and
no round counter — a real, intentional mode for "just go until you're
done," not a missing feature. If `duration_minutes` is also set, it's an
optional hard cap — hitting it force-finishes and the done screen shows
"TIME CAP" instead of "WORKOUT COMPLETE" so the athlete can tell a real
finish from a capped one.

**Round-tracked, uncapped:**

```json
{
  "kind": "quick_workout", "format": "fortime", "rounds": 3,
  "blocks": [{ "name": "Circuit", "order_index": 0,
    "exercises": [
      { "name": "Push Ups", "reps": 10, "order_index": 0 },
      { "name": "Hanging Leg Raises", "reps": 20, "order_index": 1 }
    ]
  }]
}
```

**Plain stopwatch (no `rounds`, no `duration_minutes`):** just omit both —
the athlete taps "FINISH" whenever they're done.

Timer shows: elapsed time counting up from `0:00` · "ROUND X OF N" if
`rounds` is set, otherwise "FOR TIME" · the done screen shows the real
elapsed time.

---

## Test coverage

`src/components/workoutLibrary/__tests__/QuickWorkoutTimerModal.test.tsx`
covers all 4 patterns with real fake-timer regression tests, including
the exact scenarios that were previously gaps: EMOM rotation across a
full cycle boundary, a custom `interval_seconds`, Tabata reading authored
work/rest values instead of the old hardcoded 20/10, and both For Time
modes (round-capped and uncapped).
