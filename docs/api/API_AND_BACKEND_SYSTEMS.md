# API & Backend Systems

Anti-Gravity uses a "Serverless Core" architecture powered by Supabase. Most business logic resides in PostgreSQL functions (RPCs) and triggers to ensure data integrity and security.

## 1. Core API (Supabase RPCs)

| RPC Name | Purpose | Returns |
| :--- | :--- | :--- |
| `calculate_glory` | Recalculates unified standing. | `INTEGER` |
| `send_clash_challenge` | Validates bracket and creates session. | `UUID` (Session ID) |
| `finish_clash_session` | Atomic finish reporting with SUDDEN DEATH logic. | `JSONB` (Winner details) |
| `get_arena_worldwide_rankings` | Unified Pro + User leaderboard. | `TABLE` |
| `get_static_well_rounded_leaderboard` | Complex aggregation of category PBs. | `TABLE` |
| `handle_new_user` | Triggered on Auth signup. | `TRIGGER` |

## 2. Real-time Systems (Supabase Realtime)

The app utilizes **Postgres CDC (Change Data Capture)** to drive real-time UI updates without polling.

### Subscriptions:
- **`clash_invites`**: Listens for `INSERT` on `clash_sessions` where `receiver_id = auth.uid()`. Drives the "New Challenge" modal.
- **`battle_{id}`**: Listens for `UPDATE` on a specific clash session. Drives the live progress bars in `ClashScreen.tsx`.
- **`tournament_sessions`**: Listens for status changes (e.g., `registration` -> `active`) to advance the lobby UI.

## 3. Background Systems & Cron (Inferred/Implicit)

### Auto-Elimination System
- **Trigger**: Round advancement in a tournament.
- **Logic**: `checkAndAutoEliminate` in `TournamentService.ts`.
- **Note**: Currently triggered by the first user to submit a score for a completed round, but the architecture supports a server-side cron to enforce deadlines.

### Handicap Engine
- **Logic**: Resides in `src/lib/tournamentLogic.ts`.
- **Impact**: All tournament score submissions are processed through this engine before being written to the database.

## 4. Middleware & Validation

### "Dishonor" Gate (Anti-Cheat)
- **Layer**: Service Layer (`TrialService.ts`).
- **Validation**: Checks `TIER_HARD_FLOORS` before allowing a `strength_tier` update.
- **Vulnerability**: Since this is client-side, a future improvement would move this check into a database trigger or edge function.

## 5. Third-Party Integrations
- **Expo Push Notifications**: Detected via `push_token` column in `profiles` and `expo-notifications` usage. Used for battle invites and round deadlines.
- **Supabase Storage**: Inferred for profile avatars (Identity management).
