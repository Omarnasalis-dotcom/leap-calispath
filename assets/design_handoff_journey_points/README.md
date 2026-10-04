# Handoff: Journey screen — Points, Streak & Daily Tasks

## Overview
Adds a points economy to the mobile **Journey** screen (a vertical path of workout "program cards" and side quests). Users earn points for:
- Completing the day's **program card** (auto, +50)
- Completing the weekly **side quest** (auto, +30)
- Logging three **daily tasks** from a "+" node on the path: Book (+10), Run (+20), Meal / no cheat meal (+10)
- **Bonuses**: daily streak (+50, first point of the day), Perfect day (+20, all tasks done)

Every earn plays a reward animation. The points fly into an odometer counter in a redesigned top bar, which also holds a growing "fire medallion" for today's progress and a 7-day streak strip.

## About the Design Files
The files in this bundle are **design references created in HTML**: prototypes that show the intended look and behaviour. They are not production code to copy. Recreate them in the target codebase's existing environment (SwiftUI / React Native / Flutter, etc.) using its established patterns. `Journey Points v3.dc.html` opens directly in a browser (keep `support.js` and `image-slot.js` next to it). All styling is inline, and the logic lives in the `class Component` script at the bottom of the file.

## Fidelity
**High-fidelity.** Final colours, type, spacing, copy and motion. Recreate pixel-accurately, swapping in the app's existing tab bar, status bar and card artwork.

---

## Screens / Views

Frame: iPhone 402 × 874 pt, background `#0A0A0A`. Layers from top to bottom:
1. Status bar (54pt, system)
2. **Top bar** (60pt, sticky)
3. **Journey path** (scrolls, between the top bar and the tab bar)
4. **Tab bar** (84pt, existing app component; Journey tab active)
5. Overlays: reward FX layer, toast, Today's Tasks sheet, Points History sheet

### 1. Top bar (sticky, y = 54, height 60)
- Background `rgba(10,10,10,.88)` + `backdrop-filter: blur(16px)`, bottom border `1px rgba(255,255,255,.06)`.
- Grid `1fr 76px 1fr`, horizontal padding 16.

**Left: Points odometer** (tap → Points History sheet). This is also the **fly-to target** for reward numbers.
- Row: lightning icon 12pt `#FF5A55` + label `POINTS` (Plus Jakarta Sans 800, 9pt, letter-spacing .22em, `#8A8A8E`).
- Number: Bebas Neue 30pt, white, thousands separator (`1,240`).
- Each digit is a 15×32 slot holding a vertical 0–9 column that slides `translateY(-digit × 32)`.
  - Duration `0.7s + 0.12s × placeFromRight`, easing `cubic-bezier(.2,.9,.25,1.05)`, so higher places settle later, like a mechanical counter.
  - The comma is a static 6pt-wide glyph.
- Number pops (scale 1 → 1.28 → 1, 0.4s) when points land.

**Centre: Fire medallion** (tap → Today's Tasks sheet). 72×72, hanging: top margin 6, so it overflows below the bar by ~18pt and overlaps the path.
- **Ring**: 5 arc segments (one per task), r = 30, stroke 4, round caps, gap 7pt between segments. Done = `#FF5A55`, open = `#2A2A2A`, stroke transition .4s.
- **Inner disc**: inset 9, circle.
  - Unlit: `#141414` with a `#262626` border.
  - Lit: `radial-gradient(circle at 50% 70%, #3A1410, #140A0A 70%)` with a `rgba(255,90,85,.35)` border.
- **Flame**:
  - Size: width = `20 + 22 × pct` (pct = done/total), height = 1.25 × width, transitioned .5s.
  - Fill: gradient bottom → top `#FF5A55` → `#FF8A3D` (60%) → `#FFD27A`. Unlit fill is `#3A3A3C`.
  - Flicker (scale/skew loop, alternate) when lit. Period `1.4 − 0.6 × pct` s, so it flickers faster as it grows.
  - Glow: drop-shadow `0 0 (3 + 8×pct)px rgba(255,130,60,.9)`.
- **Stage pill**: centred, bottom −9. Height 17, radius 9, 2pt `#0A0A0A` border, 800 8.5pt, tracking .14em.
  - Text: `STAGE done/total`.
  - Lit: `#FF5A55` background, white text. Unlit: `#232323` background, `#8A8A8E` text.
  - Stage names by `round(pct × 5)`: `COLD, SPARK, KINDLE, BLAZE, ROAR, INFERNO`.
- **On each task completed**: disc pops (1 → 1.18 → 1, .5s, `cubic-bezier(.3,1.5,.5,1)`) and the pill slides in (6pt up + fade, .35s).
- **At 5/5 (INFERNO)**: ring gets drop-shadow `0 0 8px rgba(255,90,85,.8)`, disc gets `0 0 22px rgba(255,120,60,.55)`.

**Right: 7-day streak strip** (tap → Points History sheet)
- Label: `{N} DAY STREAK` in 800 9pt, tracking .22em. Colour `#FF7C78` when today is lit, `#8A8A8E` otherwise.
- 7 mini flames, gap 3, each with a day letter below (`M T W T F S S`, 800 8pt; `#5E5E64`, white for today).
- Past days: 12×15, `#FF5A55` at 80% opacity.
- Today, unlit: 14×17, dashed outline `#4A4A4E` (dash 4 3), no fill.
- Today, lit (first point earned): fill `#FF8A3D`, glow `0 0 5px rgba(255,120,60,.9)`.
  - Plays **ignite** (scale .2 → 1.35 → 1, .6s, `cubic-bezier(.3,1.6,.5,1)`), then flickers continuously.
- Streak count = previous streak + 1 once today is lit (6 → 7 in the prototype).

### 2. Journey path (scroll area)
- Top padding 34; centre title `MY JOURNEY` in 800 14pt, tracking .36em, `#FF5A55`.
- Rows use a 94pt left column (node centred at x = 47) and a content column with 28pt right padding.
- Vertical line: 2pt at x = 46. Completed segments `#FF5A55`, upcoming `#2A2A2A`.
- **Nodes**
  - Done: 37pt circle `#FF5A55` with a white check.
  - Current: 56pt halo `rgba(255,90,85,.28)` containing a 32pt ring (3pt `#FF5A55`, fill `#2A1212`, day number).
  - Locked: 37pt, 2pt `#4A1E1E` border, lock icon `#6A6A6E`.
- **Completed card**: height 82, radius 22, `#121212`, border `#262626`.
  - Title: uppercase 600 16pt `#C8C8CC`, struck through. Sub: "Completed." 14pt `#7A7A80`.
  - Artwork on the right 120pt, faded in with a mask.
  - 18pt red check badge at top-right.
- **Current program card (Pull Day)**: height 166, radius 24, full-bleed art, left→right dark gradient.
  - Badge `YOU ARE HERE` (24pt pill, `rgba(255,90,85,.6)`).
  - Title Bebas 34pt. Sub 14pt `#E2E2E6`.
  - `START NOW` button: 30pt, radius 15, `#FF5A55`, 800 14pt, tracking .14em.
  - After logging: badge → `DONE TODAY`, sub → "Logged. +50 earned.", button hidden, node → done with a 9pt `rgba(255,90,85,.18)` halo.
- **Side quest card (Weekly Challenge)**: radius 18, `#141010`, border `rgba(255,90,85,.32)`.
  - Eyebrow `SIDE QUEST` (800 9pt, `#FF5A55`), title 600 14pt.
  - Sub 12pt `#9A9AA0`, single line with ellipsis.
  - Buttons `START` (filled) and `SKIP` (outline `#3A3A3C`), each 26pt, radius 13.
  - Done state: "+30 earned ✓" in `#FF7C78`. The node is a 30pt dashed circle that fills red when done.
- **"+" node row** (height 78, sits on the line directly after today's side quest): see Interactions.
- **Locked cards** (Push Day, Legs Day): height 82, `#0B0F1A`, art at 35% opacity, title Bebas 28pt `#6E6E74`, sub "Unlocks once the step before it is done."

### 3. Today's Tasks sheet (opened from the medallion)
- Bottom sheet: `#131313`, top radius 30, slides up .32s `cubic-bezier(.2,.9,.3,1)`. Scrim `rgba(0,0,0,.55)` below the top bar.
- Header: `TODAY'S TASKS` (800 13pt, tracking .28em, `#FF5A55`) on the left, `{n} pts today` on the right.
- Bonus cap bar: 8pt track `#262626` with a red fill, plus a `Bonus {x}/60 cap` label.
- 5 rows (56pt, radius 16, `#1A1A1A`), each with label, sub, points and a trailing control:
  - Program card · Pull Day: auto, chevron. Tap closes the sheet, scrolls to the card and outlines it with a 1.4s glow.
  - Side quest · Weekly Challenge: auto, chevron, same scroll-and-glow behaviour.
  - Book / Run / No cheat meal: 26pt checkbox. Unticked → scrolls to the "+" and opens the right picker. Ticked → tap to undo.
- Perfect day row: dashed border, star icon, `+20`, sub "N tasks to go" or "Earned today".
- Footer: "Tap a ticked task to undo · locks at midnight".

### 4. Points History sheet (opened from points or streak)
- Large total in Bebas 60pt, streak with flame, "Best streak 12".
- This-week bar chart (7 bars; today in red, others `#3A3A3C`).
- Ledger: `TODAY · n` (each entry as label + `+pts`, or an empty-state line), then `YESTERDAY · 100`.

### 5. Reward toast
- Top 136, inset 16: `#1A0F0F`, border `rgba(255,90,85,.45)`, radius 22.
- 46pt red star disc, title Bebas 26pt, sub 13pt `#C9A9A7`, `+pts` Bebas 30pt red.
- Enters 16pt down + fade (.35s overshoot). Auto-dismisses after 3.4s or on tap. Toasts queue one at a time.
- Copy:
  - Streak: "7-day streak / Flame lit. Bonus unlocked. / +50"
  - Perfect day: "Perfect day / Every task done today. / +20"

---

## Interactions & Behavior

### "+" daily-task tray
1. **Tap "+"** (42pt circle; idle = `#140C0C` fill, 2pt `#FF5A55` border, 6pt `rgba(255,90,85,.1)` halo):
   - Scroll the row into view.
   - Fill the circle red; the plus rotates 135° to an × (.4s, `cubic-bezier(.3,1.4,.5,1)`).
   - A tray to its right (52pt high, from x = 78 to 14pt from the right edge) reveals left → right via clip-path inset (.45s, `cubic-bezier(.2,.9,.2,1)`).
   - Three pills fade and slide in from −24pt, staggered .08 / .14 / .20s.
2. **Pills** (48pt, radius 24, `#161616`, border `#2E2E30`): 28pt icon disc + label (800 13pt) + sub (`+pts`, 700 10pt).
   - **Book** → picker "Book / CHAPTERS" with numbers 1–10.
   - **Run** → picker "Run / KM" with numbers 1–10.
   - **Meal** → logs immediately (no picker).
3. **Picker**: replaces the pills inside the same tray.
   - Back button (40pt) + title, then a horizontally scrolling row of ten 38pt round number buttons (Bebas 20pt).
   - Numbers fade/slide in staggered 30ms. Hover: border `#FF5A55`, background `#2A1212`.
   - Picking a number returns to the pills and logs the task.
4. **Done pill**: background `rgba(255,90,85,.16)`, border `#FF5A55`, icon disc red with a white check.
   - Flash ring: box-shadow 0 → 14pt fade, .7s.
   - Sub shows `3 ch ✓` / `5 km ✓` / `Clean ✓`.
   - Tapping a done pill undoes it (points removed, counter rolls down).
5. When all three are done, the tray auto-closes 1.7s later.

### "+" ignites
- When **program card AND side quest** are both complete (on a rest day, the side quest alone):
  - A one-off burst plays on the "+".
  - The node becomes a flame: radial `#FF9A4A → #FF5A55 → #D8322C` disc with a pulsing glow (1.6s loop).
  - A 54×66 gradient flame sits behind it, flickering.
  - The line segment through the node turns `#FF5A55`.
  - The view scrolls to it.

### Reward animation (every earn)
Origin is the tapped element (pill, START NOW, START). Total ~1.25s:
1. **Rings**: two 64pt rings (`#FF5A55`, then `#FFB347` delayed .12s) scale .3 → 2.2 while fading (.75s, ease-out).
2. **Sparks**: 14 particles (4–6pt, alternating `#FF5A55` / `#FFB347`, glowing) radiate 38–58pt outward and shrink to 0 (.6–.8s).
3. **Number**: `+N` in Bebas 44pt, white, with red glow text-shadow.
   - 0–22%: rises 52pt and scales to 1.25.
   - 22–48%: holds.
   - 48–100%: arcs to the points odometer, scaling to .3 and fading (1.25s, `cubic-bezier(.5,0,.25,1)`).
4. **Label** under the number (e.g. `RUN · 5 KM`, `READ · 3 CH`, `CLEAN EATING`, `PULL DAY`, `WEEKLY CHALLENGE`): 800 10pt, tracking .2em, `#FFB3A8`. Rises 30pt and fades (1.1s).
5. At ~1.15s: odometer updates (digits roll) and pops. Haptic `[8, 40, 14]` (light, double).
6. Any newly unlocked bonus → toast at ~1.5s, plus another counter pop.

### Other
- On load, scroll so the current program card sits near the top.
- Undo never plays FX; the counter just rolls down.

---

## Points rules (business logic)
| Source | Points | Trigger |
|---|---|---|
| Program card | +50 | Workout logged (auto) |
| Side quest | +30 | Quest completed (auto) |
| Book | +10 | Manual, 1–10 chapters |
| Run | +20 | Manual, 1–10 km |
| No cheat meal | +10 | Manual |
| Streak | +50 | First point of the day (prototype shows 7-day; spec: every 30 days after 30) |
| Perfect day | +20 | All 5 tasks done (rest day: program excluded) |

- Manual (honor) tasks are capped at **60 pts/day** combined, applied in order Book → Run → Meal.
- Manual tasks can be undone until midnight, then lock.
- **Rest day** variant: the program card becomes "Recovery Day / Rest up. Daily tasks keep your streak alive.", the badge reads `REST DAY`, there's no START button and no +50, and the task total is 4.

## State Management
```
done: { program, quest, read, run, meal }   // booleans
readN, runN: number | null                  // picker values
questSkipped: boolean
tray: null | 'menu' | 'read' | 'run'        // "+" tray mode
sheet: null | 'tasks' | 'history'
display: number                             // odometer value (lags real total during FX)
fx: [{ id, x, y, dx, dy, amt, label, ignite }]
toasts: [{ title, sub, pts }]               // queue
```
Derived: entries (ledger incl. capped honor + bonuses), todayPts, total = base + todayPts, doneCount/total, lit = todayPts > 0, flame = (program || restDay) && quest.

Server needs: base points total, streak count + best streak, today's ledger, week totals, program/quest completion events, rest-day flag, honor-task submit and undo endpoints (with midnight lock + 60 cap enforced server-side).

## Design Tokens
**Colours**
- Accent `#FF5A55`, accent light `#FF7C78`, accent pale `#FFB3A8` / `#FF9A93`
- Fire `#FF8A3D`, `#FFB347`, `#FFD27A`, deep `#D8322C`
- Background `#0A0A0A`, surface `#121212` / `#131313` / `#141414` / `#161616` / `#1A1A1A`, warm surface `#141010` / `#1A0F0F` / `#2A1212`
- Borders `#222`, `#232323`, `#262626`, `#2A2A2A`, `#2E2E30`, `#3A3A3C`, `#48484A`
- Text: white, `#E2E2E6`, `#C8C8CC`, `#9A9AA0`, `#8A8A8E`, `#6A6A6E`, `#5E5E64`, `#4A4A4E`
- Locked card `#0B0F1A`, current card `#0B1120`

**Type**
- Display: **Bebas Neue** (34, 30, 28, 26, 24, 20pt; 44pt FX; 60pt history)
- UI: **Plus Jakarta Sans** 400–800
- Eyebrows: 800, 8.5–14pt, tracking .14–.36em, uppercase

**Radius**: 8 (checkbox), 9, 12, 13, 15, 16, 18, 22, 24, 26, 30 (sheet), 50% (nodes)

**Spacing**: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 28

## Assets
- Card artwork uses drag-and-drop placeholders (`<image-slot>`); use the app's real program artwork.
- Icons are inline SVG paths (lightning, flame, check, plus, lock, book, runner, bowl, compass, star). Swap for the app's icon set where equivalents exist.
- The flame shape path (viewBox 0 0 40 50) is shared by the medallion, the "+" ignite and the streak strip: `M20 1C23 10 33 16 33 30a13 13 0 0 1-26 0c0-7 4-11 6-15 1 5 3 7 5 7-1-8 0-15 2-21z`
- Fonts: Bebas Neue and Plus Jakarta Sans (Google Fonts).

## Files
- `Journey Points v3.dc.html`: the full interactive prototype (open in a browser). Markup is the template; behaviour is in `class Component` at the bottom.
- `support.js`, `image-slot.js`: runtime files needed to open the prototype locally.
