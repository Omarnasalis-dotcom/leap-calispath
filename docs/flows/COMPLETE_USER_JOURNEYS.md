# Complete User Journeys

A deep dive into the user experience, from first-time onboarding to elite competition.

## 1. The Path of the Warrior: Onboarding & First Assessment
The foundational journey for every new user.

- **Trigger**: User opens the app for the first time.
- **Onboarding**: User swipes through the philosophy of Leap CalisPath.
- **Authentication**: User signs up via `AuthScreen.tsx`. A profile is automatically created via the `handle_new_user()` trigger in Supabase.
- **The Gate**: The user is presented with the **Initial Strength Assessment**. They cannot access other features until this is completed.
- **The Diagnostic**: User performs maximum reps for Pull-ups, Push-ups, Dips, and Muscle-ups.
- **Rank Reveal**: System calculates the starting tier based on performance.
- **UX Outcome**: User is assigned their first Rank (e.g., "Steel-Wrought") and their dashboard unlocks.

## 2. ⚔️ Online Clash: 1v1 PvP Battle
The high-intensity real-time competitive loop.

- **Trigger**: User enters the `BattleScreen.tsx` and toggles "Search for Warriors".
- **Lobby**: `ClashService.getAvailableWarriors` shows other active users in the same bracket.
- **Challenge**: User sends an invite. The receiver gets a real-time notification (via Supabase Realtime subscription).
- **Protocol Generation**: Upon acceptance, `ClashLogic.generateProtocol` creates a randomized 3-movement workout.
- **The Battle**: `ClashScreen.tsx` displays the dual-progress bars.
- **Sudden Death Logic**: The first person to finish reports their time via `finish_clash_session`. The session status moves to `finished` **immediately**, crowning the winner before the other can finish.
- **Reward**: Winner gains +25 Glory, loser loses -15 Glory.

## 3. The Grand Tournament: Multi-Day Competition
A marathon of consistency and speed.

- **Registration**: User joins an active session via `TournamentLobbyScreen.tsx`.
- **The Daily Trial**: Each day (round), a specific workout is revealed.
- **Performance**: User performs the workout in `TournamentTrialScreen.tsx`.
- **Handicap Scoring**: `TournamentLogic.calculateFinalScore` applies a multiplier based on their tier to ensure fairness.
- **Progression**: If it's a Knockout tournament, the system automatically pairs survivors and eliminates losers after the round deadline via `advanceToRound`.
- **The Finale**: The last survivor or top ranker is awarded a significant GP (Glory Points) payout.

## 4. Mastery: Isometric Hold Tracking
The specialized journey for static athletes.

- **Trigger**: Tier 4+ Warrior enters the Static World.
- **Hold Session**: User selects a movement (e.g., Full Planche) and starts the timer.
- **Validation**: System checks if the hold time exceeds the current PB.
- **Mastery Score**: Points are calculated as `seconds * multiplier` (multiplier increases with difficulty).
- **Well-Rounded Status**: Users are ranked in the Hall of Mastery based on their aggregated performance across all categories (Handstand, Lever, Planche).

## 5. Failure & Recovery Scenarios

| Scenario | System Response | Recovery Path |
| :--- | :--- | :--- |
| **Suspicous Time (Anti-cheat)** | `TrialService` throws "DISHONOR" error. | User must retry with a humanly possible time. |
| **Network Loss during Clash** | Realtime subscription drops. | The app attempts to reconnect. If it fails, the match remains "active" until the status is manually resolved or timed out. |
| **Missed Tournament Deadline** | `checkAndAutoEliminate` runs on round advance. | User is marked as `is_eliminated` and cannot participate in further rounds of that session. |
| **Empty Leaderboard** | `LeaderboardScreen` shows "Searching for Warriors..." state. | User is encouraged to be the first to post a score. |
