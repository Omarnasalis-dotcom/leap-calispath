# Pre-Release Submission Audit — Task Plan

**Target:** v1.1.1 · iOS build 1 · Android versionCode 2
**Reviewed:** 2026-07-04
**Scope:** Full read-only pass — security/RLS, database migrations, code quality, build config. No source files were changed as part of this audit; every item below is a task to triage.

**Verdict:** Not ready to submit as-is. Three Critical security holes let any authenticated user manipulate other users' match outcomes, tournament results, and Glory Score, and the native `ios/`/`android/` project files are already out of sync with `app.json` — the same drift that's bitten this repo before.

**Totals:** 3 Critical · 5 High · 6 Medium · 7 Low · 14 verified clean

**Feature-lock context:** Champion Arena, Tournament, Clashes, and Glory Score are product-confirmed as locked/planned-for-future. Verified: `app/battle.tsx`, `app/tournament-lobby.tsx`, `app/tournament-trial.tsx`, and `app/arena-workout.tsx` are all genuine `<LockedFeature>` "Season 2" placeholders — the real screens (`BattleScreen.tsx`, `ClashService.ts`) are orphaned, no route imports them, so nothing in the shipped app can navigate a user there. **This does not reduce the priority of the RPC findings below.** A Supabase `SECURITY DEFINER` function is callable by any authenticated user directly over the REST API the moment it exists in the database — the app having no reachable screen for it is not an access control. Any user with a free account and `curl`/Postman can invoke these today, entirely bypassing the app. Recommend either fixing the auth check properly (preferred) or, if that can't happen before this build, temporarily revoking `EXECUTE` on the affected functions from the `authenticated` role until the feature actually ships — nothing in the shipped app calls them today, so revoking is a safe stopgap. `calculate_glory()` in Phase 3 is reclassified as expected groundwork for the locked Glory feature, not a defect.

---

## Phase 0 — Submission Blockers (fix before cutting the build)

- [ ] **Patch `claim_clash_victory` and `finish_clash_session`** — neither checks `auth.uid()` against the id parameters it trusts. Any authenticated user can force a win/Glory payout (+25/-15) between two arbitrary users; `finish_clash_session` also accepts 0/negative `time_seconds`. Same bug class already fixed once by dropping `payout_tournament`. **Confirmed:** `app/battle.tsx` is a genuine `<LockedFeature>` "Season 2" placeholder — `BattleScreen.tsx`/`ClashService.ts` (the only client code that calls these RPCs) are orphaned, no route reaches them. So this isn't reachable by browsing the app; it's reachable by anyone calling the Supabase RPC directly (curl/Postman), independent of the UI lock.
  `supabase/migrations/20260614102615_remote_schema.sql:857-878,982-1046` · `src/screens/BattleScreen.tsx:188` (orphaned) · `src/services/ClashService.ts:140` (orphaned)

- [ ] **Patch `conclude_knockout_tournament(p_session_id, p_winner_user_id)`** — same vulnerability class, found while re-checking Tournament with the feature-lock note in mind. It verifies `p_winner_user_id` is *a* participant in the tournament, but never checks the *caller* is that participant, the tournament organizer, or has any authority to conclude the match at all. Any authenticated user who knows a `session_id` and a valid participant's id can call this directly, force that tournament to `completed`, and mint `tournament_gp`/`glory_score` payouts (75%/25% split for 1st/2nd) for arbitrary participants. `payout_tournament`'s arbitrary-amount version of this bug was already fixed by dropping it in the same migration that introduced this function — the caller-authority check just wasn't added here. Same as above: `app/tournament-lobby.tsx`/`app/tournament-trial.tsx` are genuine locked placeholders, so this is a direct-API-only exposure, not an in-app one.
  `supabase/migrations/20260629131000_add_tournament_conclusion_rpcs.sql:93-159`

- [ ] **Resync native projects with `app.json`.** `eas.json`'s `appVersionSource: "local"` means EAS reads versions from the checked-in `ios/`/`android/` files, not `app.json` — and they disagree (Info.plist 1.0.1/build 1; Xcode project 1.0/build 1; build.gradle 1.0.1/versionCode 2; app.json 1.1.1/build 1/versionCode 2). Run `npx expo prebuild` (or manually sync) and re-verify all three sources agree. This exact drift already caused an incident once (commit `c403586`).
  `ios/LeapArena/Info.plist` · `ios/LeapArena.xcodeproj/project.pbxproj` · `android/app/build.gradle` · `app.json`

- [ ] **Add `POST_NOTIFICATIONS` to the Android manifest.** Missing entirely — silently breaks notification delivery on Android 13+. Should self-resolve once the prebuild above regenerates the manifest; verify explicitly rather than assuming.
  `android/app/src/main/AndroidManifest.xml`

---

## Phase 1 — High Priority (fix this release if at all possible)

- [ ] **Fix the invite-code redemption IDOR.** `redeem_invite_code(p_code, p_user_id)` never checks `auth.uid() = p_user_id`. Only self-redemption happens today client-side, but the RPC is directly callable — a user with a valid code and another user's UUID could redeem against that victim's profile, overwriting `access_expires_at` unconditionally.
  `supabase/migrations/20260614102615_remote_schema.sql:1770-1810` · `src/screens/AuthScreen.tsx:148-151`

- [ ] **Add a DB-side cooldown to `submit_trial_result`.** Every other submission RPC (static/power/1MM/weekly-score) got a 30s cooldown this cycle; this one still relies solely on the `submit-trial-result` Edge Function's cooldown, which is bypassable by calling the RPC directly.
  `supabase/migrations/20260630160000_add_tier_hard_floors_table_and_enforce_in_rpc.sql:47-140` · `supabase/functions/submit-trial-result/index.ts:20,124-138`

- [ ] **Fix `save_program_template`'s silent exercise wipe.** `block_exercises` is deleted for every previous block up front, before the per-block loop that preserves blocks with logged-workout history. Those preserved blocks are no longer in the incoming payload, so they never get re-populated — permanently empty of exercises on the coach's next save.
  `supabase/migrations/20260629100000_add_save_program_template_function.sql:~66-120`

- [ ] **Fix the 1-Minute Max screen's missing back button.** `onBack` is threaded down and required but never called — the header renders only a title between two blank spacers. Only exit is hardware back/swipe or the tab bar.
  `app/one-min-max.tsx:12` · `src/screens/OneMinMaxScreen.tsx:32,237-260`

- [ ] **Reconnect or remove the "Ask Leap" AI coach prompt.** `onShowCoachPrompt` is threaded into `ProfileHeader` but never invoked — the ~40-line modal behind it can never open for any user.
  `src/screens/ProfileScreen.tsx:411,560-599` · `src/components/profile/ProfileHeader.tsx:34,63`

---

## Phase 2 — Medium Priority (track, fix soon after release)

- [ ] **Consolidate the two overlapping profile-protection triggers.** `prevent_tier_modification`'s protected-column list is a strict subset of `guard_profile_protected_fields`'s — the first never blocks anything the second doesn't already. Not a hole, but misleading for future maintenance; consider dropping `prevent_tier_modification`.
  `supabase/migrations/20260614102615_remote_schema.sql:1414,4066` · `20260626135354_remote_schema.sql:3`

- [ ] **Reconnect or remove the in-profile Glory leaderboard callback.** Same dead-callback pattern as the coach prompt (`onFetchGloryLeaderboard` never invoked) — lower priority since `app/glory-leaderboard.tsx` still gives users a working path to the same data.
  `src/screens/ProfileScreen.tsx:112,365-377,414,551-552` · `src/components/profile/ProfileHeader.tsx:37,66`

- [ ] **Remove the dead `category === 'power'` branches on the Profile/Strength screen.** `handleCategorySwitch` (the only setter) is never called since the bottom tab bar now routes Power straight to `/power-world`. Every `category === 'power'` path in `StrengthWorldView`, `TierRankCard`, `TierSelectorRow` is unreachable dead code.
  `src/screens/ProfileScreen.tsx:258-266` · `src/components/profile/BottomTabBar.tsx:25`

- [ ] **Render (or remove) ScoreBar's `rank` prop.** "Leaderboard →" affordance text is passed but never rendered — the Well-Rounded Athlete card is still pressable, just missing the label telling users what tapping it does.
  `src/components/profile/ProfileHeader.tsx:195` · `src/components/profile/ScoreBar.tsx:14,25`

- [ ] **Remove the 3 dead props `StrengthWorldView` still declares** (`tierName`, `tierRankData`, `onShowTierModal`) — harmless today since `TierRankCard` has its own working copy, but a future edit to this component's copy would silently do nothing.
  `src/components/profile/StrengthWorldView.tsx:27-28,36,50-51,59`

- [ ] **Delete `PowerAssessmentScreen.tsx`.** Writes directly to `power_assessments` bypassing bounds-checks/cooldown/logging entirely; no route imports it; the table has no INSERT/UPDATE RLS policy so it would fail if ever reconnected. Confirmed dead — remove before it gets copy-pasted into a live flow.
  `src/screens/PowerAssessmentScreen.tsx:67-77`

---

## Phase 3 — Low Priority / Cleanup Backlog

- [x] ~~`calculate_glory()` is never called anywhere~~ — **expected, not a defect.** Glory Score is a product-confirmed locked/future feature; this is unused groundwork, not dead code to clean up. Worth remembering that persisting `profiles.streak` this session doesn't feed any live calculation yet, contrary to that migration's own comment — revisit once Glory actually ships.
  `supabase/migrations/20260614102615_remote_schema.sql:829`
- [ ] Remove two unused iOS permission strings (`NSFaceIDUsageDescription`, `NSMicrophoneUsageDescription`) with no matching code — Apple review can flag unused permission descriptions.
  `ios/LeapArena/Info.plist`
- [ ] Bump Android `versionCode` to 3 rather than reusing 2, in case that value was already uploaded to Play Console for a prior closed-testing build.
  `app.json` · `android/app/build.gradle`
- [ ] Prune `ProfileScreen.tsx`'s ~87%-dead `StyleSheet.create` block (162 of 186 keys unreferenced — leftovers from before this screen's JSX moved into sub-components) and `StrengthWorldView.tsx`'s 9 unused "next step banner" style keys.
  `src/screens/ProfileScreen.tsx:635-1712` · `src/components/profile/StrengthWorldView.tsx:201-245`
- [ ] Remove confirmed-dead imports/vars/handlers: `ProfileScreen.tsx` (`Image, ActivityIndicator, SafeAreaView, TextInput, FlatList, WarriorButton, WarriorCard, LinearGradient`, unused `initialTier` prop, dead handlers `onOpenAssessment/onOpenChampionsArena/onOpenClash/onOpenTournamentArena`) and `OneMinMaxScreen.tsx` (`useRouter`/`router`, `Animated`, `ONEMM_CATEGORIES`, `toggleTheme`).
  `src/screens/ProfileScreen.tsx` · `src/screens/OneMinMaxScreen.tsx`
- [ ] **`AuthGuard`'s tier-lock comment doesn't match its own code.** `app/_layout.tsx:106` says it enforces tier gates for "Static, Clash, Power, Champions," but the `tierLocks` map (line 108-111) only actually contains `static-world` and `power-world` — Clash/Champions were never added. Harmless *today* only because `app/battle.tsx`/`tournament-lobby.tsx`/`tournament-trial.tsx`/`arena-workout.tsx` are unconditionally locked placeholders regardless of tier — but there's no safety net if one of those routes is ever swapped back to a real screen without also remembering to add it here. Either fix the comment to reflect reality, or add the entries defensively now while it's free.
  `app/_layout.tsx:106-117`

---

## Verified Clean (no action needed)

**Security**
- No service-role or Gemini key reachable client-side — `chat-gemini` is admin-gated server-side.
- Every RLS-enabled table has at least one real policy; no silent full-lockout tables.
- All coach/admin gates are backed server-side by matching RLS or RPC ownership checks.
- Bulk of submission RPCs correctly check auth, bound inputs, and scope ownership.
- `delete-user-account` only ever deletes the caller's own account.

**Database**
- Every user-data table's FK cascades correctly — account deletion leaves no orphaned rows.
- `prevent_power_tier_spoofing`'s current-user bypass pattern is consistent across migrations.
- Static/1MM leaderboard RPCs layer correctly across their refactor migrations.
- No RPC-name or table-name typos between `src/` and the migration-defined schema.

**Code Quality**
- All non-`__DEV__` console logging is neutralized in production; live `console.error` sites log no PII.
- All other route param names match between producer and consumer — no other broken deep links.
- No TODO/FIXME/HACK markers exist anywhere in the repo.

**Build Config**
- Photo library / notification permission strings match real usage; no unused Android permissions.
- `.env.local` currently points at production, matching `.env.production`'s host.
- Expo SDK 54 / React Native 0.81.5 / React 19.1 — no risky dependency pins.
- `eas.json` production profile has no dev-client leakage or env override risk.
- Deep link scheme (`leaparena://`) correctly configured on both platforms.
