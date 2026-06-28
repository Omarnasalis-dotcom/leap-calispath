# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (choose platform)
npx expo start
npx expo start --web

# Run on device/simulator
npx expo run:ios
npx expo run:android

# Build web distribution
npm run build           # expo export → dist/
npm run build:vercel    # expo export + copy public/ + set index.html

# Run tests
npm test
npm test -- --testPathPattern=powerLogic   # single test file

# Switch Supabase environments
./switch-env.sh local   # point at local Supabase (127.0.0.1)
./switch-env.sh prod    # point at production (supabase.co)
./switch-env.sh status  # show which is active
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GEMINI_KEY=     # only needed for AI-assisted coach features
```

## Architecture

### Navigation

The app uses **Expo Router** with a file-based route structure under `app/`. Navigation logic is centralized in `app/_layout.tsx` via an `AuthGuard` component that enforces:

1. Unauthenticated users → `/auth`
2. Password reset flow → `/reset-password`
3. Unassessed users → `/assessment`
4. Assessed users blocked from onboarding/auth routes → `/`
5. Strength tier gate: `static-world` requires tier ≥ 1, `power-world` requires tier ≥ 6
6. Coaching routes (`exercise-library`, `my-clients`, `program-builder`, etc.) require `is_coach` or `is_admin` on the profile

`app/index.tsx` is a thin redirector — if `profile.assessed_at` is null, redirect to `/assessment`; otherwise redirect to `/profile`.

### Screens (`src/screens/`)

Each file under `app/` imports its corresponding screen from `src/screens/`. The screens directory is the actual implementation:

- **AuthScreen** — sign in / sign up
- **AssessmentGateScreen → AssessmentScreen → RankRevealScreen** — onboarding funnel
- **ProfileScreen** — main hub; world selector (Strength / Power / Static), tier grid, initiates trials
- **TrialScreen** — three modes: `progression` (advances tier), `practice` (lower tiers, no advancement), `eternal` (tier 8+)
- **LeaderboardScreen** — strength and power rankings
- **PowerAssessmentScreen** — weighted lift input (pull-up, dip, squat, muscle-up)
- **StaticWorldScreen** — isometric holds (future feature, currently gated)
- **coaching/** — `ProgramBuilderScreen`, `WarriorProgramScreen`, `MyClientsScreen`, `ClientDashboardScreen` — coach/admin only

### State & Auth (`src/contexts/`)

- **AuthContext** — holds `user`, `profile`, `loading`, `profileLoading`, `needsPasswordReset`. Call `refreshProfile()` after any DB write that changes profile state. 5-second timeout safety prevents indefinite loading.
- **ThemeContext** — wraps `StealthTheme` (dark/light). Access via `useTheme()`.

### Database (Supabase)

**Core tables:**
| Table | Purpose |
|---|---|
| `profiles` | User state: `strength_tier`, `power_tier`, `best_times` (jsonb), `power_pbs` (jsonb), `is_admin`, `is_coach` |
| `trial_history` | Audit log of every trial attempt (completed or abandoned) |
| `leaderboard_entries` | Strength leaderboard PBs per tier |
| `power_assessments` | Power world PBs (upserted only when score improves) |
| `static_holds` | Static world hold times |

**Key patterns:**
- Strength leaderboards use the `get_tier_leaderboard` RPC function to bypass RLS and show all users.
- Tiers never decrease — code uses `Math.max(newTier, currentTier)`.
- Power scores only update if the new total exceeds the stored score.

### Trial Submission

Trial results are submitted via a Supabase Edge Function (`/functions/v1/submit-trial-result`) — **not** directly to the DB. The Edge Function is the authoritative validator for the time hard-floor (see `src/constants/Progression.ts` → `TIER_HARD_FLOORS`). The client performs a pre-check in `TrialService.isTimeValid()` for immediate UX feedback only.

### Supabase Client (`src/lib/supabase.ts`)

Uses platform-specific storage adapters:
- **Web**: `localStorage`
- **Native**: `expo-secure-store` with chunking (2000-byte chunks) to bypass the 2048-byte SecureStore limit. The chunk count key (`_chunks`) is written last as a commit signal.

### Business Logic (`src/lib/`)

| File | Exports |
|---|---|
| `trials.ts` | `RITES_OF_PASSAGE` — all 9 tier trial definitions |
| `powerLogic.ts` | `calculateTotalPowerScore`, `getPowerLevel`, `isPowerWorldUnlocked` |
| `staticLogic.ts` | `calculatePoints`, `getLevelMovements`, `isStaticWorldUnlocked` |
| `leaderboard.ts` | `getTierLeaderboard`, `getPowerTierLeaderboard` |
| `clashLogic.ts` | Online clash matchmaking and scoring |

### Tier System

Strength tiers 0–9 map to Spartan-themed ranks:
`Helot → Neos → Ephebe → Hoplite → Spartan → Lochagos → Strategos → Olympian → Demigod → Eternity`

Power World unlocks at strength tier ≥ 6 (Strategos). Power tiers are separate: `Voltaic → Ampere → Tesla` based on weighted lift totals.

### Async Safety Hooks (`src/hooks/`)

- **`useSafeAsync`** — prevents double-submission and handles unmounted state. Use this for any async action triggered by user input.
- **`useSafeMutation`** — similar guard for DB mutations.
- **`useMountedRef`** — raw ref tracking component mount state.

### Components

Shared UI lives in `src/components/`. Profile-specific extracted components (ScoreBar, ProfileHeader, WorldSelectorGrid, TierSelectorRow, StrengthWorldView) are in `src/components/profile/`. Coaching UI components are in `src/components/coaching/`.

## Testing

Tests are in `src/lib/__tests__/` and `src/services/__tests__/`. Run with `npm test`. The project uses `jest-expo` preset. Tests cover pure logic functions — `powerLogic`, `clashLogic`, `leaderboard`, `TrialService`.

## Web Deployment

The web build deploys to Vercel. `vercel.json` configures CSP and security headers. The `build:vercel` script produces the `dist/` output and copies `public/` assets (PWA manifest, download page, privacy policy).
