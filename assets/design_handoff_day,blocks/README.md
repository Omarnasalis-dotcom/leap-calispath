# Handoff: Day Blocks v2 — Redesign + Slide-to-Complete

Scope: **only** the Day Blocks screen redesign (`Leap Day Blocks v2.dc.html`). This replaces the current app screen (Upper Day 1 block list).

## About the Design Files
The HTML file is a **design reference** — exact layout, colors, type, motion and behavior. Not production code. Rebuild it in the app's existing stack using its components/patterns.

The left column next to the phone frame (notes + "MID-WORKOUT STATE" toggle) is a **prototype control only — do not implement**. The Tweaks panel options are also prototype-only. **Ship these final choices:**
- `doneStyle` = **Slide to complete** (tap-triggered, not drag)
- `doneText` = **COMPLETE → COMPLETED**
- Movement preview = **pills, one row, max 2 + "+N"**

## Fidelity
**High-fidelity.** Content is mock data — wire to the real day/block API.

---

## 1. Screen layout (402 × 874 reference)

Background `#000`. Font: **Oswald** (400/500/600/700) throughout.

### 1.1 Header (padding 22px 20px 16px)
Row, `align-items:center`, gap 14.
- **Back button** — 44×44, radius 14, bg `#141414`, chevron-left 18px, stroke `#fff` 2.4.
- **Title block** (flex 1)
  - Title: `UPPER DAY 1` — 24px / 700 / letter-spacing 1.2 / line-height 1.05 / `#fff`
  - Meta: `5 blocks · 14 moves · ~23 min` — 13px / 400 / ls .6 / `#a0a0a0`, margin-top 4
- **Progress ring** (see §2) — 52×52, right-aligned.

**Segment bar** (margin-top 16): one segment per block, flex 1 each, gap 5, height 4, radius 2.
- todo `#1f1f1f` · done = block accent · skipped `#3a3a3a`. Transition `background .3s ease`.

### 1.2 Block list
Scroll area, padding `2px 16px 130px` (bottom padding clears sticky CTA), vertical gap 12.

### 1.3 Sticky CTA
Absolute bottom, padding `24px 16px 30px`, bg gradient `transparent → rgba(0,0,0,.94) 30% → #000`.
- **Timer button** 58×58, radius 18, bg `#141414`, stopwatch icon 22px stroke `#fff` 2.
- **Primary** flex 1, height 58, radius 18, bg `#FC5454`, play icon 14px fill `#000`, label 17px / 700 / ls 2.4 / `#000`.
  - Label: `START WORKOUT` when nothing settled; `RESUME WORKOUT` once ≥1 block done/skipped.

---

## 2. Progress ring (top-right)

52×52 SVG, rotated −90° so fill starts at 12 o'clock.
- Track circle: r 22, stroke `#1f1f1f`, width 4.
- Progress circle: r 22, stroke `#FC5454`, width 4, `stroke-linecap: round`, `stroke-dasharray: 138.2` (2π·22).
  - `stroke-dashoffset = 138.2 × (1 − pct/100)`
  - Hidden (opacity 0) at 0% so the round cap doesn't show a dot.
  - Transition: `stroke-dashoffset .6s cubic-bezier(.4,0,.2,1), opacity .2s ease`.
- Center label: flex-centered in the ring, `{pct}` + small `%`.
  - Number: `#fff` / 700 / line-height 1 / font-size **15px**, **12.5px when pct = 100** (so "100%" fits and stays centered).
  - `%`: 8px / `#a0a0a0`, inline directly after the number (no offset/margin).
  - paddingLeft 3px to optically balance the `%`.
- `pct = round(settledBlocks / totalBlocks × 100)`, settled = done **or** skipped.

---

## 3. Block card

Container: radius 20, bg `#0f0f0f`, `position:relative`.
- Borders: top/right/bottom `1px solid #1f1f1f` (open: accent @ 45% alpha). **Left: `4px solid {accent}`** (skipped: `#3a3a3a`).
  - ⚠ Set the four sides individually — mixing `border` shorthand with `borderLeft` resets the left rail on re-render.
- Skipped card: opacity .55.
- Entry: fade + translateY(12px→0), `.4s ease`, stagger `0.05 + i×0.06s`.
- Transition: `border-color .2s, opacity .2s`.

### 3.1 Header row (tap anywhere = expand/collapse)
Padding `16px 12px 12px 16px`, gap 14.
- **Badge** 40×40, radius 12, 18px / 700, centered.
  - todo: bg accent @14%, text accent, shows block number.
  - done: bg accent, text `#000`, shows `✓`.
  - skipped: text `#8a8a8a`, shows `–`.
- **Title** 19px / 600 / ls 1.2 / `#fff` (skipped: line-through).
- **Meta row** (margin-top 4, gap 8, wraps): scheme (12px / 600 / ls 1.3 / accent; skipped `#8a8a8a`) · 3px dot `#5a5a5a` · `{n} moves · ~{m} min` (13px / 400 / `#a0a0a0`).
- **Chevron button** 44×44, radius 12, bg `#1a1a1a`, chevron-down 18px stroke `#d0d0d0`. Rotates 180° when open (`.25s ease`).

### 3.2 Collapsed: movement pills
Row `flex-wrap: nowrap`, gap 6, padding `2px 12px 14px 16px`, overflow hidden. **Always one row.**
- Show first **2** movement names; if more than 2, append `+{count−2}` pill.
- Name pill: radius 999, padding `7px 12px`, bg `#1a1a1a`, border `1px solid #242424`, 13px / 500 / ls .3 / `#e6e6e6`, `white-space:nowrap`, `flex: 0 1 auto; min-width:0`, ellipsis on overflow.
- "+N" pill: transparent bg, border `#2a2a2a`, `#a0a0a0`, `flex: 0 0 auto` (never shrinks).

### 3.3 Expanded: movement rows
Replaces pills. Grid gap 6, padding `2px 12px 14px`. Enter: fade + translateY(-4px), `.28s ease`.
Row: radius 14, bg `#161616`, padding `12px 14px`, gap 12.
- Name 15px / 500 / `#fff`; note 12px / 300 / `#a0a0a0`, margin-top 2.
- Target (right): e.g. `3 × 10`, `2 × 30s`, `Max` — 14px / 600 / `#e6e6e6`, nowrap.

### 3.4 Action row
Flex, gap 8, padding `0 12px 12px`. Both buttons: flex 1, **height 44**, radius 12, 13px / 600 / ls 1.6, centered, `user-select:none`.
- **SKIP** — bg `#1a1a1a`, text `#d0d0d0`. Tap → block skipped; label becomes `UNDO SKIP` (text `#fff`). Hidden when block is done.
- **COMPLETE** (slide-to-complete) — see §4. Hidden when block is skipped.

---

## 4. Complete button — tap-to-slide mechanism ⭐

Visual: button bg `#1a1a1a`, border `1px solid #2a2a2a`, text `#fff`, `position:relative; overflow:hidden`.

Layers inside (z-order low → high):
1. **Fill** — absolute, left 0, top/bottom 0, bg accent @ 22% alpha. Width 0% (idle) → 100%.
2. **Thumb** — absolute, 36×36 circle, top 4, bg = accent. Contains chevron-right (idle) or check (done), 16px stroke `#000` 2.8. `pointer-events:none`.
3. **Label** — centered, `position:relative`.

### Sequence (single tap, no drag)
| t | Event |
|---|---|
| 0ms | User taps (ignored if already animating) |
| 0–450ms | Thumb `left: 4px → calc(100% − 40px)` and Fill `width 0 → 100%`, both `cubic-bezier(.6,0,.2,1)` 450ms |
| 480ms | Commit status = `done`. Label `COMPLETE` → `COMPLETED`; thumb icon chevron → check; button bg → accent @16%, border accent @40%, text accent |
| after | Badge fills, segment bar + ring update, card stays at 100% fill with thumb parked right |

- **Undo:** tapping a completed button resets to todo — thumb/fill animate back (same 450ms curve), label reverts.
- Guard against double-tap during the 480ms window; clear the timer on unmount.
- Haptic (native): light impact on tap, success notification on commit.
- Accessibility: role=button, label "Complete {block title}", state "completed" when done; respect Reduce Motion (skip the slide, commit instantly).

---

## 5. Block accents (by block type)
| Type | Hex |
|---|---|
| Warm-up | `#E0B43A` |
| Strength / Finisher | `#FC5454` |
| Accessories | `#F7843A` |
| Cool-down | `#6B9BFF` |

Alpha helpers used: 12%, 14%, 16%, 22%, 40%, 45%.

## 6. State
- `openIndex` — which card is expanded (−1 = none; one at a time; default none).
- `status[blockId]` — `todo | done | skipped`. Toggling the same action again returns to `todo`.
- `animatingBlockId` — block currently running the slide (transient).
- Derived: `pct`, CTA label, segment colors.
Persist `status` to the backend/session so resume works.

## 7. Tokens
- Surfaces: `#000` screen, `#0f0f0f` card, `#141414` header buttons, `#161616` move row, `#1a1a1a` buttons/pills
- Borders: `#1f1f1f`, `#242424`, `#2a2a2a`, `#3a3a3a`
- Text: `#fff` primary, `#e6e6e6` pills/targets, `#d0d0d0` skip, `#a0a0a0` secondary, `#8a8a8a` disabled
- Brand coral `#FC5454`
- Radii: 12 (buttons/badge), 14 (header btn, move row), 18 (CTA), 20 (card), 999 (pills)
- Min hit target 44px everywhere.

## 8. Files
- `Leap Day Blocks v2.dc.html` — the reference prototype. Open in a browser; set Tweaks to **Slide to complete** + **COMPLETE** to see the shipped behavior.
