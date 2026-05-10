# Tournament Feature — Full Build Specification
> Give this entire document to your AI agent. Build and test each phase in order. Do not skip phases.

---

## Project Context

- **Framework:** React Native with Expo
- **Backend:** Supabase (Postgres + Realtime)
- **Auth:** Supabase Auth via `useAuth()` hook from `../contexts/AuthContext`
- **Theme:** `useTheme()` hook from `../contexts/ThemeContext` — always use `theme.X` for colors
- **Existing GP system:** already built, use it for prize payouts
- **Existing Glory Points / Leaderboard:** already built and linked to Clash Arena

---

## Database Tables (Already Created in Supabase)

These tables already exist. Do NOT recreate them. Use them exactly as defined below.

### `tournament_configs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | text | shown in arena |
| type | text | `knockout` or `rank_based` |
| bracket_size | int4 | 2, 4, or 8 — knockout only |
| workout_config | jsonb | array of round configs (see schema below) |
| window_time_min | int4 | per-round deadline (knockout) or total window (rank_based) |
| max_trials | int4 | rank_based only |
| cooldown_min | int4 | rank_based only |
| min_participants | int4 | auto-start threshold |
| payout_gp | int4 | total prize pool |
| created_at | timestamptz | |

**workout_config JSON schema:**
```json
[
  {
    "day": 1,
    "title": "QUARTER-FINALS",
    "mode": "amrap",
    "duration_min": 7,
    "strategy": "best",
    "trials": 1,
    "exercises": [
      { "name": "Push-ups", "target_reps": 10, "target_rounds": 3 }
    ]
  }
]
```

### `tournament_sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| config_id | uuid | FK → tournament_configs |
| status | text | `registration`, `active`, `completed` |
| current_round | int4 | active round number |
| round_deadline | timestamptz | when current round expires |
| start_time | timestamptz | |
| expires_at | timestamptz | |
| created_at | timestamptz | |

### `tournament_participants`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tournament_id | uuid | FK → tournament_sessions |
| user_id | uuid | FK → profiles |
| tier_at_start | int4 | locked handicap tier from profiles.strength_tier |
| is_ready | bool | lobby ready toggle |
| is_eliminated | bool | knockout only |
| scores | jsonb | `{ "1": { "raw": 25, "final": 250, "trials": 1, "last_attempt_at": "ts" } }` |
| total_score | int4 | rank_based running total |
| trials_used | int4 | rank_based |
| last_trial_at | timestamptz | for cooldown enforcement |
| final_rank | int4 | assigned at tournament end |
| joined_at | timestamptz | |

### `tournament_matches`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tournament_id | uuid | FK → tournament_sessions |
| day | int4 | round number |
| user_a | uuid | |
| user_b | uuid | null if ghost match |
| winner_id | uuid | set after round resolves |
| is_ghost_match | bool | |
| created_at | timestamptz | |

---

## Handicap Multiplier System

All raw reps are multiplied by tier before comparison:

| Tier | Multiplier |
|------|-----------|
| 0–2 | 10x |
| 3–4 | 6x |
| 5–6 | 3x |
| 7–8 | 1x |

`final_score = raw_reps * multiplier`

---

## Phase 1 — Core Logic Files

### Task 1.1 — Create `lib/tournamentLogic.ts`

```
Create lib/tournamentLogic.ts with:
- TOURNAMENT_MULTIPLIERS record mapping tiers 0-8 to multipliers (0-2=10x, 3-4=6x, 5-6=3x, 7-8=1x)
- TournamentLogic class with static method calculateFinalScore(reps: number, tier: number): number
- No external dependencies
```

### Task 1.2 — Create `services/TournamentService.ts`

Implement ALL of the following methods. Each method must handle errors gracefully with try/catch and console.error logging.

#### `getActiveSession()`
- Query `tournament_sessions` where status in [`registration`, `active`]
- Join `tournament_configs` as `config`
- Order by `created_at` descending, limit 1
- Return session or null

#### `joinTournament(sessionId, userId)`
- Check if participant already exists → return `{ success: true, alreadyJoined: true }`
- Fetch `strength_tier` from `profiles` table for this userId
- Insert into `tournament_participants` with `tier_at_start = strength_tier`
- Return `{ success: true }`

#### `submitDailyScore(sessionId, userId, day, rawReps, tier, strategy: 'best'|'sum')`
- Calculate `finalScore = TournamentLogic.calculateFinalScore(rawReps, tier)`
- Fetch current participant scores JSONB
- Apply strategy: `best` = keep max, `sum` = accumulate
- Update scores JSONB: `{ [day]: { raw, final, trials, last_attempt_at } }`
- After update, check if ALL non-eliminated participants have submitted for current round
- If all submitted → call `advanceToRound(sessionId, currentRound + 1)`
- Return `{ success: true, finalScore }`

#### `submitRankBasedScore(sessionId, userId, rawReps, tier)`
- Check cooldown: if `last_trial_at` exists and cooldown has not expired → return `{ blocked: true, remainingMs }`
- Check trials: if `trials_used >= config.max_trials` → return `{ exhausted: true }`
- Calculate finalScore
- Add to `total_score`, increment `trials_used`, update `last_trial_at`
- Return `{ success: true, finalScore, trialsRemaining }`

#### `advanceToRound(sessionId, nextRound)`
- If nextRound === 1: survivors = all participants
- If nextRound > 1:
  - Get all matches from previous round
  - For each match call `determineMatchWinner(match)`
  - Collect winner IDs as survivors
  - Mark all non-survivors as `is_eliminated = true`
- If survivors.length === 1 and nextRound > 1 → call `handleTournamentEnd(sessionId, survivors[0])`
- Otherwise:
  - Calculate `round_deadline = now + window_time_min`
  - Update session: `status = active`, `current_round = nextRound`, `round_deadline`
  - Shuffle survivors
  - Create 1v1 pairings in `tournament_matches`
  - If odd survivor count → last one gets ghost match (`user_b = null`, `is_ghost_match = true`)

#### `determineMatchWinner(match)`
- Fetch scores JSONB for user_a from `tournament_participants`
- `scoreA = scores[match.day].final ?? 0`
- If `is_ghost_match`: compare scoreA against `getLiveMedian(tournamentId, day)` → winner if `scoreA >= median`
- Else: fetch scoreB for user_b → higher score wins → tie goes to user_a
- Update `tournament_matches` set `winner_id` for this match
- Return winner userId or null

#### `getLiveMedian(tournamentId, day)`
- Fetch all participants' scores JSONB
- Extract `scores[day].final` for all where value > 0
- Sort ascending
- Return median (average of two middle values for even count)
- Return 0 if no scores

#### `handleTournamentEnd(sessionId, winnerId)`
- Update session `status = completed`
- Fetch all participants
- Sort by: winner first, then by max round reached (infer from scores keys), then by total points as tiebreaker
- Assign `final_rank` to each participant
- Award GP: 1st = 75% of payout_gp, 2nd = 25% of payout_gp
- Use existing GP award system

#### `checkAndAutoEliminate(sessionId)`
- Fetch session to get `round_deadline` and `current_round`
- If `round_deadline` has passed:
  - Find all non-eliminated participants who have NOT submitted for `current_round`
  - Set `is_eliminated = true` for each
  - Call `advanceToRound(sessionId, current_round + 1)`

#### `closeRankBasedTournament(sessionId)`
- Fetch all participants ordered by `total_score` descending, tiebreak by `last_trial_at` ascending
- Assign `final_rank`
- Update session `status = completed`
- Award GP: 1st = 75%, 2nd = 25%
- Use existing GP award system

---

## Phase 2 — Admin Screen

### Task 2.1 — Create `screens/AdminTournamentScreen.tsx`

**UI Sections:**

1. **Tournament Name** — TextInput

2. **Tournament Type Toggle** — `knockout` | `rank_based`

3. **If knockout:**
   - Bracket size selector: 2, 4, 8 (buttons)
   - Auto-generate round blocks based on size:
     - 8 players = 3 rounds: QUARTER-FINALS, SEMI-FINALS, GRAND FINALE
     - 4 players = 2 rounds: SEMI-FINALS, GRAND FINALE
     - 2 players = 1 round: GRAND FINALE
   - Per round: workout mode toggle (`amrap` | `for_time`), duration in minutes, exercise picker (dropdown from list below), target reps, target rounds
   - Window time per round (minutes) — how long users have to submit

4. **If rank_based:**
   - Single workout config: mode, exercise, reps, rounds
   - Max trials (number input)
   - Cooldown between trials (minutes)
   - Window time (hours) — total tournament duration
   - Min participants to auto-start

5. **GP Prize Pool** — number input (split 75/25 automatically, show preview)

6. **Min Participants** — number input (knockout: auto-set to bracket size, rank_based: admin sets)

7. **PUBLISH button** — validates all fields, checks no active session exists, inserts config + session

**Available exercises list:**
```
Push-ups, Pull-ups, Dips, Muscle-ups, Squats, Lunges, 
Knee Push-ups, Inverted Rows, Burpees, Handstand Push-ups, Leg Raises
```

**Validation rules:**
- Title must not be empty
- GP must be a positive number
- Each round must have at least one exercise
- Window time must be > 0
- No existing `registration` or `active` session allowed

**On publish:**
- Insert into `tournament_configs`
- Insert into `tournament_sessions` with `status = registration`, `current_round = 0`
- Show success alert
- Call `onClose()`

**Admin can also:**
- See list of existing tournaments (active and completed)
- Delete a tournament (only if status = `registration`)

---

## Phase 3 — Tournament Arena Screen

### Task 3.1 — Create `screens/TournamentArenaScreen.tsx`

This is the main entry screen users see when they tap the tournament section.

**UI:**

1. **Active Tournament Card** (if one exists):
   - Tournament name
   - Type badge: `KNOCKOUT` or `RANK BATTLE`
   - Prize display: `🏆 75 GP / 25 GP`
   - Participant count: `3/8 Warriors`
   - Status badge: `REGISTRATION` | `LIVE` | `COMPLETED`
   - JOIN button (if not joined and status = registration)
   - ENTER ARENA button (if joined and status = active)

2. **Tournament Leaderboard Tab** (all-time cumulative GP earned through tournaments per user)

3. **No active tournament** → empty state with sword icon

**Real-time:** Subscribe to `tournament_sessions` and `tournament_participants` changes via Supabase Realtime.

---

## Phase 4 — Lobby Screen

### Task 4.1 — Create `screens/TournamentLobbyScreen.tsx`

**Props:**
```typescript
{
  navigation?: any;
  onClose?: () => void;
  onEnterWorkout?: (sessionId: string, roundConfig: any) => void;
}
```

**Use a `useRef` for `activeSession` to avoid stale closure in Realtime subscription.**
**Use a `useRef` for `isIgniting` to prevent concurrent ignition calls.**

**UI States:**

1. **Registration phase:**
   - Warrior roster list with ready status icons
   - Empty slot placeholders
   - JOIN button → calls `TournamentService.joinTournament`
   - PREPARE FOR WAR button → toggles `is_ready` in `tournament_participants`
   - Auto-ignition: when `readyCount >= min_participants` → call `TournamentService.advanceToRound(sessionId, 1)`

2. **Active phase (knockout):**
   - Current round title (QUARTER-FINALS etc.)
   - Round deadline countdown timer (live, updates every second)
   - User's current score for this round (if submitted)
   - ENTER BATTLE button → calls `onEnterWorkout` with current round config
   - Match result (if submitted): WIN / LOSS / PENDING

3. **Active phase (rank_based):**
   - Live leaderboard (ranked by total_score)
   - User's total score and trials remaining
   - Cooldown timer (if blocked)
   - ATTEMPT button → calls `onEnterWorkout`
   - Window time remaining countdown

4. **Completed phase:**
   - Final rankings with medals (🥇🥈🥉)
   - GP awarded display
   - Champion name highlighted

**Deadline enforcement:**
- On load and every 30 seconds, call `TournamentService.checkAndAutoEliminate(sessionId)`
- For rank_based: call `TournamentService.closeRankBasedTournament(sessionId)` when window expires

---

## Phase 5 — Workout Trial Screen

### Task 5.1 — Create `screens/TournamentTrialScreen.tsx`

**Props:**
```typescript
{
  sessionId: string;
  roundConfig: {
    day: number;
    mode: 'amrap' | 'for_time';
    duration_min: number;
    exercises: { name: string; target_reps: number; target_rounds: number }[];
    strategy: 'best' | 'sum';
  };
  onComplete: (score: number) => void;
  onClose: () => void;
}
```

**AMRAP mode (As Many Reps As Possible):**
- Countdown timer from `duration_min` to 0
- Rep counter per exercise (+ / - buttons)
- Total reps accumulate
- When timer hits 0 → auto-submit
- User can also manually submit early

**For Time mode:**
- Stopwatch counting up
- User taps each rep
- When all target reps/rounds completed → auto-stop timer
- Score = total time in seconds (lower = better, so invert: score = 10000 - seconds)

**On submit:**
- Fetch user's `tier_at_start` from their participant record
- Call `TournamentService.submitDailyScore()` for knockout
- OR `TournamentService.submitRankBasedScore()` for rank_based
- Show score result screen with final adjusted score
- Call `onComplete(score)`

**UI requirements:**
- Full screen takeover
- Large timer display
- Cannot be dismissed once started (warn user)
- Show exercise name and target clearly

---

## Phase 6 — Navigation Wiring

### Task 6.1 — Wire tournament screens into navigation

Add tournament screens to your existing navigation stack. The entry point should be accessible from the main tab bar or home screen.

**Flow:**
```
MainTabs
  └── Tournament Tab / Button
        └── TournamentArenaScreen
              ├── TournamentLobbyScreen (modal or stack push)
              │     └── TournamentTrialScreen (full screen modal)
              └── AdminTournamentScreen (only visible to admins, modal)
```

**Admin access:** Check `profiles.is_admin` (or equivalent field in your profiles table) before showing admin button.

---

## Phase 7 — Testing Checklist

Test every scenario below before considering the feature complete.

### Tournament A — Knockout Tests
- [ ] Admin creates 2-player knockout → 1 round generated (GRAND FINALE)
- [ ] Admin creates 4-player knockout → 2 rounds generated
- [ ] Admin creates 8-player knockout → 3 rounds generated
- [ ] Two users join and toggle ready → auto-ignition fires exactly once
- [ ] Score submitted with correct handicap (Tier 0 user, 10 reps = 100 points)
- [ ] Both users submit → round auto-advances
- [ ] Window deadline passes → non-submitter auto-eliminated
- [ ] Ghost match (odd survivors) → user must beat median to advance
- [ ] Final round resolves → `handleTournamentEnd` fires, ranks assigned
- [ ] 1st place gets 75% GP, 2nd gets 25% GP
- [ ] Eliminated user sees elimination message on next open
- [ ] Cannot submit score after elimination

### Tournament B — Rank Based Tests
- [ ] Admin creates rank_based tournament with 10 trials, 30min cooldown, 8hr window
- [ ] User joins mid-window → can compete
- [ ] User submits trial → total_score increases, cooldown starts
- [ ] User tries again during cooldown → blocked with remaining time shown
- [ ] User exhausts all 10 trials → further submissions blocked
- [ ] Window expires → auto-rank fires, GP awarded
- [ ] Live leaderboard updates after each submission
- [ ] Tiebreak: earlier `last_trial_at` wins

### General Tests
- [ ] User cannot join two tournaments simultaneously
- [ ] Admin cannot create tournament if one is already active
- [ ] Admin can delete a tournament in `registration` status
- [ ] Admin cannot delete an `active` tournament
- [ ] Realtime subscription does not use stale closure (activeSession ref pattern)
- [ ] Double-tap on PUBLISH does not create duplicate sessions (ref guard)
- [ ] GP system correctly updated after tournament ends
- [ ] All-time tournament leaderboard reflects correct cumulative GP

---

## Critical Implementation Rules

1. **Never query `day1_final_score` or `day2_final_score`** — scores live in the JSONB `scores` column
2. **Always fetch `strength_tier` from `profiles`** before inserting participant — never hardcode tier
3. **Use `useRef` for activeSession** in any component with Supabase Realtime subscriptions
4. **Use `useRef` as guard** for any function that must not run concurrently (ignition, publish)
5. **Always delete in FK order:** matches → participants → sessions → configs
6. **`handleTournamentEnd` must be called** from `advanceToRound` when 1 survivor remains
7. **`is_eliminated` must be set to `true`** for losers inside `advanceToRound`
8. **Validate all admin inputs** before any Supabase insert
9. **Check for existing active session** before publishing a new one
10. **Store raw string in TextInput state**, parse to number only on save

---

## File Structure Summary

```
lib/
  tournamentLogic.ts          ← Phase 1.1

services/
  TournamentService.ts        ← Phase 1.2

screens/
  AdminTournamentScreen.tsx   ← Phase 2.1
  TournamentArenaScreen.tsx   ← Phase 3.1
  TournamentLobbyScreen.tsx   ← Phase 4.1
  TournamentTrialScreen.tsx   ← Phase 5.1
```

---

## Do Not Touch

- Existing GP award system
- Existing Glory Points / Leaderboard system  
- Existing Clash Arena (1v1) feature
- Existing navigation structure (only add to it)
- Existing Supabase Auth setup
- Any existing screen not listed above
