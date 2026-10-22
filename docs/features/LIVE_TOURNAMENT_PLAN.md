# Live Tournament: Implementation Plan

Status (2026-10-22): database applied to prod (flag off); app logic, admin page and app screens built on branch `live-tournament`; `send-live-room-push` not deployed; no device test yet. This feature is fully separate from Team Challenge (`TEAM_CHALLENGE_PLAN.md`) and from the V2-locked Tournament/Clash feature: it uses only new `live_*` tables and functions, so no existing function changes and older app versions can't see it.

## 1. What we're building

Players in the same place play a live match against each other, in sides, over 2 or 3 timed halves. After each half every player logs their own reps, the room sees the standings, and after the last half a ranked reveal shows the winning side and the best player.

| Decision (owner, 2026-10-22) | Value |
|---|---|
| Entry point | A **LIVE** tab next to SOLO / TEAM in Weekly Challenge |
| Who creates challenges | Admin, in the admin panel. 1–2 per week (start–end window, like Weekly) |
| A challenge has | 2 or 3 halves. Each half: minutes + exercises with a **max reps** and **points per rep**. Rest time between halves (default 60 s). Players per side |
| Room | Any player picks an open challenge and creates a room (gets a code). Players join with the code and **pick a side**, then tap Ready |
| Start | The room host taps Start when every player has a side and is ready |
| During a half | 3-2-1, then a countdown. Exercises in any order, each up to its max |
| After a half | Every player logs reps per exercise (0..max). 2 minutes to log; the host can log for anyone; a player who hasn't logged gets 0 |
| Between halves | Standings (side totals, ranked) + a cool-down timer. The host can start the next half **any time** once logging is done |
| Points | Reps × points per exercise (Weekly movement points) |
| End | Ranked reveal (last → first side), points per half and total, **Best player** = most points in the room |
| Results | Inside the room, in each player's Live history, and on the challenge's public PLAYERS / TEAMS leaderboard (§2a) |

## 2. Defaults chosen by Claude (change any of them)

1. **Sides:** the host picks 2–4 sides when creating the room (default 2). The challenge sets the max players per side.
2. **Fair sides:** Start needs every side to have the same number of players (at least 1). Sides don't have to be full, so a 3-a-side challenge can be played 2 v 2.
3. **Everyone plays**, including the host: every player in the room must pick a side before Start. (A non-playing referee/host is not in v1.)
4. **One live room at a time** per player (create/join is refused while you're in another unfinished room).
5. **Players can't join, leave or switch sides after Start.** Someone who drops out just gets 0 for the halves they don't log.
6. **Logging:** a player can fix their log until logging closes. It closes when everyone has logged or after 2 minutes, whichever comes first.
7. **Hidden until close:** while a half is being logged, players only see *who* has logged, not other players' numbers. Numbers and standings show once logging closes.
8. **Host gone:** if the host hasn't started the next half 3 minutes after logging closed, any player in the room can start it. If the host leaves in the lobby, the earliest-joined player becomes host. *(Owner)* If the host's phone has been gone **2 minutes in the lobby**, the earliest-joined player who is here hosts until the host is back.
9. **Stale rooms:** a lobby with no activity for 2 hours is abandoned. A match where nobody starts the next half within 30 minutes ends with the halves played so far (results kept).
10. **Best player tie:** the player whose last log came first.
11. **Ending early:** the host can abandon the room at any time (with a confirmation in the app). An abandoned room keeps no result.

## 2a. Additions *(owner, 2026-10-22)*

- **Team names:** any player on a side names it in the lobby (1–24 characters, unique in the room). Start is blocked until every side has a name. Names replace "SIDE A" everywhere, including history; the admin rooms list shows them for moderation (an offensive one: abandon the room). Migration `20261023120000_live_side_names.sql`.
- **Rep counter during a half:** −1 / +1 / +5 / +10 per exercise, capped at the max, private to the phone (saved in AsyncStorage), and it pre-fills the log when time is up.
- **Final celebration:** sides land from last to first, then the winner pops with confetti, a haptic and the bell, then the best player card; tap to skip; reduce motion jumps to the end. One Reanimated clock (no mixed drivers).

- **Public leaderboard per challenge** *(replaces "no global leaderboard in v1")*: in the LIVE tab under the challenge, with PLAYERS and TEAMS tabs on the podium layout. Only rooms that played every half count. Players: each player's best total; "hide me from leaderboards" is honoured. Teams: each side scored as points per player (fair across 2 v 2 / 3 v 3); the same group of players keeps only its best entry. Top 100 + your own row. Migration `20261023130000_live_challenge_boards.sql`.

## 2b. Lost connection, locked phone, leaving the app *(owner, 2026-10-22)*

The server keeps the time, so a phone only needs internet to join, pick a side, start, and send its log.

| Situation | Behavior |
|---|---|
| Offline in the lobby | Still in the room. Shows **Reconnecting…**; catches up on reconnect. Grey dot for the others after 15 s |
| Offline during a half | Nothing breaks: the timer runs from the synced clock. Exercises stay on screen |
| Offline while logging | The log is kept on the phone (AsyncStorage) and sent automatically on reconnect. If the 2-minute window closes first, 0 (the host can still log for them before it closes) |
| Host offline | Between halves: anyone can start after 3 min. In the lobby: next player hosts after 2 min |
| App killed / reopened | `get_my_live_room()` reopens the room at the right step |
| Screen | Kept awake while in a room (`useKeepAwakeWhile`) |
| Phone locked / app in background | Local alerts for known moments (`useBackgroundTimerAlerts`): half start, time's up, 30 s left to log. **Push** "Half N starts now" for the host's start, which the phone can't predict |
| Online dots *(owner)* | Every call records `last_seen_at` in `live_room_presence` (no realtime on it). Green = seen in the last 15 s. The host gets a warning before Start if someone is grey |
| Countdown | 5 s (was 3), so a locked phone has time to open from the notification |

**Push details:** `start_live_half` inserts one `notifications` row per other player (`type = live_half_started`, EN/AR from `profiles.language`, respects `notification_preferences.prefs.live_half_started = false`, `data.screen = live-room`). The starter's phone then calls the `send-live-room-push` Edge Function, which checks the caller is in the room, atomically claims only that room's unsent rows from the last 2 minutes, refuses above 24 pending (fan-out cap), and sends one Expo batch. The app's foreground handler must stay silent for this type while the room screen is open (step 4).

## 3. Data model (new migration, no change to existing tables)

```
live_challenges   id, title, description, halves jsonb, rest_sec, team_size (players per side, 1–6),
                  starts_at, ends_at, is_active, created_by, created_at, updated_at
                  halves = [{ duration_sec, movements: [{ name, reps (max), points }] }]  (2–3 halves)
live_rooms        id, challenge_id, code (6 chars), host_id, side_count (2–4),
                  status lobby|playing|finished|abandoned, current_half,
                  half_started_at, half_ends_at, log_closes_at, half_closed_at,
                  last_activity_at, created_at, started_at, finished_at
live_room_players room_id, user_id, side (null until picked), is_ready, joined_at
live_half_results room_id, half, user_id, side, reps int[], points, entered_by, entered_at, updated_at
live_room_presence room_id, user_id, last_seen_at   (no client access, no realtime)
```

**Access:** RLS on, `REVOKE ALL` from anon/authenticated. Clients may SELECT `live_challenges` (active only), and `live_rooms` (without `code`) / `live_room_players` for rooms they're in (for realtime). `live_half_results` has no client grant: values come only through `get_live_room_state`, which hides other players' numbers until logging closes. Every write is a SECURITY DEFINER RPC; every time is a server timestamp.

**State advances lazily:** there's no cron. Any call that touches a room first runs `live_advance(room)`, which closes an expired logging window, finishes the match after the last half, and expires stale rooms, so a dead phone can't stall a room.

## 4. Server functions

| RPC | Who | Effect |
|---|---|---|
| `admin_upsert_live_challenge`, `admin_delete_live_challenge`, `admin_get_live_challenges`, `admin_get_live_rooms`, `admin_abandon_live_room` | admin | Validated, audited. Halves/team size frozen once a room exists |
| `create_live_room(challenge, side_count)` | player | Challenge open; caller not in another live room. Returns id + code |
| `join_live_room(code)` | player | Lobby only, room not full, not in another live room |
| `pick_live_side(room, side)` | player | Lobby only, side not full; resets Ready |
| `set_live_ready(room, ready)` | player | Lobby only, must have a side |
| `leave_live_room(room, user?)` | self / host kicks | Lobby only; host handover; last one out abandons |
| `start_live_half(room)` | host (or anyone after the fallback delay) | Half 1: lobby → playing, sides fair, all ready, challenge open. Later halves: previous half closed |
| `submit_live_reps(room, half, user, reps[])` | self or host | Only after the half's timer ends and before logging closes; each value 0..max |
| `abandon_live_room(room)` | host | Any time |
| `get_live_room_state(room)` | players in the room | Everything the screens need + server time |
| `get_my_live_room()` | player | Your unfinished room (to resume) |
| `get_my_live_history()` | player | Finished rooms with your side's place and your points |

## 5. App

- `src/lib/liveTournament.ts`: pure helpers (phase from server time, points, standings, best player), mirrored from the server, with Jest tests.
- `src/services/LiveTournamentService.ts`: RPC wrappers (`withNetworkRetry`), reusing `useServerClock`.
- Screens: LIVE hub (open challenges, Create room, Join with code, history), Room lobby (code + share, sides, Ready, host Start), Half timer, Log reps, Standings / cool-down, Final reveal + Best player.
- Live updates: realtime on `live_rooms` / `live_room_players` + polling every 2 s while a room is open.
- EN + AR (RTL), light + dark, sounds/haptics from the Team attempt screen.
- Flag: `app_config.live_tournament_enabled` (per platform, admins always see it).

## 6. Admin panel

Live Challenges page: create/edit (halves editor with the shared MovementsEditor, minutes per half, rest, players per side, dates), list with room counts, view rooms, abandon a stuck room.

## 7. Build order

| Step | Work | Verify |
|---|---|---|
| 1 | Migration | Throwaway local Postgres: full match flow with 2 sides, logging deadline, max-rep checks, host fallback, stale rooms, every rejection, grants |
| 2 | `liveTournament.ts` + service + tests | Jest |
| 3 | Admin page | Build + create a challenge on prod after the migration |
| 4 | App screens | Simulators, then real phones (2 v 2 = 4 phones), EN + AR |
| 5 | Release | Migration to prod (flag off) → app build → publish a challenge → flag on |

## 7b. Load during live events (checked 2026-10-22)

Production: 68 MB database, 100% cache hit, **max_connections 60** (small compute), ~23 connections in use at rest.

| Per phone in a room | Cost |
|---|---|
| `get_live_room_state` poll | every 3 s (lobby, logging, cool-down), every 6 s while a half runs, none in the background or after the end |
| Presence write | at most once per 5 s (`live_touch` throttle) |
| Realtime | 1 socket, 2 filtered channels (`live_rooms`, `live_room_players`) |

**Measured on a throwaway Postgres (Apple silicon), 400 players in 50 rooms:** `get_live_room_state` 2.2 ms average, ~9,200 calls/s on 20 connections, 0 failures; 184k calls produced 1,600 presence writes; leaderboards 13 ms (players) / 7 ms (teams) at 50 finished rooms. 400 live players generate ~70–130 calls/s, so even a 10–20× slower production box has several times the headroom.

Tuning applied (`20261023140000_live_load_tuning.sql`): presence write throttle, no `live_rooms` touch per log (it was a realtime fan-out to every phone in the room), partial index for the push function's notification lookup. App: phase-based polling.

**Watch on event days:** Supabase dashboard → Realtime (concurrent connections and messages per second against the plan quota) and Database (CPU, connections). The realtime connection quota per plan is the first limit a big event would hit, not Postgres.

## 8. Risks / gaps

- **Honor system:** reps are self-reported, only checked against the max per exercise. Same trust level as Weekly.
- **Realtime + polling load:** up to 24 phones polling every 2 s per room. Each poll is one RPC; fine at current scale, worth watching.
- **Gym signal:** a phone that loses signal keeps the timer (server-anchored) but can't log until it reconnects; the 2-minute window is the limit.
- **Same-place assumption:** nothing stops remote players from joining a room with the code. Accepted for v1.
- **Push is sent by the starter's phone.** If its connection drops right after Start, nobody gets the push (players nearby still see the countdown). A database-triggered send would remove this, at the cost of more server setup.
- **`send-live-room-push` was not run locally** (Docker was down). Test it on prod with a real room before launch, after a read-only check of pending rows.
- **No moderation of rooms yet** beyond admin abandon. No names are user-entered (sides are A/B/C/D), so there is nothing offensive to moderate.
