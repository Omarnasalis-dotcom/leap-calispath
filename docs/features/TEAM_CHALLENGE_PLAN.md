# Team Challenge: Implementation Plan

Status: Phases 1–3 (database, app scoring lib + service + server clock, admin-web page) done on branch `team-challenge`. Not applied to prod (2026-10-08). The owner's decisions are summarized below and come from a clarification session.

## 1. What we're building

Each week an admin publishes a team challenge. A leader creates a team and shares an invite code, and members join with that code. The team trains together in one place, with every member on their own phone. Teams can make unlimited attempts and their best result is ranked on the challenge leaderboard. Team history keeps the team names, players and results.

| Decision | Value |
|---|---|
| Who creates the workout | Admin (admin-web) |
| Workout type | `time` (For Time, with a required cap) or `reps` (AMRAP, with a duration) |
| Team format (label + description shown to users; it also sets who submits) | `sync`, `switch` or `collect` |
| Team size | Fixed per challenge: 2, 3 or 4 |
| Levels | One challenge for all tiers, with no handicap |
| Points | Weekly Challenge movement points (`reps × points`) |
| Attempts | Unlimited; the best one counts |
| Membership | Unlimited, including several teams in the same challenge |
| Price | Free for every signed-in, assessed user |
| Internet | Required during an attempt, because time is measured on the server |
| Entry point | A **Solo / Team** switch at the top of the Weekly Challenge screen |

### Scoring

| | Sync / Switch (the leader submits) | Collect (each player submits) |
|---|---|---|
| For Time, finished | Leader taps Finish, and team time = server time since the start | Each player taps Finish, and team time = the **sum** of the players' times |
| For Time, cap reached | Leader enters how far the team got (rounds + reps) and gets cap + penalty | That player enters how far they got and gets cap + penalty; the team adds up all players |
| AMRAP | Leader enters rounds + extra reps per movement, and the team gets those points | Each player enters their own rounds + reps, and the team total is the sum. The leader fills in for a player who dropped out |

- **Penalty is 1 second per missing rep.** For example, a 10:00 cap with 12 reps left scores 612 s. This means a team that finishes always beats a capped team.
- **Ranking:** For Time ranks by lowest seconds and AMRAP by highest points. Ties go to the earlier submission, as in `sortBoard`.

## 2. Data model (one migration)

```
team_challenges
  id uuid pk, title text, description text,
  format text check in ('sync','switch','collect'),
  scoring_type text check in ('time','reps'),
  movements jsonb            -- [{name, reps, points}] (same shape as weekly_challenges)
  rounds smallint default 1  -- For Time: rounds of the movement list (1 = chipper)
  time_limit_sec int not null  -- AMRAP duration or For Time cap
  team_size smallint check between 2 and 4,
  starts_at timestamptz, ends_at timestamptz, is_active bool,
  started_notification_sent_at timestamptz,
  created_by uuid, created_at, updated_at

teams
  id uuid pk, challenge_id fk → team_challenges (on delete cascade),
  name text (1–24 chars, unique per challenge, case-insensitive),
  leader_id uuid fk → profiles (on delete set null),
  invite_code text unique (6 chars, server-generated, no 0/O/1/I),
  locked_at timestamptz      -- set at the first submitted attempt; roster frozen
  best_attempt_id uuid, best_score numeric, best_submitted_at timestamptz,
  attempts_count int default 0, created_at

team_members
  team_id fk (cascade), user_id fk → profiles (on delete set null → history keeps the row),
  role text ('leader','member'), joined_at, primary key (team_id, user_id)

team_attempts
  id uuid pk, team_id fk (cascade), challenge_id,
  status text ('countdown_running','scoring','submitted','abandoned'),
  started_at timestamptz     -- server now() + 3 s (3-2-1 countdown)
  cap_at timestamptz         -- started_at + time_limit_sec
  score numeric, capped bool, submitted_at timestamptz, created_by uuid

team_attempt_results          -- one row per member (Collect); one team row (Sync/Switch)
  attempt_id fk (cascade), user_id uuid null (null = whole-team row),
  time_sec numeric, rounds int, partial int[], capped bool,
  score numeric,             -- computed on the server
  entered_by uuid, entered_at
```

**Access** (lessons from the Tournament audit: no client writes at all):
- All six tables: `REVOKE ALL FROM anon, authenticated`, then `GRANT SELECT` by column to authenticated.
- `teams.invite_code` is **not** granted. Members get it through `get_team_invite_code(team_id)`.
- RLS is enabled. SELECT is open to authenticated users on challenges, teams, members and attempts, because the leaderboard and history are public in the app. There are no INSERT/UPDATE/DELETE policies; every write goes through RPCs.
- Grant SELECT by column in the same migration. A table-level REVOKE wipes column grants (see memory: postgres_revoke_wipes_column_grants).

**Realtime:** add `team_attempts`, `team_attempt_results` and `team_members` to the `supabase_realtime` publication. This would be the first realtime use in a released feature, so clients also poll every 3 s while the lobby or attempt screen is open.

## 3. Server functions (SECURITY DEFINER, `auth.uid()`, `search_path = public`, EXECUTE revoked from anon)

| RPC | Who | Checks / effect |
|---|---|---|
| `admin_upsert_team_challenge(...)` / `admin_delete_team_challenge(id)` | `is_admin()` | Validates movements, size, dates. A challenge can only be deleted while it has no teams. Writes to `admin_audit_log` |
| `admin_delete_team(team_id)` | admin | Moderation (offensive names). Audited |
| `create_team(challenge_id, name)` | any assessed user | Challenge is open; name is valid and unique. Rate limit: 10 teams per user per challenge. Leader becomes a member. Returns id + code |
| `join_team(code)` | any | `FOR UPDATE` on the team row, so two people can't take the last place at once. Team isn't full or locked, challenge is open, caller isn't already a member |
| `leave_team(team_id)` / `remove_team_member(team_id, user_id)` | member / leader | Only before `locked_at`. If the leader leaves, leadership passes to the earliest-joined member; the last member leaving deletes the team |
| `get_team_invite_code(team_id)` | member | — |
| `start_team_attempt(team_id)` | leader | Team is full, challenge is open, no attempt is running (stale ones become `abandoned` here), 30 s cooldown. Sets `started_at = now() + 3s`. Returns the attempt and the server's `now()` |
| `finish_team_attempt(attempt_id)` | leader | Sync/Switch For Time. Time = `now() - started_at`, and it is rejected once past `cap_at` (use the progress form) |
| `finish_member(attempt_id, user_id)` | that member, or the leader for them | Collect For Time. Time is measured on the server |
| `submit_progress(attempt_id, user_id or null, rounds, partial[])` | leader (team row or a missing member), or the member themselves | AMRAP score, or capped For Time progress. Accepted only after `cap_at` (AMRAP), or once capped (For Time), until `cap_at + 15 min` |
| `abandon_team_attempt(attempt_id)` | leader | — |
| *(internal)* `finalize_team_attempt(attempt_id)` | called by the above | Runs once every needed result exists. Sums or uses the team row, applies plausibility limits (§4), sets `submitted`, updates `teams.best_*` when the score is better, sets `locked_at` on the first submit |
| `get_team_challenge_board(challenge_id)` | authenticated | Best attempt per team: rank, name, member display names, score, attempt count |
| `get_my_teams()` | authenticated | History: teams the caller was in, with challenge, members and best result |
| `get_team_state(team_id)` | member | Lobby plus the current attempt, with all results and the server `now()` |

## 4. Scoring rules and anti-cheat (server is the source of truth, mirrored in `src/lib/teamChallenge.ts`)

- **Round points / total reps:** reuse `roundPoints`, `totalReps`, `clampPartial` and `amrapScore` from `src/lib/weeklyChallenge.ts`.
- **For Time total reps required:** `rounds × Σ movement reps`. **Reps done** = `completedRounds × Σreps + Σ clampPartial`.
- **Capped time** = `time_limit_sec + (required − done)`.
- **Plausibility** (same calibration as `submit_weekly_score`):
  - Per-player For Time must be at least 1 s × required reps.
  - AMRAP points per player must not exceed `roundPoints × (minutes × 3 + 1)`.
  - The same single-player ceiling also applies to the leader's team row in Sync/Switch AMRAP. The team does one shared set of rounds, and the ceiling is already about 3× the best real Weekly pace.
- **Server time:** finish times come from server timestamps, so phone clocks are never trusted. Network latency (~100–300 ms) is acceptable.

## 5. App (React Native)

**Files**
- `src/lib/teamChallenge.ts`: pure scoring and ranking helpers, plus jest tests in `src/lib/__tests__/teamChallenge.test.ts`.
- `src/services/TeamChallengeService.ts`: RPC wrappers only, no direct table writes.
- `src/hooks/useServerClock.ts`: offset = server `now()` − `Date.now()` taken from each RPC response. `elapsed = Date.now() + offset − started_at`. Built on the same wall-clock approach as `useWallClockTimer`.
- `src/screens/team/`: `TeamHub` (inside Weekly Challenge: this week's challenge, my teams, Create / Join with code), `TeamLobby`, `TeamAttempt`, `TeamScoreEntry`, `TeamResult`, `TeamHistory`.
- `src/components/team/`: format badge, member row, board (reuse `WeeklyBoard` / `WeeklyParts` where possible).

**Flow**
1. **Weekly Challenge → Team tab.** Shows the week's team challenge card (title, format badge, type, size, description) and two buttons, **Create team** and **Join with code**, plus *My teams*.
2. **Create.** The user enters a name and lands in the lobby. The lobby shows the invite code with Copy and Share buttons (native share sheet).
3. **Lobby** (realtime + polling). Shows member slots `2/3`. The leader sees **Start** once the team is full; members see "Waiting for leader". The leader can remove members until the first submitted attempt.
4. **Attempt.** Every phone switches automatically on the `team_attempts` change. There's a 3-2-1 countdown, then a big timer (count-up for For Time, countdown for AMRAP). The screen stays awake and background alerts are reused.
   - Sync/Switch For Time: the leader has **Finish**; members see the timer only.
   - Collect For Time: every player has **Finish**, plus a live list of who has finished. The leader can tap Finish for a member.
   - At the cap or the end of AMRAP: the score-entry form for whoever must submit (rounds + reps per movement, as in `ChallengeLog`).
5. **Result.** Shows the team score, the attempt's rank, whether it's a new team best, and the board.
6. **Recovery.** Reopening the app mid-attempt resumes from `get_team_state`, because the timer is server-anchored.

**Every screen:** EN + AR strings with RTL checked (memory: feedback_check_both_languages, rtl_photos_gradients_dont_mirror), light and dark, Worlds kit tokens, and `track()` events (`team_created`, `team_joined`, `team_attempt_started`, `team_attempt_submitted`).

**Feature flag:** `app_config.team_challenge_enabled` per platform, so the tab can ship dark and be switched on without a build.

## 6. Admin web

A **Team Challenges** page next to the weekly challenge pages:
- Create and edit challenges: title, description, format, type, movements (reuse the movement picker, points and challenge templates), rounds, time limit / cap, team size, dates.
- List challenges with team and attempt counts.
- View the board, with a **Delete team** action for moderation.
- Everything goes through the admin RPCs and is audited.

## 7. Build order

| Phase | Work | Verify |
|---|---|---|
| 1 | Migration: tables, grants, RLS, realtime publication, all RPCs | Throwaway local Postgres smoke test (memory: local_migration_smoke_test_without_docker): every RPC's happy path and rejections, the join race, grants (anon has none), no direct writes |
| 2 | `teamChallenge.ts` + service + `useServerClock` | Jest: scoring, penalty, ranking, plausibility mirrors server values |
| 3 | Admin web page | Create a challenge on local; audit rows written |
| 4 | Team tab, hub, create/join, lobby | Two simulators / devices, EN + AR |
| 5 | Attempt + score entry for all 6 combinations (3 formats × 2 types) | **2–4 real phones**: countdown in sync, finish, cap + penalty, dropout + leader fill-in, app killed mid-attempt and resumed, network drop |
| 6 | Result, board, history | Ranking ties, best-attempt replacement, deleted-account member |
| 7 | Flag off → apply migration to prod → deploy push sender → read-only targeting check → app build → flag on | Read-only check of grants and policies on prod; confirm no fan-out notifications |

**Release note:** DB and admin-web changes deploy on their own. The app screens need a store build.

## 8. Defaults chosen (change any of them)

1. The challenge window is set by the admin, defaulting to Sat 00:00 → next Sat 00:00 UTC, to match Weekly.
2. An attempt can only start when the team is full. *(Owner)* Members don't need to be "present"; a member who opens the app late joins the running timer.
3. The roster locks at the first submitted attempt. Before that, members can leave and the leader can remove members. *(Owner)* If the leader leaves, the earliest-joined member becomes leader.
4. Invite codes stop working when the team is full or locked, or when the challenge ends.
5. There's a 30 s cooldown between attempts. An unfinished attempt is abandoned after `cap + 15 min` or when the next attempt starts.
6. When an account is deleted, membership rows keep the team's history and show "Deleted user".
7. *(Owner)* The only push in v1 is **"New team challenge is live"**. A `send-team-challenge-started` cron function, modeled on `send-weekly-challenge-started`, uses a `started_notification_sent_at` column on `team_challenges` so it sends once. Before invoking it on prod, run a read-only check of who it targets (memory: scheduled_notification_incident_2026_08_05).
8. The board shows every team in the challenge. Teams with no submitted attempt are hidden.

## 9. Risks

- **Live sync is new to production.** Realtime is unproven in a released feature here; polling every 3 s covers it if realtime events drop.
- **Gym connectivity.** No signal means no attempt (accepted). A short drop mid-attempt is fine, because the start time lives on the server and Finish retries via `withNetworkRetry`.
- **Unlimited membership in the same challenge** lets one strong player carry several teams. The owner accepted this.
- **Honor-system reps.** Times are measured on the server, but reps and rounds are self-reported, checked only by the plausibility limits. This is the same trust level as Weekly.
