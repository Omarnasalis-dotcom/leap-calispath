# Handoff: Workout Runner — Day Blocks & For-Time Timer

Two screens only:

1. **Day Blocks** — the block list for a program day (`Leap Day Blocks.dc.html`)
2. **For-Time Runner** — the live timer session (`Leap Quick Workout Runner.dc.html`)

## About the Design Files
Both are **design references in HTML/React** — exact layout, colors, motion timings and interaction behavior. Not production code. Rebuild in the app's real stack.

Each file renders a **left rail** next to the phone frame. **The rail is a prototype control only — do not implement it.** Everything inside the phone frame is in scope.

## Fidelity
**High-fidelity.** All content is placeholder for real API data — see §3.

---

# 1. Day Blocks

Replaces the five identical gradient-bordered cards. Each block type now owns an accent color, cards expand in place, and progress lives in the header.

## 1.1 Header (fixed)

| Element | Spec |
|---|---|
| Back chevron | 34pt rounded square, radius 12, border `#221c1c`, bg `rgba(255,255,255,.02)`, `#8a8a8a` glyph |
| Title | `DAY {n}` — white, 20pt, weight 600, letter-spacing 1.4 |
| **State badge** | **Derived from progress, never hardcoded:** 0% → `NOT STARTED` (bg `rgba(255,255,255,.04)`, border `#221c1c`, text `#7a7a7a`); 1–99% → `IN PROGRESS` (bg `rgba(252,84,84,.12)`, border `#3a1d1d`, coral text); 100% → `COMPLETE`. 7.5pt/700/1.3, radius 5 |
| Meta line | `"{n} BLOCKS · {n} MOVEMENTS · ~{n} MIN"` — `#6d6d6d` 10pt/1.1, **`nowrap`** |
| Percent | Right-aligned, white 19pt/700 with a 10pt `#5a5a5a` `%`, over `COMPLETE` (7.5pt/1.5/`#4a4a4a`) |
| **Tick bar** | One segment per block, `flex:1`, 3pt tall, radius 2, 4pt gap. Completed → **that block's accent color**; skipped → `#2e2626`; pending → `#191515`. 0.4s ease color transition |

Percent = settled blocks (done **or** skipped) ÷ total blocks.

## 1.2 Block accents

One color per block type, from the app palette. This is the core of the redesign — five identical borders gave the session no readable shape.

| Block | Accent |
|---|---|
| Warm-up | Gold `#C9A227` |
| Skills | Purple `#8b5cf6` |
| Strength | Coral `#FC5454` |
| Accessories | Orange `#f97316` |
| Cool-down | Steel `#5b8def` |

Drive this from the block's `type` field with a **fallback to coral** for unknown types. The accent appears in four places: the left rail, the index plate, the scheme label, and the set pills.

## 1.3 Block card

Radius 18, `overflow: hidden`, staggered entrance (`rowIn` 0.5s `cubic-bezier(.2,.9,.3,1.2)`, 0.07s apart).

**Left rail** — 3pt wide, full card height, accent colored. Opacity 1 open / 0.6 closed / 0.4 done-or-skipped. Skipped → `#2e2626`.

**States**

| State | Border | Background | Opacity |
|---|---|---|---|
| Open | accent @ 32% | `linear-gradient(160deg, accent@7%, #0b0909 46%, #090808)` + shadow `0 14px 32px accent@9%` | 1 |
| Closed | `#1b1717` | `linear-gradient(160deg,#0d0b0b,#090808)` | 1 |
| Done | `#171313` | same as closed | 0.66 |
| Skipped | `#171313` | same as closed | 0.45 |

**Header row** (13pt padding, 17pt left, the whole row is the expand hit target):
- **Index plate** — 34pt, radius 12, border accent@38% when open else `#1e1a1a`, bg accent@12% when open else `rgba(255,255,255,.02)`. Content: block number, `✓` when done, `–` when skipped. 14pt/700, accent when open or done.
- **Title** — 15.5pt/600/1.5 uppercase, `nowrap`; `#8a8a8a` + strikethrough when skipped, `#8a8a8a` when done.
- **State chip** — only rendered when open / done / skipped (`OPEN` accent-tinted, `DONE`, `SKIPPED`). 7pt/700/1.2, radius 5.
- **Meta row** — accent scheme label (`STRAIGHT SETS` / `HOLDS`, 9pt/600/1.2) · divider · `"{n} MOVES"` · divider · `"~{n} MIN"` (both `#6d6d6d` 10pt/400/0.6). **Every text child needs `white-space: nowrap` and `flex-shrink: 0`; the row itself wraps with `column-gap:8 / row-gap:4`.** Without this the labels break onto two lines at 402pt width. Dividers are 1pt × 9pt `#221c1c`, also `flex-shrink: 0`. Keep the short label ("MOVES", not "MOVEMENTS") — it's what makes one line fit.
- **SKIP** — ghost text action, 8.5pt/600/1.4, `#4a4444`. Toggles to **UNDO** in accent color when skipped. Hidden when the block is done. Must `stopPropagation` so it doesn't expand the card.
- **Chevron** — 22pt box, rotates 180° over 0.28s `cubic-bezier(.2,.9,.3,1.2)` when open.

**Collapsed body** — up to 3 movement chips, left-inset to 62pt (aligned under the title, not the plate). Third chip becomes `"+{n} MORE"` when there are more. 8.5pt/500/1.2, radius 7, border `#1d1919`, bg `rgba(255,255,255,.02)`.

**Expanded body** — `expandIn` 0.3s. One row per movement: 6pt accent dot · name (`#EDEDED` 13pt/500) + coaching note (`#5a5a5a` 9.5pt/1.1) · **set-target pills** right-aligned, one per set, min-width 30pt, radius 8, border accent@22%, bg accent@7%, text `#D4D4D4` 10pt/600. Targets are reps (`8`) **or** holds (`45s`) — render whatever the payload says. Row bg `rgba(255,255,255,.018)`, radius 12.

Exactly **one block open at a time**; tapping the open one collapses it. Default open = the first unfinished block, never all-closed.

## 1.4 Sticky footer

Over a `linear-gradient(180deg, transparent, rgba(0,0,0,.92) 34%, #000)` fade; container `pointer-events: none` with the buttons re-enabled. Content bottom padding 132pt.
- 52pt outlined rest-timer button (clock glyph, border `#241f1f`).
- Coral primary, radius 15, shadow `0 12px 30px rgba(252,84,84,.34)`: `START WORKOUT` at 0%, `RESUME BLOCK {n}` mid-session.

---

# 2. For-Time Runner

The live session. Fixes a title colliding with the notch, an inert circuit list, a meaningless big number, and ~60% empty screen.

## 2.1 Header — two rows, never one

The old screen put "5 ROUNDS FOR TIME" **inside** the status bar row, where the notch ate it. Split it:

- Status bar untouched.
- Below it: 34pt close button · coral **`FOR TIME`** chip (9pt/700/2.0, radius 8, bg `rgba(252,84,84,.12)`, border `#3a1d1d`) · quiet `"{n} ROUNDS · {n} MOVES"` (`#5a5a5a` 9.5pt/1.5, `nowrap`) · 34pt overflow button. Both side buttons the same size so the row is optically centered.

The scheme name (`FOR TIME`, `AMRAP`, `EMOM`) comes from the workout payload.

## 2.2 Timer dial

246pt square. Two SVG circles, rotated −90°:
- Hairline r=112, 2pt `#141010` (outer bound).
- Track r=103, 7pt `#120e0e`; progress r=103, 7pt coral, round cap, `stroke-dasharray: 647`, dashoffset animated 0.6s `cubic-bezier(.2,.9,.3,1)`, `drop-shadow(0 0 10px rgba(252,84,84,.45))`.

**Progress fraction** = `(completedRounds + loggedMovesThisRound / movesPerRound) / totalRounds` — so the ring advances *within* a round, not just at lap time.

Center stack: eyebrow (`ELAPSED`, → `FINAL TIME` when finished) 8.5pt/2.6/`#4a4a4a` · **clock** `#EDEDED` 58pt weight **300**, `font-variant-numeric: tabular-nums`, letter-spacing −1 (tabular is mandatory — the number must not jitter each second) · round line: `ROUND {n}` (→ coral `COMPLETE`) · divider · `OF {n}` (→ `{n} OF {n}`).

**Paused** → the clock blinks `tickBlink` 1.1s step-end infinite. Never freeze silently.

**Round pips** below the dial: one per round, 3pt tall, 5pt gap; done = coral, current = `#5a2626` **and 24pt wide** (others 9pt), pending `#191515`. Width transitions 0.5s `cubic-bezier(.2,.9,.3,1.2)`.

**Metric strip** — 3 cards (border `#191515`, radius 13, bg `rgba(255,255,255,.014)`), value 15.5pt/600 tabular over 7.5pt/1.5 label: AVG SPLIT · THIS ROUND (coral) · REPS DONE.

## 2.3 THIS ROUND — tappable log rows

The old inert list becomes the primary interaction. Section rule `THIS ROUND` + `"{n} OF {n} LOGGED"`.

Row: radius 15, padding 13/14 — 26pt check box (radius 9, border `#241f1f` → coral filled with `✓` when logged) · name (14.5pt/500, ellipsis, strikethrough + `#8a8a8a` when logged) + note (`#5a5a5a` 9.5pt) · target pill `"× {n}"` (11.5pt/600, radius 9).

**Next-up emphasis** — the first unlogged row gets border `#3a1d1d`, bg `linear-gradient(120deg, rgba(252,84,84,.07), #0a0808 70%)` and a coral target pill. Logged rows drop to 0.58 opacity.

**Auto-advance:** when all movements in the round are logged, bank the split, increment the round, and clear the checks in one transition. Tapping a logged row un-logs it.

## 2.4 SPLITS

Fills what was dead space. Reverse-chronological rows: `R{n}` (`#6d6d6d` 10pt/1.4) · rule · **delta vs. the previous round** (`+0:04` warm `#8a6a6a` / `−0:06` cool `#6a8a6a`, min-width 40, right-aligned) · duration (`#EDEDED` 12.5pt/600, min-width 52, right-aligned). Row bg `rgba(255,255,255,.016)`, radius 12, `rowIn` 0.35s on insert.

Before round one: dashed empty state (border `#1d1919`, `#4a4444` 10.5pt) — *"Finish a round to bank your first split."*

## 2.5 Footer controls

Same fade treatment as §1.4; content bottom padding 128pt.
- **56pt pause/play** — CSS-shape glyph: two 4pt bars when running, triangle when paused.
- **Primary (flex)** — coral, radius 16, shadow `0 12px 30px rgba(252,84,84,.34)`. Label: `LAP ROUND {n}` → `FINISH WORKOUT` on the final round → disabled `SAVED ✓` (bg `rgba(255,255,255,.05)`, border `#241f1f`, no shadow, `cursor: default`) once committed.
- **56pt reset** — outlined coral square glyph, border `#2a1d1d`, bg `rgba(252,84,84,.07)`.

## 2.6 Terminal state — required

Banking the final round must:
1. **Stop the clock** (`running: false`) and switch the eyebrow to `FINAL TIME`.
2. Show `COMPLETE · {n} OF {n}` in the dial, ring at 100%.
3. **Replace** the THIS ROUND block with a **summary card** — radius 18, border `#3a1d1d`, `linear-gradient(155deg,#170a0a,#0c0707 60%,#0a0606)`, three columns at 20pt/700: TOTAL TIME · AVG ROUND (coral) · TOTAL REPS.
4. Make movement rows non-interactive (no phantom extra round).
5. Give `FINISH WORKOUT` a real commit action, then settle into disabled `SAVED ✓`.

A screen that says both "workout over" and "round 5 hasn't started" is a bug. Every state must agree: badge, ring, dial text, and CTA all read from one progress source.

---

# 3. What must be dynamic

- **Block count, movement count, set count, round count** — all from the payload. No hardcoded 5 blocks / 3 moves / 5 rounds.
- **Header state badge, tick bar, percent, and CTA label** all derive from **one** progress object.
- **Block accent** from `type` via one shared map, coral fallback.
- **Set targets** may be reps or durations; render `sets.length` pills of whatever the payload gives.
- **Scheme labels** (`STRAIGHT SETS`, `HOLDS`, `FOR TIME`, `AMRAP`) come from the workout, not the client.
- **Splits and deltas** are computed from banked lap times, not estimated.
- Timer must survive backgrounding — persist a start timestamp and recompute elapsed on resume, don't count interval ticks.

---

# Design Tokens

**Colors**
| Token | Value |
|---|---|
| Coral / primary | `#FC5454` |
| Purple / Skills | `#8b5cf6` |
| Orange / Accessories | `#f97316` |
| Gold / Warm-up | `#C9A227` |
| Steel / Cool-down | `#5b8def` |
| Screen bg | `#000000` |
| Card bg | `#0a0808` · gradient `#0d0b0b → #090808` |
| Card border | `#1b1717` · dim `#171313` · `#191515` |
| Coral border | `#3a1d1d` · `#2a1d1d` |
| Control border | `#241f1f` · `#221c1c` |
| Divider | `#161212` · `#221c1c` |
| Skipped rail | `#2e2626` |
| Timer track | `#120e0e` · bound `#141010` |
| Row bg | `rgba(255,255,255,.016–.018)` |
| Clock / row text | `#EDEDED` |
| Body text | `#D4D4D4` |
| Secondary | `#8a8a8a` |
| Muted | `#6d6d6d` · `#5a5a5a` |
| Faint | `#4a4a4a` · `#4a4444` · `#3f3f3f` |
| Delta slower / faster | `#8a6a6a` / `#6a8a6a` |

**Typography** — Oswald
| Use | Size / weight / tracking |
|---|---|
| Clock | 58 / **300** / −1, tabular |
| Screen title | 20 / 600 / 1.4 |
| Summary value | 20 / 700 / 0.4 |
| Header percent | 19 / 700 |
| Block title | 15.5 / 600 / 1.5 |
| Metric value | 15.5 / 600 / 0.5 |
| Log row name | 14.5 / 500 / 0.5 |
| Primary CTA | 13.5 / 700 / 1.9 |
| Movement name | 13 / 500 / 0.5 |
| Split time | 12.5 / 600 / 0.8 |
| Target pill | 11.5 / 600 |
| Dial round line | 12 / 600 / 1.2 |
| Set pill | 10 / 600 |
| Meta text | 10 / 400 / 0.6 |
| Note / split num | 9.5 / 400 / 1.1 |
| Scheme label | 9 / 600 / 1.2 · chip 9 / 700 / 2.0 |
| Chips | 8.5 / 500 / 1.2 |
| Section eyebrow | 8.5 / 500 / 2.6 |
| State badge | 7.5 / 700 / 1.3 |
| Metric label | 7.5 / 500 / 1.5 |
| Block state chip | 7 / 700 / 1.2 |

**Motion**
| Name | Value |
|---|---|
| Card enter (`rowIn`) | 0.5s `cubic-bezier(.2,.9,.3,1.2)`, Y+15 + scale .985, stagger 0.07s |
| Block expand | 0.3s `cubic-bezier(.2,.9,.3,1.1)`, Y−6 + fade |
| Chevron rotate | 0.28s `cubic-bezier(.2,.9,.3,1.2)` |
| Ring progress | 0.6s `cubic-bezier(.2,.9,.3,1)` on dashoffset |
| Pip width | 0.5s `cubic-bezier(.2,.9,.3,1.2)`; color 0.4s ease |
| Paused clock blink | 1.1s step-end infinite |
| Card state change | 0.22–0.25s ease on border / bg / opacity |
| Ambient top glow | 5–6s ease-in-out infinite, opacity .35 → .85 |

**Layout**: side padding 20pt · card radius 18 / row radius 12–15 / control radius 12–16 · sticky footer at `bottom: 0` with 26pt bottom inset and 128–132pt content padding · ambient radial glow centered above the screen top, blurred 22pt, `pointer-events: none`.

---

# Integration checklist
- [ ] Block accents from one type→color map with coral fallback; accent applied to rail, plate, scheme label, set pills, and header tick.
- [ ] Meta-row labels `nowrap` + `flex-shrink: 0`, row wraps — verified on the longest block title at 402pt.
- [ ] Day badge derives from progress (NOT STARTED / IN PROGRESS / COMPLETE), never a literal.
- [ ] One block open at a time; first unfinished open by default.
- [ ] SKIP toggles to UNDO, stops propagation, hidden when done.
- [ ] Set pills render one per set, reps or holds.
- [ ] Runner title on its own row below the status bar — nothing under the notch.
- [ ] Clock uses tabular numerals; blinks when paused.
- [ ] Ring fraction includes partial-round progress.
- [ ] Log rows tappable, next-up emphasized, all-logged auto-banks the split and advances.
- [ ] Splits show per-round duration + delta; empty state before round one.
- [ ] Terminal state: clock stops, summary card replaces the round list, rows inert, CTA commits then disables.
- [ ] Timer recomputes elapsed from a timestamp after backgrounding.
- [ ] Reduce-motion: drop the ambient glow, stagger, and blink; keep ring, pips, and all text — no information lost.
- [ ] Footer buttons clear the home indicator on all device heights.

# Assets
None to export — all shapes, inline SVG and CSS. Glyphs (chevron, close, clock, play/pause, overflow, square-stop) should be swapped for the app's existing icon set at the same optical sizes.

# Files
- `Leap Day Blocks.dc.html` — block list reference.
- `Leap Quick Workout Runner.dc.html` — timer reference. Timings live in the `@keyframes` block at the top; state logic (lap, auto-advance, terminal state, split deltas) is in the logic class at the bottom. Read those if any number here is ambiguous.
