# Handoff: Leap Arena — PR Celebration Cards (Static · Endurance · Power)

## Overview
This is the modal that shows when a user sets a new personal record (PR) in any of the three worlds. All three cards share the same shell, layout and timeline. What differs per world is the accent color, the unit, and the "hero" animation in the middle of the card:

| World | Hero animation | Unit | Accent |
|---|---|---|---|
| Static | Smooth ring fills to the new hold time, then a crystal burst | seconds | `#8E6BFF` |
| Endurance | Stopwatch-bezel ticks light up one per rep, then embers rise | reps | `#FF6B2C` |
| Power | Plates drop onto a loading pin, then the number slams on top | kg | `#FF4A3D` |

## About the design files
The `.dc.html` files are **design references built in HTML**, not production code. Rebuild them in the app's own stack (React Native / SwiftUI / etc.) using its animation tools. Reanimated, Moti, SwiftUI `withAnimation`/`TimelineView` or Lottie are all fine. To preview, open each file in a browser with `support.js` next to it. Use the side panel's **REPLAY** button to watch again. Tweaks let you change the values (new result, previous best, movement name).

- `Leap Static PR Celebration.dc.html` is the Static card (option A, the hold ring).
- `Leap Endurance PR Celebration.dc.html` is the Endurance card.
- `Leap Power PR Celebration v2.dc.html` is the Power card (the plate-drop version).

## Fidelity
**High-fidelity.** Colors, type, spacing and timings are final. The name, date and values are mock data.

---

## Shared shell (all three)

### Tokens
- Font: **Oswald** 300–700. The **LEAP ARENA** wordmark uses **Michroma**; this is a placeholder until the real logo asset (SVG) arrives.
- Neutrals: `#000` screen, text `#fff` / `#d0d0d0` / `#a0a0a0` / `#8a8a8a` / `#6a6a6a`, strike line `#4a4a4a`.
- Easing curves:
  - `easeOutCubic` = `1-(1-t)^3`
  - `easeInOutCubic`
  - `easeOutBack` (c = 1.5) for the card's entry
  - `easeIn` (t²) for gravity drops (Power)

### Per-world palette
| Token | Static | Endurance | Power |
|---|---|---|---|
| accent | `#8E6BFF` | `#FF6B2C` | `#FF4A3D` |
| card bg | `#0b0a12` | `#0e0906` | `#0e0808` |
| card border | accent @ .5 | accent @ .5 | accent @ .5 (goes up to .9 on impact) |
| stats bg / border | `#100e1a` / `#1f1c2c` | `#150d09` / `#2a1a12` | `#150b0a` / `#2a1614` |
| empty track | `#1c1830` | `#22160f` (unlit tick) | — |
| logo pill border | `#2a2440` | `#3a2216` | `#3a1a18` |
| Save border / text | `#3a3160` / `#c9bbff` | `#5a3220` / `#ffb088` | `#5a2622` / `#ff9d94` |
| Share text | `#fff` | `#000` | `#fff` |
| World icon | snowflake | stopwatch | bolt (filled) |

### Layout (402×874 frame)
- **Backdrop**: `rgba(0,0,0,.78)` with `backdrop-filter: blur(6px)` over the world screen. Fades in over 0–0.35s.
- **Card**:
  - Position: absolute, top 70 (62 on Power), left/right 24.
  - Shape: radius 30, padding `22 22 24`, overflow hidden.
  - Background: a subtle radial accent glow (`rgba(accent,.15)`, ellipse at 50% 30%).
  - Shadow: `0 0 60px rgba(accent, glow)`. Glow goes from .12 to .22 while filling, jumps to about .5 at the lock, then settles at .3.
- **Card contents, top to bottom:**
  1. Header row:
     - Left: world icon (12px) + "{WORLD} WORLD" in the accent color, 11px / 600, letter-spacing 2.4.
     - Right: date "SEP 30, 2026", 11px / 500, letter-spacing 1.6, `#6a6a6a`.
  2. "NEW PERSONAL RECORD": 12px / 600, letter-spacing 4, `#d0d0d0`, centered, margin-top 20.
  3. **Hero area** (per world, see below). The value is white, and the unit label under or next to it uses letter-spacing 3.
  4. Movement name: 30px / 700, letter-spacing 1.4, centered.
     - Below it, a handle row: a 22px avatar circle with a 1.5px accent ring, then "@HANDLE" (13px / 500, `#a0a0a0`).
  5. Stats box:
     - Box: 2 columns, radius 18, padding 16/0, with a 1px divider.
     - **PREVIOUS BEST**: the value in `#a0a0a0` with a strikethrough.
     - **GAIN**: "+N {unit}" in the accent color (24px / 700), then "+NN%" in `#6a6a6a` 12px.
     - The value and its unit never wrap onto separate lines (`nowrap`). Long gains drop to 20px, and the % wraps to the next line.
  6. **LEAP ARENA** logo pill: 30px tall, radius 15, 1px border, Michroma 11px, letter-spacing 2, centered. It takes the place of the old quote.
- **Actions** (absolute, left/right 24, bottom 40, gap 12):
  - SHARE: 56px tall, radius 16, accent fill, share icon + label (16px / 700, letter-spacing 2.6), shadow `0 10px 30px rgba(accent,.3)`.
  - SAVE TO PHOTOS: 52px tall, 1.5px border (14px / 600).
  - DISMISS: text only, 36px tall, `#8a8a8a` 13px.
  - **Use icons, not emoji.**
- **Ambient particles** (Static and Endurance): after the lock, 12–14 tiny dots drift slowly upward inside the card and loop.

### Shared timeline (seconds)
| t | What happens |
|---|---|
| 0.00–0.35 | Backdrop fades in |
| 0.05–0.60 | Card enters: opacity 0→1, translateY 40→0, scale .9→1 with easeOutBack |
| 0.35–0.85 | "NEW PERSONAL RECORD" fades up 8px |
| 0.60–2.10 | **Hero fill** (per world) and the counter runs from 0 to the new value |
| **2.10 (LOCK)** | Impact: number bump (scale +12–16%, 0.35–0.4s sine), accent text-shadow glow, glow spike on the card, and the world's burst effect |
| LOCK+0.25 | Movement name and handle fade up 14px (0.5s) |
| LOCK+0.40 | Stats box fades up, and the GAIN value pops (scale 1→1.25→1, 0.35s) |
| LOCK+0.60 | Logo pill fades up 6px |
| LOCK+0.80 / +0.90 / +1.00 | SHARE / SAVE / DISMISS slide up 24px (0.5s each) |

Power's LOCK moves with the number of plates. All later steps are relative to the LOCK.

---

## Static — Hold Ring
- The ring is 220×220 with radius 92 and a 10px stroke. The track is `#1c1830`; the fill is the accent color with round caps. The ring starts at 12 o'clock and fills clockwise.
- **Fill**: `dashoffset = C × (1 − p)`, where `p = easeInOutCubic((t − 0.6) / 1.5)`. It has a drop-shadow glow of 6–16px.
- **Counter**: `round(p × newTime)`, 92px / 700, tabular numbers, with "SECONDS" underneath.
- **PREV marker**:
  - A 14px dot on the ring at angle `prev / new × 360°`, with a "PREV {n}s" label 26px outside the ring.
  - It starts as an outlined dot (`#5a5270`) and turns solid white, scaling to 1.25, when the fill passes it.
  - It fades out after the lock.
- **Lock**:
  - A pulse ring (2px accent) scales 1→1.45 and fades out over 0.9s.
  - A radial accent bloom fades out at the same time.
  - **18 crystal sparks** (5–8px squares rotated 45°, a mix of accent and white, with glow) fly out from the ring edge by 44–76px. They spin a further 90° and fade out over 0.9s.

## Endurance — Stopwatch Ticks
- The ring is a set of **tick marks**: `n = min(reps, 60)` ticks. Each tick is 16px tall; its width is `clamp(4, 12, circumference / n × .42)`. Ticks sit at radius 92 and are rotated around the center.
- **Fill**: `lit = floor(p × n)`, using the same curve as Static.
  - Ticks below the previous best light up in a dim ember color, `#7a3a1c`.
  - New ticks light up in the accent color with a `0 0 6px` glow.
  - Unlit ticks: `#22160f`.
- **Counter**: `round(p × reps)`, with "REPS" underneath.
- **PREV marker**: a 10px round dot 20px outside the ticks, with a "PREV {n}" label. It turns white when passed.
- **Lock**:
  - New ticks flash hot, from `rgb(255,227,194)` back to the accent over 0.45s, and stretch in length by 25% with the bump.
  - A pulse ring and bloom play, as in Static.
  - **24 embers** (3–6px round dots, a mix of accent and `#FFD2A8`, with glow) rise 90–180px from the top half of the ring, wobbling from side to side as they go, over 1.3s.
- Ambient particles are warm (`rgba(255,150,90,.6)`) and drift faster than Static's.

## Power — Plate Drop
- **Hero stage**: 232px tall.
  - A loading pin sits in the center: 12px wide, with a metal gradient `#2a2a2a → #5a5a5a → #2a2a2a`, fading in at 0.45s.
  - A floor line (2px, `#2a1614`) with a soft red glow ellipse under it.
- **Plate breakdown**: build the **new weight** greedily from `[20, 10, 5, 2.5, 1.25]` kg, **heaviest at the bottom**. Examples:
  - 50 → 20·20·10
  - 55 → 20·20·10·5
  - 52.5 → 20·20·10·2.5
  - 20 → 20
  - 7.5 → 5·2.5

  Plate sizes (width × height, px):
  - 20 kg: 220×24
  - 10 kg: 188×19
  - 5 kg: 158×15
  - 2.5 kg: 128×12
  - 1.25 kg: 104×10

  - Gap between plates: 3.
  - If the stack would be taller than 128px, scale every plate's height by `k = 128 / rawHeight`.
  - Hide the weight label on any plate shorter than 12px.
- **Plate style**:
  - All plates look the same: `linear-gradient(#ff7a6f, #FF4A3D 35%, #c22a20)`, 1px `#ff8f86` border, `0 0 14px rgba(255,74,61,.35)` glow.
  - Corner radius: `min(6, h / 2.4)`.
  - A white weight label (≤12px / 600) is right-aligned inside each plate.
- **Drops**:
  - Plates start dropping at 0.6s. Each one starts `min(0.3, 1.5 / plateCount)` seconds after the previous one.
  - Each drop falls from −80px to its resting spot over 0.26s with gravity easing (t²).
  - On landing: the plate squashes (scaleY down to .82 over 0.14s), bounces 3px over 0.16s, and the card shakes briefly (up to 3px).
- **Counter while loading**: "LOADED {sum} KG" at the top left (12px / 600, letter-spacing 2). It is gray until the total passes the previous best, then red. It fades out at the lock.
- **Number slam** (this moment is the LOCK):
  - The number starts falling 0.12s after the last plate lands, dropping from −260px onto the top of the stack over 0.3s with t² easing.
  - It is the new weight at 84px / 700, with "KG" next to it in accent 18px.
  - Its bottom edge rests 2px above the top plate.
  - As it starts to fall, the pin shrinks down to just below the top plate so it can't show through the digits.
- **Impact**:
  - The number squashes (scaleX 1.14 / scaleY 0.8 over 0.22s).
  - The card shakes: `sin(t·70) × 8px`, decaying over 0.4s.
  - A white flash (`#ffd6d0` at .2) fades out over 0.25s.
  - A flat elliptical shockwave (220×28, 2px accent) spreads out from under the number.
  - 12 dust sparks spray out to the left and right in small arcs.

---

## Props / data
| Prop | Static | Endurance | Power |
|---|---|---|---|
| new value | `time` (s) | `reps` | `weight` (kg, 0.25 step) |
| previous best | `previousBest` (s) | `previousBest` | `previousBest` (kg) |
| movement | `movement` | `movement` | `movement` |
| also needed | handle, date, avatar | same | same |

Gain = new − previous. Gain % = `round(gain / prev × 100)`.

## Behavior
- Show the card right after the result is saved, but only when it beats the previous best.
- **Share**: render the card (without the action buttons) as an image and open the system share sheet. **Save**: write that same image to Photos.
- **Dismiss** closes the modal. Tapping the backdrop does nothing. Let the user tap to skip to the final frame, but still play the haptics.
- **Haptics** (recommended):
  - Light haptic on each Power plate landing and on each Endurance tick where it's cheap to do.
  - Medium haptic when the Static/Endurance ring passes PREV.
  - Heavy haptic or a success notification at the LOCK.
- **Reduce Motion**: skip to the final frame, with a short 0.2s fade.

## Open items
- Real LEAP ARENA logo (SVG) to replace the Michroma wordmark.
- Avatar image source (currently shows initials).
- Decide whether the per-world quotes are dropped for good; they were replaced by the logo.

## Files
- `Leap Static PR Celebration.dc.html`
- `Leap Endurance PR Celebration.dc.html`
- `Leap Power PR Celebration v2.dc.html`
- `support.js`: the runtime the reference files need.
