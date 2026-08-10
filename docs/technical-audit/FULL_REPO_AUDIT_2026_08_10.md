# Full-Repo Audit — Status & Task Plan

**Target:** v1.1.7 · Android versionCode 6 · pre-build
**Run:** 2026-08-10
**Scope:** Planned as an exhaustive 15-partition read-every-file audit of the mobile app, `admin-web/`, Supabase backend, native config, and repo-root surface. `docs/` deliberately out of scope (code/config only).

**Status: INCOMPLETE — 7 of 15 partitions finished.** The run was cut short by an Anthropic monthly spend limit, not by a decision to stop. **The two highest-stakes partitions never ran** (RLS policies across 144 migrations, and edge functions running as service-role). Treat the "verified clean" claims below as scoped strictly to what was actually read.

**Files actually read: ~200.**

**Fixed and verified during the session: 8.** Mobile `tsc` clean on edited files · 140/140 tests pass · `admin-web` build succeeds.

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
| 1 | `src/screens/` (excl. coaching) | 0/27 | ❌ spend limit |
| 3 | `src/components/worlds/` + `profile/` | 25 read, 0 reported | ❌ connection dropped pre-report |
| 4 | `src/components/coaching/` + rest | partial | ⚠️ killed |
| 7 | `app/` routes | 0/31 | ❌ spend limit |
| **9** | **`supabase/migrations/` (RLS, SECURITY DEFINER)** | **0/144** | ❌ **spend limit — now the top remaining priority** |
| 14 | `_backup/` `scratch/` `sql_archive/` | 0/28 | ❌ spend limit |
| 15 | `public/` `web/` `assets/` | 0/63 | ❌ spend limit |

P9 is now the highest-value gap: P2 already found an unscoped `UPDATE` inside one RPC (see C3), and that class of bug is exactly what a systematic pass over the RLS policies and `SECURITY DEFINER` functions would catch.

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

## ✅ Fixed this session (8)

All applied to the working tree. **Not yet committed.**

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
