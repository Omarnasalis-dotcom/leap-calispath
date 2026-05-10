# User Roles & Permissions

Anti-Gravity (Leap CalisPath) uses a role-based access control (RBAC) system combined with tiered progression gates.

## Roles Matrix

| Role | Detection Mechanism | Primary Capabilities | Restrictions |
| :--- | :--- | :--- | :--- |
| **Guest/Unauthenticated** | `AuthContext` (no user) | View Login/Signup screen. | No access to training or social features. |
| **Warrior (Authenticated)** | `AuthContext` (has user) | Full access to training, assessments, profile, and basic social features. | Cannot access admin panels. |
| **Tiered Warrior** | `strength_tier > 0` | Access to specific "Rites of Passage" trials for their current rank. | Lower tiers cannot access "Elite" clash brackets or Static World (requires Tier 4). |
| **Elite Warrior** | `strength_tier >= 5` | Access to "Elite" competition brackets and Champions Arena benchmarks. | None. |
| **Tournament Admin** | `profile.is_admin = true` | Access to `AdminTournamentScreen.tsx`. Can create/delete tournaments. | None. |

## Feature-Based Permissions

### 1. The Static World Gate
- **Condition**: `strength_tier >= 4`
- **Logic**: Detected in `src/lib/staticLogic.ts` via `isStaticWorldUnlocked`.
- **Effect**: If false, the "Static World" (Mastery) navigation is locked or restricted.

### 2. Clash Brackets
- **Developing Bracket**: Warriors at Tiers 2-4.
- **Elite Bracket**: Warriors at Tiers 5-8.
- **Restriction**: Warriors at Tier 0-1 cannot initiate Clashes. Matches are only permitted between warriors in the same bracket.

### 3. Tournament Entry
- **Registration**: Open to all authenticated warriors.
- **Qualification**: Some tournaments may require a minimum Tier at the start (tracked in `tournament_participants.tier_at_start`).

## Database-Level Security (RLS)

The system enforces security at the data layer using Supabase Row Level Security (RLS):

- **Profiles**: Warriors can only `UPDATE` their own profile (`auth.uid() = id`). Public fields are readable via the `public_leaderboard` view.
- **Static Holds**: Users can only insert holds for their own `user_id`.
- **Clash Sessions**: Logic is enforced via RPCs (`SECURITY DEFINER`) to ensure atomic updates that users cannot spoof via direct REST calls.

## Inferred & Future Roles
- **Coach/Trainer**: While not explicitly active in the UI for users, the `is_admin` flag and the structured exercise configurations suggest an architecture ready for a "Coach" role who can manage group workouts or athlete rosters.
- **Moderator**: Inferred from the need to manage leaderboards and handle "Dishonor" (anti-cheat) reports.
