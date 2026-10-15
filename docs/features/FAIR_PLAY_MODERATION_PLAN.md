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

## Starting limits (draft for owner review, 2026-10-16)

Hard ceilings already exist and are enforced at submit (`static_movements.max_hold_seconds`, `onemm_movements.max_reps`, Strength trial minimums). These limits only **queue a result for review** (it stays visible): they sit at elite level, below the ceilings. All editable later in the admin panel.

**Rules for every area**
- **Jump:** a new best more than **+50 %** over the athlete's own previous best (ignored while the previous best is tiny: < 10 s / < 10 reps / < 10 kg). Strength: a new trial time more than **25 % faster** than their own best on that tier.
- **Burst:** more than **10 results in one hour** in the same area.
- **Strength:** a time within **10 % of the tier's minimum** (the minimum is already the fastest allowed).
- **Weekly:** with 5+ entries, a reps score above **3×** the challenge's median, or a time below **40 %** of it.

**Static holds (seconds)** — researched 2026-10-16. Two bands, both review-only (no action unless the admin decides): **Flag** = well above a strong amateur; **Strong flag** = at or near the world record. Hard ceilings still reject anything above them at submit.

Sources: front lever record 62 s (Michal Urbanik, CaliBase), back lever record 73 s (Joan Romero, Wikipedia), planche record 47 s on parallettes (Michele Esposito, CaliBase); training guides put a clean full front lever of 5–10 s at advanced level and ~10 s as the usual hold before moving up a progression; freestanding handstand ≈ 10 s beginner, 30 s intermediate, ~60 s advanced. Tuck / straddle steps and handstands have no official records: their values are estimates from the same guides.

| Movement | Strong amateur | Record (or estimate) | Flag above | Strong flag at | Ceiling | Prod max |
|---|---|---|---|---|---|---|
| Tuck front lever | 15–20 | ~120 (est.) | 45 | 90 | 300 | 30 |
| Straddle front lever | 8–10 | ~60 (est.) | 25 | 45 | 280 | 10 |
| Full front lever | 5–10 | **62** | 20 | 55 | 240 | **29 → Flag** |
| Tuck back lever | 20 | ~150 (est.) | 60 | 120 | 300 | 50 |
| Straddle back lever | 10–15 | ~90 (est.) | 30 | 60 | 280 | 20 |
| Full back lever | 10–15 | **73** | 30 | 65 | 240 | 10 |
| Tuck planche | 10 | ~90 (est.) | 25 | 45 | 300 | 22 |
| Straddle planche | 3–5 | ~60 (est.) | 12 | 30 | 240 | — |
| Full planche | 3–5 | **47** | 10 | 40 | 120 | 4 |
| Freestanding handstand | 30–60 | far above the ceiling | 90 | 180 | 240 | 56 |
| Wall handstand | 60 | far above the ceiling | 150 | 240 | 300 | 80 |
| One-arm handstand | 3–10 | ~60 (est.) | 20 | 45 | 120 | — |

**Endurance (reps in 60 s)** — researched 2026-10-16, same two bands (review-only). The ceiling still rejects anything above it at submit.

Records found: pull-ups 50–68 (Guinness 50–54; Gymless lists 68), push-ups ~100–140 (Gymless 101 standard; Guinness knuckle 141), parallel dips 43 strict (Gymless) to 66 (RecordSetter, strict) and 90 (looser form), bench / tricep dips 119 (Guinness), bodyweight squats 51 (Guinness "II") / 78 (Guinness female), HSPU 66–79 (Guinness), muscle-ups 15 with a 20 lb pack (Guinness; no clean unweighted 1-min record found). Strong-amateur values are common fitness-test levels (e.g. ~50–60 push-ups, 15–20 pull-ups in a minute). "(est.)" = no reliable record found.

| Movement | Strong amateur | Record | Flag above | Strong flag at | Ceiling | Prod max |
|---|---|---|---|---|---|---|
| Push-ups | 50–60 | ~100–140 | 80 | 100 (ceiling 105) | 105 | **100 → Strong flag** |
| Knee push-ups | 60–70 | (est.) | 85 | 95 | 100 | 73 |
| Incline push-ups | 60–70 | (est.) | 85 | 95 | 100 | **100 → Strong flag** |
| Inverted rows | 30–35 | ~70 (est.) | 50 | 70 | 90 | **90 → Strong flag** |
| Dips (parallel bars) | 25–30 | 43–66 strict | 45 | 60 | 100 | 28 |
| Bench dips | 40–50 | 119 | 70 | 85 | 90 | 22 |
| Air squats | 40–50 | 51–78 | 65 | 80 | 100 | **97 → Strong flag** |
| Pull-ups | 15–20 | 50–68 | 35 | 50 | 75 | **40 → Flag** |
| Assisted pull-ups | 25–30 | ~70 (est.) | 50 | 70 | 90 | 12 |
| Muscle-ups | 5–8 | ~25–30 (est.) | 15 | 25 | 40 | 13 |
| Handstand push-ups | 8–12 | 66–79 | 25 | 50 | 60 | 8 |
| Planche push-ups | 3–5 | ~40 (est.) | 15 | 30 | 60 | 2 |
| Front lever press | 3–5 | ~30 (est.) | 15 | 30 | 40 | 8 |
| Front lever pull-ups | 2–3 | ~20 (est.) | 10 | 20 | 30 | 5 |
| Deadlift | 25–30 | (est.) | 50 | 75 | 90 | 33 |
| Any other movement | | | 70 % of its ceiling | 90 % of its ceiling | | |

**Power (1RM)** — researched 2026-10-16. Pull-up, dip and muscle-up are **added weight**; squat is the full barbell load. With a logged bodyweight the ratio applies, otherwise the kg value (for a ~80 kg athlete).

Records found: weighted pull-up 146.64 kg added (Guinness, 2025), weighted tricep dip 154.20 kg added (Guinness), weighted ring muscle-up 44.30 kg (Guinness, 2023). Standards: weighted pull-up intermediate 0.25–0.5 × bodyweight, advanced 0.5–0.75 (BullBarFit); back squat intermediate 1.75 ×, advanced 2.25 ×, elite 2.75 × bodyweight (StrengthLevel). Dip and muscle-up levels are estimated from the same pattern.

| Movement | Strong amateur | Record | Flag above | Strong flag at | Prod max |
|---|---|---|---|---|---|
| Weighted pull-up | 0.25–0.5 × BW | 146.6 kg | 0.75 × BW (60 kg) | 1.2 × BW (100 kg) | **80 → Flag** |
| Weighted dip | 0.5–0.75 × BW | 154.2 kg | 1.0 × BW (80 kg) | 1.6 × BW (130 kg) | **100 → Flag** |
| Weighted muscle-up | 0.1–0.2 × BW | 44.3 kg (rings) | 0.3 × BW (25 kg) | 0.5 × BW (40 kg) | **30 → Flag** |
| Back squat | 1.75–2.25 × BW | far above | 2.5 × BW (200 kg) | 3.2 × BW (260 kg) | **215 → Flag** |

## Build steps
1. **Finish the leaderboard opt-out** using the shared `leaderboard_visible(athlete, scope)` (boards are built once and later gain holds without changes).
2. **Database:** limits (drafted starting values), flags + detection triggers + one-time scan, holds, strikes, appeals, admin RPCs (audited), athlete RPCs (accept reset, appeal), visibility function extended with holds.
3. **Admin panel:** Flags queue, athlete moderation panel, appeals inbox, limits editor.
4. **App:** the athlete notice, accept-reset and appeal flow, status in Settings, "hidden" labels.
5. **Terms / privacy policy:** a fair-play section (results may be reviewed, hidden or removed; how to appeal).

## Open items
- Starting limits: drafted in step 2 for the owner to review before the scan runs.
- Optional later: a push to the athlete when an action is taken, and to admins for high-severity flags.
