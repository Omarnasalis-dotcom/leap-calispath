# Handoff: Leap Admin — User Performance panel

## Overview
Redesign of the **Performance** section on the admin user detail page (`/users/:id`). It replaces the four existing charts (Weighted lifts, Bodyweight, Blocks completed, World points) with a cleaner 2×2 panel that leads with numbers, handles sparse data and adds hover detail.

## About the Design Files
`Leap Admin Performance.dc.html` is a **design reference built in HTML/React**, not production code. Recreate it inside the existing admin app (Next.js on Vercel) using its components and chart library (Recharts, visx, Chart.js, etc.). `support.js` is the prototype runtime only, so don't port it. Open the HTML file in a browser to inspect it. The Tweaks panel switches between **2 weeks** (current user) and **8 weeks** of data.

## Fidelity
**High-fidelity.** The colors, type, spacing and behaviors below are final. The data is sample data.

## Layout
- The section sits in the existing content column, max-width 1240, padding 32 / clamp(16px, 4vw, 48px).
- **Panel:** white `#FFFFFF`, radius 20, border `1px #E8E8EC`, overflow hidden.
- **Header:** padding 24/28/20, bottom border `1px #EEEEF1`, flex space-between, aligned to the bottom.
  - Eyebrow "TRAINING": Oswald 600, 11px, letter-spacing 3px, `#E5383B`
  - Title "Performance": Oswald 600, 26px
  - Right: range label, e.g. "W1 – W8 · Advanced A Program". Barlow 13px, `#6B6B76`
- **Grid:** `repeat(auto-fit, minmax(min(100%, 440px), 1fr))`, gap 1px on a `#EEEEF1` background, which draws hairline dividers between the cells. You get 2 columns on desktop and 1 on narrow screens.
- **Each cell:** white, padding 24/28/20, flex column, gap 18, `min-width: 0`.
- **Cell header:** title Barlow 600 15px `#17171C`, subtitle Barlow 13px `#6B6B76`, optional control on the right.
- **Order:** Weighted lifts, World points, Bodyweight, Blocks completed.

## Cards

### 1. Weighted lifts
- **Subtitle:** "Heaviest set per workout slot".
- **Exercise switcher** (replaces the dropdown): a segmented control.
  - Track `#F2F2F4`, radius 10, padding 3, gap 4.
  - Item: Barlow 600 13px, padding 6/12, radius 8, followed by the session count in 500 weight `#9A9AA4`.
  - Active item: white background, `#17171C` text, shadow `0 1px 2px rgba(23,23,28,.08), 0 0 0 1px #E8E8EC`.
  - Inactive item: transparent background, `#6B6B76` text.
  - If an athlete has more than about 5 exercises, fall back to a searchable dropdown in the same style.
- **Slot tiles:** one per workout slot, flex `1 1 180px`, border `1px #EEEEF1`, radius 12, padding 10/14.
  - Color dot 8×8 + slot name (12px, `#6B6B76`).
  - Latest value: Oswald 500 26px, followed by the unit "kg" at 14px `#6B6B76`.
  - Delta: "+15 kg since W1", 12px 600 `#1E8A4C`.
  - **Click toggles the series** in the chart. A hidden series' tile drops to opacity 0.45.
- **Chart:** line chart, aspect 560×200, full width.
  - Y axis starts at 0, steps of 5 kg, 18% headroom.
  - Three gridlines (min, mid, max): `#EEEEF1`. The bottom one is solid, the others dashed 3/4. The label sits above each line, 11px `#9A9AA4`, e.g. "110 kg".
  - X labels W1…Wn, 11px `#9A9AA4`. The first is left-aligned, the last right-aligned.
  - Lines: 2.5px, round caps, smooth monotone curve.
  - Area under each line: the series color at 7% opacity.
  - Points: r=3, white fill, 2px stroke in the series color. The latest point is r=5, filled, with a white stroke.
  - **Hover:** snaps to the nearest week.
    - A vertical guide line appears: `#17171C` at 15% opacity.
    - The hovered points enlarge and fill, and the week label turns bold `#17171C`.
    - A tooltip appears above: background `#17171C`, radius 8, padding 6/10, white 12px text. It shows the week label in `#9A9AA4` and one row per visible series with a dot and value. Clamp it to the left/right edges for the first and last weeks.

### 2. World points
- **Subtitle:** "Score at the end of each week".
- One tile per world in a grid `repeat(auto-fit, minmax(170px, 1fr))`, gap 12. Each tile has radius 14, padding 16/16/10 and a tinted background.
  - Static: tint `#F4F0FF`, line `#7B4DFF`, label/delta text `#5B2FE0`
  - One-Min-Max: tint `#FFF3EB`, line `#E8661C`, label/delta text `#B5470C`
  - A third world (Power) needs its own tint and line color from the brand.
- **Tile content:**
  - World name: Oswald 600, 11px, letter-spacing 2.5px, uppercase.
  - Delta vs the previous week ("+3 this week"): 12px 600, aligned right.
  - Score: Oswald 500, 40px, line-height 1, followed by "pts" at 15px.
  - Sparkline pinned to the bottom (aspect 240×70): no axes, 2px line, 12% area fill, and only the latest point drawn (r=5).

### 3. Bodyweight
- **Subtitle:** "Weekly log".
- **Right side of the header:** latest value in Oswald 500 28px with "kg", and below it "−3.6 kg since W1" (12px `#6B6B76`). Use a neutral color here because a change in bodyweight is neither good nor bad.
- **2 or more logs:** the same chart spec as Weighted lifts, with a `#17171C` line, steps of 1 kg and an axis that isn't pinned to 0.
- **Only 1 log (empty state):** dashed box `1.5px dashed #E1E1E6`, radius 14, min-height 150, centered content.
  - A 10px dark dot with a 5px `#EDEDF0` halo.
  - "One log so far" (13px 600).
  - "The trend line appears after a second weekly weigh-in." (12px `#6B6B76`)
  - The header still shows the value and "Logged {date}".
- **0 logs:** same empty-state box, with the copy "No weigh-ins yet" (product to confirm).

### 4. Blocks completed
- **Subtitle:** "Per program week". On the right, the program select keeps the existing behavior: border `1px #E8E8EC`, radius 10, padding 8/32/8/12, 13px 600, with a custom chevron.
- **Summary:** average completion in Oswald 500 28px (e.g. "21%"), followed by "6 of 28 blocks · 2 weeks" (13px `#6B6B76`).
- **Week columns:** a flex row with gap 10. Each column is `flex: 1 0 34px`, max-width 64, and scrolls horizontally if there are many weeks.
  - Top: percentage, 12px 600.
  - Middle: a stack of **one cell per block in the week**, filling from the bottom up. Each cell is 8px high, radius 3, gap 3, inside a padding-4 radius-10 wrapper.
    - Done (past weeks): `#F08A8C`
    - Done (current week): `#E5383B`
    - Not done: `#F0F0F3`
  - **Current week:** outline `1.5px #F6C9CA` on the wrapper, percentage in `#E5383B`, label 600 `#17171C`.
  - Bottom: week label ("W1"), 12px `#9A9AA4`.

## Design Tokens
- Ink: `#17171C` · Muted: `#6B6B76` · Faint: `#9A9AA4`
- Page: `#F2F2F4` · Surface: `#FFFFFF` · Border: `#E8E8EC` · Divider/grid: `#EEEEF1` · Empty cell: `#F0F0F3`
- Coral (brand / push slot / blocks): `#E5383B` · light coral `#F08A8C` · coral outline `#F6C9CA`
- Purple (Static / pull slot): `#7B4DFF` · ink `#5B2FE0` · tint `#F4F0FF`
- Orange (One-Min-Max): `#E8661C` · ink `#B5470C` · tint `#FFF3EB`
- Positive delta: `#1E8A4C`
- **Fonts:** Oswald 500/600 for numbers, eyebrows and titles; Barlow 400/500/600 for UI text. If the admin already uses another sans font for body text, keep it and use Oswald only for numbers.
- Radii: panel 20, tile 12–14, controls 8–10, cells 3

## Data
- **Weighted lifts:** for each exercise, a list of workout slots, each with `{ name, color, values[week] }` = heaviest set in kg. Also the session count per exercise for the switcher badge.
- **World points:** for each world, the end-of-week score per week.
- **Bodyweight:** weekly logs `{ date, kg }`.
- **Blocks:** blocks per week (prototype uses 14), plus completed blocks per week for the selected program and the current week index.
- **Deltas:**
  - Lifts and bodyweight: latest minus first.
  - World points: latest minus previous week.
- **Missing weeks:** break the line (don't interpolate). Show "—" in the tooltip.

## Responsive
- Below about 900px the grid becomes 1 column.
- Tiles wrap. The exercise switcher wraps under the title.
- Week columns scroll horizontally.

## Files
- `Leap Admin Performance.dc.html`: the reference. Chart logic is in `chart()`, sample data in `data()`.
- `support.js`: prototype runtime only, don't port.
