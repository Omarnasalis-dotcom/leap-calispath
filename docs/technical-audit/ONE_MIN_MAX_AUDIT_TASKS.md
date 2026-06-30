# 1MM World (One Min Max) — Audit Task List

Findings from a full audit of the 1MM World feature (`OneMinMaxScreen`, `OneMMService`, `oneMMLogic.ts`, the `one_min_max_logs`/`one_mm_scores` tables, and the RPCs `submit_onemm_log`/`sync_onemm_points`/`get_onemm_well_rounded_leaderboard`). This is an audit only — nothing in this list has been fixed yet. Severities follow the same scale used in `COACHING_CENTER_AUDIT_TASKS.md` and `STATIC_WORLD_AUDIT_TASKS.md`.

**Headline finding:** 1MM World is in the exact same vulnerable state Static World was in before its anti-cheat fix this session — same missing per-movement ceiling, same missing cooldown, same 3x-duplicated movement metadata across SQL functions. The fix already shipped for Static World (`20260629120000_add_static_movements_and_attempts_tables.sql` + `20260629121000_refactor_static_functions_for_movements_table_and_cooldown.sql`) is a directly reusable template here — same shape of problem, same shape of fix.

## 🔴 Critical

- [ ] **No anti-cheat ceiling proportional to movement difficulty, and no submission cooldown, on `submit_onemm_log`** — `supabase/migrations/20260614102615_remote_schema.sql:1623-1697`. The only validation is a flat `0–150` rep bound applied identically to every movement:
  ```sql
  IF p_reps < 0 OR p_reps > 150 THEN
      RAISE EXCEPTION 'Rep count exceeds realistic human capability.';
  END IF;
  ```
  150 reps of `knee_push_ups` (entry-level, 0.25x multiplier) is plausible; 150 reps of `muscle_ups` or `planche_push_ups` (advanced, 5.0x multiplier — by far the hardest movements here) is not even remotely achievable in 60 seconds, yet the RPC accepts it identically. There is **no submission cooldown at all** — a single account can spam-submit 150 reps on every advanced movement back-to-back with zero rate limiting, instantly topping every 1MM leaderboard with physically impossible scores. No attempt log exists to even detect this after the fact (unlike Static World's new `static_hold_attempts` table).

## 🟠 High

- [ ] **Movement→category→multiplier and movement→pattern mappings are hand-duplicated across three SQL functions, no reference table** — identical to the Static World duplication problem fixed via the new `static_movements` table. Here, the same 10-movement mapping is hardcoded three separate times:
  - `submit_onemm_log` (`...remote_schema.sql:1648-1660`) — movement → category_id + multiplier:
    ```sql
    CASE p_movement_id
        WHEN 'knee_push_ups', 'inverted_row', 'bench_dips', 'air_squats', 'incline_push_ups', 'assisted_pull_ups' THEN
            v_category_id := 'entry'; v_multiplier := 0.25;
        WHEN 'push_ups', 'pull_ups', 'dips', 'goblet_squats', 'deadlift' THEN
            v_category_id := 'main'; v_multiplier := 0.5;
        WHEN 'muscle_ups', 'hspu', 'fl_press', 'fl_pull_ups', 'planche_push_ups' THEN
            v_category_id := 'advanced'; v_multiplier := 5.0;
        ELSE RAISE EXCEPTION 'Invalid movement ID.';
    END CASE;
    ```
  - `get_onemm_well_rounded_leaderboard` (`...remote_schema.sql:1126-1135`) — movement → pattern_id, same 10 movements, different grouping.
  - `sync_onemm_points` (`...remote_schema.sql:1993-2002`) — movement → pattern_id again, third copy.

  Any future movement add/rename needs all three updated in lockstep or risks silent drift (a movement accepted by `submit_onemm_log` but unmapped in `sync_onemm_points` would simply never sync points). Same fix shape as Static World applies: a reference table (`id, category_id, pattern_id, multiplier, max_reps`) all three functions JOIN against instead of CASE.

## 🟡 Medium

- [ ] **`get_onemm_well_rounded_leaderboard()` has no `LIMIT`, returns every user who's ever logged a score** — `...remote_schema.sql:~1115-1160`, `ORDER BY t_score DESC` with no cap. Same class of issue as Static World's three unbounded leaderboard RPCs. Fine today, won't scale.
- [ ] **`OneMMService.getCategoryLeaderboard()` has no `.limit()` on its Supabase query either** — `src/services/OneMMService.ts:240-278`. Pulls every `one_min_max_logs` row for a category (not per-user PBs — every submission ever made), aggregates in JS, then slices to 50 client-side. Should aggregate + limit in SQL instead.
- [ ] **`get_onemm_well_rounded_leaderboard()`'s `RETURNS TABLE` omits `gender`, forcing a second client-side query** — `src/services/OneMMService.ts:181-192` fetches `profiles.gender` separately for every returned user id after the fact, even though the RPC's own internal JOIN against `profiles` already had this column available and discarded it. Same flavor of broken/incomplete-contract issue as Static World's well-rounded leaderboard missing per-category hold times.
- [ ] **`ProfileScreen`'s self-healing `one_mm_points` sync only catches "never synced," not "synced but wrong"** — `src/screens/ProfileScreen.tsx:273-278`, same limitation already flagged for `statics_tier`: only re-runs `sync_onemm_points` when `one_mm_points === 0 || null`, never re-validates an already-nonzero value. Same safety-net gap, compounded by the High-severity duplication finding above.
- [ ] **1MM's unlock tier (0) is hardcoded separately in `WorldSelectorGrid.tsx:51`, not derived from any shared source** — works correctly today (matches `oneMMLogic.ts`'s per-movement `minTier` values, which bottom out at 0), but it's one more place a future tier change would need to be remembered and kept in sync, alongside `oneMMLogic.ts`, `OnboardingTutorialScreen.tsx:35`, and `AssessmentEngine.ts`'s per-movement filter.
- [ ] **`OneMMService` logs every error via `console.error`, including expected validation rejections** — at least 6 call sites (`src/services/OneMMService.ts:88,108,136,153,232,275`), e.g. `console.error('Exception saving 1MM log:', JSON.stringify(err), ...)`. `submit_onemm_log` raises plain exceptions (not `P1xxx`-style error codes) for "rep count exceeds realistic human capability" and "invalid movement ID" — both expected outcomes, not bugs — yet logged identically to a genuine unexpected failure. Same console-noise issue already fixed for Static World's `StaticWorldScreen.tsx` this session. `OneMinMaxScreen.tsx:174-176`'s own `onError` has the same unconditional-log pattern on top of this.
- [ ] **`OneMinMaxTimerModal` has the same dual-listener timer race already flagged for Static World** — `src/screens/OneMinMaxScreen.tsx:753-815`. Both an `AppState` listener and a 250ms `setInterval` independently call `checkTimerStatus()` and can fire near-simultaneously on app foreground, the identical pattern already documented as a "fragile but currently harmless" issue for `StaticWorkoutLogModal` (`StaticWorldScreen.tsx:698-751`).

## 🟢 Low

- [ ] **Unused timer refs declared at the `OneMinMaxScreen` parent level** — `src/screens/OneMinMaxScreen.tsx:59-61` (`timerRef`, `startTimeRef`, `preStartTimeRef`) are declared but never used in the parent component; the actual timer state lives in the nested `OneMinMaxTimerModal` (lines ~749-751), which has its own copies. Leftover from an earlier design where the timer may have lived at the screen level.
- [ ] **`OneMinMaxTimerModal` receives an unused `movementId` prop** — `src/screens/OneMinMaxScreen.tsx:734`, passed from the parent but never referenced in the modal body (only `movementName` is used for display).
- [ ] **Inconsistent `isMounted` guards across the two leaderboard fetchers** — `src/screens/OneMinMaxScreen.tsx:98-107` (`fetchMovementLeaderboard`) has no `isMounted` check in its `catch` block, while `fetchOverallLeaderboard` (`:109-122`) does. Minor unmounted-state-update risk if a request resolves after navigating away.
- [ ] **`ONEMM_MOVEMENTS`' `multiplier` field is unused dead code** — `src/lib/oneMMLogic.ts:16-38`, every movement entry has a `multiplier` (1, 2, or 3), but `calculateOneMMPoints()` (`:40-43`) only reads the *category*-level multiplier (0.25/0.5/5.0, matching the SQL side), never the per-movement one. Misleading — reads like it should provide per-movement scaling but doesn't.
- [ ] **`one_mm_scores` table is fully orphaned** — defined with its own columns and self-only RLS policies (`...remote_schema.sql:153-165` + policies around line 3412), but zero client/RPC code references it. Every actual 1MM log goes through `one_min_max_logs` instead. Same "leftover from an earlier design" shape as Static World's orphaned `statics_assessments` table.
- [ ] **`one_min_max_logs` has no write policies of its own, relies entirely on the `submit_onemm_log` RPC bypassing RLS** — intentional and correct (mirrors `static_holds`'s identical pattern: SELECT-only policy, RPC is the only write path), just noting it as the same correct-but-fragile-if-RLS-is-ever-touched shape already accepted elsewhere in this codebase.

## What's already clean (no action needed)

- `AssessmentEngine.ts`'s 1MM unlock handling is **correct**, unlike Static World's hardcoded tier≥4 bug — 1MM uses each movement's own `minTier` from `oneMMLogic.ts` rather than a hardcoded threshold.
- `WarriorProgramScreen.tsx`'s `OneMMService.getUserStats` call is properly awaited inside `Promise.all(...)` — no fire-and-forget bug (unlike `StaticService.getUserStats`'s already-flagged dead-code issue).
- `profiles.one_mm_points` is well-named (clearly "points," not a tier) — better than `statics_tier`'s misleading name.
- `submit_onemm_log`/`sync_onemm_points` are otherwise solid: single insert point, atomic profile update, no tier-naming confusion.

## Suggested next step

The 🔴 Critical + 🟠 High items here map almost 1:1 onto the Static World fix already shipped this session — a `onemm_movements` reference table (id, category_id, pattern_id, multiplier, max_reps) consolidating the 3x duplication, plus an `onemm_attempts`-style log table for a per-movement cooldown, plus per-movement rep ceilings replacing the flat 150. Same migration shape, same verification approach (test ceiling/cooldown/invalid-id rejection, confirm leaderboard/sync regression-free).
