# Screen-by-Screen Breakdown

An audit of the visual interface and navigation architecture of Anti-Gravity.

## 1. Onboarding & Authentication
| Screen | Purpose | Key Actions |
| :--- | :--- | :--- |
| `OnboardingScreen.tsx` | Introduction to the philosophy. | Swipe through slides, navigate to Auth. |
| `AuthScreen.tsx` | Unified Login/Signup. | Toggle between modes, submit credentials. |

## 2. Diagnostics & Progression
| Screen | Purpose | Entry Point |
| :--- | :--- | :--- |
| `AssessmentGateScreen.tsx` | Entry point for the diagnostic. | Post-Login (if tier is 0). |
| `AssessmentScreen.tsx` | Initial strength test. | Gate Screen. |
| `RankRevealScreen.tsx` | Dramatic reveal of starting tier. | Completion of Assessment. |
| `PowerAssessmentScreen.tsx` | Explosive power diagnostic. | Profile -> Power World. |
| `TrialScreen.tsx` | The "Rite of Passage" timer. | Profile -> Level Up. |

## 3. The Warrior's Dashboard
| Screen | Purpose | Features |
| :--- | :--- | :--- |
| `ProfileScreen.tsx` | Central command for the athlete. | Warrior Gauges (Tournament, Glory, Power, Static, Strength), Identity Avatar, Level Badges. |
| `WeeklyChallengeScreen.tsx` | Community event participation. | Live countdown, protocol reveal, leaderboard. |

## 4. Competitive Arenas
| Screen | Purpose | Logic |
| :--- | :--- | :--- |
| `BattleScreen.tsx` | The 1v1 PvP Lobby. | "Search for Warriors" toggle, Challenge list. |
| `ClashScreen.tsx` | The active PvP battle. | Dual-progress bars, Real-time status updates. |
| `TournamentLobbyScreen.tsx` | Tournament overview. | Registration, Round progress, Match brackets. |
| `TournamentArenaScreen.tsx` | The workout timer for tournaments. | Movement checklist, finish time reporting. |
| `ChampionsArenaScreen.tsx` | Elite benchmark comparison. | Integrated rankings with Pro athletes. |

## 5. Information & Rankings
| Screen | Purpose | Features |
| :--- | :--- | :--- |
| `GloryLeaderboardScreen.tsx` | Global prestige ranking. | Top 3 medals, current user highlight, GP totals. |
| `LeaderboardScreen.tsx` | Tier/Movement specific ranks. | Filter by Tier (Helot to Eternity). |
| `StaticWorldScreen.tsx` | Isometric hold mastery. | Category filters (Planche, Lever), PB tracking. |

## 6. Administration
| Screen | Purpose | Capabilities |
| :--- | :--- | :--- |
| `AdminTournamentScreen.tsx` | Tournament management. | Create Knockout/Rank sessions, define workouts, set payout GP, delete sessions. |

## Navigation Structure
- **Root**: `Auth` -> `Onboarding` -> `Assessment` (conditional) -> `Main`.
- **Main (Drawer/Tabs)**:
    - **Identity**: `ProfileScreen`.
    - **Battle**: `BattleScreen` -> `ClashScreen`.
    - **Competitive**: `TournamentLobby` -> `TournamentArena`.
    - **Mastery**: `StaticWorld`.
    - **Social**: `GloryLeaderboard`.
- **Admin**: Restricted access to `AdminTournamentScreen`.
