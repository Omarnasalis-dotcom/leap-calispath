# AI Coach — day-by-day-into-one-program evals

**Status:** written test list, not automated. These are conversation-level
behaviors (what the model and the app actually do across a real multi-turn
chat with real taps) — Jest can't drive a live Anthropic conversation or a
live app session, and this repo has no Deno test infrastructure for
anything that needs a live Supabase client either (see `system-prompt.ts`'s
own header comment). Run these by hand against a real (non-prod, or
admin-bypassed) conversation before trusting this flow with real athletes.

**Supersedes:** `docs/archive/ai-coach-direct-build/evals.md` (Direct
Build, a single whole-week `propose_new_program` call — replaced
2026-09-17/18; see `docs/features/ai-coach-flow-history.md`). Cases from
`docs/features/ai-coach-rebuild-plan.md`'s original list that are unrelated
to program building (tier gating, Arabic, safety, weekly review) are still
valid and still apply — not reproduced here.

**Primary worked case, used throughout:** tier 7, 10 strict muscle-ups
(`mu_variant: "strict_mu"`, `mu_reps: 10` in `assessment_raw`), ~30 strict
pull-ups, full equipment, 4 days/week, goal handstand + front lever, also
wants to keep progressing toward the trial. Confirmed structure: Day 1
Pull & Muscle-Up, Day 2 Legs, Day 3 Push (handstand), Day 4 Weighted
Strength.

| # | Case | Passes when |
|---|---|---|
| DD-01 | Primary case, full 4-day build, tapping "Add Day N" on every card | One program, one week (week 1), exactly 4 distinct days in `program_blocks`, no duplicates; each day's numbers are this athlete's own (not a flat default) |
| DD-02 | Structure proposal (step 2 of §11) | One short line per day, real categories, no exercises yet — the athlete confirms or edits before anything is built; the model assigns both named skills (handstand, front lever) to at least 2 different days in the structure it proposes |
| DD-03 | Day 1 card | `propose_new_program` is called with exactly one day's blocks (not a whole week) and the full brief; the card reads "Add Day 1 of 4: Pull & Muscle-Up" (or similar), not "Start Program" |
| DD-04 | Day 2+ card | `propose_add_day` is called with that day's `day_name`, blocks, and the full brief resent (not omitted); the card reads "Add Day N of 4: <focus>" |
| DD-05 | Tap "Change this day" before adding | No RPC fires (check Supabase logs — no `ai_coach_create_program`/`ai_coach_add_block_to_week` call), a local message "Tell me what to change for Day N" appears from the coach with no network delay, and the athlete's next real message drives a rebuild of just that one day |
| DD-06 | Redo an already-added day (e.g. athlete says "actually redo day 2" after days 1-3 are all added) | The rebuilt day_name matches exactly; on confirm, `ai_coach_replace_day_in_week` fires (not `ai_coach_add_block_to_week`); after it, week 1 still has exactly one set of blocks for that day name — no duplicate "LEGS DAY \| Warm-Up" etc. |
| DD-07 | Redo-day label correctness | The model supplies `propose_add_day`'s optional `day_number` (e.g. 2, when redoing day 2 after day 4 has already been added) and the card reads "Redo Day 2 of 4," not "Redo Day 4 of 4" — confirms Fix B's label override actually gets used, not just silently defaulting |
| DD-08 | Skill-coverage warning: structure names a skill but the model doesn't actually assign it two days (a prompt-compliance failure, forced for this test) | On the LAST day's `propose_add_day` call, the tool result's `warnings` array names the under-trained skill and how many days it appeared in; the model does not repeat this to the athlete verbatim (per §1's tool-result-is-internal rule) — it either folds the skill into the last day or mentions the shortfall in its own words |
| DD-09 | Athlete-fit ceiling violation forced (e.g. ask for a hold above the confirmed max) | Same-turn hard tool error naming the exact block and number — this must still reject, not warn (§11: only unknown exercise names and above-max numbers still hard-reject) |
| DD-10 | Athlete-fit floor case forced (e.g. unusually low reps on a tracked pattern, deliberately, for legitimate skill/trial-complex work) | Does NOT reject — appears only as a `warnings` entry the model can judge, per the demoted-to-warning policy |
| DD-11 | Structural auto-repair forced (a circuit block proposed with no `metadata.rounds`, a 2-exercise Cool-Down) | Card still renders — `auto_fixed` in the tool result names what was defaulted/topped up; the athlete never sees an error or any mention of an auto-fix in the chat text |
| DD-12 | `get_program_structure` called before day 1 exists (force this, e.g. by asking "what's in my program?" before confirming day 1) | Either the model doesn't call it yet (correctly, per §11's explicit rule), or if it does, the tool's own "week has no blocks" error is handled gracefully — never a raw crash or a confusing reply |
| DD-13 | App closed after day 2 is added, reopened, athlete says "what's next" | The coach's next `get_user_context`/`get_program_structure` call reflects the real 2-day state; it resumes with day 3, not day 1 again and not confused about what's already there |
| DD-14 | Program Ready celebration timing (Fix A) | The onboarding-redirect / "Program Ready" card does NOT appear after day 1's confirm in a 4-day build — only after the 4th (last) day's confirm; the chat message after day 1 reads like "Day 1 added," not "is live — check your Workout Program" |
| DD-15 | Program Ready celebration on a genuine 1-day build | Fires immediately after that single day's confirm (dayNumber === totalDays === 1) — the gate doesn't accidentally delay a legitimately-complete 1-day program |
| DD-16 | Rate limits, a full 6-day build with one deliberate redo | `ai_coach_create_program` called once (day 1), `ai_coach_add_block_to_week`/`ai_coach_replace_day_in_week` called 6 times total (days 2-6 plus the redo) — comfortably under the raised 10/day shared cap; no `RATE_LIMIT: add_block daily limit reached` mid-build |
| DD-17 | "Add a day" to an already-complete, already-training program, weeks later (§13, unrelated to the initial build) | `propose_add_day` is used (not the old `add_block_to_week` direct-write path); the model reconstructs a reasonable brief from current `get_user_context` data rather than fabricating one — flag this case if it feels forced, since `propose_add_day`'s schema was designed for the initial build sequence, not this reuse |
