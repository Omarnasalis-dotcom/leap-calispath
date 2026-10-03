# Handoff: Leap Arena — Log Block sheet (v3)

## Overview
This replaces the "LOG WORKOUT DETAILS" modal. The sheet opens when an athlete finishes or skips **one block** of a workout day, and each block is logged separately. Saving replaces any earlier log of that block. The triggers and pre-fill rules are unchanged from today (slide to complete, skip, inline/full-screen timers, ladder finish, re-open).

## About the Design Files
`Leap Log Workout Sheet v3.dc.html` is a **design reference built in HTML/React**, not production code. Recreate it in the app's own stack and components. `support.js` is prototype runtime only. Open the HTML in a browser and use the **Sample block** list on the left to see each block type.

## Fidelity
**High-fidelity.** The copy, colors, type, spacing and behavior below are final. The exercise names and values are sample data.

## Container
- **Bottom sheet:** background `#141416`, top radius 28, top border `1px #2A2A2E`, max-height ~92% of the screen.
- **Grabber:** 40×5, radius 3, `#3A3A40`. Swipe down = cancel.
- **Backdrop:** `rgba(0,0,0,.6)` over the workout screen.
- **Three zones:**
  1. Fixed header
  2. **Scrolling body** (padding 4/22/20, gap 14)
  3. **Sticky footer** (padding 14/22/34 + safe area, top border `1px #1F1F23`)

## Header
- **Block name:** Barlow Condensed 800, 28px, white (e.g. "Strength 1").
- **Status pill** below the name:
  - Height 32, radius 16, background `#1C1C20`, border `1px #2A2A2E`.
  - An 8px dot: green `#4CD964` for Completed, amber `#E0B54A` for Skipped.
  - Label "COMPLETED" / "SKIPPED" (Condensed 700, 14px, letter-spacing 1.5), then "· change" (13px `#8A8A94`).
  - **Tapping the pill toggles the status.** It's a quiet control because the trigger already chose the status: slide = Completed, Skip = Skipped.
- **Close (×):** 44×44 circle `#222226` on the right. This replaces CANCEL and closes without saving.

## Section label style (used throughout)
Barlow Condensed 700, 14px, letter-spacing 2px, `#8A8A94`, uppercase. An optional right-aligned helper sits beside it, 12px `#6E6E78`.

## Body sections
Each section appears only when its condition is met.

### 1. SETS / ROUNDS (Completed, sets-type blocks: straight sets, circuit, superset, holds)
The **SETS confirmation question is replaced** by one card per exercise. Seeing the sets is the confirmation.
- **Card:** background `#0E0E10`, border `1px #222226`, radius 20, padding 16, gap 12.
- **Row 1:** exercise name (Barlow 600, 16px, white) on the left. On the right, the count `3 / 4` in Condensed 800 22px, with the "/ plan" part at 14px `#6E6E78`.
- **Row 2:** one **set tile per planned set** (flex 1, height 48, radius 12, gap 6). The tile has a top line (Condensed 800, 17px) and a bottom line (10px 600).

| State | Background | Border | Top / bottom text |
|---|---|---|---|
| Ticked on the card (locked) | `#4CD964` | `#4CD964` | ✓ / "ticked", ink `#0C0C0E` |
| Counted (added in the sheet) | `#16301B` | `#2F6B35` | set number / "6 reps" · "10s" · "done", `#7FE08C` / `#5FB86B` |
| Not done | `#18181B` | `#26262A` | set number / "—", `#5E5E68` |

- **Tap rule:** tapping tile *n* sets the count to *n*. Tapping the current last tile again lowers it by one.
  - The count can't go below the ticked count.
  - An untouched exercise (0 ticked) can go down to 0.
  - Ticked tiles can't be tapped.
- **Default:** the ticked count, or the full plan if nothing was ticked (same as today).
- **Row 3, left:** a status line (12px 600, `#8A8A94`):
  - "Untouched · counted as planned" (0 ticked, not changed)
  - "2 ticked + 1 added"
  - "All done"
  - "3 of 4"
  - "Not done — counts as skipped": shown at 0, in amber `#E0B54A`
- **Row 3, right:** an optional compact stepper.
  - Container: background `#1C1C20`, radius 12, padding 3.
  - Label (12px `#8A8A94`), − and + buttons (36×36, radius 9, `#2A2A2E`), and the value between them (Condensed 800, 18px, min-width 58).
  - **Weighted exercise:** "Top set", step 2.5 kg, minimum 0, pre-filled with the heaviest ticked kg. This **replaces the block-level "WEIGHT USED"**. With 2+ weighted exercises, each card has its own stepper.
  - **Hold exercise:** "Hold", step 1 s, minimum 1, pre-filled from the plan. This is a **new** field; save it as seconds, not reps.
- **Circuits / supersets:** the section label reads "ROUNDS" and there's one card for the whole round structure.

### 2. Result (Completed, by block type)
**AMRAP:** label "YOUR SCORE · {cap} AMRAP".
- Two side-by-side cards: **ROUNDS** and **+ REPS**. Each card: background `#0E0E10`, radius 20.
- Big number (Condensed 800, 52px), with full-width − and + buttons below it (height 44, `#1C1C20`).
- Pre-filled from the timer.
- Saved as **integers** `rounds`, `reps` (replaces the free text).

**For Time:** label "TIME TO FINISH".
- A card with `MM : SS` (Condensed 800, 56px, tabular numbers) and ▲ / ▼ buttons (72×32) above and below each part.
- Seconds wrap around at 0–59.
- Below the card, a toggle button "Hit the time cap?". When on it reads "✓ Hit the time cap" in coral and the time card dims to 35%.
- Saved as `seconds: int` + `timeCapReached: bool` (replaces the free text). Keep the "round X/Y" capture from the timer.

**Ladder:** a read-only card with the label "LADDER RESULT".
- Big "8 / 10 rungs".
- Sub line "36 total reps · saved from your ladder".

### 3. HOW DID IT FEEL? + EFFORT · RPE (Completed only; both optional)
- **Feel:** five chips in a row: HARD · OK · GOOD · STRONG · BEAST.
  - Each chip: flex 1, height 48, radius 12, Condensed 700 15px.
  - Selected: coral border `#FF6A4D` + background `#2A1512` + coral text.
  - Unselected: `#18181B`, border `#26262A`, `#C8C8D0` text.
  - Tapping the selected chip clears it.
- **RPE:** a 10-cell segmented bar (height 44, gap 3; outer corners radius 12, inner corners 4).
  - Cells 1…n fill coral at increasing strength: `rgba(255,106,77, 0.25 + n·0.075)`, white numbers.
  - Unselected cells: `#18181B`, numbers `#6E6E78`.
  - The right label shows "7 · Hard" in `#FF8A6D`, or "Optional" when nothing is picked.
  - Words for 1–10: Very easy, Easy, Light, Moderate, Steady, Challenging, Hard, Very hard, Near max, All out.
  - Tapping the selected value clears it.

### 4. WHY DID YOU MISS IT? (Skipped only)
- A 2×2 grid: NO TIME · TOO TIRED · INJURY · OTHER.
- Each tile: height 56, radius 14, Condensed 700 17px.
- Selected: amber `#E0B54A` border + background `#2E2610` + amber text.
- This field is **required** to save a skip.

### 5. Note (always)
- Collapsed by default: a dashed button (`1px dashed #33333A`, height 48, radius 14) labelled "+ Add a note". When Skipped it reads "+ Add details (optional)".
- Expanded: a textarea, height 84, background `#0C0C0E`, border `1px #2E2E34`, radius 14.
  - Placeholder "Highlights, pain, modifications…" (Completed) or "What happened?" (Skipped).
  - The skipped "Any details?" field is merged into this one note.
- **Re-opening** a block that has a saved note shows the note expanded.

## Footer — primary button
Full width, height 58, radius 16, Barlow Condensed 800 20px, letter-spacing 2.5.

| State | Label | Background | Text |
|---|---|---|---|
| Completed | LOG BLOCK | `linear-gradient(90deg,#8A5CD0,#FF5A55 60%,#FF7A45)` | `#FFFFFF` |
| Skipped, no reason | PICK A REASON | `#222226` (disabled) | `#5E5E68` |
| Skipped, reason picked | LOG AS MISSED | `#E0B54A` | `#1A1406` |
| Saving | SAVING… | same as the state above, not tappable | — |

- **Error:** keep the sheet open and the user's input. Show an inline message above the button and let them retry. Don't reload the screen.

## Saved state
- The sheet content is replaced by a centered confirmation:
  - An 84px circle with a white check. Gradient background for Completed, amber for Skipped.
  - Title: "{BLOCK} LOGGED" or "MISS LOGGED" (Condensed 800, 30px).
  - Summary line (15px `#8A8A94`), e.g. "6/8 sets · Strong · RPE 7", "5 rounds + 4 reps", "Finished in 14:32", or "No time. Your plan will adjust around it."
- Auto-dismiss after ~1.2s, or on tap (product decision). The prototype's "START AGAIN" button is only there for the demo.

## What gets saved (changes vs today in bold)
- **Block log:** status, feel, RPE, missed reason, and the note (now one note field).
- **Result fields as structured data:** **`amrap.rounds`, `amrap.reps`, `forTime.seconds`, `forTime.capReached`**. Stop writing "[LOG]" lines into notes; keep writing them for older app versions if needed.
- **Set rows:** same as today.
  - Ticked sets as entered.
  - Added sets at planned reps.
  - **Hold seconds from the Hold stepper.**
  - **kg from the per-exercise Top set stepper** (applied to added sets; it doesn't overwrite kg already typed on ticked sets).
- **Exercise set to 0:** the existing 0-rep "skipped" marker.
- **Skipped:** no sets. The missed marker, plus the note.

## Design tokens
- **Surfaces:** sheet `#141416` · card `#0E0E10` · control `#18181B` / `#1C1C20` · input `#0C0C0E` · border `#222226` / `#26262A` / `#2A2A2E` / `#2E2E34`
- **Text:** primary `#FFFFFF` · secondary `#C8C8D0` · muted `#8A8A94` · faint `#6E6E78` / `#5E5E68`
- **Coral (selection / primary):** `#FF6A4D`, light `#FF8A6D`, tint `#2A1512`
- **Primary gradient:** `#8A5CD0 → #FF5A55 (60%) → #FF7A45`
- **Green (done sets only):** `#4CD964`, tint `#16301B`, border `#2F6B35`, text `#7FE08C`
- **Amber (skipped only):** `#E0B54A`, tint `#2E2610`, ink `#1A1406`
- **Type:** Barlow Condensed 700/800 for labels, numbers and buttons; Barlow 400–600 for body text.
- **Hit targets:** at least 44px.
- **Radii:** sheet 28 · cards 20 · tiles/buttons 12–16 · pills 16

## Rules of color (fixes the "mixed visual language" pain point)
- Green only means "set done".
- Amber only means "skipped".
- Coral marks selections, and the gradient is used only for the primary action. No red buttons.

## Open questions
- Should the saved state auto-dismiss, and after how long?
- Who owns the backend change for structured AMRAP / For Time results and hold seconds?
- For circuits, should the rounds card list the exercises (as the prototype does in its title) or show one card per exercise?
- What should the inline error message say?

## Files
- `Leap Log Workout Sheet v3.dc.html`: the reference. Sample blocks are in `SC`, defaults in `fresh()`, all rules in `renderVals()`.
- `support.js`: prototype runtime only, don't port.
