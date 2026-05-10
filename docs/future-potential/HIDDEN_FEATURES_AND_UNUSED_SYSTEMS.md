# Hidden Features & Unused Systems

A technical audit of "future-ready" code, commented-out logic, and experimental systems discovered in the Anti-Gravity codebase.

## 1. The Ghost Match Engine
- **Location**: `TournamentService.ts` (`getLiveMedian`).
- **Feature**: Logic to handle matches where a participant has no opponent (odd numbers).
- **Hidden Logic**: The user is paired against a "Ghost" whose score is the **live median** of all other participants. This is a highly advanced way to handle tournament byes fairly.

## 2. Inferred "Spartan" Logic
- **Location**: `src/lib/spartanLogic.ts`.
- **Status**: Detected as a standalone module.
- **Intent**: Likely a specialized challenge mode or a "survival" gauntlet separate from the main tiers.

## 3. Suden Death Finish (Atomic Finish)
- **Location**: `finish_clash_session` RPC.
- **Experimental Logic**: The use of `FOR UPDATE` locking in the database suggests the developer anticipated high-concurrency race conditions where two users finish within milliseconds of each other. The first person to "hit" the server locks the session, ensuring a single winner.

## 4. Admin Command Center
- **Location**: `AdminTournamentScreen.tsx`.
- **Status**: Hidden from the standard user navigation flow.
- **Intent**: A full suite for creating "Knockout" and "Rank-based" tournaments, defining exercises, and setting prize pools. The presence of this screen indicates the app is designed for community management and hosted events.

## 5. Pro Athlete Benchmarks
- **Location**: `arena_leaderboard_engine.sql` (`arena_pro_results`).
- **Data**: Seed data for athletes like "Sergio", "Jamie", and "Florian".
- **Intent**: Allows users to compete against "Pro ghosts" or historical data from real-world competitions (Leap World Series).

## 6. Dead Code & Placeholders
- **`is_searching_clash` flag**: While used in the lobby, the matchmaking is currently manual (select a warrior). The flag suggests a future **Auto-Matchmaking** queue system.
- **`cooldown_min` and `max_trials`**: These variables in the tournament configs suggest the system is ready for "Stamina" or "Attempt-limited" gameplay loops.
- **`push_token`**: Registered in the profile but notification dispatch logic is mostly client-side placeholders.

## 7. Future Product Potential (Architecture-Ready)
- **Monetization**: The `tournament_gp` and `glory_score` systems are ready-made for a "Tournament Entry Fee" or "Premium Battle Pass" model.
- **Coaching**: The exercise configuration system in the Admin screen is generic enough to be turned into a "Custom Workout" or "Personal Training" assignment tool.
- **Live Streaming**: The real-time progress subscription in `ClashScreen.tsx` is the foundation for a "Spectator Mode" where others can watch a battle live.
