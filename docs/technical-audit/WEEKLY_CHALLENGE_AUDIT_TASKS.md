# Weekly Challenge — Audit Task List

Findings from a full read-only audit of the Weekly Challenge feature (`WeeklyChallengeScreen`, `ChallengeService`, `weeklyChallenge.ts`, `submit_weekly_score` RPC, `weekly_challenges`/`weekly_entries` tables). Severities follow the same scale as the other audit docs. Nothing in this list has been fixed yet.

**Core files:** `src/screens/WeeklyChallengeScreen.tsx` (1191 lines), `src/services/ChallengeService.ts`, `src/lib/weeklyChallenge.ts`, `submit_weekly_score` RPC in `supabase/migrations/20260614102615_remote_schema.sql:1905-1979`.

**What's already solid:** `submit_weekly_score` is `SECURITY DEFINER` using `auth.uid()` — no client-supplied user id. `weekly_entries` has SELECT-only RLS (no INSERT policy), so the RPC is the only write path — correctly mirrors `static_holds`/`one_min_max_logs`. Score bounds exist (0 < score ≤ 10000) — unlike Static/1MM before their fix. DB-level unique constraint on `(challenge_id, user_id)` prevents duplicate entries. Admin-only write policies on `weekly_challenges` enforced at DB level (`is_admin = true`).

---

## 🟠 High

- [x] **Two `getCurrentWeekStart` implementations that disagree on timezone** — `src/lib/weeklyChallenge.ts:72-87` uses `new Date()` + `getDay()` (LOCAL device time) while `src/services/ChallengeService.ts:25-45` uses `Date.UTC` + `getUTCDay()` (UTC). These return different dates for users in timezones where local Saturday ≠ UTC Saturday. `WeeklyChallengeScreen` imports `ChallengeService` for its calls, but also imports `MOVEMENT_POINTS` from `weeklyChallenge.ts` — and any code that still calls `weeklyChallenge.ts`'s `getActiveChallenge()` or `getAllActiveChallengesForWeek()` will use the local-time version, computing a different `week_start` than ChallengeService would. For a user in UTC+14 (Kiribati) or UTC-12 (Baker Island), the local-time version could produce a date one full day ahead or behind the UTC version, making the user see "no active challenge" when one exists. **Only one implementation should exist** — the UTC one in ChallengeService is the correct approach (matches Supabase's UTC-stored `week_start` dates).

- [x] **No submission cooldown on `submit_weekly_score`** — `remote_schema.sql:1905-1979`. The RPC has no rate limiting at all. A user can call it in a tight loop. Unlike every other submission path now (Trials: 30s in Edge Function, Static: 30s, 1MM: 30s, Power: 30s), Weekly Challenge has none. `weekly_entries` stores `submitted_at` which updates on every upsert — same `assessed_at`-based approach used for Power World's cooldown would work here with no new table needed.

---

## 🟡 Medium

- [ ] **`getChallengeLeaderboard()` in `weeklyChallenge.ts` has no `.limit()`** — `src/lib/weeklyChallenge.ts:103-134`. The query has two `.order()` calls (`score` then `submitted_at`) but no `.limit()` — returns every entry for a challenge, unbounded. For a popular challenge with many participants, this grows with user count. Should be capped at 100 (or 50) consistent with other leaderboards.

- [ ] **Score ceiling is a flat 10000 regardless of challenge type** — `remote_schema.sql:1932-1934`:
  ```sql
  IF p_score <= 0 OR p_score > 10000 THEN
      RAISE EXCEPTION 'Submitted score exceeds realistic limits.';
  END IF;
  ```
  For a reps-based challenge with movements worth 1–15 points, a realistic max total is in the hundreds. For a time-based challenge, score is in seconds (a typical 5-minute AMRAP yields 300s as the upper bound). 10000 is a loose ceiling that could accept obviously impossible scores (e.g. 9999 reps in a workout where each rep scores 1 point, which would take several hours). Not as critical as the per-movement gaps fixed in Static/1MM (since MOVEMENT_POINTS gives a natural practical ceiling), but worth tightening.

- [ ] **`getUserBadges()` in `weeklyChallenge.ts` returns hardcoded `champion: 0, top3: 0`** — `src/lib/weeklyChallenge.ts:176-183`. Only `competitor` (total entry count) is real. The function signature promises champion and top3 badge counts but both are permanently zero dead stubs — if any UI ever renders these values, it will always show 0. The real values would require querying historical leaderboard ranks.

- [ ] **`weeklyChallenge.ts` is a parallel API to `ChallengeService` with behavioral divergence** — the codebase has two separate abstractions over the same data: the standalone async functions in `weeklyChallenge.ts` (older pattern) and the class-based `ChallengeService` (newer pattern). `WeeklyChallengeScreen` uses `ChallengeService` for all operations but still imports `MOVEMENT_POINTS` from `weeklyChallenge.ts`. Functions like `getActiveChallenge()`, `submitChallengeScore()`, `createChallenge()`, `deleteChallenge()`, `getAllActiveChallengesForWeek()` exist in both, with the critical `getCurrentWeekStart` difference noted above. Having two APIs creates a maintenance trap — fixing a bug in one (e.g. the UTC fix) must be remembered in both. `weeklyChallenge.ts`'s data-fetching functions should be removed in favour of `ChallengeService`; only `MOVEMENT_POINTS` and pure helpers like `getUserGroup()`/`GROUP_NAMES` are not yet in `ChallengeService`.

- [ ] **`submit_weekly_score` does not validate that the challenge's `week_start` matches the current week** — `remote_schema.sql:1922-1929`. It only checks `is_active = true`. An admin could accidentally leave an old challenge `is_active` (or explicitly reactivate it), and users could submit valid scores to a past week's challenge. Adding a `week_start >= DATE_TRUNC('week', NOW())` check or comparing against the current Saturday would close this.

---

## 🟢 Low

- [ ] **`MOVEMENT_POINTS` has duplicate keys with different casing/pluralisation** — `src/lib/weeklyChallenge.ts:36-57`: `'Squat': 4` and `'Squats': 4` both exist (different keys, same value), likewise `'Lunge': 6` and `'Lunges': 6`. These are lookup keys matched against movement names from `weekly_challenges.movements` (JSONB). If a challenge creator uses "Squat" and a different admin uses "Squats", the scoring lookup works but the duplication is fragile — a point-value change needs to update both keys.

- [ ] **`WeeklyChallengeScreen` is 1191 lines** — the screen handles challenge display, score submission, admin panel (create/delete challenges), leaderboard, week navigation, and timer all in one file. This is not a functional bug but makes it the largest screen in the codebase by a significant margin (~2× others). Worth splitting into sub-components when the feature stabilises.

- [ ] **`ChallengeService.create()` always sets `week_start` to the current week** — `src/services/ChallengeService.ts:99`. Admins cannot create a challenge for a future week in advance via this method — the `week_start` is always computed from `this.getCurrentWeekStart()` at call time, ignoring any `week_start` passed in via the `challenge` param. Probably intentional today but limits flexibility.

---

## Priority order for fixes

1. 🟠 **Remove local-time `getCurrentWeekStart` from `weeklyChallenge.ts`, consolidate on `ChallengeService`'s UTC version** — affects challenge visibility for users in non-UTC timezones.
2. 🟠 **Add 30s cooldown to `submit_weekly_score`** using `weekly_entries.submitted_at`.
3. 🟡 **Add `.limit(100)` to `getChallengeLeaderboard()`**.
4. 🟡 **Remove dead `getUserBadges()` stub or implement it properly**.
5. 🟡 **Remove data-fetching functions from `weeklyChallenge.ts`**, consolidate into `ChallengeService`.
