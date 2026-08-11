# Full-Repo Audit — Prioritised Task List

**Run:** 2026-08-10 · **Target:** v1.1.7 · Android versionCode 6
**Scope:** 15 partitions · ~460 files · mobile app, `admin-web/`, Supabase backend, native config, repo root. `docs/` deliberately excluded (code/config only).
**Status:** ✅ All partitions complete. **13 fixes shipped** (H1, H2, H3 + 10 earlier). Remaining items below.

> **✅ No production exposure outstanding.** The C4 privilege-escalation fix is applied to prod (migration `20260810120000`, confirmed present in the remote column of `supabase migration list`).

---

## How to use this document

Work top-down. Each item has a stable ID (`H1`, `M3`…) so it can be referenced in commits and issues. Every finding was verified against actual file content — nothing here is speculative pattern-matching.

| Priority | Meaning | Count |
|---|---|---|
| **P0** | Production is exposed right now | 1 |
| **P1** | Corrupts user data or crashes the app | 5 (+3 fixed) |
| **P2** | Wrong behaviour users will notice | 12 |
| **P3** | Cleanup, consistency, dead code | 14 |

---

## P0 — ✅ Closed

### ~~P0.1 · Apply the C4 migration to production~~ ✅ DONE

`supabase/migrations/20260810120000_validate_initial_assessment_tier.sql` is applied to prod. Any authenticated user could previously call one RPC and permanently become tier 9 — unlocking Static World, Power World and Champions Arena. The tier is now derived server-side from raw reps; the legacy signature was retained (range-checked 0..7) so shipped v1.1.7 builds keep working.

Verified by 6,480 parity cases plus a live Postgres run: `p_tier: 9` and `999` rejected, legitimate submissions score identically.

**Open question — historic data.** A check for pre-existing abuse was inconclusive. Six accounts sit at tier 8-9, but the obvious detector is useless: **`trials_passed` is never incremented anywhere in the codebase** (declared `default 0`, referenced only in trigger-protection lists and a view), so it reads 0 for legitimate trial-passers too. All six predate the Play Store release and five cluster within ~2 hours on 2026-05-04 — consistent with dev-era seeding rather than exploitation. To actually check, join against `trial_history`, which is what tier 8-9 progression writes to:

```sql
SELECT p.display_name, p.strength_tier, p.assessed_at,
       count(t.id) AS trial_attempts, max(t.tier) AS highest_tier_attempted
FROM profiles p
LEFT JOIN trial_history t ON t.user_id = p.id
WHERE p.strength_tier >= 8
GROUP BY p.id, p.display_name, p.strength_tier, p.assessed_at
ORDER BY p.assessed_at DESC;
```

A legitimate tier-8 user has attempts at tier 7+. Zero attempts means the tier arrived some other way. Separately: **`trials_passed` should either be wired up or dropped** — right now it is a column that looks meaningful and is always 0.

---

## P1 — Data corruption & crashes

### ~~H1 · "For Time" logs a perfect score for a workout that never happened~~ ✅ FIXED
`src/components/coaching/ForTimeInlineTimer.tsx` · `AmrapInlineTimer.tsx` — commit `ef9a12f`
LOG WORKOUT is now disabled until the timer has run (reads "START THE TIMER FIRST"), a sub-20s uncapped finish asks for confirmation naming what will be recorded, and a synchronous ref blocks double submission. AMRAP got a proportionate guard — it understates rather than inflates — confirming when the timer is still running or the result would be zero.
**Not unit-tested:** no component-testing library exists in this project (tests are pure-logic by design). Worth exercising manually on the next build.

### ~~H2 · Champions Arena timer isn't wall-clock anchored~~ ✅ FIXED
### ~~H3 · A completed arena result can be silently discarded~~ ✅ FIXED
`src/screens/ArenaWorkoutScreen.tsx` — commit `95d5898`
Timer now derives elapsed time from a `Date.now()` anchor (plus an AppState listener that recomputes on foreground), so backgrounding no longer under-counts the score that goes to the worldwide leaderboard. Both save-failure paths now tell the user the attempt was not recorded, report to Sentry, and skip the celebration — which is reached only when the result actually persisted.
**Not unit-tested:** no component-testing library in this project. Worth exercising manually, including a background/foreground cycle mid-trial.

### H4 · Collapsing a block destroys a running workout
`src/components/coaching/WarriorBlockCard.tsx:69-73`
Inline timers are gated on `isExpanded` and hold state locally. Tapping the block header — a large target directly above the timer — unmounts them, wiping elapsed time, rounds, ladder rung and extra reps. No warning, no persistence.

### H5 · Three Modals swapped in a single commit → likely the production Fabric crash
- `src/components/profile/EditProfileModal.tsx:87 + :198` (strongest candidate)
- `src/screens/coaching/WarriorProgramScreen.tsx:1356/1366, 1369/1379, 1382/1393`
- `src/screens/OneMinMaxScreen.tsx:650-658`

Each dismisses one native Modal and presents another in the same render. **The codebase already knows this is dangerous** — `WarriorTimerModal.tsx:415` renders its warning as a child `View` "without nested Modals", and `PBOverwriteConfirmModal`/`BonusTaskWheel` carry the same iOS-freeze note. These are the top suspects for the live `ReactClippingViewManager.addView` "child already has a parent" crash (24 users / 31 events).
→ Defer the second modal to `onDismiss`, or swap inner content within one Modal.

### H6 · `TournamentTrialScreen` auto-submits score 0, then loops forever
`src/screens/TournamentTrialScreen.tsx:101-128`
The interval's deps omit the score state, so `handleSubmit` closes over the initial zeros — a 10-minute AMRAP with 7 logged rounds submits `0`. Nothing clears the interval on that path, so a failed submit re-fires **every 500 ms indefinitely**, hammering the DB and stacking alerts. *(V2-locked feature, but the code is live.)*

### H7 · `TierLeaderboardList` `getItemLayout` reports the wrong row height
`src/components/profile/TierLeaderboardList.tsx:283`
Declares `length: 73`; `entryRow` is `minHeight: 52` + `marginBottom: 5` = **57px**. The error compounds (~320px off by row 20), breaks `initialScrollIndex` so "SEE MORE" never lands on the user's row, and feeds wrong clip/unclip decisions on Android — a documented path into the same `addView` crash.
→ `length: 57`, or drop `getItemLayout`.

### H8 · Admin cascade delete reports success while partially failing
`src/screens/AdminTournamentScreen.tsx:373-379`
Four sequential deletes, **not one** `{ error }` inspected, and the function hard-codes `error: null`. If RLS denies the session delete but permits the first two, every participant and match row is destroyed, the session survives, and the admin is told "Tournament removed successfully".

---

## P2 — Wrong behaviour users will notice

### M1 · Invite code permanently burned on every email-confirmation signup
`src/screens/AuthScreen.tsx:316-333`
After `signUp()` there's no session, so `authData.user` is null and the redeem block is skipped — but this is the *success* path, so the release at `:347` never runs either. The code is left reserved forever: not redeemed, not released. Silently drains inventory.

### M2 · Invite codes generated with `Math.random()`
`src/screens/AdminTournamentScreen.tsx:68-70`
These grant trial and **lifetime** memberships. Hermes' PRNG is non-cryptographic and its state is recoverable from a few outputs, so seeing a handful of issued codes lets an attacker predict the rest of a batch. Also `.substring(2,10)` can yield <8 chars, and the batch insert is atomic so one collision fails all 50.
→ `expo-crypto`'s `getRandomBytes`.

### M3 · `chat-gemini` has no rate limiting (server) and AsyncStorage-only quota (client)
`supabase/functions/chat-gemini/index.ts` · `src/screens/CoachScreen.tsx:105-121`
`DAILY_LIMIT = 10` is tracked client-side and the cooldown is React state; clearing app data resets both. There is **no server-side throttle**. Any authenticated user can bill your Gemini key in a loop.

### M4 · Weekly challenge scores are self-reported and unbounded
`src/screens/WeeklyChallengeScreen.tsx:944-1026`
"SKIP TIMER — ENTER MANUALLY" bypasses timing entirely; `calculatePointsFrom` multiplies free-text rounds with no cap. Unlike Static/1MM/Power (`P1001-P1004` server ceilings) and Trials (edge-function floors), no server-side sanity bound exists.

### M5 · `StaticWorldScreen` crashes on a null `display_name`
`src/screens/StaticWorldScreen.tsx:552, 657, 1072` ← `src/services/StaticService.ts:175`
`StaticService` is the only service that doesn't coalesce to `'Warrior'` (`PowerService` and `OneMMService` both do). One null name crashes the Static Mastery modal and level leaderboard into the error boundary.

### M6 · `ExercisePickerModal` crashes the whole picker on a null field
`src/components/coaching/ExercisePickerModal.tsx:135`
`item.category.toUpperCase()` unguarded, while line 59 guards the identical field with `?.`. One bad library row takes the picker down for every coach.

### M7 · Post-save refresh failure reported as a save failure
`src/screens/StaticWorldScreen.tsx:262-270`
The refresh calls sit inside the same `Promise.all` *after* `saveHold` succeeded, so a blip shows "Failed to save hold — Try Again". The user resubmits an already-saved hold and hits the `P1004` cooldown error.

### M8 · "Replace your active program" warning vanishes on a transient error
`src/screens/TemplateRecommendationsScreen.tsx:81-92`
The query ignores `error`, making a failure indistinguishable from "no active program", so both the banner and the switch warning are suppressed. The code comment explicitly claims it distinguishes these — it doesn't.

### M9 · `BlockConfigWizard` silently rewrites saved metadata on mount
`src/components/coaching/BlockConfigWizard.tsx:42-84`
Fires `onChange` before the coach touches anything, rebuilding the payload from scratch rather than spreading `initialMetadata` — so unknown keys are dropped. Merely *expanding* a legacy block discards `type`. **Consequence:** the superset/circuit warnings at `BuilderBlockCard.tsx:143/150` test `metadata?.type`, which the wizard never writes — both are now dead code.

### M10 · Destructive actions missing confirmation
- `BuilderDayCard.tsx:239` — DELETE DAY removes a day and all its blocks/exercises. No autosave, no unsaved-changes guard, so the only undo is abandoning the session. **Inconsistent** — four other deletes in the same hook do confirm.
- `BuilderBlockCard.tsx:245` — delete block, same.
- `ClientDashboardScreen.tsx:119` — DELETE WEEK's dialog doesn't mention it destroys the client's **logged workout history** (the RPC deletes `workout_logs` first).
- `WeeklyChallengeScreen.tsx:173-201` — native gets a weaker message than web, and the `Alert.alert` promise has no `onDismiss`, so an Android back-press leaves it pending forever.

### M11 · Coach-facing failures are invisible in production
`console.error`-only catches, with `console` stripped in release builds:
`ProgressTrackingScreen.tsx:306,348,380,413` · `MyClientsScreen.tsx:248` · `ProfileScreen.tsx:329,355,361,367` · `WeeklyChallengeScreen.tsx:132` · `ChampionsArenaScreen.tsx:56` · `OneMinMaxScreen.tsx:149`
Worst case: a failed fetch renders **"NO WORKOUT LOGS RECORDED YET"**, indistinguishable from a genuinely inactive client. Now that Sentry is wired in, these should report.

### M12 · Week-note race destroys the wrong week's note
`src/screens/coaching/ProgressTrackingScreen.tsx:329-362`
No request sequencing on `selectedWeek` change; a slower earlier response lands last, leaving the previous week's row id in state. The coach then saves week-2 text over week 1.

---

## P3 — Cleanup & consistency

### Light-mode regressions
- **L1** — Filter/scope chips use `rgba(255,255,255,0.05)` fill: ALL/MALE/FEMALE and PUBLIC/MY COMMUNITY lose their pill entirely in light mode. `TierLeaderboardList.tsx:115,117,142,144` · `LeaderboardModals.tsx:94,96,119,121,240,242`
- **L2** — `GloryLeaderboardScreen.tsx` themes only its page background; every row, name and filter colour is hardcoded dark. Worst offender.
- **L3** — `DeleteAccountModal.tsx:139-267` ignores the theme wholesale (self-consistent but renders a dark sheet in a light app).
- **L4** — Hardcoded white placeholders on `#FFFFFF` surfaces: `ExercisePickerModal.tsx:82` · `WarriorLogModal.tsx:143/155/167/219` · `BuilderExerciseRow.tsx:79/91/104/140/155` and others. `PowerWorldScreen.tsx:516` uses `#333`, near-invisible in *dark* mode.

### Correctness nits
- **L5** — `ProfileHeader.tsx:171` hardcodes `TIER {n} OF 9`; power tiers max at 3, so a Tesla user sees "TIER 3 OF 9".
- **L6** — `TierDetailsModal.tsx` is `maxHeight: '90%'` with **no ScrollView**; on tier 9 (12 movements) the "LEAP NOW" CTA can be unreachable on a small screen.
- **L7** — `OnboardingTutorialScreen.tsx:28,41` says Static World unlocks at Tier 2; it's Tier 1 (`staticLogic.ts:59`, `_layout.tsx:180`).
- **L8** — `CoachScreen.tsx:29-42` tier labels are off by one, so the AI is briefed with the wrong rank names.
- **L9** — `BattleScreen.tsx:293-306` warns "THIS COUNTS AS A DEFEAT" but writes `cancelled` with no winner and no loss recorded.
- **L10** — `AdminTournamentScreen.tsx:319/324/329` — `parseInt('') <= 0` is `false`, so clearing a numeric field writes `NaN`/`null` into a live config.
- **L11** — `OneMinMaxScreen.tsx:74-76` — `/one-min-max?category=advanced` bypasses the tier-5 UI gate (per-movement locks still hold, so UI-only).
- **L12** — `EditProfileModal.tsx:53-54` — the "set once" rule for username/gender/country is client-side only; the DB policy has no `WITH CHECK` and `guard_profile_protected_fields` doesn't cover those columns. Privilege escalation is blocked; only the cosmetic claim is bypassable.

### Dead code & duplication
- **L13** — Orphaned files, zero importers: `src/components/profile/ScoreBar.tsx` (190 lines, superseded by ProfileHeader's inlined WRA card — `CLAUDE.md:123` still lists it, plus `WorldSelectorGrid` which no longer exists) · `src/components/SpartanIntro.tsx` (100 lines, carries an uncleaned-timer bug) · `src/screens/UniversalWorkoutScreen.tsx` (264 lines, superseded by `TournamentTrialScreen`) · `scripts/check_constraints.js` and `scripts/generate-icons.js` (both non-functional) · `components/AntigravityCard.tsx` (never imported in the repo's entire history).
- **L14** — **Timer logic is reimplemented six times** across the inline timers. That's why the impure-updater and unmount-loses-state bugs each had to be fixed six times — and `SetRow`/`WarriorExerciseRow` still lack the `AppState` background correction, so their rest timers under-count while backgrounded.
- **L15** — `ProfileScreen.tsx` carries ~17 unused imports, ~60 dead style entries, and a stale "Module-level cache" comment describing what is actually a per-mount `useRef` (so it provides no cross-mount dedupe at all).
- **L16** — `_backup/`, `scratch/`, `sql_archive/` (28 files) — no secrets, no PII, **nothing in live code references them**. Safe to delete.
- **L17** — `public/account-deletion.html:183,229` publishes a personal email on a live public page; `privacy.html` uses the `support@` alias for the same purpose.
- **L18** — `tsconfig.json` doesn't exclude `admin-web/`, producing 381 phantom errors that mask **14 real** ones (all `Type 'number' is not assignable to 'Timeout'`). No `typecheck`/`lint` script exists to gate them.

---

## ✅ Already fixed and shipped (10)

| # | Fix |
|---|---|
| C1 | **Cross-account auth leak** — `fetchProfile` never validated the RPC result against the requested user, so a refresh resolving after sign-out wrote the previous user's profile back; the next user to sign in was gated on **their** `is_admin`/`is_coach`. |
| C2 | **Power PB data loss** — a discarded read error meant a forced overwrite sent `0` for three untouched lifts, erasing them permanently while `power_points` masked it. |
| C4 | **Tier privilege escalation** — see P0.1. Tier now derived server-side; legacy signature range-checked and retained for shipped builds. |
| — | **Runtime crash in two log modals** — the light-mode refactor moved `W` into component scope, breaking module-level modals that referenced it. Caught during commit review, not by the audit. |
| — | `push_token` never cleared on sign-out (notifications followed a handed-down device) |
| — | `.easignore` uploaded **release keystores** and all `.env` files to EAS on every build |
| — | admin Waitlist "Reject" failed 100% of the time (sent a status the DB constraint forbids) |
| — | `ConfirmButton` swallowed every failure behind 11 destructive actions |
| — | Sentry web reporting silently dead (CSP blocked the ingest host) |
| — | `switch-env.sh` silently wiped the Sentry DSN; now refuses to drop keys |

**Closed, no action:** the three Gemini keys found in public git history were already deleted. `EXPO_PUBLIC_GEMINI_KEY` is unused dead config — the real call is server-side via `Deno.env.get`, so no key ever shipped in the bundle.

---

## Verified clean

- **RLS:** 44/44 tables enabled. 88/88 `SECURITY DEFINER` functions pin `search_path`. Every dangerous permissive **write** policy from the baseline was dropped by a later migration. Write grants to `anon` exist but are inert (policies gate on `auth.uid()`, NULL for anon).
- **`profiles` PII:** column-level SELECT grants exclude `email`/`push_token`/`timezone`/`first_name`/`last_name`, verified intact across the 58 migrations following the lockdown.
- **Edge functions:** no function running as service-role trusts a client-supplied user id. The 2026-08-05 fan-out incident class is properly fixed (idempotency guard, opt-out, timezone-aware, `EXECUTE` revoked from `anon`).
- **admin-web:** all 42 admin actions traced to server-side enforcement — every one backed. No service-role key anywhere. No fan-out surface.
- **Routes:** no ungated protected route. `admin-tournament` self-gates; `warrior-program` passes `user.id`, never a param.
- **Secrets:** none in ~460 files; release keystores never committed.
- **`TIER_HARD_FLOORS`:** identical across all three copies, checked value-by-value.

### Known limits of this audit
- **P9 (migrations)** was a targeted security analysis, not a line-by-line read. It tested for missing RLS, `search_path` escalation and over-permissive grants — **not** input validation inside function bodies. C4 proves that gap: `submit_initial_assessment` passed both filters while accepting an unvalidated privilege-granting parameter. Treat "no RLS gaps" as established; do **not** read it as "every RPC validates its inputs".
- Nothing here was runtime-tested against production data.
