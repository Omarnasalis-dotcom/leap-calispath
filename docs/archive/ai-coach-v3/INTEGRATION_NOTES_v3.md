# Leap AI Coach v3: Integration Notes for the Code Agent

These notes go with `system-prompt.ts` (v3, 2026-09-15). The file replaces the
v2 `SYSTEM_PROMPT` export in `supabase/functions/ai-coach/system-prompt.ts`.
It keeps the same export name, the same tool names and the same part structure
as v2, so swapping the file is the minimum change. The work below makes each
of its instructions actually true.

---

## 1. Tool contract the prompt assumes

| Tool | Type | Prompt sections | What the prompt expects |
|---|---|---|---|
| `get_user_context` | read | 2.1, 2.2, 4.x | `strength_tier`, `next_trial` (live requirements), goals, training days, `assessment_raw`, `active_program { warrior_program_id, current_week, is_ai_coach_owned }` |
| `get_workout_logs` | read | 4.3, 4.4, 4.5 | Per block: exact `day_name` / `block_name`, `block_exercise_id`, `exercise_id`, `status`, `feel`, `rpe`, `missed_reason`, `missed_detail`, `notes`, `sets[] { reps_completed, weight_used, hold_seconds }`; plus `bodyweight_trend` and last week's `coach_week_note` |
| `search_exercises` | read | 3.3, everywhere | Returns exact `name` + `exercise_id` from the live `exercise_library` |
| `propose_new_program` | card | 4.2 | Program name + week 1 blocks |
| `append_week` | write | 4.3 | `warrior_program_id`, blocks, `removed_block_names`, `coach_week_note` |
| `adjust_program` | write | 4.5 | Targets by `block_exercise_id`; any existing week |
| `add_block_to_week` | write | 4.6 | `warrior_program_id`, `week_number`, blocks; rejects duplicate names |
| `propose_end_program` | card | 4.7 | reason |
| `propose_delete_week` | card | 4.7 | week number + reason; refuses if logged or last week |
| `recommend_test` | card | 4.9 | trial recommendation |

If any of these differs in your codebase, change the tool name or field in the
prompt, not the behavior.

---

## 2. New in v3: what the backend needs

### 2.1 Progress Recap (§4.4): **required**
`get_workout_logs` must accept a range, not only the current week:

```
get_workout_logs({ warrior_program_id, from_week?, to_week? })
```

The prompt defaults to the last 4 weeks. If you would rather not return raw
logs for 4 weeks (token cost), add a `get_progress_summary` tool that returns,
per exercise, the first and last logged sets, reps, weight and hold, plus
sessions done vs planned and the missed reasons. Then change §4.4 Step 1 to
call that tool instead.

### 2.2 Routing change (§2.2)
In v2, "how am I doing" went to Weekly Review. In v3 it goes to Progress Recap,
which is read-only. Weekly Review now runs only when a week is finished or the
athlete asks for the next week. If the app sends a system nudge when a week
finishes, word it as "week N complete, run the weekly review" so the router
picks §4.3.

### 2.3 Language (§1.2)
Replies mirror the athlete's language (Egyptian colloquial for Arabic).
Render chat bubbles and `coach_notes` with `dir="auto"` so mixed Arabic text
with English exercise names displays correctly.

### 2.4 coach_notes validation (§5.8): recommended
The prompt limits Arabic to two fixed tables. Enforce it server-side in
`append_week` / `propose_new_program` / `add_block_to_week`:

- Reject or strip any `—` (U+2014) in `coach_notes`.
- If `coach_notes` contains Arabic characters (`/[؀-ۿ]/`), check that
  it matches one of the Table A / Table B templates (numbers and the bracketed
  body-part word may vary). If it does not match, set it to `""` and log it
  so the coach can add a new phrase-bank row.

Keep the phrase list in one shared constant so the prompt and the validator
cannot drift apart.

---

## 3. Carried over from the v2 audit: check the status of each

The prompt tells the model to use every item below. If one is **not live**,
delete or edit the listed lines so the model does not act on a field that
does not exist.

| # | Backend item | If NOT live, edit these prompt lines |
|---|---|---|
| B1 | CONCEPT field table moved into the tool JSON schemas | Nothing to delete. Once it IS live, delete the field tables in §5.9 and keep only the judgment rules (types, is_weighted levels, carry-forward). |
| B2 | `timing_system` enum confirmed against `BlockConceptParser.ts` | §5.3 and §5.9 list five values including `ladder`. Match the code. |
| B3 | `coach_week_note` param on `append_week` + returned by `get_workout_logs` | §4.3 Step 1 (read it) and the "Write your reasoning into coach_week_note" paragraph; §5.8 Rule 2 (log the gap) |
| B4 | `pending_proposal`, `cooldown_until`, `assessment_raw.captured_at` in `get_user_context` | §1.1 "One pending proposal" (keep, but the model can only use chat history); §4.1 eight-week staleness check; §4.9 add "not during a cooldown" once live |
| B4b | `missed_reason` / `missed_detail` in `get_workout_logs` | §4.3 Step 2 first paragraph; §4.4 "excluding real missed_reasons" |
| B5 | Block exercise auto-creation for the AI coach RPCs | **Do this regardless.** The week import resolver creates a new `exercise_library` row when a name does not match. The athlete-facing coach must not have that ability. Make the AI-coach RPCs fail on an unknown name and return the closest matches. |
| B8 | Server-side state injection (tier, program, pending proposal, last 7 days, last note) prepended every turn | When live: delete §2.1 entirely and every "call get_user_context first / re-fetch" line in §4.3 Step 4, §4.4 Step 1 and §4.5. Keep the rule "take block names from the logs". |

---

## 4. Exercise library issues found while writing v3

The prompt copies names exactly, misspellings included. These rows will cause
confusion until cleaned up with a DB migration (then update §3.2, §3.3 and
§5.6 to match):

- **Duplicates:** `Deadlift` (LEGS and PULL), `Inchworm` / `Incworm`,
  `archer push ups` / `Archer Push UPs`, `Pike push up` / `Pike Push Ups`,
  `Seated Hip Felxors raises` / `Seated Hip Flexors raises`,
  `Pull ups (Normal Grip ) #bodyweightexercises` (junk copy of
  `Pull Ups (Normal Grip)`).
- **Misspellings the model must copy:** `Adance tuck Front Lever Hold`,
  `Pesudo push ups`, `Pusedo Planche Push Ups`, `Elvated Pike Push Ups`,
  `Asisted …` (4 rows), `Hanging Leg Rasies`, `Childe Pose`,
  `Bulgarin Lunges`, `Bulgarin Jumping Lunges`, `Russion Twist`,
  `pigoen Stretch`, `Flooe I Raise`, `Frog Gluts Bridg`,
  `Single leg Glutes Bridg`, `Banaded Shoulder Press`, `I, Y, T Rasies`,
  `Decline Dimond Push Ups`, `Incline Dimond Push Ups`.
- **Uncategorized:** `Treadmill (Steady)`.

`search_exercises` should do case-insensitive and fuzzy matching, but return
the stored string exactly.

---

## 5. Coach decisions still open (ask Omar before relying on these)

1. **Planche grid.** v3 treats Planche as positions Tuck → Advanced Tuck →
   Straddle → Full, with methods Lean Hold → Lean → Press, and places
   `Tuck Planche` (the hold) between `Planche Lean` and `Tuck Planche Press`.
   The Planche audit in `skill_progression_corrections_v1.md` was never
   finished, so confirm this order.
2. **Handstand order.** v3 uses the coach's corrected order (Wall Handstand
   hold second, Free Handstand last). The library still rates
   `Wall Handstand hold` intermediate and `Belly to Wall Handstand Hold`
   beginner, which does not match that order.
3. **Weighted Strength day gating.** Still gated to 4+ day splits and to
   athletes doing unassisted Dips and Pull Ups (same as v2). Change §5.6 if
   the coach wants it in every program.
4. **Legs day 20kg.** Kept as the coach's standard load, changed only when
   the logs show it was clearly easy or too hard (using the phrase bank).

---

## 6. Evals: run before and after deploying

Keep the 16 cases from the v2 changelog (update case 10). Add these:

| # | Case | Passes when |
|---|---|---|
| 10 | Whole conversation in Arabic | Whole reply in Egyptian colloquial; exercise names kept exactly as in the library |
| 17 | "How am I doing?" with 4 weeks of logs | §4.4 format; every number traceable to the logs; no write tool called |
| 18 | "How am I doing?" with only 1 logged session | Says data is thin in one line, still gives a partial recap |
| 19 | Unchanged block in the weekly build | `coach_notes` is `""` |
| 20 | Weighted block logged "easy" at 10kg | Note is exactly the Table B "easy" line with X=10 and a real Y |
| 21 | Situation with no phrase-bank row | `coach_notes` is `""`; gap mentioned in `coach_week_note` |
| 22 | Any output | No `—` in chat text or coach_notes |
| 23 | Athlete at Tuck Front Lever Hold, clean | Next step is Tuck Front Lever Press (same position, next method), not Advanced Tuck |
| 24 | Athlete asks for "Handstand Hold" | Resolved to a real library name from the §3.2 handstand line |
| 25 | Recap shows a flat lift | Phrased as "holding", never "dropping" |
