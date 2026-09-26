# Handoff: Worlds Redesign — Static · Power · Endurance (1MM)

Scope: the three World screens.

| World | File | Accent |
|---|---|---|
| Static (timed holds) | `Leap Static v4 Mix.dc.html` | Violet `#8E6BFF` |
| Power (1RM) | `Leap Power v4 Mix.dc.html` | Red `#FF4A3D` |
| Endurance (1MM — max reps in 60s) | `Leap Endurance v1.dc.html` | Orange `#FF6B2C` |

## About the design files
The HTML files are **design references**: exact layout, colors, type, motion and behavior. They are not production code. Rebuild them in the app's stack using its existing components. Open any file directly in a browser (keep `support.js` next to them).

**Prototype-only, do not implement:**
- The left notes column beside the phone frame.
- The Tweaks: `demoState` (New / Ranked / King) just seeds mock data; `inCommunity` and `fromJourney` are real flags (see §1.1, §1.6).
- The status bar.

## Fidelity
**High-fidelity.** All users, scores, world bests, multipliers, thresholds and quotes are **mock data / placeholders**. Wire them to the real API and scoring rules.

---

## 0. Shared system (all three worlds)

The three worlds share one layout and component set. Only the accent colour, the copy and the movement/log module change.

### 0.1 Type & base
- Font: **Oswald** 300/400/500/600/700, throughout.
- Screen bg `#000`; frame reference 402 × 874.
- Text: primary `#fff`, secondary `#d0d0d0`, muted `#8a8a8a`, faint `#6a6a6a`, disabled `#4a4a4a`.
- Neutral surfaces: `#0a0a0a` (nav/sheets), `#0c0c0c` (sheet), `#0e0e0e` (segmented track), `#111`/`#141414`/`#1a1a1a` (buttons), borders `#1a1a1a`–`#2a2a2a`.
- Rank colours (gold/silver/bronze): `#E8B64C`, `#C9CED6`, `#C98B5A`. Gold is also the "King" state (#1 in the world).

### 0.2 Per-world tint tokens
| Token | Static | Power | Endurance |
|---|---|---|---|
| Accent | `#8E6BFF` | `#FF4A3D` | `#FF6B2C` |
| Accent hover | `#a08aff` | `#ff6a5f` | `#ff8a57` |
| Ring track / bar track | `#1c1830` | `#2a1212` | `#2a1a0c` |
| Tinted card bg | `#0c0a14` / `#121019` | `#140b0b` | `#140c07` |
| Tinted border | `#221c38` / `#1e1a2c` | `#2e1616` / `#3a1a18` | `#33200f` / `#3a2412` |
| Icon | snowflake | lightning bolt | stopwatch |

### 0.3 Header (padding `16px 24px 4px`)
- Row: world icon 18px in accent + title `STATIC WORLD` / `POWER WORLD` / `ENDURANCE WORLD`, 26px / 700 / ls 1.4 / `#fff`.
- If `fromJourney`: show a right-aligned `‹ JOURNEY` back chip (36h, radius 12, border `#2a2a2a`, 11px/600).

### 0.4 Dashboard: three circles (padding `22px 20px 0`, gap 6, centred)
| Circle | Size | Ring | Content |
|---|---|---|---|
| Left: **Rank** | 96 | r45, stroke 3 | label 9.5px/500 ls1.6 `#8a8a8a` · value 24px/700 (`#1` gold if King, `—` `#4a4a4a` if unranked) · sub 10px `OF WORLD` / `UNRANKED` |
| Centre: **Score** | 158 | r75, stroke 6; inner disc inset 14 tinted | label 10.5px/600 ls2 accent · score 34px/700 (`#4a4a4a` when 0) · `TOTAL PTS` 10px `#6a6a6a`. Content has `padding-bottom:16px` so the number clears the button. |
| Right: **Gap** | 96 | r45, stroke 3 | label · value 22px/700 · sub 10px |

- **Leaderboard button:** 44×44 accent circle, 4px `#000` border, absolute `right:-2 bottom:4` on the Score circle, podium icon (white, stroke 2.4). **It opens the Leaderboard sheet** (§0.8). Tapping the Rank or Score circle also opens it.
- Rings: SVG rotated −90°, `stroke-linecap:round`. They animate from 0 on mount: `stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)`, staggered .15 / .25 / .35s.

What each ring shows:
- **Rank ring:** `1 − (rank−1)/totalUsers`, i.e. how near the top you are.
- **Score ring:**
  - Static: progress within the current level.
  - Power and Endurance: `score / worldTopScore`.
- **Gap ring:**
  - Static and Endurance: `score / pointsOfUserAbove`. Full and gold when King.
  - Power: progress within the current level.

Gap circle copy:
- Static and Endurance:
  - Ranked: `GAP TO #n` · `12.34` · `PTS TO PASS`
  - King: `STATUS` · `KING` (gold) · `#1 OF WORLD`
  - Unranked: `GAP TO` · `—` · `RANK UP`
- Power: `LEVEL GAP` · pts to next level · `PTS TO AMPERE` / `PTS TO TESLA`. Shows `MAX` at the top level.

### 0.5 Segmented switch (the shared "switch style")
Used for skill tabs, level tabs, tier tabs and the log-sheet mode switch.
- Track: padding 3, radius 14, bg `#0e0e0e`, border `1px #1c1c1c`, CSS grid `repeat(N, minmax(0,1fr))`.
- Segment: radius 11, 12–13px / 600 / ls 1.4–1.6. Active = accent bg + `#fff`; inactive = transparent + `#8a8a8a`. `transition: background .2s`.
- Two-line variant (Static skills, Endurance levels): height 46–50; label, then a sub-line (dots or `3/6 LOGGED`, 9.5px).

### 0.6 Goal card (padding 18, radius 20, gap 14)
- 40×40 icon tile (accent at 14% alpha bg). Shows a crown in gold when King.
- Kicker 10.5px ls2 `#8a8a8a` (`NEXT TARGET` / `YOU'RE #1` / `GET STARTED`).
- Title 18px/600 (e.g. `12.34 pts to steal Rank #4`).
- Progress bar 4px: you vs the user above, animated width .9s. Labels `YOU 107.50` / `#4 120.00`.
- Footer line 12px/500 ls2.4 `#6a6a6a`, top border `#1a1a1a`:
  - Static: quote (placeholder)
  - Power: `TAKE THE LEAP. CLAIM YOUR POWER.`
  - Endurance: `SIXTY SECONDS. NO EXCUSES.` (placeholder)
- King state: bg `#14110a`, border `rgba(232,182,76,.35)`.

### 0.7 Bottom sheet (shared shell)
- Scrim `rgba(0,0,0,.72)`; tap it to close.
- Sheet: radius `28 28 0 0`, bg `#0c0c0c`, top border tinted, max-height 88–90%.
- Grabber 40×4 `#2a2a2a`.
- Header: kicker 10.5px ls2 `#8a8a8a` + title 24px/700, and a close button (40 circle, `#1a1a1a`).
- Primary CTA: 56h, radius 16, accent bg, 17px/700 ls2.6 `LOG PERFORMANCE`.
- "This set" row: `THIS SET` label, then points 30px/700 + `PTS`.
- Right of that row, a PB chip:
  - Accent-filled with `NEW PB` / `NEW 1RM` / `FIRST SET` when the entry beats your best.
  - Otherwise outlined `#2a2a2a` showing `PB …`.
- Below: a **Top list** (6 rows: rank colour · name · `YOU` badge · value) and your row highlighted at 9% accent alpha.
- After logging: a toast at top (52h, radius 16, accent bg, 14px/600) — `NEW PB · +x.xx PTS` or `LOGGED · PB UNCHANGED`, auto-hides after 2.2s.

**Typeable number field** (Power + Endurance log):
- Box: padding `4 14 6`, radius 16, tinted border.
- Input: 60px/700, transparent, caret in accent, width auto-sized by character count. Numeric keypad (`inputmode`). Select-all on focus.
- A unit label and pencil icon sit to the right; hint `TAP TO TYPE` below at 10px.

### 0.8 Leaderboard sheet (opened by the leaderboard button)
- Sheet height 90%, bg `#0a0a0a`.
- Header: kicker (icon + `<WORLD> WORLD`, accent 10.5px/600) and title `LEADERBOARD` 26px/700.
- Filters:
  - `PUBLIC | MY COMMUNITY` — only when `inCommunity`.
  - `ALL | MALE | FEMALE` — right-aligned.
  - Style: pill segs, padding `7px 12px`, radius 9, active = accent.
- **Podium**, 3 columns in order 2nd · 1st · 3rd, bottom-aligned:
  - Crown (gold, 20px) above 1st only.
  - Avatar with initials: 62px for 1st, 52px otherwise. 2px border in the rank colour (accent if it's you). 1st also gets a 5px gold halo at 12% alpha.
  - Name: 12px, ellipsis.
  - Block: heights 126 / 96 / 76, radius `14 14 0 0`. Shows the rank number (30/24px, rank colour), points 15px/600, and the level 9.5px.
- **List** of ranks 4–20: attached under the podium (radius `0 0 18 18`), rows 58h showing rank · country code chip (26×18) · name · level · pts.
- **Pinned "you" bar**, outside the scroll area:
  - 62h, radius 16, tinted bg, accent border at 35% alpha.
  - Left to right: rank (20px/700) · `@handle` + `YOU` · a sub-line (`x pts to pass @name` / `Static King · hold the top spot` / `Log a hold to join the board`) · score on the right.
  - King state is gold.

### 0.9 Bottom nav
5 columns: Profile · Strength · **Worlds** (active: 48×30 pill at 16% accent alpha, icon + label in accent) · Train · Journey. Padding `12 6 28`, bg `#0a0a0a`, top border `#1a1a1a`, labels 11px ls1.2.

---

## 1. Static World — `Leap Static v4 Mix.dc.html`
Timed holds. There are 4 skills with 3 variations each (12 holds).

### 1.1 Skill switch (padding `26 24 8`)
- 4-column segmented switch (§0.5, two-line): `HANDSTAND · FRONT LV · BACK LV · PLANCHE`.
- Each segment has 3 dots (5×5): logged = accent (white on the active segment); not logged = `#2a2a2a` (30% white on active).

### 1.2 Skill cards (swipe carousel)
- Track height 318. Card 326w × 306h, gap 12, centred.
- Active card is at scale 1. Neighbours are at scale .92 and 42% opacity. Transition `.45s cubic-bezier(.4,0,.2,1)`.
- Swipe > 40px moves one card. Tapping a neighbour selects it. Kept in sync with the switch.
- Card: radius 26, padding 20. Active card: bg `#0e0b18`, border `rgba(142,107,255,.45)`.
  - Top: `SKILL n OF 4` kicker, skill name 30px/700, skill points (accent, 22px) on the right.
  - Bottom: 3 hold rows. Each row is 62h, radius 16, bg `#121019`, border `#1e1a2c`:
    - Level badge 22×22, e.g. `1`.
    - Name 15px/600 with ellipsis.
    - Sub-line: `PB 60.0s · 15.00 pts` or `TAP TO TIME`.
    - Multiplier chip, e.g. `×0.25`.
    - 36px accent stopwatch button.
- Implementation note: the card and its row grid need `min-width:0` / `minmax(0,1fr)` so long names truncate instead of widening the card.

### 1.3 Tier tabs + goal / elite
- Tabs: `OVERALL` (with crown) · `STONE` · `IRON` · `TITAN` (§0.5).
- `OVERALL` shows the goal card (§0.6).
- A level tab shows `<TIER> ELITE`, the filters, and a list of up to 6 rows. Empty state is a dashed card: "No warriors at this level yet."

### 1.4 Timer sheet (tap a hold row)
- Kicker: `HANDSTAND · LEVEL 1`. Title: the hold name.
- **Mode switch** (§0.5, 2 columns, margin-top 16): `LOG TIME | TIMER`.
  - `LOG TIME` goes to manual entry, prefilled with your PB or 20s.
  - `TIMER` goes to the idle timer.
- Ring: 196px, r90, stroke 5. Centre shows label, a big value (50px, or 72px for the countdown) and a sub-line (points).
- Timer states:
  - **Idle:** `START TIMER` CTA with a play icon.
  - **Ready:** 3-2-1 countdown, with a `CANCEL` outlined button.
  - **Running:** the ring fills toward max(PB, 10s). CTA is white, `STOP & LOG`.
  - **Stopped:** `−1s | ADJUST | +1s`, then `LOG PERFORMANCE`, then `RESTART | DISCARD`.
- **Manual state:** quick chips `10s 20s 30s 60s`, `−1s | FINE TUNE | +1s`, and `LOG PERFORMANCE`.
- Below: `TOP HOLDS` list, with `×mult PTS / SEC` on the right.

### 1.5 Scoring (placeholder)
- Formula: `pts = seconds × multiplier`.
- Multipliers — only the 0.25× and 8× endpoints are confirmed:
  - Handstand: .25 / 1 / 8
  - Front lever: .5 / 2 / 6
  - Back lever: .5 / 1.5 / 4
  - Planche: 1 / 3 / 8
- Level thresholds: Stone 0–150, Iron 150–400, Titan 400+. **Replace these with the real values.**

---

## 2. Power World — `Leap Power v4 Mix.dc.html`
**1RM**: the user enters the most weight they can lift for one rep. There are 4 movements: Pull-up, Dip, Squat, Muscle-up.

### 2.1 Lift rows (padding `22 24 0`, gap 10)
- Card: radius 20, padding `14 14 14 16`, gap 12.
  - Logged: bg `#140b0b`, border `#3a1a18`.
  - Empty: bg `#0d0d0d`, border `#1c1c1c`.
- Top row:
  - Left: name 18px/700, with a sub-line under it (`1RM · 40.00 PTS` in accent, or `TAP TO LOG 1RM` `#6a6a6a`).
  - Right: the 1RM value 40px/700 + `KG` (`—` in `#3a3a3a` when empty).
  - A 36px accent `+` button.
- Bottom: a 4px bar showing `1RM / worldBest` (animated .9s). Footer 10.5px: `×2 · ADDED WEIGHT` on the left, `WORLD BEST 60 KG` on the right.
- Tapping the row opens the Log sheet.

### 2.2 Level tabs + goal / elite
Same as Static §1.3: `ALL` (crown) · `VOLTAIC` · `AMPERE` · `TESLA`.

### 2.3 Log sheet: plate loader
- Kicker: `CURRENT 1RM 20 KG · 40.00 PTS` or `ONE REP MAX · NO LIFT YET`.
- Loader card (radius 22, bg `#110a0a`, border `#2e1616`, padding `18 14 14`, gap 16):
  1. **Typeable kg field** (§0.7), with `TAP TO TYPE · OR LOAD PLATES` under it. Accepts decimals, max 999.
  2. **Barbell visual** (96h, centred):
     - Order: collar 22×6 · plates on the left (mirrored) · sleeve 8×20 · bar · sleeve · plates on the right · collar.
     - Plate heights: 20 kg → 88, 10 → 72, 5 → 56, 2.5 → 44, 1.25 → 34. Widths 13 / 11 / 9 / 7 / 7.
     - Plate colours: 20 `#FF4A3D` · 10 `#c7372d` · 5 `#8a2620` · 2.5 `#d0d0d0` · 1.25 `#8a8a8a`.
     - Bar width = `max(44, 110 − plates×11)`. **Maximum 6 plates drawn per side.** Any extra shows as `+N MORE PLATES` in accent next to the hint. The kg number is always exact.
     - A typed value is split into plates greedily (heaviest first).
  3. Hint: `TAP A PLATE TO ADD · ADDED WEIGHT|BARBELL`.
  4. Plate buttons `+20 +10 +5 +2.5 +1.25` (48h, radius 14, bg `#1a1010`).
  5. `UNDO · −2.5 · +2.5 · CLEAR` (40h, outlined). Undo removes the smallest plate.
- Then the "This set" row, `LOG PERFORMANCE`, and a `TOP LIFTS` list (`×mult PTS / KG`).
- Logging only updates the PB when the new kg is higher.

### 2.4 Scoring (placeholder)
- Formula: `pts = kg × multiplier`.
- Multipliers: Pull-up 2 (added kg), Dip 1.5 (added kg), Squat 0.6 (total barbell kg), Muscle-up 4 (added kg).
- Levels: Voltaic 0–100, Ampere 100–250, Tesla 250–500.
- World bests: 60 / 85 / 220 / 30 kg.
- **Confirm whether pull-ups, dips and muscle-ups count added weight only or bodyweight + added.**

---

## 3. Endurance World (1MM) — `Leap Endurance v1.dc.html`
**One Minute Max**: the most reps in 60 seconds. There are 3 levels: Entry (6 movements), Main (5) and Advanced (5).

### 3.1 Level switch (padding `26 24 10`)
- 3-column segmented switch, two-line (§0.5), height 50: `ENTRY · MAIN · ADVANCED`.
- The sub-line reads `n/6 LOGGED`. Switching tabs swaps the movement list.

### 3.2 Movement rows (gap 10)
- Row: radius 20, padding 12, gap 14. Tinted when logged (`#140c07` / `#3a2412`); `#0d0d0d` / `#1c1c1c` when empty.
- Mini ring on the left: 54px, r24, stroke 3. It fills to `reps / worldBest`. The centre shows the reps (17px/700) + `REPS`, or `—`.
- Name 16px/700 with ellipsis. Sub-line 11px/600: `27.50 PTS · 79% OF WORLD BEST` (accent), or `TAP TO LOG · OR RUN TIMER`.
- 42px accent stopwatch button on the right.
- **Two entry points:**
  - Tap the row → Log sheet opens in **Log reps** mode.
  - Tap the stopwatch → Log sheet opens in **60s timer** mode. The tap must not also trigger the row.

Entry movements: Knee Push-ups, Inverted Row, Bench Dips, Air Squats, Incline Push-ups, Assisted Pull-ups.
Main and Advanced movements are **placeholders**: Push-ups, Pull-ups, Parallel Dips, Jump Squats, Hanging Knee Raises / Clap Push-ups, Chest-to-bar Pull-ups, Ring Dips, Pistol Squats, Toes-to-bar.

### 3.3 Log sheet
- Kicker: `ENTRY · 1 MINUTE MAX · PB 40 REPS`.
- **Mode switch** `LOG REPS | 60S TIMER` (§0.5). This is the reference for the switch style.

**Log reps mode:**
- Card (radius 22, bg `#140c07`, border `#33200f`).
- `REPS IN 60 SECONDS` label.
- Typeable reps field (whole numbers, max 3 digits).
- Buttons `−5 −1 +1 +5` (46h, radius 12, bg `#1a1109`).
- Then the "This set" row and `LOG PERFORMANCE`.

**60s timer mode:**
- Ring: 210px, r97, stroke 6.
- **Idle:** shows `1 MINUTE MAX`, `60`, `SECONDS`. CTA `START 60S` with a play icon, and the hint "Tap the ring on every rep to count as you go."
- **Ready:** 3-2-1 countdown (76px), ring fills in 3 steps, with an outlined `CANCEL`.
- **Running:** `TIME LEFT`, whole seconds remaining (64px), and `n REPS` in accent. The ring drains `left/60` (linear, .1s updates).
  - Buttons: `+1 REP` (64h, accent, takes 2/3 of the width) and outlined `STOP`.
  - Tapping the ring also adds a rep.
- **At 0s or on STOP:** switch automatically to **Log reps** with the tapped count prefilled, and show the toast `TIME! CONFIRM YOUR REPS`. The user can correct the number, then log.

Below both modes: `TOP 60S SETS` list (`×mult PTS / REP`).

### 3.4 Scoring (placeholder)
- Formula: `pts = reps × level multiplier`.
- Multipliers: Entry 0.5, Main 1, Advanced 2.
- World bests start at 70 / 55 / 35 and drop by 3 per movement.
- The score is the sum across all logged movements.

---

## 4. States to support (all worlds)
- **New:** score `0.00` greyed, rank `—` / `UNRANKED`, all rings empty, rows in their "tap to log" state, goal card showing `GET STARTED`.
- **Ranked:** everything filled. The goal card shows the gap to the user above.
- **King (#1):** rank shown in gold, Gap circle reads `STATUS / KING` in gold (Power keeps the level gap), goal card turns gold with `<WORLD> KING ACHIEVED`, "you" bar turns gold.

## 5. Motion summary
| Element | Motion |
|---|---|
| Dashboard rings | dashoffset 1s `cubic-bezier(.4,0,.2,1)`, stagger .15/.25/.35s, from 0 on mount |
| Progress bars | width .9s same curve, .2s delay |
| Carousel (Static) | translateX + scale/opacity .45s |
| Segmented switch | background .2s |
| Timer ring | linear .1s while running; .6s ease otherwise |
| Toast | appears on log, auto-hide 2.2s |

## 6. Open items: need real data
1. The real multiplier for every movement in all three worlds.
2. Level names and thresholds (Static: Stone / Iron / Titan; Power: Voltaic / Ampere / Tesla; Endurance: none — confirm).
3. Power: does bodyweight count toward the 1RM?
4. Endurance: the final Main and Advanced movement lists.
5. The quote copy for Static and Endurance.
