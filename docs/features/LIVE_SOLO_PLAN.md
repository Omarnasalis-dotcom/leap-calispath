# Solo Battle

Status (2026-11-05): migration `20261106120000_add_solo_battle.sql` on prod; code on main; owner tested and confirmed everything works. Ships in the build after 1.2.17.

A free-for-all match in the LIVE tab, built on the Live Tournament engine (`LIVE_TOURNAMENT_PLAN.md`). Each player is a side of one, so timers, logging, hidden numbers, host fallback, presence, push, history and the PLAYERS board are the same code.

## Owner decisions (2026-11-05)

| Topic | Decision |
|---|---|
| Name | Solo Battle |
| Challenges | Admin creates them and sets the halves |
| Rooms | Any player opens a room and shares the code |
| Players | 2–12; any number from 2 can start |
| Halves | 1, 2 or 3, for Solo Battle and Live Teams |
| Tie for 1st | Shared 1st place |
| Results | Show when everyone has logged, or at the 2-minute limit |
| Missing log | 0 points at the limit |
| Host logging (Solo) | Only for a player offline 30+ seconds, 30+ seconds after time is up, never over the player's own log |
| Host logging (Teams) | Unchanged: any player, any time during logging |

## How it works

- `live_challenges.format` is `teams` or `solo` (also on `live_challenge_templates`). A solo challenge always has `team_size` 1.
- A solo room opens with `side_count` 12 and seats each player in the lowest free place. Start renumbers players 1..N by join order and sets `side_count` to N, so "#3 of 7" and history have no empty sides.
- Picking or naming a side is refused in a solo room. `get_live_team_board` skips solo challenges.
- In the app, `roomSideNames()` gives each side its player's name, and the Best Player card and per-player table are hidden because the winner is the best player.
- A one-half match says MATCH, not HALF 1 OF 1, in the app and in the push.

## Older apps (1.2.15–1.2.17)

They read `live_challenges` directly and don't know solo rooms.

- RLS limits direct reads to teams challenges. New apps call `get_open_live_challenges()`.
- `join_live_room` refuses a solo code with `APP_UPDATE_REQUIRED` unless the app sends `p_supports_solo`.
- A one-half **Teams** challenge does reach them. The match should run normally, but they show "1 HALVES". Publish the first one once most users have updated.

There is no new feature flag: publishing the first Solo Battle is the launch switch.

## Release order

1. Apply the migration to prod. This must come first: the new admin page sends `p_format` and the new app calls `get_open_live_challenges`.
2. Merge to main (deploys admin-web).
3. Ship the app in the build after 1.2.17.
4. Publish a Solo Battle.

## Known limits

- If the host's log is the last one missing, logging closes at once, so a returning player can't replace it. Earlier than that, the player's own log replaces the host's.
- Nobody can log for the host, so a host who is offline at the limit gets 0.
- Reps are self-reported, same as Teams and Weekly.
