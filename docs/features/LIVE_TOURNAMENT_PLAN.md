# Live Tournament: Implementation Plan

Status: planning done 2026-10-22; step 1 (database) in progress. This feature is fully separate from Team Challenge (`TEAM_CHALLENGE_PLAN.md`) and from the V2-locked Tournament/Clash feature: it uses only new `live_*` tables and functions, so no existing function changes and older app versions can't see it.

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
| Results | Inside the room and in each player's Live history. No global leaderboard in v1 |

## 2. Defaults chosen by Claude (change any of them)

1. **Sides:** the host picks 2–4 sides when creating the room (default 2). The challenge sets the max players per side.
2. **Fair sides:** Start needs every side to have the same number of players (at least 1). Sides don't have to be full, so a 3-a-side challenge can be played 2 v 2.
3. **Everyone plays**, including the host: every player in the room must pick a side before Start. (A non-playing referee/host is not in v1.)
4. **One live room at a time** per player (create/join is refused while you're in another unfinished room).
5. **Players can't join, leave or switch sides after Start.** Someone who drops out just gets 0 for the halves they don't log.
6. **Logging:** a player can fix their log until logging closes. It closes when everyone has logged or after 2 minutes, whichever comes first.
7. **Hidden until close:** while a half is being logged, players only see *who* has logged, not other players' numbers. Numbers and standings show once logging closes.
8. **Host gone:** if the host hasn't started the next half 3 minutes after logging closed, any player in the room can start it. If the host leaves in the lobby, the earliest-joined player becomes host.
9. **Stale rooms:** a lobby with no activity for 2 hours is abandoned. A match where nobody starts the next half within 30 minutes ends with the halves played so far (results kept).
10. **Best player tie:** the player whose last log came first.
11. **Ending early:** the host can abandon the room at any time (with a confirmation in the app). An abandoned room keeps no result.

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

## 8. Risks / gaps

- **Honor system:** reps are self-reported, only checked against the max per exercise. Same trust level as Weekly.
- **Realtime + polling load:** up to 24 phones polling every 2 s per room. Each poll is one RPC; fine at current scale, worth watching.
- **Gym signal:** a phone that loses signal keeps the timer (server-anchored) but can't log until it reconnects; the 2-minute window is the limit.
- **Same-place assumption:** nothing stops remote players from joining a room with the code. Accepted for v1.
- **No moderation of rooms yet** beyond admin abandon. No names are user-entered (sides are A/B/C/D), so there is nothing offensive to moderate.
