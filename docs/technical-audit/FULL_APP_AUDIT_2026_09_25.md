# Full-App Audit — 2026-09-25

**Target:** v1.2.5 (iOS build 22 / Android versionCode 14) · branch `ai-coach-v3` · prod project `vxscvluyskawegmwaxnh`
**Method:** delta audit in two passes. The 2026-08-10 full-repo audit and the 2026-09-16 AI Coach audit are the baseline.
- **Pass 1:** re-checked baseline items, audited what changed since 08-10 (297 commits, 292 files, +38k lines), and covered the gaps 08-10 declared — input validation inside RPC bodies, and **live read-only checks against prod** (schema, grants, policies, deployed function source, notification data).
- **Pass 2:** re-verified every remaining 08-10 item; screen-level UX/error handling; offline behaviour; accessibility; localization; auth flows; web build + CSP; cron targeting on real prod data; AI cost.
- **Pass 3 (coverage closure):** checked the report line-by-line against the original audit plan (areas A–L + inventory) and closed every gap reachable from code and prod — storage, **read** policies (pass 1 only reviewed writes), triggers, overloads, auth settings, UGC, webhook ordering, remaining game modes, error boundaries, chat storage, build profiles, admin-web build, docs accuracy, rate limits. See the coverage checklist at the end.

**Rules followed:** read-only against prod (SELECT queries, `migration list`, `functions download`, `db advisors`); nothing invoked, deployed, or changed. Web build exported to a scratch dir, not `dist/`. Nothing fixed.

---

## Fix log (2026-09-26)

| Status | Items |
|---|---|
| **Fixed on prod & verified** | C1 (key rotation, legacy keys disabled), H1, H2, H6, M1, M2, M20, M21, M22, L5, AI Coach cool-down validator loop (found from live logs, not in the original audit), L9 |
| **Fixed on prod & verified (batch 2)** | M15 (reminder only to users active in last 14 days: 246 → 62 targets/day), L21, M8, L6 — migration `20260926030000`; H5 #1 (100 s turn-start deadline, ai-coach v82); L1 (`chat-gemini` deleted); M10 server minimum password length 8 |
| **Fixed in app code — ships with next store release** | M3, M12, M13, M17, L10, L13, L16, M10 (app side), M20 follow-ups, invite field hidden |
| **Fixed — ships on push to `main` (Vercel)** | M9 (admin-web react-router 7.18.4) |
| **Resolved without code** | M11 (made unreachable by M20's DB rules), L14 (moot while email confirmation is off) |
| **Accepted limitation** | M10 leaked-password protection — paid Supabase plan feature; revisit if the plan is upgraded |
| **Not a problem / won't fix** | M4 (by design: coaches want every log from their assigned clients), M6 (Apple review purchases run in sandbox — filtering it would break review), L8 (build config, left alone) |
| **Parked by owner** | H4 (minimal version planned: Apple standard EULA link + AI Coach privacy section/notice), H3 (until invite codes return) |
| **Open — needs a decision or dashboard** | M19 email confirmation, M5/M18 analytics, M23 webhook ordering, H5 #4/#7, M7, M14, M16, L2–L4, L7, L11, L12, L15, L17–L20, L22, L24–L27 |

Correction: M15 and the "15 weekly actives" context used `profiles.last_active`, which only the V2-locked Clash code writes. Real signals (training + app opens): 42 users opened the app in the last 7 days, 17 trained; 123 of 188 reachable users had neither in 14+ days.

---

## Verdict

**Fix C1 today — it is a live production exposure, independent of any release.** Then **ship-with-fixes**: H1–H6 plus the two crash items (M11, M12) should land before the next store build. Nothing found blocks users from using the app today.

| Priority | Count |
|---|---|
| Critical (prod exposed now) | 1 |
| High | 6 |
| Medium | 23 |
| Low | 27 |

**Business context from prod:** 321 profiles · **15 active in the last 7 days** · **1 active paying subscriber** · paywall ON since 08-28 · ~80% of users who set a country are in Arabic-speaking markets (Egypt 141, KSA 21, Algeria 10, UAE 8).

**Funnel since the paywall went live (83 signups):** 13 (16%) never picked a name · 2 never assessed · 10 assessed but never finished onboarding · **58 (70%) fully onboarded** · 35 have an active program.

---

## Critical

### C1 · Deployed `delete-user-account` writes the service-role and secret keys to function logs on every call — Confirmed
- **Evidence:** deployed source (downloaded via `supabase functions download`, v12, deployed 2026-06-06) lines 40-41, 45:
  `console.log("SECRET_KEYS raw:", rawSecretKeys); console.log("SERVICE_ROLE_KEY raw:", rawServiceRole); console.log("Resolved key prefix:", …)`
  The repo copy (`supabase/functions/delete-user-account/index.ts`, fixed in `17e2d0d` on 06-12) has no such logs — **the fix was committed but never deployed.**
- **Impact:** every account deletion since 06-06 put full-database-bypass credentials into Edge Function logs. Anyone with dashboard log access (or any log drain) can read/write every row, including payments and PII.
- **Fix:** (1) deploy the repo version now; (2) rotate the service-role / secret API keys, then update every consumer (Edge Function secrets are platform-injected, but check admin tooling, CI, local `.env`s); (3) check whether logs are drained anywhere external. **Effort:** S + M.
- **Process gap behind it:** no check that deployed functions match the repo. 5 other functions also differ (see L9).

---

## High

### H1 · Paid-tier gate regressed on three AI Coach write RPCs — Confirmed
- `ai_coach_append_week`, `ai_coach_add_block_to_week`, `ai_coach_replace_day_in_week` have **no** `caller_has_pro_access()` check on prod. Their siblings (`adjust_program`, `delete_week`, `replace_block_exercises`, `create_program`, …) do.
- **Cause:** `20260903100000_add_pro_gate_to_ai_coach_direct_write_rpcs.sql` added the gate; `20260917140000_…replace_day…` and `20260918160000_fix_ai_coach_append_week_block_order.sql` re-created the functions without it (`replace_day_in_week` never had it).
- **Impact:** a lapsed subscriber (2 on prod) or anyone from the reset grace cohort who still has an AI program can keep generating new weeks for free — via the app's free chats, or directly over REST.
- **Fix:** re-add the gate in one migration; add a test/grep in CI that every `ai_coach_*` write RPC calls it. **Effort:** S.

### H2 · Invite-code RPCs use `ILIKE` on user input — `%` claims every unused code at once — Confirmed (code), not live-tested
- `redeem_invite_code` / `reserve_invite_code` / `release_invite_code`: `WHERE code ILIKE p_code`. `p_code = '%'` matches all rows; the `UPDATE` marks **all 28 unused codes** (incl. 2 `master`, 1 `lifetime`) as used by the caller.
- **Impact:** one call wipes invite inventory; a lapsed subscriber (tier still set) would get up to 100 years of paid access. 08-10 `M2` (codes generated with `Math.random()`) is still open in `src/screens/AdminTournamentScreen.tsx:69`.
- **Fix:** exact match on `upper(code) = upper(p_code)`; generate codes with `expo-crypto`. **Effort:** S.

### H3 · Invite codes no longer grant anything to new users — Confirmed on prod data
- Access now requires `access_expires_at > now()` **and** a non-null `subscription_tier` (`caller_effective_tier()`, mirrored in `src/lib/entitlement.ts:21`). `redeem_invite_code` only sets `access_expires_at`.
- **Prod:** 1 user redeemed a code after the paywall went on and is `invite_code | tier=null | active=true` → treated as **free** everywhere.
- **Impact:** every trial / member / lifetime code handed out is silently worthless; support problem and broken promise to invitees.
- **Fix:** decide which tier each code type grants and set `subscription_tier` in the RPC (fix together with H2). **Effort:** S.

### H4 · Store/legal: no Terms of Service, and the privacy policy omits AI Coach — Confirmed (links on RC paywall: Suspected)
- No ToS/EULA page in `public/`, no ToS link on `AuthScreen` or `PaywallScreen`. Apple 3.1.2 requires working ToS/EULA + privacy links for auto-renewable subscriptions (in-app and in metadata). The RevenueCat paywall template may carry them — **verify in the RC dashboard.**
- `public/privacy.html` (effective June 8) never mentions AI Coach or that chat content goes to Anthropic. iOS privacy manifest (`app.json`) lists no *Other User Content* type.
- No health/injury disclaimer before max-effort trials (only in AI Coach, `CoachScreen.tsx:1058`). No age requirement stated anywhere.
- **Fix:** ToS page + links; privacy policy update (AI processor, retention); add `OtherUserContent` to the manifest and Play Data Safety; one-time disclaimer before the first trial. **Effort:** M (mostly writing).

### H5 · AI Coach audit (09-16) top items still open — Confirmed
- **#1** no internal deadline before the Edge Function wall-clock limit (`ai-coach/index.ts` has no `AbortController`/deadline; `startedAt` is only logged).
- **#4** no code-level safety backstop for pain/nutrition/under-18 guidance.
- **#7** no `actionClaimGuard.test.ts`.
- (#3 appears addressed — propose tools are now in the claim set.)

### H6 · Any signed-in user can read every unused invite code — Confirmed on prod
- Policy "Users can validate codes" on `invite_codes` is `USING (used_by IS NULL OR used_by = auth.uid())` for role `public`, and `authenticated` has SELECT on the `code` column.
- **Verified** by simulating a random signed-in user inside a rolled-back read-only transaction: **28 unused codes visible, 3 of them `lifetime`/`master`** (only counts were returned, no codes).
- Anonymous requests are blocked only by accident: evaluating the admin policy hits `permission denied for table profiles`.
- **Impact:** harmless today *only because* of H3. **Fixing H3 without fixing this turns every listed code into free paid access for anyone who signs up** (and sign-up needs no email confirmation — M19).
- **Fix:** drop the SELECT policy; validate codes only inside the SECURITY DEFINER RPCs. Ship together with H2/H3. **Effort:** S.

---

## Medium

### Security & money
| ID | Finding | Evidence | Status |
|---|---|---|---|
| M1 | **Paused coach can un-pause themselves.** `coaching_paused_at` is UPDATE-granted to `authenticated`, the "own profile" policy allows it, and `guard_profile_protected_fields` doesn't cover it. Admin pause is meant to revoke coach write access (`20260807100000_add_coach_roster_schema.sql:3`). | prod grants + trigger source | Confirmed (SQL), not exploited |
| M2 | **Community join-code bypass.** `profiles.community_id` is directly writable and every community `id` is readable (communities SELECT `true`; `community_id` visible on all profiles). Anyone can put themselves on any of the 17 coach rosters / community leaderboards without the code `join_community` checks. | prod grants/policies | Confirmed (SQL) |
| M3 | **Delete-account doesn't tell users their subscription keeps billing**, and the RevenueCat customer isn't deleted. | `DeleteAccountModal.tsx` (no subscription copy), `delete-user-account` | Confirmed |
| M6 | **Sandbox purchases not filtered** in `revenuecat-webhook` / `confirm-entitlement` — TestFlight/license-tester purchases would grant real paid access. | no `environment`/`is_sandbox` check in either | Suspected (depends on tester setup) |
| M7 | Weekly Challenge scores still self-reported (08-10 M4). Server now caps at a flat 10 000, not per challenge; manual entry still bypasses timing. | `submit_weekly_score` | Partially fixed |
| M8 | `tournament_sessions` UPDATE policy lets **any** signed-in user flip any session `registration → active`. V2-locked, 0 rows today — fix before V2. | prod `pg_policies` | Confirmed |
| M9 | admin-web: `react-router 7.12–7.18` high-severity advisory; public admin panel. | `npm audit` (admin-web) | Confirmed |
| M10 | Leaked-password protection disabled in Supabase Auth; minimum password length is 6 (`ResetPasswordScreen.tsx:195`). | `supabase db advisors` | Confirmed |
| M19 | **Email confirmation is effectively off** — 321/321 accounts are confirmed. Anyone can sign up with someone else's address; unlimited throwaway accounts each get 8 free AI Coach chats; no bot friction. | `auth.users` | Confirmed (data) |
| M20 | **`display_name` has no length limit and no DB uniqueness.** Uniqueness is only an RPC the client calls (`check_username_available`), but the column is directly writable — anyone can copy the #1 leaderboard name or use "Leap Arena Admin", or set a huge string that breaks leaderboard rows. No report/block feature anywhere (Apple guideline 1.2 for user-visible content). | prod constraints + grants, grep | Confirmed |
| M21 | **Past coaches keep reading a client's full history forever.** `workout_logs` / `bodyweight_logs` SELECT policies match *any* program the coach ever had with that user, any status, and cover *all* the user's logs (incl. self-made/AI programs). 1 user affected today. | prod `pg_policies` | Confirmed |
| M22 | **Raw leaderboard data is readable without logging in** (public anon key): every user's lift weights (`power_assessments`), holds, 1-min-max logs and weekly entries, keyed by `user_id` with timestamps. Names aren't exposed (profiles need a login), so it's pseudonymous — but there's no need for anon access. | prod policies + column grants | Confirmed |
| M23 | **RevenueCat webhook ordering/idempotency.** `access_expires_at` is overwritten by whichever event lands last (no event-timestamp check), so a delayed old event can cut or extend access; a redelivered RENEWAL resets the AI budget period. Refund handling not special-cased — verify RC's refund event semantics. | `apply_revenuecat_entitlement` (7-arg), webhook | Confirmed (code); refund: Suspected |

### Crashes & reliability
| ID | Finding | Evidence | Status |
|---|---|---|---|
| M11 | **Static World crashes for everyone once a nameless user logs a hold** (08-10 M5, still open). `StaticService.ts:175` doesn't default `display_name`; `StaticWorldScreen.tsx:601/706/1122` call `.toUpperCase()` on it. **21 users on prod have no name** — none has logged a hold yet. | code + prod count | Confirmed, latent |
| M12 | **Android modal-swap crash pattern still unmitigated** (08-10 H5 candidates). Timer completion closes `WarriorTimerModal` and opens the log modal in the same commit (`WarriorProgramScreen.tsx:1707-1718`, both handlers) — the exact shape of the confirmed `addView` crash fixed elsewhere with `requestAnimationFrame`. `EditProfileModal.tsx:86/198` unchanged. | code | Confirmed pattern, crash not reproduced |
| M13 | **My Journey shows "no program" on a network blip — and wipes its cache.** The program query ignores `error`; failure → `setJourneyData(null)` + `journeyDataCache = null` (`MilestoneLaneScreen.tsx:1332-1342`). The block/log queries right after do throw correctly. This is the tab daily reminders now open. | code | Confirmed |
| M17 | **Caught failures are invisible in production** (08-10 M11, still open). Sentry only records `console.error` as breadcrumbs; no `captureException` in ProgressTracking (5), OneMinMax (5), MyClients (2), ChampionsArena (2), Profile (8)… Sentry also never gets a user id (`Sentry.setUser` absent), so a user's crash report can't be found. | `app/_layout.tsx:20-25`, grep | Confirmed |

### Product & UX
| ID | Finding | Evidence | Status |
|---|---|---|---|
| M4 | **Coach notification flood.** `client_workout_logged` has no dedupe (only day/week-complete do) — one coach got 32 "Alex just logged a workout." in one day; most failed only because the coach had no token. | `notify-coach-workout-logged/index.ts:74-99`, prod `notifications` | Confirmed |
| M5 | **No product analytics at all.** No SDK; the funnel numbers above had to be reconstructed by hand from `profiles`, and paywall conversion can't be measured. | `package.json` | Confirmed |
| M14 | **Accessibility.** Tertiary text is ~1.7:1 contrast (both themes) and is used **356 times**, incl. assessment question descriptions (`AssessmentScreen.tsx:289`) and trial labels; light-mode secondary text is ~3.3:1 (AA needs 4.5). Only 30 accessibility props across 558 touchables; ≥33 icon-only buttons have no label. Good: font scaling is never disabled, reduce-motion is respected in 31 places. | `constants/Theme.ts:34-53`, grep | Confirmed (code) |
| M15 | **Daily reminder has no inactivity cutoff.** Every assessed user gets a push at 19:00 local, every day, forever. **163 of the 185 users with a push token have been inactive 14+ days** (139 for 30+); 0 have opted out in-app. Likely driving OS-level disables/uninstalls. | `get_users_needing_daily_reminder`, prod counts | Confirmed |
| M16 | **English-only UI for a mostly Arabic-speaking user base.** No i18n library, no RTL handling, 96 `margin/paddingLeft/Right` vs 0 `Start/End`. Only AI Coach speaks Arabic. Strategic, not a bug. | `package.json`, grep, prod `country` | Confirmed |
| M18 | **16% of new signups stall at "choose a name"** (`complete-profile`) — the largest single drop in the funnel. Can't diagnose why without analytics (M5); worth a device walk-through of that screen. | prod `profiles` since 08-28 | Confirmed (data) |

---

## Low

| ID | Finding |
|---|---|
| L1 | `chat-gemini` still deployed, **without** the admin gate the repo has; inert only because no `GEMINI_API_KEY` secret exists. Delete the function; revoke the unused `EXPO_PUBLIC_GEMINI_KEY` still in `.env.local`/`.env.production` (not in the bundle — verified). |
| L2 | Waitlist tables `invite_requests` / `play_store_testers` accept unlimited anonymous INSERTs (spam into admin-web). |
| L3 | 26 of 106 SECURITY DEFINER functions have no pinned `search_path` (08-10 said all were pinned). Not exploitable now — `authenticated`/`anon` lack CREATE on `public` — but advisors flag it 40×. |
| L4 | 59 SECURITY DEFINER functions executable by `anon`. All sampled ones check the caller internally; revoke from `anon`/`PUBLIC` anyway as defence in depth. |
| L5 | Unguarded self-writable profile columns: `best_times`, `power_pbs`, `one_mm_rank`, `assessment_locked_until` (re-assessment cooldown bypass), `email`. Leaderboards read `trial_history`, so impact is cosmetic/self only. |
| L6 | `ai_coach_message_reports.reviewed_by` FK has no `ON DELETE` → deleting an admin who reviewed a report fails. |
| L7 | 1 101 of ~1 900 notifications/week are created for users with no push token (`NO_TOKEN`). Skip at creation. |
| L8 | Committed native projects are stale (`android/` 1.1.7/vc 6, `ios/` 1.2.3/20); EAS ignores them (`.easignore`), but local release builds would ship wrong versions. |
| L9 | Deploy drift besides C1: `send-daily-workout-reminders` (repo deep-links to `my-journey`, prod to `profile`), `chat-gemini` (L1); `ai-coach` / `submit-trial-result` / `notify-coach-workout-logged` differ only in non-runtime files. |
| L10 | Sentry `tracesSampleRate: 1.0` in production (`app/_layout.tsx:23`) — quota/cost as users grow. |
| L11 | App toolchain `npm audit`: 1 critical / 8 high (tar, xmldom, js-yaml…) — build-time deps, not in the shipped bundle. |
| L12 | Performance advisors: 148 duplicate permissive policies, 75 `auth.uid()` re-evaluated per row. Fine at 320 users; revisit before growth. |
| L13 | Admin tournament delete still ignores all four delete errors and reports success (08-10 H8, `AdminTournamentScreen.tsx:375-379`). V2/admin only. |
| L14 | Invite code reserved but never redeemed when signup returns no session (08-10 M1). **Moot today** — email confirmation is off (M19), so signup always returns a session; becomes live if confirmation is turned on. Fix with H2/H3. |
| L15 | In-progress workout state (timers, set progress, inputs) lives only in memory — an app kill mid-block loses it. Workout log saves have no network retry, but a failed save **keeps the modal and its input** so the user can retry. `PowerService`/`ChallengeService` submits also lack the `withNetworkRetry` that Trial/Static/1MM use. |
| L16 | Google account isn't signed out on logout — on a shared phone the next Google sign-in may silently reuse the previous account. |
| L17 | Web: the app ships as one **6 MB** JS bundle (no code splitting). |
| L18 | Web: exercise videos can't play — `InlineVideoPlayer` uses `react-native-webview` (no web support) and the CSP has no `frame-src` for YouTube. Confirmed from code, not browser-tested. |
| L19 | 90% of AI Coach spend in the last 30 days ($10.24 of $11.33) belongs to since-deleted accounts (probably test accounts), so spend can't be attributed. Real free users cost ≈ $0.08/month each; cost is not a concern at this scale. |
| L20 | `_layout.tsx` still checks `segments[0] === 'onboarding'` for a route that no longer exists (dead code). |
| L21 | AI Coach caps are count-then-insert with no lock (`ai_coach_log_chat_request`) — parallel requests can exceed any cap. Combined with M19, free chats are effectively unlimited for a determined abuser. |
| L22 | Only one app-wide error boundary (`app/_layout.tsx:433`) — any screen crash replaces the whole app with the fallback. Expo Router supports per-route `ErrorBoundary` exports. |
| L23 | `CLAUDE.md` is stale: lists a `leaderboard_entries` table that doesn't exist on prod and 3 screens that were removed (`AssessmentGateScreen`, `LeaderboardScreen`, `PowerAssessmentScreen`); no mention of the paywall, AI Coach, Milestone Lane. Misleads new devs and AI agents. |
| L24 | No rate limit on `join_community`, `reserve/redeem_invite_code`, or `confirm-entitlement` (each call hits the RevenueCat API). Guessing is moot today (M2, H6 make codes unnecessary/visible). |
| L25 | Schema hygiene: 3 tables without a primary key (`bodyweight_logs`, `coach_week_notes`, `workout_set_logs`), 23 unindexed foreign keys, `pg_net` installed in `public`, old 3-arg `apply_revenuecat_entitlement` overload still present (service-role gated). |
| L26 | No self-serve data export (right of access under GDPR / Egypt & KSA PDPL); only the privacy-policy contact route. |
| L27 | 187 unused locals/imports app-wide (`tsc --noUnusedLocals`). |

---

## 08-10 audit — status of every item

| Item | Now |
|---|---|
| H4 collapse destroys running workout | **Fixed** — confirm dialog (`WarriorBlockCard.tsx:381`) |
| H5 modal-swap crash candidates | **Open** → M12 |
| H6 tournament trial auto-submits 0 | **Unreachable** — route renders `LockedFeature` |
| H7 leaderboard `getItemLayout` | **Fixed** (57) |
| H8 admin cascade delete | **Open** → L13 |
| M1 invite code burned | **Open, milder** → L14 |
| M2 `Math.random()` invite codes | **Open** → H2 |
| M3 `chat-gemini` no rate limit | **Superseded** — replaced by `ai-coach`; dead function → L1 |
| M4 weekly score unbounded | **Partial** → M7 |
| M5 Static null `display_name` crash | **Open** → M11 |
| M6 ExercisePicker null crash | **Fixed** |
| M7 save/refresh error conflated | **Fixed** |
| M8 TemplateRecommendations error | **Gone** — screen removed |
| M9 BlockConfigWizard rewrites metadata | **Fixed** — spreads `initialMetadata` |
| M10 destructive actions unconfirmed | **Fixed** — day/block confirm, delete-week copy mentions logs |
| M11 coach failures invisible | **Open** → M17 |
| M12 week-note race | **Fixed** — request-key guard |
| L5, L6, L7, L8, L10, L11, L12, L13, L16, L17 | **Fixed** |
| L18 TS errors | **Unchanged** — 14 `Timeout` type errors |
| L1 light-mode chips | **Partly open** — `TierLeaderboardList` fixed; 7 in `LeaderboardModals.tsx` remain |
| L2 Glory leaderboard hard-coded dark | **Open** — 12 hard-coded colours vs 5 theme uses |
| L3 DeleteAccountModal ignores theme | **Fixed** |
| L4 white placeholders on white | **Fixed** |
| L9 Battle "defeat" copy | **Moot** — route renders `LockedFeature` |
| L14 timer logic duplicated | **Reduced** — 3 timer components remain (refactor item, no bug found) |
| L15 ProfileScreen dead code | **Mostly fixed** — 7 unused locals remain (see L27) |

---

## Pending (uncommitted) change — tutorial rework

Reviewed `useScreenTour`, `TourTarget`, `TourHelpButton`, `TutorialContext` diff. No blocking issues.
- *Suspected:* optional steps skip if their target hasn't mounted within **500 ms** (`OPTIONAL_MOUNT_GRACE_MS`) — slow Android transitions may skip steps. Test on a low-end device.
- *Product decision:* per-screen tours auto-start only within 7 days of onboarding, so existing users only get them via the "?" button. Intended?
- `TourHelpButton` has an accessibility label — the pattern M14 needs elsewhere.

---

## Verified clean

- Migration history: 249 local = 249 prod, no drift.
- RLS enabled on 49/49 tables; `public_leaderboard` view is `security_invoker`.
- Money fields on `profiles` are guarded by trigger; `apply_revenuecat_entitlement` requires the `service_role` JWT claim; webhook authenticates with the RC shared secret.
- Every RPC that takes a user/coach id (29 checked across anon + authenticated) either checks `auth.uid()`/admin, or only recomputes/reads harmless data. `log_block_with_sets` is SECURITY INVOKER, so RLS scopes it.
- Leaderboards read `trial_history` (server-written), not user-writable `best_times`.
- Cron targeting RPCs are read-only, dedupe per day/week, and respect opt-outs; all users have a timezone.
- `send-overtake-notification-push`: type-restricted and idempotent (`push_sent_at`).
- Account deletion cascades across ~30 user tables.
- Sign-out clears the push token and RevenueCat identity; all module caches are keyed by user id.
- Free users can finish onboarding (58 did with 1 payer) — the paywall is not a hard wall.
- Reset-password shows inline errors for every failure path.
- Web export builds; no secrets in the bundle (only the publishable key); CSP covers Supabase, Sentry, fonts.
- V2 routes (battle, tournament-*) render a lock screen.
- Storage: one public bucket (`workout-covers`, 152 images, 5 MB/image-type limits); only admins can write.
- Champions Arena submissions are server-validated (floor, tier 9, cooldown); mini-games (Beat the Ladder, Guess the Skill) write only local best scores.
- Startup native calls (RevenueCat, push registration) are wrapped in try/catch.
- AI chat history is stored only on-device, keyed per user; all user-relevant AsyncStorage keys include the user id.
- admin-web builds with 0 type errors and sends CSP / `frame-ancestors` headers.
- Tests: **377/377 pass** (21 suites).

---

## Coverage inventory

| Surface | Count | Status |
|---|---|---|
| Routes (`app/`) | 40 | Gating audited; all 39 screens scanned for loading/error/empty handling; funnel screens + My Journey + workout logging read in depth. **Not walked on a device** |
| Edge Functions | 14 | All: deployed source diffed vs repo. Auth reviewed: payment ×2, notifications ×8, delete-account. `ai-coach` → 09-16 audit |
| Tables | 49 | RLS + all write policies reviewed; `profiles` grants/triggers in depth |
| SECURITY DEFINER functions | 106 | Hygiene counted for all; bodies read for every one taking a user id or granting access; tier-gate audit across all `ai_coach_*` |
| Cron jobs | 4 | Targeting RPCs read; reach measured on prod; 7-day send data reviewed |
| Feature flags (`app_config`) | 2 rows | paywall ON, coach ON, free cap 8 lifetime, pro 40/day, min version 1.2.3 |
| Third-party SDKs | RC, Sentry, Google/Apple sign-in, Anthropic, Expo push | Config reviewed; sign-in not live-tested |
| Web | — | Built to scratch; bundle scanned; CSP compared |
| admin-web | — | `npm audit` only; 08-10 traced all 42 admin actions |

## Not verified — needs you or a device

| Gap | Needs |
|---|---|
| On-device: funnel walk (esp. complete-profile, M18), Android back button, large text sizes, iPad layout (`supportsTablet: true`), performance on a low-end Android, M12 crash repro | A device session |
| RC paywall legal links, sandbox handling, refund event semantics (M23) | RevenueCat dashboard / docs |
| Who can read Edge Function logs / any log drains (sizes C1) | Supabase dashboard → members & log settings |
| Backups / PITR, Auth email-confirmation toggle (M19) | Supabase dashboard |
| Which Supabase project each EAS build profile points at (profiles set no `environment`) | expo.dev → EAS environment variables |
| Sentry source-map upload and alert rules | Sentry dashboard |
| App Store privacy labels & Play Data Safety match reality | App Store Connect / Play Console |

## Metrics you should track but can't today

Signup → name → assessment → onboarding done → first workout → day-7 return · paywall views → purchase (per tier) · AI Coach chats and cost per user · trial pass rate per tier · push open rate and OS-level opt-out · coach-client retention.

---

## Top 10 fixes, in order

1. **C1** — deploy repo `delete-user-account`, rotate keys, check log drains.
2. **H1** — re-add the paid gate to the 3 AI Coach RPCs.
3. **H6 + H2 + H3 + L14** — hide invite codes from clients *first*, then exact-match, crypto-random generation, set `subscription_tier` on redeem. Never ship H3 alone.
4. **M1 + M2 + M20 + M21 + M22 + L5** — one "profiles & read-access hardening" migration: guard `coaching_paused_*`, `community_id`, `display_name` (length + unique index); scope coach log reads to active relationships; drop anon reads on leaderboard tables.
5. **M11 + M12 + M13** — the latent Static crash, the modal-swap crash pattern, and My Journey's "no program" on a blip.
6. **H4 + M3** — ToS page + links, privacy policy AI section, manifest `OtherUserContent`, trial disclaimer, subscription warning in the delete flow.
7. **M15 + M4 + L7** — reminder inactivity cutoff, coach notification dedupe, skip `NO_TOKEN` rows.
8. **H5** — AI Coach deadline (#1) and safety log-and-flag (#4).
9. **M5 + M17** — minimal funnel analytics; report caught errors to Sentry with a user id.
10. **Process** — pre-release check that diffs deployed Edge Functions against `main`, plus a CI check that every `ai_coach_*` write RPC calls the paid gate.

**Also before growth:** M19 email confirmation + L21 cap lock (abuse), M23 webhook ordering, M10 password policy.
**Later / strategic:** M14 accessibility pass, M16 Arabic UI, web polish (L17, L18), L23 refresh `CLAUDE.md`.

---

## Coverage checklist — original audit plan vs this report

| Area | Covered | Where |
|---|---|---|
| **0 · Inventory** (routes, functions, tables, RPCs, crons, SDKs, flags) | ✅ | Coverage inventory; storage + triggers added in pass 3 |
| **A · Money & entitlements** — server gates, webhook auth/ordering/idempotency, confirm-entitlement, client/server parity, restore, leftover grants | ✅ code/data · ⏳ RC dashboard | H1, H2, H3, H6, M6, M23; restore/pricing UI → device |
| **B · AI Coach & cost** — dead endpoints, caps, keys, safety, spend | ✅ | H5, L1, L19, L21; prompt injection & tool auth → 09-16 audit §H |
| **C · Competitive integrity** — trials, power, static, 1MM, arena, weekly, mini-games, clock, leaderboards | ✅ | M7, M8; verified clean section |
| **D · Security & privacy** — RLS read+write, grants, SECURITY DEFINER, overloads, coach isolation, UGC, auth, deletion, secrets, Sentry PII, deps, storage | ✅ | C1, M1, M2, M9, M10, M19–M22, L2–L6, L25 |
| **E · Data & backend health** — migration drift, indexes, keys, orphans | ✅ · ⏳ backups | L12, L25; backups → dashboard |
| **F · Notifications & jobs** — targeting on prod, dedupe, opt-out, token lifecycle | ✅ | M4, M15, L7, L9 |
| **G · Stability, performance, offline** — startup, boundaries, submits, crashes, assets | ✅ code · ⏳ device perf | M11, M12, M13, L15, L22 |
| **H · UX, product & funnel** — funnel data, dead ends, tours, states, a11y, i18n, tablet, V2 deep links | ✅ code/data · ⏳ device walk | M5, M14, M16, M18, pending-change section |
| **I · Analytics & observability** | ✅ · ⏳ Sentry dashboard | M5, M17, L10 |
| **J · Legal, store & compliance** — manifest, policy, ToS, disclaimer, deletion, subscriptions, UGC, data export | ✅ · ⏳ store consoles | H4, M3, M20, L26 |
| **K · Release engineering & code health** — versions, EAS profiles, tests, types, builds, dead code, docs | ✅ · ⏳ EAS env | L8, L11, L23, L27; all builds pass |
| **L · Cost & abuse** — spend, uncapped costs, rate limits, bot signups | ✅ | L19, L21, L24, M19 |

✅ = audited from code and/or prod · ⏳ = needs a dashboard, store console, or physical device (listed under *Not verified*).
