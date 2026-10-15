# Fair Play: detection, leaderboard holds, resets and appeals

Status: **plan, owner decisions 2026-10-16**. Builds on the leaderboard opt-out (`profiles.leaderboard_hidden`, migration 20261016100000).

## Goal

Spot unrealistic results, let an admin hide the athlete from leaderboards (everywhere, or one area), and give the athlete a fair way back: accept a reset of the flagged results, or appeal with a note.

## Owner decisions

| Question | Decision |
|---|---|
| What a reset removes | **Only the flagged results** (the specific entries); bests and points are recomputed, honest results stay |
| Strength tier after a reset | **Tier stays**; only the flagged trial times leave the boards |
| Flagged score before review | **Stays visible** until the admin acts (flags only queue it) |
| Permanent ban | **Hidden from every board forever**; the app stays usable (training, programs, coach); a reset can't undo it |
| Strikes | **Admin chooses each time** ("counts as a strike" on the action); the athlete is warned once they have a strike |
| Admin alerts | **Admin panel queue** ("Flags" page) |
| Inactive 45+ days | **Admin panel queue**; admin may hide (no strike/reset); athlete un-hides with **one tap** on a welcome-back card |
| Appeal | **Hide stays while pending**; one appeal per action; accept = unhide, no reset, strike removed; reject = they can still accept the reset |
| Limits | **Claude drafts starting limits; the admin tunes them** in the panel |

## How it works

### 1. Detection (automatic, server-side)
- A `fair_play_limits` table holds per-area / per-movement rules, editable by admins:
  - **absolute**: a hold longer than X s, reps per minute above Y, a 1RM above Z × bodyweight, a weekly score above a cap;
  - **jump**: a new result more than N % better than the athlete's own previous best;
  - **burst**: more than K submissions in an hour.
- A trigger on each result table (`trial_history`, `static_holds`, `power_assessments`, `one_min_max_logs`, `weekly_entries`) checks new rows and writes a `fair_play_flags` row: athlete, area, the exact result (table + row id), value, rule hit, severity. Nothing is hidden automatically.
- Strength already rejects times below each tier's minimum, so Strength flags rely on **jump** and **burst** rules.
- A one-time scan flags existing results against the starting limits, so the queue isn't empty on day one.

### 2. Admin review (admin panel)
- **Flags** page: the queue, newest first, with the evidence (result, the athlete's history, the rule hit). Actions:
  - **Dismiss** (looks real);
  - **Hide from this area** (e.g. Static), with the flagged results attached;
  - **Hide from all leaderboards**;
  - **Permanent ban** (all boards, forever);
  - each with **"counts as a strike"** and a note to the athlete.
- **Athlete** panel: their flags, holds, strikes and appeals.
- **Appeals** page: accept or reject, with a reply.
- Every action is written to `admin_audit_log`.

### 3. Leaderboard visibility (one rule everywhere)
- A `leaderboard_holds` table: athlete, scope (`all` / `strength` / `static` / `power` / `endurance` / `weekly`), the flagged results, status (`active` / `lifted` / `permanent`), strike flag, notes.
- Every board asks one function, `leaderboard_visible(athlete, scope)`: visible to others only if the athlete hasn't hidden themselves **and** has no active hold for `all` or that scope. You always see yourself.
- Well-Rounded boards combine Static, Power and Endurance, so a hold in **any** world also hides the athlete there (owner-confirmed 2026-10-16).
- The user's own "Hide me" switch and an admin hold are separate: switching "Hide me" off never lifts a hold.

### 4. The athlete's side (app)
- On next open, a notice explains: what was hidden (all boards or one area), which results were flagged, the admin's note, and whether it counted as a strike. If they already have a strike, it warns that another can mean a permanent ban.
- Choices:
  - **Accept the reset**: the flagged results are removed, bests and points are recomputed, and the hold is lifted. They're visible again.
  - **Send a note (appeal)**: one per action; they stay hidden until the admin decides.
  - **Not now**: they stay hidden, and the notice is in Settings.
- **Permanent ban**: information only; they can still appeal once.
- Their own rows show a "hidden" label, as with the opt-out.

### 5. Resets (what "remove the flagged results" does per area)
| Area | Removed | Recomputed |
|---|---|---|
| Strength | the flagged `trial_history` times | leaderboard bests (tier unchanged) |
| Static | the flagged `static_holds` rows | static points / Well-Rounded |
| Power | the flagged `power_assessments` rows | power PBs and points (**tier stays**, owner-confirmed 2026-10-16) |
| Endurance | the flagged `one_min_max_logs` rows marked `excluded_from_pb` | endurance points / Well-Rounded |
| Weekly | the flagged `weekly_entries` row | that week's board |

## Inactive athletes (owner request 2026-10-16)
- An athlete with **no activity for 45 days** shows up in the admin panel's queue (same place as Fair Play flags), as "Inactive 45+ days", with their last activity date and where they rank.
- The admin decides: **hide from leaderboards** (a hold with reason `inactive`, scope `all`) or leave them.
- An inactive hold is **not** a cheat action: no strike, no reset, results untouched.
- When the athlete comes back, a **welcome-back card** on opening the app offers "Show me on leaderboards again"; **one tap** lifts the hold. They can also do it from Settings.
- "Activity" = the latest of: app opens recorded in `app_events`, workouts logged, trial / world / weekly results.

## Build steps
1. **Finish the leaderboard opt-out** using the shared `leaderboard_visible(athlete, scope)` (boards are built once and later gain holds without changes).
2. **Database:** limits (drafted starting values), flags + detection triggers + one-time scan, holds, strikes, appeals, admin RPCs (audited), athlete RPCs (accept reset, appeal), visibility function extended with holds.
3. **Admin panel:** Flags queue, athlete moderation panel, appeals inbox, limits editor.
4. **App:** the athlete notice, accept-reset and appeal flow, status in Settings, "hidden" labels.
5. **Terms / privacy policy:** a fair-play section (results may be reviewed, hidden or removed; how to appeal).

## Open items
- Starting limits: drafted in step 2 for the owner to review before the scan runs.
- Optional later: a push to the athlete when an action is taken, and to admins for high-severity flags.
