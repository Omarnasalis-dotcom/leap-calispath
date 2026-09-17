# AI Coach — build-flow history

Moved out of `supabase/functions/ai-coach/system-prompt.ts`'s header comment
on 2026-09-18, when it had grown to ~320 lines of chronological incident
log sitting above the actual prompt. None of this text was ever sent to the
model (it lives outside the `SYSTEM_PROMPT` template literal) — it's kept
here purely as engineering history: why the build mechanism changed three
times, and the exact live failures behind each round of fixes. The prompt
file itself now carries only a short "current architecture" paragraph
pointing here.

---

## REBUILD (2026-08-26, superseded 2026-09-16)

§11 was rewritten for Match→Clone→Adapt (`docs/features/ai-coach-rebuild-plan.md`,
historical) — search the Workout Library day by day, clone the confirmed
days into a real program, then fit it to the athlete with two more tool
calls. Replaced because the required Adapt pass kept not running in
practice: a cloned library day reached the athlete unadapted (wrong level,
wrong numbers, skill holds above what they could do) often enough that the
control-flow bet — trusting the model to reliably run two more tool calls
on its own judgment, every time, unwatched — stopped being worth it.

## V3-ALIGNMENT (2026-09-16)

Reviewed against `docs/archive/ai-coach-v3/` (a design spec + a reference
prompt written without knowledge of the rebuild above; its build-from-
scratch-only flow and its timing_system/structure mixup were deliberately
not imported — the 4-timing-system, ladder-is-a-structure model was already
correct). What actually changed, net:
- No em dash anywhere the athlete sees text (§3, §18, every example).
  Program name separator switched to "·".
- Level bands (§7) tying tier ranges to exercise_library difficulty, with
  matching dose/structure modifiers (§16) and a session-length table (§8).
- Non-skill variation ladders + selection guardrails (§9) — Lever C now has
  a real "next step" for ordinary strength work, not just skills.
- Planche corrected to its real structure: a Lean Hold prerequisite, then a
  Tuck/Advanced Tuck/Straddle/Full grid (§8). Its Push Ups method isn't in
  the library yet — see `supabase/prepared/planche_library_correction.sql`.
- Per-day variety (no day where every block is straight_set+single) — a
  hard reject at the time. At the time this was written it was also a
  required manual check during Match→Clone→Adapt's clone step — that flow
  is gone (see below), and this later became an auto-repair (2026-09-17).

## DIRECT BUILD (2026-09-16)

§11 rewritten again. `propose_new_program` became the main path: every
block written fresh, adapted to this athlete from the first draft, checked
against their real numbers before it could even be proposed.
`propose_program_from_workouts` was narrowed to an athlete explicitly
naming a specific library workout they want as-is.

- Build brief (`BUILD_BRIEF_SCHEMA`, `tools/blockHelpers.ts`) — goal,
  skills (each with a confirmed checkpoint exercise and confirmed max
  hold/reps), trial_focus, days_per_week, split_days, equipment, pacing —
  became a required `propose_new_program` input, validated by
  `validateBuildBrief` (same-turn error naming the exact missing field).
  `save_build_brief` existed for an earlier "here's what I'll build" check
  but was never the gate — `propose_new_program` re-validated the same
  brief itself, every time.
- Athlete-fit checks (`validateAthleteFit`) — the handler fetches
  `assessment_raw` and recent `workout_set_logs` itself, never trusting a
  model-reported number: no band cue on Muscle Up once the athlete has 3+
  strict reps, no unassisted Pull Ups (Normal Grip) at 0, a skill's
  hold/reps target never at or above its confirmed max, reps on a tracked
  pattern never at or above the athlete's tested max, weighted work needs a
  real number once one is known from logs.
- rounds → sets "1" (`validateBlockStructure`) — a previously-confirmed,
  long-standing gap (the schema documented it, nothing enforced it) became
  a real same-turn check.
- `validateSplitCoverage` — every day FULL_BODY at 1-2 days/week, every
  split of 3+ days/week trains Legs somewhere (later rewritten again as a
  warning — see "Day-by-day rebuild" below).
- `tools/replyCleanup.ts`'s `sanitizeReply` — server-side backstop for §1
  (never narrate a tool step as text) and §3 (no em dash).

## POST-SHIP HARDENING (2026-09-16, same day)

Two real 4-day/2-skill builds failed live at "low" effort, each burning
~50 cents in what looked like repeated full-payload retries —
`propose_new_program` validated the ENTIRE program atomically, so any one
miss anywhere forced a full, expensive regenerate. Response, same day:
- Effort "low" → "medium" — unconfirmed whether this alone fixed it.
- `max_tokens` 16000 → 32000 — insurance against a known silent-truncation
  bug at a larger payload size.
- §11 gained an explicit "check every rounds-bearing block" reminder.
- `validateSplitCoverage` cross-checked `brief.days_per_week` against the
  real distinct day count (was unvalidated).
- `validateBlockStructure` rejected a stray `metadata.rounds` on a
  "single" structure block (was unvalidated).

Not done in this round: the real structural fix (per-day incremental
validation instead of one atomic whole-program call) — deferred until
confirming these cheaper fixes didn't already resolve it. They didn't; see
ROUND 3 below.

## ROUND 2 (same day, after a real 2-day build)

A tier-7 athlete with 30 real pull-ups got a 6/8/10 pull-up ladder — the
BEGINNER band's own numbers, not this athlete's — and Muscle-Up work
landed after a high-volume Pull Ups block with no skill goal declared at
all. Neither was a validated ceiling violation (both were BELOW the
athlete's tested max, just absurdly far below), so nothing caught them.
- `validateAthleteFit`'s tracked-pattern check gained a floor, not just a
  ceiling: reps under 50% of tested max (outside Warm-Up/Cool-Down) read
  as the wrong level band's numbers.
- The weighted-work check stopped only firing when logged history existed
  — `is_weighted:true` always needed a real number in notes, even a
  first-time estimate.
- §8's freshness-first skill-ordering rule explicitly applied to any
  technical/CNS-demanding movement whenever it appeared at all, not only
  when formally declared as the goal.

## ROUND 3 (same day)

The SAME 4-day/2-skill build failed AGAIN (`FunctionsFetchError`, then
"stream ended with no reply") despite rounds 1-2's tightening — this was
never really a correctness-rate problem, it was that `propose_new_program`'s
atomic, no-partial-resend design meant ANY single miss anywhere in a
~32-block payload forced a full regenerate, and a few of those in a row
ran long enough to hit what looked like a platform wall-clock timeout.
- New tool `add_program_day` (later removed, 2026-09-17) — validated and
  staged ONE day's blocks at a time. `propose_new_program`'s `blocks`
  became optional — when omitted, the program assembled from whatever was
  staged (`resolveProgramBlocks`, also later removed). A mistake on day 3
  cost re-staging day 3 alone, not regenerating all four days.
- `tools/types.ts`'s `ToolDefinition.handler` gained a third `context`
  parameter (a per-HTTP-request draft, later also removed).
- Scoped deliberately to in-request staging only: covered direct build and
  the no-questions override, NOT day-by-day pacing's cross-turn case (each
  day was a separate HTTP request) — that gap was what the 2026-09-17
  day-by-day rebuild (below) actually solved, by making every build call
  exactly one day regardless of pacing.

## ROUND 4 (same day) — the actual root cause

Round 3's staging fix deployed and the same build failed a THIRD time,
slightly slower, not faster — proof the "reduce retry cost" theory was
wrong. Pulled real Edge Function logs and found this repeating on every
single `propose_new_program` attempt: `TypeError: Cannot read properties
of undefined (reading 'toLowerCase')` at `nameIs`, called from
`validateAthleteFit`'s skill-checkpoint filter.

Root cause: `validateBuildBrief` validated the model's real snake_case
fields but then did `return b as unknown as BuildBrief` — a type CAST, not
a transformation. `SkillFitCheckpoint`'s interface declared camelCase,
which never existed on the real object — `skill.checkpointExercise` was
silently `undefined` on every call, and `nameIs(ex.name, undefined)`
crashed. This fired on the FIRST `propose_new_program` attempt for ANY
skill-goal build, every time, with zero chance of ever succeeding — a raw
`TypeError` isn't something the model can act on like a normal tool error,
so it just kept trying until `MAX_TOOL_TURNS` or a platform timeout killed
the request. Rounds 1-3's effort/max_tokens/validator changes were chasing
this without ever being able to touch it.

Fix: `validateBuildBrief` now actually transforms each skill entry into
`SkillFitCheckpoint`'s real shape instead of casting. `nameIs` hardened
defensively on both arguments. Two regression tests added.

## DEEP AUDIT (same day, before testing again)

Re-read every file in the build path hunting for the same bug class (a
silent field/type mismatch hidden behind an unsafe cast) plus dead code
and duplication. Found and fixed one gap: `addProgramDay.ts` never checked
that the blocks it was given actually belonged to the `day_name` it was
staging them under. `getBlockParts` was exported from `blockHelpers.ts` so
it could cross-check directly. No other instance of the ROUND 4 bug class
found. One known, pre-existing inefficiency left alone at the time:
`propose_new_program` resolved exercise names twice (once for validation,
again in `index.ts`'s `buildProgramAction` for the client payload) — fixed
later, 2026-09-17, as part of the day-by-day rebuild.

## ROUND 5, next real test after the crash fix

The crash was confirmed GONE. But a new bug surfaced: the reps floor/
ceiling check (ROUND 2) compared WEIGHTED Pull Ups/Dips against the
athlete's BODYWEIGHT tested max and rejected 6 reps as "well below" it — 6
reps of a heavily weighted pull-up is completely normal programming.
Cost 2 wasted retries; the request ran 117s across 12 turns before being
killed with no final reply, consistent with a platform wall-clock timeout.

Fix: skip any exercise with `is_weighted:true` in that check entirely,
both floor and ceiling. Also exempt via the BLOCK-level
`metadata.is_weighted`, not just the exercise-level flag — the live
failure happened on a block literally named "WEIGHTED STRENGTH DAY."

Before the next test, a full 4-day INTEGRATION test was built in
`blockHelpers.test.ts` matching the primary live case byte-for-byte,
running every validator together, not in isolation. Library reality check
at the same time: `docs/features/ai-coach-rebuild-plan.md`'s "3 workouts,
all PUSH-focused" figure was stale — 32 published by then.

## MATCH + EDIT-IN-PLACE (2026-09-16)

After ROUND 5's integration test still passed and the live build STILL
failed a third real time on a platform timeout with no new code bug found,
the actual pattern across rounds 1-5 was that every fix was a validator
patch reacting to one more way a from-scratch day could be wrong — never
addressing why the model was inventing an entire day's structure from
nothing in the first place, the single largest source of retryable
mistakes. Reverted the mechanism, not the validators: §11/§8 made
"search_workouts → get_workout_detail → edit the exact returned structure
in place" the primary path again, writing from a blank page only when
nothing usable matched. Zero validator/tool changes — this was a
prompt-only change. Not tested live before the next rebuild superseded it.

## DAY-BY-DAY REBUILD (2026-09-17 to 2026-09-18)

A live day-by-day test succeeded, and a full whole-week build failed again
on the 150s platform timeout the same day — direct evidence that a
single-day-at-a-time build is the actually-reliable shape, not a validator
tuning problem. Whole-week building was removed entirely:

- `propose_new_program` now proposes exactly ONE day (day 1); every day
  after goes through the new `propose_add_day` tool, confirmed into
  `ai_coach_add_block_to_week` (a new day) or the new
  `ai_coach_replace_day_in_week` RPC (redoing a day already added — the
  old RPC hard-rejects that name collision by design). Both RPCs share one
  raised rate bucket (5 → 10/day) for a 6-day build's headroom.
- `add_program_day`, `save_build_brief`, `RequestContext`/`ProgramDraft`,
  and `resolveProgramBlocks` — all existed only for whole-week staging —
  removed once nothing built more than one day per call anymore.
- Validator policy changed: only an unknown exercise name hard-rejects.
  Ceiling/band-cue checks stayed hard rejects (no false-positive history).
  The reps-floor check and split/Legs-day coverage became warnings
  (`warnSplitCoverage` checks the declared plan's categories, not blocks —
  the old per-block version couldn't run against a single day at all). A
  day-variety auto-repair (convert the Accessories block to a superset)
  replaced that case's hard reject.
- A skill-coverage warning (`warnSkillCoverage`) was added: when it looks
  like the last day of the confirmed structure, warns if a named skill
  appears on fewer than 2 days — never a rejection.
- `index.ts`'s `buildProgramAction` collapsed the duplicate exercise-name
  resolution (tools now return `resolved_blocks`) and does its own
  trusted, fresh query to decide add-vs-replace and the card's day
  number — never the model's own claim.
- CoachScreen.tsx: day 1 and day 2+ share one card ("Add/Redo Day N of M"
  / "Change this day," the latter a canned local message, no server
  call). The "Program Ready" celebration/onboarding redirect, which used
  to fire on every `propose_new_program` confirm, was gated to only fire
  once `dayNumber === totalDays` (the trusted value) — day 1 of a 4-day
  build no longer interrupts itself.
- One known cosmetic gap, partially addressed: a redo's day-count label
  is a running total, not necessarily its true structural position.
  `propose_add_day` gained an optional `day_number` the model can supply
  from the confirmed structure for the LABEL only — never affects the
  add-vs-replace decision, which stays server-derived.
