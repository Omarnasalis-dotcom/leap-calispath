# Handoff: Training Center — Flow & Screens

## Overview
Renames the Profile screen's program button to **TRAINING CENTER** and turns it into the entry point for a hub dashboard with **four paths**: My Active Program, Program Templates, Customize Your Program, Quick Workout. Includes the Active Program week/day view and the full Session detail reached from a day's START button.

## About the Design File
`Leap Training Center.dc.html` is a **design reference in HTML/React** — exact layout, colors, motion timings, and navigation behavior. Not production code. Rebuild in the app's real stack (React Native / Swift / Kotlin).

The file renders a **left rail** (screen jump list + a "has active program" toggle) next to a phone frame. **The rail is a prototype control only — do not implement it.** Everything inside the phone frame is in scope.

## Fidelity
**High-fidelity** on the Training Center dashboard, the four path tiles, and the Session screen. The Profile screen is **context only** — it already exists; the only change there is the button (§1). All content is placeholder for real API data — see §8.

---

## Navigation map

```
Profile
  └─ [TRAINING CENTER]  →  Training Center (hub)
        ├─ 1  My Active Program   (gated — only when a program is assigned)
        │      └─ Session detail  (from a day card's START)
        ├─ 2  Program Templates   → select → assigns program → Active Program
        ├─ 3  Customize Your Program → build → assigns program
        └─ 4  Quick Workout       → play → session runner (existing)
```

Push/pop stack. Forward = slide in from right (translateX 26 → 0, fade), back = slide in from left, both 0.34s `cubic-bezier(.2,.9,.3,1.05)`. Back chevron in every child header pops one level. The 6-tab bar stays fixed and visible on all screens.

---

## 1. Profile screen change

The existing "My Workout Program" button becomes:

- **Label: `TRAINING CENTER`** — white, 15pt, weight 700, letter-spacing 1.8, uppercase.
- Leading calendar glyph + trailing chevron `›` — the chevron is what signals "this opens a hub", not "this starts a workout".
- Treatment: 1.5pt gradient border (`#8b5cf6 → #f97316`, the Static→1MM discipline sweep) around a near-black fill, with a slow diagonal sheen pass (4.2s ease-in-out loop) so it reads as the screen's primary destination.
- It must sit **above** the coral Weekly Challenge button — the coral fill stays reserved for that action so the two don't compete.

Nothing else on Profile changes.

---

## 2. Training Center (hub)

Header: back chevron + title "TRAINING CENTER" (19pt/700/1.9) + a coral status subline (9.5pt/500/2.0, uppercase) that is **dynamic**: `"WEEK 3 · 2 SESSIONS LEFT"` when a program is active, `"NOTHING SCHEDULED YET"` when not.

### 2.1 Hero card
Radius 20, padding 18. Two states:

**Active** — border `#3d1a1a`, background `linear-gradient(160deg,#140807,#0a0505 55%,#080505)`.
- Left: 96pt SVG donut, 5pt stroke, track `#2a1212`, coral fill drawn on entry (dashoffset animated over 0.9s `cubic-bezier(.2,.9,.3,1)`). Center: big % (24pt/700) + "COMPLETE" (8pt/1.4).
- Right: "ACTIVE PROGRAM" eyebrow (9pt/2.0/`#6d6d6d`) · program name (19pt/700, wraps) · coral meta line `"WEEK {n} OF {total} · {freq}×/WEEK"` (10pt/600/1.6) · next-session row: 6pt coral dot pulsing (1.6s ease-in-out, opacity 1→.35 / scale 1→.7) + `"Next up · {session} · {min} min"` (12.5pt/300/`#D4D4D4`).
- Below: coral **CONTINUE** button (flex, radius 12, shadow `0 8px 22px rgba(252,84,84,.32)`) → opens Active Program; plus a 46pt square outlined button with the sliders glyph → jumps to Customize.

**Empty (no program)** — border `#1c1414`, flat `#080505`, dashed-border calendar icon, "No program assigned" + "Pick a template or build your own to unlock your plan.", then a coral **BROWSE TEMPLATES** button.

### 2.2 Stat strip
Three equal cards (border `#1c1414`, radius 12, bg `#080505`), value 17pt/700 over an 8.5pt/1.3 `#6d6d6d` label: SESSIONS DONE · ADHERENCE (coral value) · WEEK STREAK. Hide the strip entirely for a user with no history rather than showing zeros.

### 2.3 Path grid
Section eyebrow "CHOOSE YOUR PATH" (9pt/2.4/`#3f3f3f`), then a **2×2 grid**, 11pt gap. Each tile: radius 16, 1pt `#241414`, bg `#0B0707`, padding 14, min-height 118, icon in a 36pt `rgba(252,84,84,.1)` rounded square, title at the bottom (13.5pt/700/1.1, two lines), sub-label under it (8.5pt/500/1.4/`#6d6d6d`). Tiles stagger in: `rowIn` 0.42s `cubic-bezier(.2,.9,.3,1.2)`, 0.07s apart.

| # | Tile | Sub-label (dynamic) | Target |
|---|---|---|---|
| 1 | MY ACTIVE PROGRAM | `WEEK {n} OF {total}` / `NO PROGRAM ASSIGNED` | Active Program |
| 2 | PROGRAM TEMPLATES | `{count} READY PLANS` | Templates |
| 3 | CUSTOMIZE YOUR PROGRAM | `{movementCount}+ MOVEMENTS` | Customize |
| 4 | QUICK WORKOUT | `{min}–{max} MIN` | Quick Workout |

**Gating rule — tile 1 only.** With no assigned program it renders disabled: opacity 0.5, border `#161010`, bg `#060404`, icon and title greyed (`#5a5a5a` / `#8a8a8a`), and a `LOCKED` badge (bg `#140e0e`, text `#6d6d6d`). Tapping it must **not** dead-end — route to Program Templates, since that is how the user unlocks it. When a program *is* assigned it carries a solid coral `LIVE` badge. Tiles 2–4 are always enabled.

---

## 3. My Active Program

Header: program name uppercased + "MY ACTIVE PROGRAM" subline.

**Week selector** — horizontally scrolling pill row, one pill per program week (`W1…Wn`), current selected. Pill: padding 8/14, radius 999, border `#241414`→coral when active, bg `rgba(252,84,84,.12)` when active, text `#6d6d6d`→coral, 10.5pt/1.4. Count comes from the program length — **do not hardcode 8**.

**Day cards** — one per scheduled day in the selected week, radius 16, padding 14, staggered `rowIn`. Layout: 3pt vertical state rail · day eyebrow + discipline tag pill (colored by discipline) · session name (15.5pt/600) · meta `"{n} MOVEMENTS · {min} MIN"` · right-side CTA. Three states:

| State | Rail | Card | Name | CTA |
|---|---|---|---|---|
| Completed | `#2a1212` | border `#1c1414` | `#8a8a8a`, strikethrough | coral `✓` |
| Today | coral | border coral, bg `#120707` | white | coral **START** button → Session |
| Upcoming | `#181010` | border `#1c1414`, opacity 0.6 | white | `LOCKED` (9pt `#3f3f3f`) |

Only the today card's CTA is tappable.

---

## 4. Session detail ★

Reached from a day card's **START**. This is the pre-workout brief — the user reads it, then commits.

**Header** — session name (17pt/700/1.6) + coral subline `"WEEK {w} · DAY {d} · TODAY"`.

**Summary card** — radius 18, coral-tinted gradient, 3-column grid: est. duration (`35 MIN`), movement count, and **points on deck** (coral, e.g. `+4.8`) — the rank points the session is worth. Values 21pt/700 over 8.5pt/1.4 labels.

**Warm-up block** — section rule "WARM-UP · {min} MIN" (9pt/2.4/`#3f3f3f` + 1pt `#161010` line), then wrapping pills: `"{movement} · {duration or reps}"` (10pt, border `#1d1414`, bg `rgba(255,255,255,.03)`, `#7a7a7a`). Omit the block if the session has no warm-up.

**"THE WORK"** — section rule, then one card per movement (radius 16, border `#1c1414`, bg `#0B0707`, staggered `rowIn` 0.07s apart):

| Part | Spec |
|---|---|
| Index | 28pt rounded square, bg `rgba(252,84,84,.1)`, border `#241414`, coral `01`/`02`… 11pt/700 |
| Name + tag | white 15pt/600 + discipline tag pill (2/6 padding, radius 5, color from discipline) |
| Coaching cue | `#7a7a7a` 11.5pt/300, line-height 1.4 — one sentence, comes from the movement record |
| **Set pills** | One pill per set, wrapping row: `"{setIndex} · {target}"` where target is reps (`8`) or a hold (`25s`). Radius 8, border `#241414`, `#D4D4D4` 10.5pt/500. Set count is variable — a 4-set movement shows 4 pills. |
| Rest | clock glyph + `"{n}s REST"` (9.5pt/1.2/`#6d6d6d`) |
| Points | coral `"+{n} PTS"` (9.5pt/600) |
| LOG | Outlined 9.5pt/700 coral button — opens the set logger for that movement |

**Fixed bottom bar** — coral **START SESSION** with a play glyph, `left/right: 16`, `bottom: 96` (clears the tab bar), radius 16, shadow `0 14px 34px rgba(0,0,0,.7)`, enters with `rowIn` 0.34s at 0.1s delay. Tapping it hands off to the existing session runner. Bottom content padding is 108pt so the last card clears the bar.

---

## 5. Program Templates

Header subline is a live count: `"{shown} OF {total} SHOWN"`.

**Goal filter chips** (scrolling row): `ALL · STATIC · POWER · 1MM · ALL-ROUND` — same pill spec as the week selector. Filters the list client-side, instantly.

**Template card** — radius 16, border `#1c1414`, bg `#0B0707`, padding 15, staggered `rowIn`:
- 34pt rounded index mark, border `#241414`, bg `rgba(252,84,84,.1)`, **number tinted by the template's discipline**.
- Name (15.5pt/600/0.9, uppercase) + one-line description (11.5pt/300/`#7a7a7a`).
- Meta pill row: `{n} WEEKS` · `{n}×/WK` · level (level pill tinted by discipline), then a coral **SELECT** button pushed right.

SELECT assigns the program and lands the user on My Active Program. Confirm first if it would replace an existing active program.

---

## 6. Customize Your Program

Header subline is live: `"{n} MOVEMENTS · {n} ADDED"`.

- **Search field** — 40pt tall, radius 20, bg `#0d0909`, border `#211414`, magnifier glyph, placeholder "Search movements" (`#5a5a5a` 13pt/300). Filters by name.
- **Two filter rows**, both scrolling, both live: discipline (`ALL · STATIC · POWER · 1MM`) and level (`ALL · ENTRY · MAIN · ADVANCED · ELITE`). Filters compose (AND) with each other and with search. Drive both lists from the movement taxonomy, not hardcoded arrays.
- **Movement grid** — 2 columns, 11pt gap. Card: radius 15, padding 13, border `#1c1414` / bg `#080505`; **selected** → border coral, bg `#120707` (0.2s transition). Contents: discipline tag pill top-left, add control top-right (22pt rounded square: `+` outlined coral when off, filled coral with `✓` when on), name (13.5pt/600, wraps), then level (9pt/1.3/`#6d6d6d`) + coral point value (`{n} PTS`).
- **Build bar** — appears the moment ≥1 movement is selected: coral bar at `bottom: 96`, left `"{n} MOVEMENT(S) ADDED"` (11pt/600/1.6, correctly singular/plural) and right `"BUILD PROGRAM →"` (13pt/700/1.8), enters with `rowIn` 0.3s. Bottom content padding 96pt. Tapping it continues to schedule/name the program.

Show an empty state (not a blank grid) when filters match nothing.

---

## 7. Quick Workout

Header subline `"{n} READY SESSIONS"`. Duration chips: `ALL · ≤10 MIN · 15 MIN · 20+ MIN`, filtering live.

**Session card** — radius 16, border `#1c1414`, bg `#0B0707`:
- Left: 52pt rounded square, **border and number tinted by discipline**, big minute count (19pt/700) over "MIN" (8pt/1.2).
- Middle: name (15pt/600/0.9) · `"{n} movements · no equipment"` (11pt/300) · a row of movement-name pills.
- Right: 38pt coral circle with a play triangle, shadow `0 8px 18px rgba(252,84,84,.3)` — starts the session immediately (no brief screen; that's the point of Quick).

---

## 8. What must be dynamic

Nothing in the mock is fixed copy. In particular:

- **Gating** — one boolean, `hasActiveProgram`, drives the hero state, tile 1's lock, and the hub subline. All three read the same source.
- **Counts everywhere** — template count, movement count, week count, session count, "OF n SHOWN", "n ADDED" all derive from data. No hardcoded 8 weeks, 5 templates, 4 movements.
- **Filter option lists** come from the taxonomy API, so a new discipline or level appears without a client release.
- **Discipline colors** are looked up from one map: Static `#8b5cf6`, 1MM `#f97316`, Power `#FC5454`, All-round `#FC5454`. Unknown discipline → coral fallback.
- **Sets, reps, holds, rest, cue, and point values** all come from the session payload; the set-pill row renders `sets.length` pills.
- Empty, loading, and error states are needed for all four list screens (templates, movements, quick sessions, program days).

---

## Design Tokens

**Colors**
| Token | Value |
|---|---|
| Coral / brand accent | `#FC5454` |
| Screen background | `#000000` |
| Card bg (raised) | `#0B0707` |
| Card bg (flat) | `#080505` |
| Card bg (locked) | `#060404` |
| Card border | `#1c1414` / `#241414` |
| Border (locked) | `#161010` |
| Hero border (active) | `#3d1a1a` |
| Hero gradient | `#140807 → #0a0505 → #080505` |
| Selected card bg | `#120707` |
| Chip active bg | `rgba(252,84,84,.12)` |
| Icon well | `rgba(252,84,84,.1)` |
| Input bg / border | `#0d0909` / `#211414` |
| Ring track | `#2a1212` |
| Divider | `#161010` / `#1a1a1a` |
| Primary text | `#FFFFFF` |
| Body text | `#D4D4D4` |
| Secondary | `#7a7a7a` |
| Muted / meta | `#6d6d6d` |
| Faint / disabled | `#3f3f3f` · `#5a5a5a` · `#8a8a8a` |
| Static | `#8b5cf6` |
| 1MM | `#f97316` |
| Power | `#FC5454` |

**Typography** — Oswald, already bundled
| Use | Size / weight / tracking |
|---|---|
| Screen title | 19 / 700 / 1.9 |
| Sub-screen title | 17 / 700 / 1.6 |
| Coral status subline | 9.5 / 500 / 2.0 |
| Section eyebrow | 9 / 500 / 2.4 |
| Card title | 15–15.5 / 600 / 0.5–0.9 |
| Tile title | 13.5 / 700 / 1.1 |
| Tile sub-label | 8.5 / 500 / 1.4 |
| Body / cue | 11.5–12.5 / 300 / lh 1.4 |
| Big stat | 21 / 700 · ring value 24 / 700 |
| Stat label | 8.5 / 500 / 1.4 |
| Chips | 10.5 / 500–600 / 1.4 |
| Set pill | 10.5 / 500 / 0.8 |
| Meta pill | 9 / 500 / 1.3 |
| Tag pill | 8 / 700 / 1.1 |
| Primary CTA | 13–14 / 700 / 1.8–2.0 |

**Motion**
| Name | Value |
|---|---|
| Screen push forward | 0.34s `cubic-bezier(.2,.9,.3,1.05)`, X+26 → 0 + fade |
| Screen pop back | same, X−26 → 0 |
| Card / tile enter (`rowIn`) | 0.4s `cubic-bezier(.2,.9,.3,1.2)`, Y+14 + scale .98 → 1, staggered 0.06–0.07s |
| Ring draw | 0.9s `cubic-bezier(.2,.9,.3,1)` on dashoffset |
| Next-session dot pulse | 1.6s ease-in-out, infinite |
| Profile button sheen | 4.2s ease-in-out, infinite |
| Chip / card selection | 0.2s ease on border + background |
| Bottom bar enter | 0.3–0.34s `rowIn` |

**Layout constants**: screen side padding 18pt (20pt on Profile) · card radius 16 · tile grid 2×2 at 11pt gap · fixed bottom bars at `bottom: 96` with matching 96–108pt content padding · tab bar 6 columns, 9pt top / 16pt bottom padding, 1pt `#1a1a1a` top border.

---

## Integration checklist
- [ ] Profile button label, glyph, chevron, and gradient/sheen treatment updated; coral reserved for Weekly Challenge.
- [ ] Hub hero switches on `hasActiveProgram`; tile 1 locked state matches spec and routes to Templates instead of dead-ending.
- [ ] Tiles 2–4 always enabled regardless of program state.
- [ ] All counts and sub-labels computed from data; no hardcoded lengths.
- [ ] Week selector generated from program length; day cards render done / today / upcoming correctly, only today tappable.
- [ ] Session detail set pills render one per set with reps *or* hold duration; LOG opens the set logger.
- [ ] START SESSION hands off to the existing runner; bottom bar clears the tab bar on all device heights.
- [ ] Template SELECT confirms before replacing an active program.
- [ ] Search + discipline + level filters compose; empty state when nothing matches.
- [ ] Build bar appears/disappears on selection count, pluralises correctly.
- [ ] Quick Workout play starts immediately with no brief screen.
- [ ] Discipline colors from one shared map with a coral fallback.
- [ ] Loading / empty / error states for all four list screens.
- [ ] Reduce-motion: keep screen transitions instant, drop sheen, pulse, ring draw, and stagger — no information is lost.
- [ ] Back chevron pops one level on every child screen; tab bar remains visible throughout.

## Assets
None to export — all shapes, SVG glyphs, and CSS. Glyphs used (calendar, layers, sliders, bolt, clock, play, chevron, magnifier) should be swapped for the app's existing icon set at the same optical sizes.

## Files
- `Leap Training Center.dc.html` — the design reference. Exact timings are in the `@keyframes` block at the top; screen data and filter logic are in the logic class at the bottom. Read those if any number here is ambiguous.
- Related: `design_handoff_leap_coach_fab/`, `design_handoff_leap_coach_chat/`, `design_handoff_rank_up_celebration/`.
