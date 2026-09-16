# AI Coach — Direct Build evals

**Status:** written test list, not automated. These are conversation-level
behaviors (what the model actually does across a real multi-turn chat) —
Jest can't drive a live Anthropic conversation, and this repo has no Deno
test infrastructure for anything that needs a live Supabase client either
(see `system-prompt.ts`'s own header comment). Run these by hand against a
real (non-prod, or admin-bypassed) conversation before trusting Direct
Build with real athletes.

**Scope:** supplements `docs/features/ai-coach-rebuild-plan.md`'s original
18 evals (tier gating, Arabic, safety, weekly review, etc. — all still
valid, still apply). This list covers only what's new in the 2026-09-16
Direct Build pass: the build brief, the athlete-fit checks
(`validateAthleteFit`), split coverage, and the rounds→sets rule. Evals
13–18 in the original doc specifically targeted Match→Clone→Adapt and are
now superseded by DB-01 through DB-04 below (the architecture they tested
no longer exists as the main path).

**Primary worked case, used throughout:** tier 7, 10 strict muscle-ups
(`mu_variant: "strict_mu"`, `mu_reps: 10` in `assessment_raw`), full
equipment, 4 days/week, goal handstand + front lever, also wants to keep
progressing toward the trial.

| # | Case | Passes when |
|---|---|---|
| DB-01 | Primary case, direct build, day-by-day pacing | Each day is presented already adapted (real ladder/dose for tier 7, not a flat beginner default) — never a plain-text copy of a library day |
| DB-02 | Primary case, direct build, "direct" pacing | Card renders with all 4 days on the first proposal, no walkthrough messages in between |
| DB-03 | Athlete explicitly asks for a named library workout as-is | `propose_program_from_workouts` is used (not `propose_new_program`), no adaptation claimed in the accompanying text |
| DB-04 | Athlete does NOT ask for a specific library workout | `propose_program_from_workouts` is never called; `search_workouts`/`get_workout_detail`, if used at all, are for style reference only — no block content copied verbatim into the proposal |
| DB-05 | Build brief missing a field (e.g. no `pacing` recorded before proposing) | `propose_new_program` is rejected server-side naming the exact missing field, in the same turn — the model reacts to it, not a broken/empty reply |
| DB-06 | Skill goal named, checkpoint given, but no max hold/reps ever confirmed | Model asks for the max before proposing — never sends a guessed number as if confirmed, never proposes with the field silently omitted |
| DB-07 | Primary case (10 strict muscle-ups), Muscle Up appears in the program | No band-assistance cue anywhere on Muscle Up — real, unassisted programming |
| DB-08 | Tier 1 athlete, 0 pull-ups, program includes pull work | Never programs unassisted "Pull Ups (Normal Grip)" as main work — uses Banded Pull Ups or an earlier §9 ladder step |
| DB-09 | Primary case, handstand checkpoint = Free Handstand, confirmed max hold 25s | Every Free Handstand hold in the program is ≤ 25s, never at or above it |
| DB-10 | Skill checkpoint confirmed as (e.g.) Tuck Front Lever Hold | The program actually uses that exact exercise name somewhere — never a different step in the line substituted silently |
| DB-11 | Athlete's tested max on a tracked pattern (e.g. 10 dips) | No block prescribes reps at or above 10 for Dips — always below their tested max |
| DB-12 | Weighted exercise with a real logged `weight_used` from history | A real number appears in that exercise's notes (per §18's phrase bank) — never a bare "+load" |
| DB-13 | Weighted exercise with NO logged history at all (brand-new lift) | Model asks the one question before proposing, rather than guessing a starting weight silently |
| DB-14 | 1-day or 2-day build | Every session is FULL_BODY — never an isolated Pull-only or Push+Pull split that drops Legs for the week |
| DB-15 | Primary case (4 days/week) | At least one day trains Legs (own day or folded in per §15) — never a Pull/Push/Skills-only split |
| DB-16 | A circuit or ladder block anywhere in the program | Every exercise in that block has `sets: "1"` — never a number that double-counts the block's own `rounds` |
| DB-17 | "Don't ask me anything, just build it" override, primary case | Brief still ends up complete — missing pieces (e.g. checkpoint hold) are stated as an explicit assumption in one line, never silently guessed or silently omitted |
| DB-18 | Reason text / confirmation-card copy for any successful proposal | States something real and specific already true of the program (e.g. "pull-ups run 22/18/14") — never a promise that fitting happens after the athlete taps Start |

## Notes for whoever runs these

- DB-07 through DB-13 are the direct behavioral tests of `validateAthleteFit` — if any of them fail, check whether the *model* skipped confirming the number, or the *validator* let a bad value through (different bugs, different fixes).
- DB-16 is a genuinely new server-side rule (`blockHelpers.ts`'s `validateBlockStructure`, 2026-09-16) — before this pass, a rounds-based block with mismatched `sets` silently passed.
- If DB-01/DB-02 show a cut-off or truncated reply, capture the real `logTurn` line from the Edge Function logs (`turn=`, `stop=`, `out=` token count) before assuming `max_tokens` is the cause — a 4-day advanced program's JSON is estimated at ~3,500–5,500 output tokens, well under the current 16000 ceiling, so a truncation there would point to something else worth investigating directly rather than just raising the limit.
