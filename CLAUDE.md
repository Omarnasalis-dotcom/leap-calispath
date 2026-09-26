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
EXPO_PUBLIC_SUPABASE_ANON_KEY=           # publishable key (sb_publishable_...)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
```
Store builds get these from EAS environment variables, not from `.env` files (`.easignore` excludes them). Legacy JWT API keys are **disabled** on prod: clients use the publishable key; Edge Functions read `SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS` first. The AI Coach's Anthropic key is an Edge Function secret (`ANTHROPIC_API_KEY`).

## Architecture

### Navigation

The app uses **Expo Router** with a file-based route structure under `app/`. Navigation logic is centralized in `app/_layout.tsx` via an `AuthGuard` component that enforces:

1. Password reset flow → `/reset-password`
2. Unauthenticated users → `/auth`
3. Signed in without a username (first Google/Apple sign-in) → `/complete-profile`
4. Unassessed users → `/onboarding-journey` (the Milestone Lane owns the "Start Assessment" CTA)
5. Assessed but `onboarding_completed_at` null → `/onboarding-journey` (Goals & Equipment, build-program routes and `/paywall` are exempt)
6. Fully onboarded users are kept out of auth/assessment/onboarding routes
7. Strength tier gates: `static-world` ≥ 1, `power-world` ≥ 6, `arena-workout` ≥ 9
8. Coaching routes (`coaching-hub`, `my-clients`, `client-dashboard`, `program-builder`, `progress-tracking`) require `is_coach` or `is_admin`

`app/index.tsx` is a thin redirector: unassessed → `/onboarding-journey`, otherwise `/profile` (or a one-time destination set after onboarding). Main screens live in the `app/(tabs)/` group: profile, training-center, my-journey, one-min-max, power-world, static-world. V2-locked routes (`battle`, `tournament-*`) render `LockedFeature`.

### Screens (`src/screens/`)

Each file under `app/` imports its corresponding screen from `src/screens/`. The screens directory is the actual implementation:

- **AuthScreen** — sign in / sign up (email, Google, Apple). Invite codes are retired: `INVITE_CODE_ENABLED = false`
- **CompleteProfileScreen** — username (set once, unique, 1–30 chars, no `@`), gender/country
- **MilestoneLaneScreen** (`/onboarding-journey`, `/my-journey`) — onboarding lane and the ongoing Journey tab
- **AssessmentScreen → RankRevealScreen** — assessment and tier reveal
- **ProfileScreen** — main hub; world selector, tier grid, leaderboards, initiates trials
- **TrialScreen** — three modes: `progression` (advances tier), `practice` (lower tiers, no advancement), `eternal` (tier 8+)
- **PowerWorldScreen / StaticWorldScreen / OneMinMaxScreen / WeeklyChallengeScreen / ChampionsArenaScreen** — the worlds and challenges
- **TrainingCenterScreen, CustomizeProgramScreen, ProgramTemplatesScreen, QuickWorkoutScreen** — program building and workouts
- **CoachScreen** — AI Coach chat (paid; free users see `FreeCoachIntake`, then the paywall)
- **PaywallScreen** — RevenueCat paywall
- **coaching/** — `WarriorProgramScreen` (workout runner, used by athletes too), `ProgramBuilderScreen`, `MyClientsScreen`, `ClientDashboardScreen`, `ProgressTrackingScreen`, etc.

### State & Auth (`src/contexts/`)

- **AuthContext** — holds `user`, `profile`, `loading`, `profileLoading`, `needsPasswordReset`. Call `refreshProfile()` after any DB write that changes profile state. 5-second timeout safety prevents indefinite loading.
- **ThemeContext** — wraps `StealthTheme` (dark/light). Access via `useTheme()`.

### Database (Supabase)

**Core tables:**
| Table | Purpose |
|---|---|
| `profiles` | User state: tiers, `best_times`/`power_pbs` (jsonb), `is_admin`, `is_coach`, `subscription_tier` + `access_expires_at`, `community_id` |
| `trial_history` | Every trial attempt (completed or abandoned) — the strength leaderboard source |
| `power_assessments`, `static_holds`, `one_min_max_logs`, `weekly_entries` | World/challenge results (readable by signed-in users only) |
| `warrior_programs`, `program_templates`, `program_blocks`, `block_exercises` | Programs; AI Coach programs have `coach_id = 00000000-…-0002`, library templates `…-0001` |
| `workout_logs`, `workout_set_logs`, `bodyweight_logs` | Training logs |
| `ai_coach_requests` | AI Coach request + cost log (drives message caps and $ budgets) |
| `app_config` | Per-platform flags: `paywall_enabled`, `ai_coach_enabled`, chat caps, `minimum_version` |

**Key patterns:**
- Leaderboards come from SECURITY DEFINER RPCs (`get_tier_leaderboard`, etc.) over server-written tables.
- Tiers never decrease — code uses `Math.max(newTier, currentTier)`.
- Power scores only update if the new total exceeds the stored score.
- `guard_profile_protected_fields` (BEFORE UPDATE trigger on `profiles`) blocks direct client writes to tiers, points, entitlement/subscription fields, `community_id`, `coach_id`, `coaching_paused_*`, and makes username/gender/country set-once. Change those only in SECURITY DEFINER functions owned by `postgres`.
- Paid access is enforced server-side by `caller_effective_tier()` / `caller_has_pro_access()`; `src/lib/entitlement.ts` mirrors it for UI. Every AI Coach write RPC must call `caller_has_pro_access()`.
- In SECURITY DEFINER functions identify the caller with `auth.uid()` or `request.jwt.claims::jsonb->>'role'`, never `current_user`.

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
| `entitlement.ts` | `getSubscriptionTier`, `canAccessPro`, `hasActiveAccess` — mirrors the server's tier logic |
| `clashLogic.ts` | Online clash matchmaking and scoring (V2-locked) |

### Edge Functions (`supabase/functions/`)

- `submit-trial-result`, `revenuecat-webhook`, `confirm-entitlement`, `delete-user-account`, `send-push-notification`, `notify-*`, and 4 hourly cron senders (`send-daily-workout-reminders`, `send-weekly-challenge-*`, `send-client-attention-alerts`, authenticated with the Vault `cron_secret`).
- `ai-coach` — Claude tool-use loop (`index.ts`, `tools/`, `system-prompt.ts`). Program days pass through `assembleDayWithServerBlocks` → `normalizeBlockStructure` → `validateBlockStructure`; keep those three consistent (`tools/__tests__/blockHelpers.test.ts` runs them together). A model/prompt change is a server deploy, no app release.
- After deploying, check deployed == repo with `supabase functions download <name> --workdir <scratch>` and diff.

### Tier System

Strength tiers 0–9 map to Spartan-themed ranks:
`Helot → Neos → Ephebe → Hoplite → Spartan → Lochagos → Strategos → Olympian → Demigod → Eternity`

Power World unlocks at strength tier ≥ 6 (Strategos). Power tiers are separate: `Voltaic → Ampere → Tesla` based on weighted lift totals.

### Async Safety Hooks (`src/hooks/`)

- **`useSafeAsync`** — prevents double-submission and handles unmounted state. Use this for any async action triggered by user input.
- **`useSafeMutation`** — similar guard for DB mutations.
- **`useMountedRef`** — raw ref tracking component mount state.

### Components

Shared UI lives in `src/components/`. Profile-specific extracted components (ProfileHeader, TierSelectorRow, StrengthWorldView) are in `src/components/profile/`. Coaching UI components are in `src/components/coaching/`.

## Testing

Tests are in `src/lib/__tests__/`, `src/services/__tests__/`, `src/components/**/__tests__/` and `supabase/functions/ai-coach/tools/__tests__/`. Run with `npm test` (`jest-expo` preset). They cover pure logic — tier/points/entitlement logic, leaderboards, services, and the AI Coach block helpers. `npx tsc --noEmit` has ~14 known `Timeout` type errors; don't add new ones.

## Web Deployment

The web build deploys to Vercel. `vercel.json` configures CSP and security headers. The `build:vercel` script produces the `dist/` output and copies `public/` assets (PWA manifest, download page, privacy policy).
