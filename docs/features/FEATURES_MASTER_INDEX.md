# Features Master Index

A complete inventory of all features detected in Anti-Gravity (Leap CalisPath).

## 1. Athlete Lifecycle & Progression
| Feature Name | Description | Status | Related Files |
| :--- | :--- | :--- | :--- |
| **Initial Strength Assessment** | Comprehensive diagnostic of Pull-ups, Push-ups, Dips, and Muscle-ups to determine starting tier. | Complete | `AssessmentScreen.tsx`, `trials.ts` |
| **Tier Advancement (Rites of Passage)** | High-gate progression system where users pass timed trials to reach the next rank. | Complete | `TrialScreen.tsx`, `TrialService.ts`, `trials.ts` |
| **Power Assessment** | Specialized explosive power diagnostic. | Complete | `PowerAssessmentScreen.tsx`, `powerLogic.ts` |
| **Statics Hold Tracking** | Tracking isometric holds (Planche, Front Lever, etc.) with multipliers. | Complete | `StaticWorldScreen.tsx`, `StaticService.ts`, `staticLogic.ts` |
| **Glory Score Algorithm** | Complex unified standing metric based on tiers, volume, and streaks. | Complete | `supabase_schema.sql` (RPC), `leaderboard.ts` |
| **Tier Rank System** | Visual identity and titles associated with 9 difficulty levels. | Complete | `src/types/index.ts`, `tierDescriptions.ts` |

## 2. Competitive Systems
| Feature Name | Description | Status | Related Files |
| :--- | :--- | :--- | :--- |
| **Online Clash (1v1 PvP)** | Real-time matchmaking and battle system with SUDDEN DEATH finish logic. | Complete | `ClashScreen.tsx`, `ClashService.ts`, `clashLogic.ts` |
| **Tournament Lobby** | Multi-day knockout or rank-based tournament participation. | Complete | `TournamentLobbyScreen.tsx`, `TournamentService.ts` |
| **Knockout Bracket Engine** | Automatic pairing and elimination logic for multi-round tournaments. | Complete | `TournamentService.ts`, `tournamentLogic.ts` |
| **Champions Arena** | Elite circuit training with pro-athlete benchmark comparisons. | Complete | `ChampionsArenaScreen.tsx`, `ArenaService.ts`, `arena_leaderboard_engine.sql` |
| **Weekly Challenges** | Periodic community events with unique workout protocols. | Complete | `WeeklyChallengeScreen.tsx`, `ChallengeService.ts`, `weeklyChallenge.ts` |

## 3. Social & Leaderboards
| Feature Name | Description | Status | Related Files |
| :--- | :--- | :--- | :--- |
| **Hall of Glory** | Global prestige leaderboard based on Glory Score. | Complete | `GloryLeaderboardScreen.tsx`, `leaderboard.ts` |
| **Movement Leaderboards** | Individual rankings for specific exercises or hold types. | Complete | `LeaderboardScreen.tsx`, `StaticService.ts` |
| **Well-Rounded Athlete Ranking** | Aggregated static hold mastery leaderboard. | Complete | `StaticService.ts`, `StaticWorldScreen.tsx` |

## 4. Administration & Management
| Feature Name | Description | Status | Related Files |
| :--- | :--- | :--- | :--- |
| **Tournament Command Center** | Admin interface for publishing, managing, and deleting tournaments. | Complete | `AdminTournamentScreen.tsx`, `AdminService.ts` |
| **Handicap Logic** | Automatic scoring multipliers to balance matches between different tiers. | Complete | `tournamentLogic.ts` |
| **Anti-Cheat Validation** | "Dishonor" detection for suspicious completion times. | Complete | `TrialService.ts` |

## 5. System Foundations
| Feature Name | Description | Status | Related Files |
| :--- | :--- | :--- | :--- |
| **Auth & Profile Sync** | Real-time profile state management via Supabase. | Complete | `AuthContext.tsx`, `AuthScreen.tsx` |
| **Dynamic Theme Engine** | High-performance "Warrior" UI with obsidian backgrounds and themed gauges. | Complete | `ThemeContext.tsx`, `ProfileScreen.tsx` |
| **Real-time Subscriptions** | Live updates for Clash invites and battle progress. | Complete | `ClashService.ts` |

## Hidden/Experimental Features
- **Inferred Coach Role**: Architecture supports internal roles (admin flag detected), suggesting a future coaching dashboard.
- **Ghost Match Median Evaluation**: Logic for handling matches with odd numbers of participants via median score comparison (in `TournamentService.ts`).
- **Sudden Death Finish**: Logic in `finish_clash_session` RPC that ends a session immediately upon the first person finishing to ensure speed-based victory.
