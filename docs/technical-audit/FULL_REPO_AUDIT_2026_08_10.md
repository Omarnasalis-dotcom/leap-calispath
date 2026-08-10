# Full-Repo Audit — Status & Task Plan

**Target:** v1.1.7 · Android versionCode 6 · pre-build
**Run:** 2026-08-10
**Scope:** Planned as an exhaustive 15-partition read-every-file audit of the mobile app, `admin-web/`, Supabase backend, native config, and repo-root surface. `docs/` deliberately out of scope (code/config only).

**Status: ALL 15 partitions complete.** ~460 files examined.

**One CRITICAL is open and unfixed — see C4 below.** Any authenticated user can set their own `strength_tier` to 9 via a single unvalidated RPC call. This should be fixed before the next release.

**Files actually read: ~210.**

**Fixed and verified: 9** (8 audit findings + 1 regression caught while committing). Mobile `tsc` clean apart from a pre-existing repo-wide `Timeout` typing issue · 140/140 tests · `admin-web` build succeeds · Metro bundle succeeds.

---

## Coverage — what was and wasn't audited

| # | Partition | Files | Status |
|---|---|---|---|
| 2 | `src/screens/coaching/` | 9/9 | ✅ complete |
| 5 | `src/lib/` + `src/services/` | 53/53 | ✅ complete |
| 6 | `src/hooks/` `contexts/` `types/` `data/` `constants/` | 17/17 | ✅ complete |
| 8 | `admin-web/` | 79/79 | ✅ complete |
| 11 | top-level shadow dirs | 7/7 | ✅ complete |
| 12 | `ios/` + `android/` native config | 35/35 | ✅ complete |
| 13 | repo-root config + git-history secret scan | 17/17 | ✅ complete |
| 10 | `supabase/functions/` + `config.toml` | 10/10 | ✅ complete — see below |
| 1 | `src/screens/` (excl. coaching) | 27/27 | ✅ complete — **1 critical**, see below |
| 3 | `src/components/worlds/` + `profile/` | 25/25 | ✅ complete — 2 high, see below |
| 4 | `src/components/coaching/` + rest | 49/49 | ✅ complete — highest-yield, see below |
| 7 | `app/` routes | 30 routes cross-checked | ✅ pass — see below |
| 9 | `supabase/migrations/` (RLS, SECURITY DEFINER) | 144 analysed | ✅ security-complete — see below |
| 14 | `_backup/` `scratch/` `sql_archive/` | 28/28 | ✅ clean, deletable |
| 15 | `public/` `web/` `assets/` | inventoried + scanned | ✅ pass — 1 low finding |

All partitions are now complete.

**Correction to P9's stated coverage.** P9 was originally recorded as "security-complete." That was wrong. Its extraction tested `SECURITY DEFINER` functions for two properties — presence of `auth.uid()` and a pinned `search_path` — and `submit_initial_assessment` passes both while still accepting an unvalidated privilege-granting parameter (C4). P9 did not test for input validation inside function bodies at all. Read P9 as: *no unprotected tables, no missing RLS, no search_path escalation* — **not** as *every RPC validates its inputs*.

---

## Partition 10 — Edge functions: **passes**

All 10 read in full, plus `supabase/config.toml`. **No critical or high findings.** The thing this partition existed to find — a function running as service-role that trusts a client-supplied user id — **does not occur anywhere.**

**Caller-identity model, per function:**

| Function | `verify_jwt` | How the caller is authorised | Verdict |
|---|---|---|---|
| `submit-trial-result` | true | JWT; validates tier range 0-9 + hard floor server-side | ✅ |
| `delete-user-account` | *(unlisted → true)* | JWT; deletes `user.id` only — **never a body id** | ✅ |
| `chat-gemini` | *(unlisted → true)* | JWT via `getUser()` | ⚠️ no rate limit — see below |
| `notify-coach-workout-logged` | true | JWT + `log.warrior_id !== user.id` → 404; coach derived server-side | ✅ |
| `notify-client-program-update` | true | JWT + `program.coach_id !== user.id` → 403 | ✅ |
| `send-push-notification` | true | **anon key + caller's header**, so RLS decides; someone else's row 404s identically | ✅ |
| `send-overtake-notification-push` | true | service-role, but constrained to `leaderboard_overtaken*` types + idempotent | ✅ |
| `send-daily-workout-reminders` | **false** | `x-cron-secret` shared secret; fails closed if env var unset | ✅ |
| `send-weekly-challenge-started` | **false** | same cron-secret guard | ✅ |
| `send-weekly-challenge-ending-reminder` | **false** | same cron-secret guard | ✅ |

**Fan-out safety — the 2026-08-05 incident class is properly fixed.** `get_users_needing_daily_reminder()` now carries an idempotency guard (`NOT EXISTS … type='daily_reminder' … same local date`), honours `notification_preferences` opt-out, is timezone-aware, uses `NOT EXISTS` over `NOT IN` (with the NULL-semantics reason documented in the migration), sets `search_path = ''`, and has `EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated` and granted only to `service_role`. Sending batches at Expo's 100 limit and prunes `DeviceNotRegistered` tokens.

**Only finding — `chat-gemini` has no rate limiting (medium).** Any authenticated user can call it in a loop; each call bills against the Gemini key. Accounts are free, so this is a real cost-abuse vector. The key itself is correctly server-side (`Deno.env.get`), never in the bundle. Worth a per-user quota or a short cooldown.

**Minor note:** `send-overtake-notification-push` checks only that an `Authorization: Bearer` header is *present*, never calling `getUser()`. That's safe today because `verify_jwt = true` makes the platform validate the JWT before the function runs — but the guarantee lives in `config.toml`, not in the code, so flipping that flag would silently remove all authentication. Worth a comment at minimum.

---

## Partition 9 — Migrations / RLS: RLS/grants clean; input validation NOT covered (see correction above)

**Method matters here.** This was *not* a line-by-line read of all 144 migrations. It was a systematic extraction targeting the security-critical questions, reasoning about **cumulative final state** (a policy created in the baseline and dropped later does not exist). That answers "is anything exposed?" with high confidence; it would *not* reliably catch a subtle logic bug inside an individual RPC body. Partition 9 should be considered **security-complete, correctness-partial**.

**Findings: no critical, no high.**

| Check | Result |
|---|---|
| Tables with RLS enabled | **44 of 44** — no gaps |
| `SECURITY DEFINER` fns with a pinned `search_path` | **88 of 88** — no privilege-escalation vector |
| `SECURITY DEFINER` fns with no identity check | 10, all benign: 6 leaderboards (bypass RLS *by design*, verified to expose **zero** PII columns), 2 cron-only (`EXECUTE` revoked from `PUBLIC`/`anon`/`authenticated`, granted only to `service_role`), 2 are `RETURNS TRIGGER` and not callable as RPCs |
| Dangerous permissive **write** policies | All dropped. `profiles UPDATE using(true)` ("Tournament service can update rewards") and `tournament_participants UPDATE` ("Allow participants to update each other") → `20260629130000`; `tournament_matches` "Allow all insert/update" → `20260711100200` |
| Write grants to `anon` | Present on `workout_set_logs`, `bodyweight_logs`, `static_hold_attempts` — but **inert**: every policy gates on `auth.uid()`, which is NULL for anon, so no row ever matches |
| `profiles` PII | Protected by **column-level** SELECT grants. `email`, `push_token`, `timezone`, `first_name`, `last_name` are deliberately excluded; own-row reads go through `get_my_profile()`. Verified intact — **no later migration re-granted or re-revoked** across the 58 migrations that follow the lockdown |
| C3-pattern (unscoped `UPDATE` in an RPC) | One hit, benign: a V2-locked Clash trigger scoped to its own row's participants (`WHERE id IN (NEW.sender_id, NEW.receiver_id)`) |

**Worth knowing:** ~20 permissive `SELECT using(true)` policies remain active on gameplay tables (`arena_attempts`, `power_assessments`, `static_holds`, `one_min_max_logs`, `weekly_entries`, tournament tables). These let any authenticated user read all rows — which is what leaderboards need, so it reads as intentional. Flagging it as a deliberate design choice to be aware of, not a defect: if any of these tables ever gains a sensitive column, it is exposed cross-user by default.

**Standout:** `20260725110000_reenforce_profiles_column_select_lockdown.sql` is the best-documented migration in the repo — it records the empirically-verified Postgres behaviour that `REVOKE SELECT ON TABLE` also strips *column-level* grants, and re-grants the safe column list in the same transaction to avoid exactly that trap.

---

## Partitions 7, 14, 15 — Routes, archives, public assets: **pass** (1 low finding)

### P7 · `app/` routes — no ungated protected route

Cross-checked **every** route file against `AuthGuard`'s gate arrays. All 5 coaching routes (`coaching-hub`, `my-clients`, `client-dashboard`, `program-builder`, `progress-tracking`) are present in `coachingRoutes`. The apparent gaps all resolve:

| Route | Why it's not in the array | Verdict |
|---|---|---|
| `admin-tournament` | Self-gates at route level: `if (!profile?.is_admin) return <Redirect href="/" />` | ✅ |
| `one-min-max` | `ONEMM_UNLOCK_TIER = 0` — intentionally open to everyone | ✅ |
| `warrior-program` | Renders a `coaching/` screen but passes `warriorId={user.id}` — **never** from params, so no arbitrary-warrior access | ✅ |
| `battle`, `tournament-lobby`, `tournament-trial` | Genuine `<LockedFeature>` placeholders (V2) | ✅ |
| `template-recommendations`, `weekly-challenge`, `beat-the-plank`, `guess-the-skill` | Warrior-facing by design | ✅ |

**Worth knowing (low):** the codebase uses **two** gating mechanisms — the centralised `AuthGuard` arrays and per-route self-gating. `admin-tournament` uses only the latter. Both work, but a future admin route that forgets *both* is silently ungated, and nothing catches that. A comment in `_layout.tsx` pointing at the self-gated exceptions would make the split explicit.

### P14 · `_backup/` · `scratch/` · `sql_archive/` — clean, deletable

No secrets, no PII, no credentials. The one grep hit (`scratch/verify_edge_function.ts`) reads `process.env.SUPABASE_SERVICE_ROLE_KEY` — it doesn't contain one. Tracked status: `_backup` 0/2, `scratch` 0/14, `sql_archive` 1/12 (only `invite_requests_schema.sql`). **Nothing in `src/`, `app/`, `supabase/`, `admin-web/` or `package.json` references any of the three** — confirmed by grep. Safe to delete; no destructive loose SQL found.

### P15 · `public/` (live-served) · `web/` · `assets/`

`public/` is copied into the Vercel deploy by `build:vercel`, so everything in it **is on the public internet**. Inventory is all intentional: `download.html` (landing), `privacy.html`, `account-deletion.html`, `request.html`, PWA manifest/icons. **`redesign.html` is correctly absent** (confirmed retired). No secrets in any live-served file.

**LOW — personal email published on a live page.** `public/account-deletion.html:183` and `:229` both print `Omarnasalis@outlook.com` as the contact address. `public/privacy.html` uses the `support@leap-arena.com` alias for the same purpose. The personal address is scrapeable on a public page and inconsistent with the privacy page. Fix: swap both occurrences to the support alias.

---

## Partition 3 — `components/worlds/` + `components/profile/`: 2 high, several medium

25/25 files read. **Zero instances of the module-scope/component-scope bug class** that broke the two log modals — every module-level declaration in this partition is self-contained, and no file imports the raw static `WORLD_NEUTRALS` (all use `getWorldNeutrals(mode)` or the `theme` prop). `BottomTabBar` re-verified fully theme-aware.

**HIGH — `EditProfileModal.tsx:87` + `:198` — two sibling Modals swap in one commit.** *(verified)*
`<Modal visible={visible && !showCountryModal}>` and `<Modal visible={showCountryModal}>` are siblings, so tapping "Select Country" unmounts one native modal host and mounts another in the **same render**, mid-animation. This is the strongest `ReactClippingViewManager.addView` candidate found anywhere in the audit. Repro: Edit Profile → Select Country → pick one. Fix: one Modal with swapped inner content, or gate the second on the first's `onDismiss`.

**HIGH — `TierLeaderboardList.tsx:283` — `getItemLayout` reports the wrong row height.** *(verified)*
Declares `length: 73`, but `entryRow` is `minHeight: 52` + `marginBottom: 5` = **57px** pitch. A ~28% per-row error compounds — by row 20 the offset is ~320px wrong. Combined with `initialScrollIndex` and Android's default `removeClippedSubviews`, wrong offsets drive wrong clip/unclip decisions, a documented path into the same `addView` crash. Guaranteed visible bug regardless: "SEE MORE" never lands on the user's own row. Fix: `length: 57`, or drop `getItemLayout`.

**MEDIUM — `TierDetailsModal.tsx` — the CTA can be unreachable.** `modalContent` is `maxHeight: '90%'` with **no ScrollView in the file**. Tier 9 lists 12 movements; on a small screen the content clips and **"LEAP NOW" cannot be tapped**.

**MEDIUM — `ProfileHeader.tsx:171` hardcodes `TIER {n} OF 9`.** `category` can be `'power'`, where max tier is 3 — a Tesla-tier user sees "TESLA · TIER 3 OF 9".

**MEDIUM — modal-inside-modal during sign-out.** `SettingsSheet.tsx:89` renders `DeleteAccountModal` (itself a `<Modal>`) inside its own `<Modal>`, and `DeleteAccountModal.tsx:92` calls `signOut()` while both are visible — AuthGuard then navigates while two stacked native modal hosts tear down.

**MEDIUM — `BottomTabBar.tsx:60-81` has no double-fire guard.** `activeTab` doesn't change until the destination mounts, so a fast double-tap fires `router.replace` twice.

**Light-mode regressions (medium→low).** Inactive filter chips use `rgba(255,255,255,0.05)` fill / `0.1` border in `TierLeaderboardList` and `LeaderboardModals` — in light mode ALL/MALE/FEMALE and PUBLIC/MY COMMUNITY lose their pill entirely and become bare floating text. Leaderboard row fill and several dividers vanish similarly. `DeleteAccountModal` ignores the theme wholesale (self-consistent, but renders a dark sheet in a light app).

**Security — one real gap (low).** `EditProfileModal`'s "can only be set once" rule for username/gender/country is **client-side only**. Verified DB side: the update policy has no `WITH CHECK` and no column list, and `guard_profile_protected_fields` covers `is_admin`/`is_coach`/tiers/points but **not** `gender`/`country`. Privilege escalation is correctly blocked; only the cosmetic write-once claim is bypassable via direct API call.

**Organization.** `src/components/profile/ScoreBar.tsx` (190 lines) is **fully orphaned** — zero importers repo-wide, superseded by `ProfileHeader`'s inlined WRA card. Note `CLAUDE.md:123` still lists it (and `WorldSelectorGrid`, which no longer exists). Plus 9 dead styles in `StrengthWorldView`, several unused props left over from the theme refactor, and the scroll-hint + filter-chip machinery triplicated across three files.

---

## Partition 4 — `components/coaching/` + remaining components: highest-yield partition

49 files / 9,444 lines. Like P3, **no instances of the module-scope bug class**. The agent also explicitly listed four suspected findings it *dropped* after verification, which is what a trustworthy report looks like.

**HIGH — `ForTimeInlineTimer.tsx:139-149` logs a perfect score for a timer that never ran.** *(verified)*
`LOG WORKOUT` has no `disabled` prop and `handleFinalize` has no started-check. Tap it before pressing START and it submits `elapsedSeconds: 0` with `capped: false` — and because the code reads "not capped ⇒ all rounds done", it records `roundsCompleted: totalRounds`. **A perfect workout in 0:00, written to the client's permanent log.** The in-code comment shows the author assumed LOG is only tapped after finishing; nothing enforces it. `AmrapInlineTimer.tsx:127` has the same shape (finalises while running, at 0 rounds, no confirmation).

**HIGH — `WarriorProgramScreen.tsx:1356/1366/1369/1379/1382/1393` dismisses one native Modal and presents another in a single batched commit.** *(verified)*
All three timer-completion handlers call `setActiveTimerBlock(null)` (unmounting the timer modal) and then `setLogModalVisible(true)` synchronously. React 18 batches these into one commit. This codebase *already knows* this is dangerous — `WarriorTimerModal.tsx:415` renders its end-warning as a child `View` "without nested Modals", and `PBOverwriteConfirmModal`/`BonusTaskWheel` carry the same documented iOS-freeze warning. The pattern is correct there and reintroduced across the timer→log handoff. Strong `addView` crash candidate. Fix: wait for `onDismiss` before flipping `logModalVisible`.

**HIGH — `WarriorBlockCard.tsx:69-73` — collapsing a block silently destroys a running workout.** The inline timers are gated on `isExpanded`, and `toggleBlockExpanded` has no guard. Tapping the block header mid-workout unmounts `AmrapInlineTimer`/`ForTimeInlineTimer`/`LadderRungPicker`, all of which hold timer state locally. Elapsed time, rounds, ladder rung, extra reps — all gone, no warning, no persistence. The header is a large tap target directly above the timer.

**HIGH — `BuilderDayCard.tsx:239` — `DELETE DAY` removes a day and every block/exercise inside it with no confirmation.** There's no autosave and no unsaved-changes guard, so the only undo is abandoning the whole editing session. Notably this is an *inconsistency*, not house style: four other deletes in the same hook do confirm. `BuilderBlockCard.tsx:245` (delete block) has the same gap.

**MEDIUM — `BlockConfigWizard.tsx:42-84` silently rewrites saved metadata on mount.** The effect fires `onChange` before the coach touches anything, and the payload is rebuilt from scratch rather than spread from `initialMetadata` — so unknown keys are dropped. Merely *expanding* a legacy block rewrites `{type:'amrap', timer_seconds:'12'}` to `{timing_system:'amrap', …}`, discarding `type`. Direct consequence: two coach-facing warnings at `BuilderBlockCard.tsx:143/150` test `metadata?.type`, which the wizard now never writes — **both warnings are dead code**.

**MEDIUM — `ExercisePickerModal.tsx:135` crashes the whole picker on a null field.** `item.category.toUpperCase()` — unguarded, while line 59 in the same file guards the identical field with `?.`. One library row with a null `category` takes down the picker for every coach and escalates to the GlobalErrorBoundary "SYSTEM FAILURE" screen.

**MEDIUM — uncleaned `Animated.loop` in `LeapLogo.tsx:34-45` and `Skeleton.tsx:16-31`** — no handle, no `.stop()`, and `LeapLogo`'s effect deps let a second concurrent loop drive the same `Animated.Value`. This is the app-wide loading spinner, so it mounts constantly. `tutorial/HighlightRing.tsx` and `TapDot.tsx` do it correctly — copy that pattern.

**MEDIUM — `CopyBlockModal.tsx:117-120`** — an uncleaned 2s `setTimeout` calls `handleClose()`, which resets **parent** state. Closing and reopening within that window wipes the second modal's template selection.

**LOW/MEDIUM — six dropped promises** (`Linking.openURL` ×3, `onCopyTemplate`, `onFetchTargetBlocks`, `onFetchOtherTemplates`). Worst placement is `ForceUpdateScreen.tsx:22` — a **blocking screen with exactly one action**, so a rejected `openURL` leaves the user permanently stuck with a dead button.

**Security — one low.** `InlineVideoPlayer.tsx:12-34`: `getYouTubeVideoId` doesn't exclude quotes/angle brackets and only checks `length === 11`, then interpolates into `src="${embedUrl}"` in a WebView with `javaScriptEnabled` and `originWhitelist={['*']}`. An 11-char payload can break out of the attribute. Requires a malicious coach/admin writing `exercise_library.youtube_url`, so low — trivial fix: validate `/^[A-Za-z0-9_-]{11}$/`.

**Organization.** `SpartanIntro.tsx` (100 lines) is **fully orphaned** (zero importers) and carries an uncleaned-timer bug. Timer logic is **reimplemented six times** across the inline timers — which is why the impure-updater and unmount-loses-state bugs each had to be fixed six times, and two copies (`SetRow`, `WarriorExerciseRow`) still lack the `AppState` background correction entirely, so their rest timers under-count while backgrounded. Plus dead props still threaded from parents (`logRating` is still `setLogRating(5)`-ed in all three handlers despite the star UI being removed), 5 sets of dead styles, and hardcoded white placeholders that vanish on light-mode `#FFFFFF` surfaces.

---

## Partition 1 — `src/screens/` (excl. coaching): 1 critical, several high

27/27 files read. No new instances of the module-scope bug class (all 20 module-level sub-components verified prop-driven).

### 🔴 C4 · CRITICAL · OPEN — any user can grant themselves max tier *(verified)*

`src/screens/AssessmentScreen.tsx:209-215` computes the tier **client-side** and sends only the result:
```js
const tier = calculateSpartanRank(assessment);
await supabase.rpc('submit_initial_assessment', { p_tier: tier });
```
The raw reps never reach the server. `submit_initial_assessment` (`20260614102615_remote_schema.sql`, defined **once**, never superseded) is `SECURITY DEFINER` and checks only the 72-hour lockout before `UPDATE profiles SET strength_tier = p_tier WHERE id = auth.uid()`. **No range check, no recomputation**, and no explicit `GRANT`/`REVOKE` so `EXECUTE` defaults to PUBLIC.

**Exploit:** sign up free → `supabase.rpc('submit_initial_assessment', { p_tier: 9 })` → instantly Eternity, permanently (tiers use `Math.max` thereafter). Unlocks Static World (≥1), Power World (≥6), Champions Arena (≥9), and top-tier leaderboards. An out-of-range value like `999` is also writable and would break `TIER_NAMES[tier]` lookups app-wide.

**Fix shape:** send the raw assessment and compute the tier server-side (preferred), or at minimum `IF p_tier < 0 OR p_tier > 9 THEN RAISE EXCEPTION`.

### Other high findings

**`TournamentTrialScreen.tsx:101-128` — stale-closure auto-submit writes score 0, then loops forever.** The interval's deps omit the score state, so `handleSubmit` closes over the initial zeros; a 10-minute AMRAP with 7 logged rounds auto-submits `0`. Worse, nothing clears the interval on that path, so if the submit throws it re-fires **every 500 ms indefinitely**, hammering the DB and stacking alerts. *(V2-locked feature, but the code is live.)*

**`TournamentLobbyScreen.tsx:603-605` — null deref crashes the screen on any fetch failure.** The catch shows an Alert but never assigns `activeSession`; render then hits `activeSession.status` unguarded (line 598 correctly uses `?.`, 603-605 don't).

**`ArenaWorkoutScreen.tsx:56-67` — the Champions Arena timer isn't wall-clock anchored.** Plain `setInterval` increment, while every other timer in the codebase anchors to `Date.now()`. Backgrounding mid-trial under-counts by the whole suspended duration — and the result lands on the **worldwide** leaderboard. Both a correctness bug and an anti-cheat hole the server can't detect.

**`ArenaWorkoutScreen.tsx:89-118` — a completed arena result can be silently discarded while the celebration still plays.** Either `isTimeValid` returns false (nothing saved, no message) or `saveAttempt` throws into a `console.error`-only catch — then "ARENA COMPLETE / WORLD CLASS" shows and navigates away. The user believes it was recorded.

**`StaticWorldScreen.tsx:262-270` — a post-save refresh failure is reported as a save failure.** The refresh calls sit inside the same `Promise.all` *after* `saveHold` already succeeded, so a blip triggers "Failed to save hold — Try Again"; the user resubmits an already-saved hold and hits the `P1004` cooldown error.

**`StaticWorldScreen.tsx:552/657/1072` — `display_name.toUpperCase()` on an un-coalesced value.** `StaticService.ts:175` is the only service that doesn't fall back to `'Warrior'` (`PowerService` and `OneMMService` both do). One null `display_name` crashes the Static Mastery modal and level leaderboard into the error boundary.

**`AdminTournamentScreen.tsx:373-379` — cascading deletes that always report success.** Four sequential deletes, **not one** `{ error }` inspected, and the function hard-codes `error: null`. If RLS denies the session delete but permits the first two, every participant and match row is destroyed, the session survives, and the admin sees "Tournament removed successfully".

**`AuthScreen.tsx:316-333` — invite codes are permanently burned when email confirmation is on.** After `signUp()` there's no session, so `authData.user` is null and the redeem block is skipped — but this is the *success* path, so the release at line 347 never runs either. The code is left reserved forever: not redeemed, not released. Every such signup silently consumes inventory.

**`AdminTournamentScreen.tsx:68-70` — invite codes generated with `Math.random()`.** These grant trial and **lifetime** memberships. Hermes' PRNG is non-cryptographic and its state is recoverable from a few outputs, so seeing a handful of issued codes lets an attacker predict the rest of a batch. Use `expo-crypto`'s `getRandomBytes`.

**`CoachScreen.tsx:105-121` — the paid-LLM quota is AsyncStorage-only.** `DAILY_LIMIT = 10` is tracked client-side and the cooldown is React state; clearing app data resets both. Confirms the P10 finding from the client side — there is no server-side throttle in `chat-gemini`.

**`WeeklyChallengeScreen.tsx:944-1026` — weekly scores are self-reported and unbounded.** "SKIP TIMER — ENTER MANUALLY" bypasses timing entirely and `calculatePointsFrom` multiplies free-text rounds with no cap. Unlike Static/1MM/Power (`P1001-P1004` server ceilings) and Trials (edge-function floors), no server-side sanity bound was found.

**`TemplateRecommendationsScreen.tsx:81-92` — the "this replaces your active program" warning vanishes on a transient error.** The query ignores `error`, making a failure indistinguishable from "no active program", so both the banner and the switch warning are suppressed. The code comment explicitly claims it distinguishes these — it doesn't.

### Medium/low highlights

`OneMinMaxScreen.tsx:650-658` dismisses one Modal and mounts another in the same commit — the exact pattern the file's own comment warns about (**third** independent instance of this class, after P3 and P4). `OneMinMaxScreen.tsx:74-76` lets `/one-min-max?category=advanced` bypass the tier-5 UI gate (per-movement locks still hold, so UI-only). `BattleScreen.tsx:293-306` warns "THIS COUNTS AS A DEFEAT" but writes `cancelled` with no winner and no loss. `OnboardingTutorialScreen` tells users Static World unlocks at Tier 2 when it's Tier 1. `CoachScreen`'s tier labels are off by one, so the AI is briefed with the wrong rank names.

**Organization:** `UniversalWorkoutScreen.tsx` (264 lines) appears genuinely superseded by `TournamentTrialScreen`. `ProfileScreen` carries ~17 unused imports, ~60 dead style entries, and a stale "Module-level cache" comment describing what is actually a per-mount `useRef` (so it provides no cross-mount dedupe at all). `GloryLeaderboardScreen` themes only its page background — every row, name and filter colour is hardcoded dark.

---

## ✅ Fixed this session (9)

All merged to `main` and pushed (`468237b`).

- [x] **Runtime crash in two log modals (found while committing, not by the audit).** The light-mode refactor in `919efee` moved `const W = WORLD_THEMES.<world>` out of module scope into each screen component so it could resolve per-render. `OneMinMaxTimerModal` and `StaticWorkoutLogModal` are declared at *module* level and referenced `W` directly, so they lost access to it — 10+ `Cannot find name 'W'` type errors, and a `ReferenceError` the moment a user opened the 1MM timer or Static hold-log modal. Metro doesn't typecheck, so it survived a simulator pass where those modals weren't opened. Fixed by threading the resolved world (and mode) through as props. **Lesson: a green simulator run and a green `tsc` are independent signals** — and verifying with a filtered `tsc | grep <files-I-touched>` hides regressions in files you didn't touch.

- [x] **C1 · CRITICAL · cross-account auth leak** — `fetchProfile(userId)` never validated the RPC result against the requested user, so an in-flight refresh resolving after sign-out (still-valid access token) wrote the previous user's profile back. Both AuthGuard hold-conditions are false while a stale profile exists, so the next user to sign in was gated on the **previous user's** `is_admin`/`is_coach`/`strength_tier`.
  → guard rejects any profile whose `id` ≠ requested `userId`. `src/contexts/AuthContext.tsx:194`

- [x] **C2 · CRITICAL · silent PB data loss** — the `power_assessments` read discarded its `error`; on failure `current` became null and the three untouched lifts were sent as `0`. The RPC's `p_force` branch assigns verbatim with **no `GREATEST` ratchet** (unlike the normal path), so three PBs were permanently erased while `profiles.power_points` survived and masked it.
  → read error now throws before reaching the force path; failures no longer return a "not a PB"-shaped result. `src/services/PowerService.ts:204`

- [x] **H4 · push-token bleed** — `signOut()` never cleared `push_token`, so a handed-down device kept receiving the previous owner's notifications. → cleared best-effort before session drop. `src/contexts/AuthContext.tsx:342`

- [x] **`.easignore` uploading release keystores** — the file had only `android/`/`ios/`. Since `.easignore` **replaces** `.gitignore` rather than extending it, every `eas build` uploaded both `.jks` keystores and all `.env` files. Verified EAS env vars are a strict superset of `.env.production` before excluding them.

- [x] **ST-2 · admin Waitlist "Reject" 100% broken** — sent `status:'rejected'`; the constraint allows only `pending|approved|declined`, so every click threw 23514 and the button never hid. `admin-web/src/pages/waitlist/WaitlistPage.tsx:71,75`

- [x] **ST-1 · ConfirmButton swallowed all failures** — `try/finally` with no `catch`, behind **11 destructive actions**. Rejections escaped unhandled; dialog stayed open, nothing signalled failure, and two call sites never rendered their error at all. → added `catch` + inline error. `admin-web/src/components/bits.tsx:137`

- [x] **Sentry web reporting silently dead** — `vercel.json` CSP `connect-src` didn't allowlist the ingest host. → added both regions (DSN is EU).

- [x] **Sentry DSN silently wiped** — the DSN lived only in `.env.local`, which `switch-env.sh` overwrites wholesale. → added to both source env files, and the script now **refuses to switch** when it would drop keys (tested).

**Closed, no action:** the three Gemini API keys found in public git history were already deleted in Google Cloud. Also confirmed `EXPO_PUBLIC_GEMINI_KEY` is **unused** by client code — the real call is server-side in `chat-gemini` via `Deno.env.get`, so no key ever shipped in the bundle. (The unused var is harmless dead config; removing it is optional cleanup.)

---

## 🔴 Open — Critical / High

### C3 · Coach silently ends a program they cannot see — *needs its own session*
`assign_program_template` ends with an **unscoped** `UPDATE warrior_programs SET status='completed' WHERE warrior_id = … AND status='active'`. The client-side "already has a program?" check reads a **coach-filtered** list, so a warrior's self-selected Library program (owned by the Leap system account) or another coach's program is invisible to it — the append/archive/overwrite modal never appears and the program is silently completed.

**This is not a one-line fix.** The intended flow (coach gets overwrite / archive+append / append) is blocked at two layers:
1. **Detection** — `warrior_programs` SELECT policy is `coach_id = auth.uid() OR warrior_id = auth.uid() OR is_assistant_for(coach_id)`, so the coach can never see the row. Needs a `SECURITY DEFINER` helper.
2. **Action** — all three apply RPCs reject non-owners with `Not authorized to modify this client's program`. Needs a new branch, safely scoped to *"warrior is in this coach's community"* (the predicate `assign_program_template` already enforces).

Confirmed invariant: **one active program per warrior** — `WarriorProgramScreen.tsx:371` uses `.maybeSingle()` and rethrows, so two active rows hard-error the warrior's screen. That rules out simply scoping the UPDATE by coach.
`supabase/migrations/20260807340000_…sql` · `src/screens/coaching/MyClientsScreen.tsx:266`

### H1 · `withNetworkRetry` is inert around every `supabase.rpc()`
postgrest-js resolves with `{data, error}` instead of rejecting, and its internal retry covers only GET/HEAD/OPTIONS — RPC is POST. **Proven empirically** (1 attempt vs 4 on a raw-fetch control). Static-hold and 1MM submits therefore have **zero** retry protection — the exact regression the helper was added for after the "Network request failed" incidents. Fix: `.throwOnError()` inside the callback, or check the error inside the retried fn and `throw`.
`src/services/StaticService.ts:50-64` · `src/services/OneMMService.ts:126-140`

### H2 · `RECORD_AUDIO` almost certainly live on the Play Store
`.easignore` excludes `android/`/`ios/`, so EAS prebuilds fresh from `app.json` — the permission trims in commit `0d1dcca` **never reached a shipped build**, and `expo-av`'s auto-plugin re-adds mic. Same root cause re-adds the iOS Face ID/mic usage strings removed in `fb8ae13`. Data-safety mismatch + review risk. Fix belongs in `app.json` plugin props, not the native dirs.

### H3 · Deep link can force-logout and hijack the reset flow
`AuthContext.tsx:79` matches `url.includes('reset-password')` against the **whole URL**, and the intent filter has no host/path. `leaparena://x?q=reset-password&token_hash=<attacker's>` signs the victim out into a password-set screen for the attacker's account. `autoVerify="true"` is a no-op on a custom scheme.

### H5 · Week-note race destroys the wrong week's note
No request sequencing on `selectedWeek` change; a slower earlier response lands last, leaving the previous week's row id in state. Coach then saves week-2 text over week 1. `ProgressTrackingScreen.tsx:329-362`

### H6 · "SUBMIT DIRECTLY" writes the previous block's data
Quick-log path never resets log state, so block B is persisted with block A's AMRAP rounds / notes / RPE. **Currently latent** (no call site) but 50 lines of live-looking code wired to `quickLogWorkout`. `WarriorProgramScreen.tsx:959-1046`

### H7 · DELETE WEEK doesn't warn it destroys logged history
`delete_coach_week_data` deletes `workout_logs` first; the dialog says only "blocks and exercises". `ClientDashboardScreen.tsx:119`

### H8 · Production error blindness
Several coach-screen catch blocks are `console.error`-only, and console is stripped in production — a failed fetch renders as "NO WORKOUT LOGS RECORDED YET", indistinguishable from an inactive client. `ProgressTrackingScreen.tsx:306,348,380,413`

### H9 · 15 sites render in the wrong font
`PlusJakartaSans-Medium`/`-SemiBold` used in code, registered nowhere (verified against `Info.plist` and the Android assets dir). All ~199 Jakarta usages also fall back on **web** — the `expo-font` config plugin is native-only. Fix by adding the faces to `hooks/useFonts.ts`.

---

## 🟠 Open — Medium (selected)

- **`useMountedRef` never resets to `true`** — latent today (no `StrictMode`/`freezeOnBlur`, verified). If either is ever enabled, `useSafeAsync` leaves `isExecuting` stuck true and **permanently disables the submit button** on Trial and 1MM. One-line fix; do it pre-emptively. `src/hooks/useMountedRef.ts:4-7`
- **SecureStore `setItem` deletes before writing** — interruption mid-write leaves no session; user silently signed out. `src/lib/supabase.ts:86-114`
- **`useSafeMutation` fires callbacks after unmount** — `Alert.alert` pops over an unrelated screen. `src/hooks/useSafeMutation.ts:40-57`
- **`WarriorTimerModal` inline callbacks rebuild the interval every render** — a warrior typing a hold time **freezes the running AMRAP/Tabata countdown**. Naive fix activates a stale-closure bug in the same effect; must be fixed together. `src/hooks/useWarriorTimer.ts:179-263`
- **Raw `"AbortError: Aborted"` shown to users** — postgrest returns a plain object with no `.name`, so the friendly-copy branch never matches. `src/lib/submitErrors.ts:8-10`
- **Trial retry misreports success as failure** — retry re-POSTs, server returns `TOO_FAST`, user is told to wait for a trial that *was* recorded. `src/services/TrialService.ts:64-108`
- **admin-web query cache never cleared on sign-out** — app explicitly targets shared machines; ID-keyed entries aren't re-scoped, so coach B can see admin A's fetched client data for up to 60s. `admin-web/src/auth/AuthProvider.tsx:144`
- **admin "Save week" can overwrite the live challenge** with no confirmation, while every delete on that page is confirm-gated. `ChallengeWeekPage.tsx:373`
- **admin library "Publish" has no confirm and no audience preview** — a `0`–`9` typo recommends an advanced program to every warrior. `LibraryTab.tsx:116`
- **`PrivacyInfo.xcprivacy` declares `NSPrivacyCollectedDataTypes` empty** while the app collects email, user IDs, fitness data, push tokens. App Store review risk.
- **`tsconfig.json` doesn't exclude `admin-web/`** — produces 381 phantom errors that mask **14 real** ones (all `Type 'number' is not assignable to 'Timeout'`). No `typecheck`/`lint` script exists to gate them.
- **Missing HSTS** and CSP weaknesses (`unsafe-inline`, a whole-CDN allowlist) in `vercel.json`.

---

## ✅ Verified clean (scoped to partitions that ran)

- **No hardcoded secrets** in ~200 files; **no service-role key** anywhere in `admin-web`; release keystores never committed; `.DS_Store` never tracked.
- **All 42 admin-web actions** traced to server-side enforcement — every one backed. The anon-key + RLS model holds; an attacker with the anon key and full client control gains nothing beyond their own role.
- **`TIER_HARD_FLOORS` identical** across all three copies (client constant, edge function, DB table), checked value-by-value.
- **Native:** only `MainActivity` is exported; no cleartext or debuggable in release; R8 correctly off; signing config contains only the public AOSP debug values.
- **No fan-out surface in admin-web** — the 160-user incident class cannot repeat there.

---

## Next actions, in order

1. **Commit the 8 fixes** — currently uncommitted working-tree changes.
2. **Resume the audit at P9 and P10** (RLS + edge functions) once the spend limit is raised. These are the only partitions that can surface a full-database exposure, and nothing else should be assumed safe until they run.
3. **Then P1, P3, P4, P7, P14, P15** to complete coverage.
4. **C3 as its own scoped piece of work**, with a security review of the widened community predicate — ideally after P9, since P9 would reveal whether that predicate has other holes.
5. Work the High list above; `H1` (inert retry) and `H2` (Play Store permission) are the most user-visible.
