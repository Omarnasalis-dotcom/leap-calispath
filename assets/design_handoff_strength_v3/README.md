# Handoff: Leap Arena — Strength World ("The Climb") v3

## Overview
Strength World home screen. Users move through 9 tiers (HELOT → ETERNITY). Each tier is a swipeable card that holds all of that tier's info: status, progress, rank, gap to #1 and the trial button. Below the cards: a 9-dot "climb line" showing overall progress, then that tier's leaderboard (top-3 podium, a pinned "you" row, and a full-list bottom sheet).

## About the Design Files
The files here are **design references built in HTML**. They show how the screen should look and behave. They are not production code. Rebuild them in the target codebase's environment (React Native, SwiftUI, Flutter, etc.) using its own patterns and libraries. If there's no codebase yet, pick the best-fit framework.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and motion are final. Match them exactly. Leaderboard names, times and counts are mock data.

## Screen: Strength World
Frame: 402 × 874 (iPhone 16 Pro), background `#000`. Vertical stack, top to bottom:
1. Status bar (system)
2. Header (fixed)
3. Scroll area: tier carousel → climb line → leaderboard
4. Bottom tab bar (fixed)
5. Leaderboard bottom sheet (overlay, shown on demand)

### 1. Header
- Padding `16px 24px 4px`. Row, space-between, centered vertically.
- Eyebrow "STRENGTH WORLD": 11px / 500, letter-spacing 2.4px, `#8a8a8a`.
- Title "THE CLIMB": 26px / 700, letter-spacing 1.4px, line-height 1.1, `#fff`, margin-top 2px.
- Right: 44px coral circle `#FC5454` with a white 4-bar "levels" icon (18px, stroke 2.6). Outer halo ring: inset −5px, 1px `rgba(252,84,84,.2)`. Action: TBD (the Power/Static/Endurance worlds use it to open levels/stats).

### 2. Tier carousel
- Container height 348px, margin-top 14px. Horizontal track, `touch-action: pan-y`.
- Card width **318px**, gap **12px**. The selected card is centered: `translateX((402 − 318)/2 − index × 330)`.
- Track transition: `transform .45s cubic-bezier(.4,0,.2,1)`.
- Change tier by: swiping (threshold **40px** horizontal, one card per swipe, clamped 0–8), tapping a side card, or tapping a climb-line dot.

**Card** (height 336, radius 26, padding 22, column, gap 16, overflow hidden):
| State | Background | Border |
|---|---|---|
| Current | `#130909` | 1px `rgba(252,84,84,.45)` |
| Complete | `#0d0d0d` | 1px `#1f1f1f` |
| Locked | `#0d0d0d` | 1px `#181818` |

- Unselected cards: `scale(.92)`, opacity .45, pointer cursor. Selected card: `scale(1)`, opacity 1. Transition .45s on the same easing.
- **Ghost numeral** (e.g. "05"): absolutely positioned at right −8, top −26. 190px / 700, letter-spacing −4, transparent fill, 1.5px text stroke — `rgba(252,84,84,.22)` on the current card, `rgba(255,255,255,.06)` on others. Not interactive.
- **Top row**: "TIER N OF 9" (11px / 600, ls 2.2; coral on current, `#8a8a8a` otherwise) and a status chip on the right.
  - Chip: padding `3px 9px`, radius 7, 10.5px / 700, ls 1.6.
  - CURRENT: coral fill, black text.
  - COMPLETE: text `#4CC38A`, 1px border `rgba(76,195,138,.45)`.
  - LOCKED: text `#4a4a4a`, 1px border `#2a2a2a`.
- **Tier name**: 46px / 700 (40px when the name is longer than 8 characters), ls 1.4, line-height 1, margin-top 18. `#fff`, or `#5a5a5a` when locked.
- **Progress bar**: 4px tall, radius 2, track `#221414`. Fill: green 100% (complete), coral at `currentPct` (current), 0% (locked). Animates in from 0: `width .9s cubic-bezier(.4,0,.2,1)`, .15s delay, starting 120ms after mount.
- **Caption** (12.5px / 400, ls .4):
  - Current → "{pct}% to {Next tier}" in `#d0d0d0`
  - Complete → "Tier complete" in `#4CC38A`
  - Locked → "Complete {Previous tier} to unlock" in `#6a6a6a`
  - Tier names in captions use title case (e.g. "Strategos").
- **Stats row**: two columns. Top border 1px `#1f1f1f`, padding-top 14. The right column has a 1px `#1f1f1f` left border and 16px left padding.
  - Labels "RANK" / "GAP TO #1": 10.5px / 500, ls 2, `#8a8a8a`.
  - Values: 26px / 600, line-height 1.
  - Rank: "#N" in `#fff` with "of {count}" next to it (12px, `#6a6a6a`). If the user isn't on this tier's board, show "—" in `#4a4a4a`. The suffix becomes "unranked · {count}" when the tier is unlocked and has entries, or "no entries yet" when the board is empty.
  - Gap: "KING" in gold `#E8B64C` when the user is #1. Otherwise "+M'SS"" in `#fff`, or "—" in `#4a4a4a` when unranked.
- **Button** (pinned to the bottom with margin-top auto): height 52, radius 15, 15px / 700, ls 2.4.
  - Current: coral fill, black text, "START {TIER} TRIAL"
  - Complete: transparent, 1.5px `#3a3a3a` border, white text, "PRACTICE {TIER}"
  - Locked: `#141414` fill, `#4a4a4a` text, "LOCKED", not tappable

### 3. Climb line ("YOUR CLIMB")
- Padding `22px 24px 0`, gap 12.
- Header row: "YOUR CLIMB" (11px / 500, ls 2, `#8a8a8a`) on the left. "TIER {n} OF 9 · {overall}%" (12px / 500, ls 1.4, `#d0d0d0`) on the right.
  - `overall = round(((currentIndex + pct/100) / 9) × 100)`
- Track: height 34. A 2px line at top 16, inset 17px each side, `#1f1f1f`. Coral fill on top of it, width `step × (currentIndex + pct/100)` where `step = (402 − 48 − 34) / 8`. Animates in: `width 1s cubic-bezier(.4,0,.2,1)`.
- 9 dots (each in a 34×34 hit area, spaced evenly), numbered 1–9, 11px / 700:
  - Current: coral fill, black text, halo `0 0 0 5px rgba(252,84,84,.16)`
  - Complete: `#1a1a1a` fill, `#e6e6e6` text, 1.5px `#3a3a3a` border
  - Locked: `#000` fill, `#4a4a4a` text, 1.5px `#222` border
  - Selected (and not current): 30px with 13px text and a 2px `#fff` border. Unselected dots are 22px. All dots use `transition: all .25s`.
- Tapping a dot selects that tier (moves the carousel and changes the leaderboard).

### 4. Leaderboard (for the selected tier)
- Padding `30px 24px 28px`, gap 16.
- Title "{TIER} LEADERBOARD": 19px / 600, ls 2, `#fff`. Count on the right: "{n} WARRIORS" (singular "WARRIOR" when n = 1), 12px / 500, ls 1.4, `#8a8a8a`.
- **Filters** (segmented controls): container padding 3, radius 12, background `#111`, 1px `#1f1f1f` border. Options: padding `7px 12px`, radius 9, 12px / 600, ls 1.4. Selected option: coral fill with black text. Others: `#8a8a8a`.
  - Scope: PUBLIC | MY COMMUNITY. Only shown when the user belongs to a community. Left-aligned.
  - Gender: ALL | MALE | FEMALE. Right-aligned (margin-left auto). The two controls wrap onto separate lines if space runs out.
- **Podium** (3 equal columns, gap 8, bottom-aligned, padding-top 6). Order left→right is **#2, #1, #3**.
  - Avatar: 56px for #1, 44px for #2/#3. `#141414` fill, 2px ring in the rank color, or coral if it's the user. Shows initials (18px or 15px / 600).
  - Name: 12px, ellipsis. `#a0a0a0`, or coral / 600 if it's the user. Time underneath: 16px / 600, `#fff`.
  - Block heights: **84 / 60 / 46** (for #1 / #2 / #3). Radius `12 12 0 0`, 2px top border in the rank color. Background: `linear-gradient(#1c1710,#0c0c0c)` for #1, `linear-gradient(#161616,#0c0c0c)` for the others. Contents: rank number (26px for #1, 20px for others / 700, rank color) and country code (10px / 600, ls 1, `#6a6a6a`).
  - Blocks grow from height 0 on mount: `height .7s cubic-bezier(.4,0,.2,1)`, delayed `.1s + i × .08s`.
  - Missing podium spots: dashed placeholders (`#2a2a2a` avatar, `#222` block), "—" for the name.
- Rank colors: gold `#E8B64C`, silver `#C9CED6`, bronze `#C98B5A`.
- **"You" row** (only when the user is ranked #4 or lower): height 62, padding `0 16px`, radius 16, background `rgba(252,84,84,.07)`, 1px `rgba(252,84,84,.4)` border.
  - Rank: 18px / 700, coral, 34px wide.
  - Name: 14px / 500, ellipsis, followed by a "YOU" pill (coral fill, black text, 10px / 700, ls 1.2, radius 5, padding `1px 6px`).
  - Right side: time (16px / 600) with the gap to #1 underneath (11px / 500, `#8a8a8a`).
- **Not-ranked row** (user isn't on the board but the tier is unlocked): 62px tall, 1px dashed `#2a2a2a` border, "—" in `#4a4a4a`, note text 13px `#8a8a8a`.
  - Current tier: "Complete the trial to rank up in the leaderboard"
  - Completed tier: "Practice this tier to set your time"
- **SEE MORE** button: height 48, radius 14, `#111` fill, 1px `#1f1f1f` border. Label 13px / 600, ls 2, `#d0d0d0`, with a chevron. Opens the bottom sheet.
- **Empty state** (no entries): three dashed podium outlines (heights 56 / 84 / 42) at 50% opacity, with the message "No warriors have attempted this tier yet." (13px, `#8a8a8a`, centered).

### 5. Bottom sheet (full leaderboard)
- Backdrop: `rgba(0,0,0,.7)`. Tapping the backdrop closes the sheet.
- Sheet: max-height 72%, radius `28 28 0 0`, `#0c0c0c` fill, 1px `#222` top border. Grab handle: 40×4, `#2a2a2a`.
- Header: the same title and count as the leaderboard section, plus a 40px `#1a1a1a` round close button (✕).
- Rows: height 60, padding `0 24px`, 1px `#161616` top border. Each row has:
  - Rank: 22px wide, 17px / 700. Gold/silver/bronze for the top 3, `#6a6a6a` for the rest.
  - Country badge: 26×18, radius 4, `#1a1a1a` fill, 10px / 600, `#a0a0a0`.
  - Name: 14px, `#d0d0d0` (or `#fff` / 500 for the user), plus the YOU pill.
  - Time (16px / 600) with the gap underneath: "LEADER" for #1, "+M'SS"" for everyone else (11px, `#6a6a6a`).
  - The user's row is tinted `rgba(252,84,84,.07)`.
- The sheet uses the same scope and gender filters as the main leaderboard.

### 6. Bottom tab bar
5 columns: PROFILE · STRENGTH (active) · WORLDS · TRAIN · JOURNEY. Padding `12px 6px 28px`, `#0a0a0a` fill, 1px `#1a1a1a` top border.
- Icons are 20px inside a 48×30 box.
- Labels: 11px / 500, ls 1.2, `#8a8a8a`.
- Active tab: icon box gets `rgba(252,84,84,.14)` fill with radius 10, and the icon and label turn coral (label weight 600).

## Interactions & Behavior
- On mount, the carousel opens on the **current tier**. Progress bars, the climb fill and the podium blocks animate in from zero after 120ms.
- Selecting a tier (swipe, card tap or dot tap) updates the card focus, the selected dot, the leaderboard title, the count and all rows.
- Filters apply to the podium, the "you" row, the count and the sheet. Filtering is client-side.
- Times display as `M'SS"` (e.g. 2'40"). Lower time = better rank.
- Locked tiers can be browsed (you can see their leaderboard) but their button is disabled.

## State
- `currentTier` (1–9) and `currentPct` (0–100) come from the user's profile.
- `inCommunity` (bool) decides whether the scope filter appears.
- Local UI state: `selectedTier` (defaults to current), `scope` (PUBLIC), `gender` (ALL), `sheetOpen` (false), `drawn` (flag for the mount animations).
- Data needed per tier: the ordered entries `{ userId, handle, countryCode, gender, inCommunity, timeSeconds }`, plus the user's own entry if they have one.

## Design Tokens
- Coral (primary): `#FC5454` · hover/link: `#ff7b7b`
- Green (complete): `#4CC38A`
- Gold / Silver / Bronze: `#E8B64C` / `#C9CED6` / `#C98B5A`
- Backgrounds: `#000` screen, `#080808` page, `#0a0a0a` tab bar, `#0c0c0c` sheet, `#0d0d0d` card, `#130909` current card, `#111` controls, `#141414`, `#1a1a1a`
- Lines: `#161616`, `#181818`, `#1f1f1f`, `#222`, `#2a2a2a`, `#3a3a3a`
- Text: `#fff`, `#e6e6e6`, `#d0d0d0`, `#a0a0a0`, `#8a8a8a`, `#6a6a6a`, `#5a5a5a`, `#4a4a4a`
- Font: **Oswald** (300–700, Google Fonts), fallback `'Arial Narrow', sans-serif`. Labels are uppercase with wide tracking (1.2–2.4px).
- Radii: 5, 7, 9, 12, 14, 15, 16, 26 (card), 28 (sheet), 44 (device)
- Easing: `cubic-bezier(.4,0,.2,1)` everywhere

## Open data (placeholders in the mock)
- Final tier names and order (HELOT, EPHEBE, HOPLITE, PELTAST, LOCHAGOS, STRATEGOS, OLYMPIAN, DEMIGOD, ETERNITY)
- How tier progress % is calculated, and the unlock rules
- What each trial contains (movements, time cap) and the Start Trial / Practice flows
- What the header levels button does
- Leaderboard page size and pagination for the sheet

## Assets
No image assets. All icons are simple inline SVG strokes; swap them for your codebase's icon set. Avatars show initials until real profile photos are available.

## Files
- `Leap Strength v3.dc.html` — interactive reference. Open it in a browser with `support.js` in the same folder. Adjustable props: `currentTier`, `currentPct`, `inCommunity`.
- `support.js` — the runtime that the reference file needs in order to open.
