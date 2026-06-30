# Power World & Strength Trials — Audit Task List

Findings from a full read-only audit of the Power World (weighted lift assessments) and Strength Trials (tier-gated timed workouts) features. Severities follow the same scale used in `COACHING_CENTER_AUDIT_TASKS.md`, `STATIC_WORLD_AUDIT_TASKS.md`, and `ONE_MIN_MAX_AUDIT_TASKS.md`. Nothing in this list has been fixed yet.

---

## Power World

Core files: `src/lib/powerLogic.ts`, `src/services/PowerService.ts`, `src/screens/PowerAssessmentScreen.tsx`, `submit_power_assessment` RPC + `power_assessments` table in `supabase/migrations/20260614102615_remote_schema.sql`.

**What's already solid:** `submit_power_assessment` is `SECURITY DEFINER` using `auth.uid()` (no client-supplied user id — the bug class fixed for `submit_trial_result` doesn't exist here). Per-lift individual ceilings are already present (pullup ≤ 150kg, dip ≤ 200kg, squat ≤ 300kg, muscleup ≤ 100kg, lines 1723-1728). `power_assessments` has SELECT-only RLS (no write policy), so the RPC is the only write path — mirrors `static_holds`/`one_min_max_logs`. Power leaderboard queries already have `.limit(50)` at the client level (no unbounded RPC issue here).

### 🟠 High

- [x] **No submission cooldown on `submit_power_assessment`** — `supabase/migrations/20260614102615_remote_schema.sql:1699-1818`. Unlike every other submission RPC in this codebase (`submit_trial_result`: 30s cooldown, `submit_static_hold`: 30s cooldown, `submit_onemm_log`: 30s cooldown), `submit_power_assessment` has zero rate limiting — a user can call it in a tight loop. The fix is simpler than Static/1MM since submission is all-four-lifts at once (not per-movement): a global per-user cooldown checked against `power_assessments.assessed_at` (already stored, no new table needed). 30 seconds matches the codebase convention.

- [x] **`prevent_power_tier_spoofing()` trigger uses `auth.role()` instead of `current_user`, inconsistent with the correct pattern on `profiles`** — `remote_schema.sql:1400-1411` vs `1414-1434`. `prevent_tier_modification()` on `profiles` explicitly uses `current_user IN ('authenticated', 'anon')` because `current_user` changes to `'postgres'` when a SECURITY DEFINER function runs — documented in a comment in that function: *"SECURITY DEFINER RPCs run as the 'postgres' role, which bypasses this block safely."* But `prevent_power_tier_spoofing()` on `power_assessments` uses `auth.role() = 'authenticated'`, which reads the JWT role and remains `'authenticated'` even inside a SECURITY DEFINER function. This means the trigger may incorrectly fire when `submit_power_assessment` does `ON CONFLICT DO UPDATE SET power_tier = ...`, either: (a) blocking legitimate tier promotions via RAISE EXCEPTION, or (b) if `auth.role()` behaves unexpectedly in trigger context, silently failing to protect anything. Either outcome is a bug; the trigger should use `current_user IN ('authenticated', 'anon')` to match `prevent_tier_modification`.

### 🟡 Medium

- [x] **Power-tier promotion thresholds (Voltaic/Ampere/Tesla: 0/100/250) are duplicated between `powerLogic.ts` and the `submit_power_assessment` RPC** — `src/lib/powerLogic.ts:21-26` and `remote_schema.sql:1771-1778`. Two places (lower risk than Static/1MM's 3x duplication), but a future threshold change still needs updating both. Could be consolidated into a single DB lookup table or at minimum a comment cross-referencing the client constant.

- [ ] **`PowerService.savePB()` passes ALL four lift values to the RPC in one call, including unchanged lifts** — `src/services/PowerService.ts:130-167`. The RPC uses `GREATEST(current, client_supplied)` so this is safe against lowering PBs. However, a user calling the RPC directly (bypassing client logic) can submit any combination of values under their per-lift ceilings in a single call and immediately reach Tesla (250+ points) from a standing start. This is a design-level gap rather than a bypass of the ceiling check — worth noting since it's architecturally different from the per-movement model (Static/1MM/Trials), where the server independently determines the stored PB for the one submitted movement.

- [x] **`PowerAssessmentScreen`'s `onError` logs all errors unconditionally via `console.error`** — `src/screens/PowerAssessmentScreen.tsx:102`. Same console-noise issue already fixed for `StaticWorldScreen.tsx` and `OneMinMaxScreen.tsx` this session. `submit_power_assessment` raises a plain exception ("Assessment values exceed realistic physical limits.") for out-of-bounds values — an expected, known rejection that shouldn't log as an error. No structured error codes (P1001-P1004) yet on Power, but could be added alongside the cooldown fix.

### 🟢 Low

- [x] **Muscle-up multiplier (×2) is hardcoded in three places** — `src/lib/powerLogic.ts:37` (`calculateTotalPowerScore` uses `pbs.muscle_up * 2` directly), `powerLogic.ts:13` (POWER_MOVEMENTS `multiplier: 2`), and `remote_schema.sql:1767` (`muscleup * 2` inline in the RPC). `calculatePowerPoints()` reads the movement's multiplier, but `calculateTotalPowerScore` bypasses it and hardcodes `* 2`. If the multiplier ever changes in `POWER_MOVEMENTS`, `calculateTotalPowerScore` and the RPC would diverge from it.

---

## Strength Trials

Core files: `src/lib/trials.ts` (RITES_OF_PASSAGE), `src/services/TrialService.ts`, `src/screens/TrialScreen.tsx`, `supabase/functions/submit-trial-result/index.ts` (Edge Function), `submit_trial_result` RPC (`supabase/migrations/20260629110000_fix_submit_trial_result_user_id_trust.sql`), `trial_history` table.

**What's already solid:** `submit_trial_result` uses `auth.uid()` (fixed in `20260629110000`). Hard-floor check per tier in Edge Function before DB write. 30s cooldown via `trial_history.attempted_at` in Edge Function. Profile row locked with `FOR UPDATE` preventing concurrent-submission races. `get_tier_leaderboard` is SECURITY DEFINER and bypasses RLS to show all users.

### 🟠 High

- [x] **`trial_history` has a client-facing INSERT policy that lets any authenticated user write arbitrary completion records directly, bypassing all validation** — `remote_schema.sql:3846-3851`:
  ```sql
  create policy "Warriors insert own trials"
    on "public"."trial_history" as permissive
    for insert to public
  with check ((auth.uid() = user_id));
  ```
  A user can call `supabase.from('trial_history').insert({ user_id: auth.uid(), tier_attempted: 9, time_seconds: 1, completed: true })` directly, skipping both the Edge Function (hard-floor + cooldown checks) AND the RPC's `IF p_tier > v_profile.strength_tier THEN FORBIDDEN` guard. The fake record appears on `get_tier_leaderboard(9)` with a 1-second time — real leaderboard poisoning regardless of actual tier. This INSERT policy is unnecessary: `submit_trial_result` is SECURITY DEFINER and bypasses RLS regardless, so removing the policy doesn't break any legitimate write path (same reasoning used to correctly secure `static_holds` and `one_min_max_logs`).

### 🟡 Medium

- [x] **`get_tier_leaderboard(tier_num)` has no `LIMIT`** — `remote_schema.sql:1249-1267`. Returns every user who has ever completed a tier, unbounded, same class of issue as the Static/1MM leaderboard RPCs just fixed this session. Fine today, won't scale.

- [x] **No upper ceiling on `time_seconds`** in either the Edge Function or `submit_trial_result` RPC. Only a floor check exists. A submission with an absurdly large time passes validation and appears in `trial_history`. In practice, `get_tier_leaderboard` uses `MIN(time_seconds)` and tier advancement only records improvements (lower is better), so the practical impact is low — a very slow time doesn't help a user advance or appear at the top of a leaderboard. Still worth a sanity cap (e.g. `time_seconds <= 3600` — no real trial should take over an hour).

- [x] **`TIER_HARD_FLOORS` is duplicated between the Edge Function and `src/constants/Progression.ts`** — `supabase/functions/submit-trial-result/index.ts:5-16` and `src/constants/Progression.ts`. The Edge Function comment says *"must match src/constants/Progression.ts."* Currently in sync (both define the same 10 values), but any floor change needs updating both files in lockstep — including the Deno Edge Function, which is easy to miss. A DB-side floor table (analogous to `onemm_movements`) would make the Edge Function a thin routing layer rather than a policy carrier.

### 🟢 Low

- [x] **`TrialService.isTimeValid()` only checks the hard floor, not a maximum** — `src/services/TrialService.ts:28-31`. Client-side pre-check has no upper bound, same gap as the server. Harmless in practice but inconsistent.

- [ ] **`RITES_OF_PASSAGE` (trial movements/reps) is client-side only** — `src/lib/trials.ts`. The DB has no record of what each trial actually consists of. Neither the Edge Function nor the RPC validates that the user performed the correct movements — only the time floor is checked server-side. This is a known, accepted architectural choice (honor-system), but worth documenting explicitly since it means any time above the floor is accepted regardless of whether the user actually completed the workout.

---

## Priority order for fixes

1. 🟠 **Verify/fix `prevent_power_tier_spoofing` trigger** (`auth.role()` → `current_user`) — could be silently broken today (tier promotions blocked or trigger useless).
2. 🟠 **Remove `trial_history` client INSERT policy** — closes real leaderboard poisoning with zero app-code change.
3. 🟠 **Add cooldown to `submit_power_assessment`** — completes anti-cheat coverage across all four worlds.
4. 🟡 **Add `LIMIT` to `get_tier_leaderboard`**.
5. 🟡 **Fix `PowerAssessmentScreen` console noise** — same pattern already fixed for Static/1MM.
