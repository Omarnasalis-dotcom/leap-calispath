# Handoff: Leap Arena — "Workout Complete" milestone card

## Overview
A full-screen celebration modal shown when the athlete finishes a training day in the workout runner (every block logged). It replaces the static stats card. It is a sibling of the World PR cards (`design_handoff_pr_celebrations`): same shell, same timeline style. Its own hero is a **segmented session ring**: one segment per block, in workout order, in that block's color. At 100% the segments fuse into one solid ring.

## About the design file
`Leap Workout Complete.dc.html` is a **design reference built in HTML**, not production code. Open it in a browser with `support.js` next to it.
- Side panel: **REPLAY**, **SCENARIO** chips (all edge cases below), and a live **HAPTIC / SOUND CUE** readout that shows when each cue fires.
- Tweaks: all mock data, `theme` (both / dark / light), `rtl`, `reduceMotion`.
- `blocks` is a comma list; prefix a block with `-` to mark it missed: `Warm-up, -Skills, Strength`.
- Tap the card to skip to the final frame.

## Fidelity
**High-fidelity.** Colors, type, spacing and timings are final. Data is mock.

---

## Tokens

### Shared (from the PR cards)
- Font: **Oswald** 300–700. Arabic UI strings: **Cairo** 400–700 (Oswald has no Arabic glyphs). Numbers always stay in Oswald.
- LEAP ARENA wordmark: **Michroma** 11px, ls 2 + 12px double-chevron mark in accent. Both are placeholders until the official logo SVG arrives.
- Easing: `easeOutCubic` = `1-(1-t)^3`, `easeInOutCubic`, `easeOutBack` (c = 1.5).

### Accent
- Training red `#FC5454` (card border, header label, Share fill, pulse, glow).
- Block accents (hero only), matched by block name:

| Block | Color |
|---|---|
| Warm-up | `#C9A227` |
| Skills | `#8b5cf6` |
| Strength | `#FC5454` |
| Accessories | `#f97316` |
| Cool-down | `#5b8def` |
| anything else | `#FC5454` |

### Palette
| Token | Dark | Light |
|---|---|---|
| screen | `#000` | `#f3f1ef` |
| backdrop | `rgba(0,0,0,.78)` + blur 6 | `rgba(30,18,18,.42)` + blur 6 |
| card bg | `#0e0808` | `#fff` |
| card border | `rgba(252,84,84,.5)` | `rgba(252,84,84,.45)` |
| top radial glow | `rgba(252,84,84,.15)` | `rgba(252,84,84,.09)` |
| outer glow multiplier | ×1 | ×0.55 |
| text 1 / 2 / 3 / 4 / 5 | `#fff` `#d0d0d0` `#a0a0a0` `#8a8a8a` `#6a6a6a` | `#141010` `#3a3434` `#5e5858` `#6e6868` `#7a7474` |
| stats bg / border (divider) | `#150b0b` / `#2a1616` | `#fbf6f5` / `#f0e2e0` |
| ring track (unlit) | `#1f1414` | `#f1e8e7` |
| logo pill border | `#3a1a1a` | `#efd9d7` |
| DONE border / text | `#3a2222` / `#d0d0d0` | `#e6d3d1` / `#3a3434` |
| particles | `rgba(255,140,140,.6)` | `rgba(252,84,84,.35)` |
| SHARE | `#FC5454` fill, `#fff` text | same |

---

## Layout (402×874 frame)
- **Card**: absolute, top 58, left/right 24. Radius 30, padding `22 22 24`, overflow hidden, 1px border. Outer shadow `0 0 {spread}px rgba(252,84,84,{glow})` (see timeline).
- **Contents, top to bottom:**
  1. Header row. Left: dumbbell icon 12px + "TRAINING" (11px / 600, ls 2.4, accent). Right: date (11px / 500, ls 1.6, text 5).
  2. Eyebrow "WORKOUT COMPLETE" (12px / 600, ls 4, text 2, centered), margin-top 20. At 0% it reads **"SESSION LOGGED"** (see edge cases).
  3. **Hero** 212×212, margin-top 12, centered.
  4. Program name: 30px / 700, ls 1.4, centered, max 2 lines (`numberOfLines={2}` + `adjustsFontSizeToFit`, min 22px). Reference steps: ≤22 chars 30px, ≤32 chars 26px, else 22px. Day name under it: 13px / 500, ls 1.6, text 3, margin-top 6. Block margin-top 16.
  5. **Stats box**, margin-top 18: radius 18, 1px border, 1px dividers (made with a 1px grid gap over the border color). Uses a 6-column grid:
     - 4 stats → 2×2 (each spans 3).
     - 5 stats (bodyweight logged) → 3 on top (span 2) + 2 below (span 3). No empty cells.
     - Cell padding 14/16. Label 10.5px / 500, ls 2, text 4, one line with ellipsis. Value 24px / 700 tabular, `nowrap`. It drops to 20px when it's longer than 6 chars (or longer than 5 in a 3-column row).
     - BLOCKS DONE shows "4" + "/5" (13px / 500, text 5). BODYWEIGHT shows "78.5" + "KG" the same way.
  6. LEAP ARENA pill, margin-top 18: 30px tall, radius 15, 1px border, mark + wordmark, gap 8.
- **Actions** (absolute, left/right 24, bottom 36, gap 10):
  - SHARE: 56px, radius 16, accent fill, share icon 18 + label 16px / 700, ls 2.6, shadow `0 10px 30px rgba(252,84,84,.3)`.
  - DONE: 48px, radius 16, 1.5px outline, 14px / 600, ls 2.4. Closes the modal.
  - No "Save to photos". Icons, never emoji.

## Hero: segmented session ring
- SVG 212×212, center 106, **R = 90, stroke 12, butt caps**. Starts at 12 o'clock and runs clockwise (counter-clockwise in RTL).
- `n` = block count. Gap between segments: `gapDeg = n === 1 ? 0 : min(8°, 360/n × 0.12)`. `segLen = (C − n·gapLen) / n`, segment `i` starts at `i·(segLen+gapLen) + gapLen/2`.
- Each segment is a `<Circle>` drawn with `strokeDasharray = "{len} {C}"` and `strokeDashoffset = −start`, inside a group rotated −90°. Layers per segment:
  1. track (always, track color, full `segLen`)
  2. glow: same arc, stroke 22, block color at opacity `.16` (+.25 while flashing), × theme glow multiplier. This stands in for a blur filter, so it's buildable in react-native-svg.
  3. fill: block color, `len = segLen × p`
  4. landing flash: white arc, opacity `.7 → 0` over 0.3s after the segment lands
- **Missed block**: the segment is never filled. When its turn comes, a gap marker fades and scales in (0.25s): a circle r 4 at the segment's midpoint on the ring line, card-bg fill, 1.5px text-5 stroke. No tick.
- **Center**: completion % at 76px / 700 tabular, with "%" at 30px / 600 in text 3. "COMPLETE" under it (11px / 500, ls 3, text 4, margin-top 6).
  - Counter = `round(pct × Σ p_i / completedCount)`, so it only climbs while a completed segment is filling and holds still across missed ones.

### Hero timing (scales by block count)
```
D       = clamp(1.2 + n × 0.125, 1.4, 2.2)     // 1 block 1.4s · 5 blocks 1.825s · 8 blocks 2.2s
segDur  = n === 1 ? D : min(0.45, D / n × 1.4) // segments overlap slightly (cascade)
step    = n === 1 ? 0 : (D − segDur) / (n − 1)
start_i = 0.6 + i × step
p_i     = easeOutCubic((t − start_i) / segDur) // n === 1: easeInOutCubic (one smooth sweep like Static)
LOCK    = 0.6 + D                              // the last segment lands exactly here
FUSE    = LOCK + 0.35                          // 100% only
C0      = 100% ? FUSE : LOCK                   // content cascade anchor
```

## Timeline (seconds; the 5-block example in brackets)
| t | What happens |
|---|---|
| 0.00–0.35 | Backdrop fades in |
| 0.05–0.60 | Card enters: opacity 0→1, translateY 40→0, scale .9→1 (easeOutBack) |
| 0.35–0.85 | Eyebrow fades up 8px |
| 0.60 → LOCK [2.425] | Segments light in order. Each landing = **light haptic + tick**. Outer glow .12 → .22 with progress |
| **LOCK** | **Success haptic + bell**. Number bump (sin, 0.4s): +12% at 100%, +6% partial. Pulse ring (2px accent, inset 8) scales 1→1.45 (100%) / 1→1.25 (partial) and fades out over 0.9s (opacity .7 / .4). Radial bloom .32 / .16. Text-shadow glow on the number. Glow peaks at .5 (100%) or .32 (partial) |
| LOCK → FUSE (100% only) | Gaps close to 0 (easeInOutCubic, 0.35s). The segments become one continuous ring that keeps its color bands |
| **FUSE** (100% only) [2.775] | Rigid haptic. White ring flash: opacity .85→0 and stroke 14→12 over 0.45s. Second number bump +10% (0.35s). **22 sparks** (4–6px squares rotated 45°, colored with the completed blocks' colors, every 4th white, with glow) fly 40–74px out from the ring, spinning 90° more and fading over 0.9s. Glow settles .5 → .3 |
| C0+0.25 | Program name + day name fade up 14px (0.5s) |
| C0+0.30 | Ambient particles start fading in (13 dots, 2–4px, drift up 12–27px/s, loop) |
| C0+0.40 | Stats box fades up 14px |
| C0+0.60 | Logo pill fades up 6px |
| C0+0.80 / +0.90 | SHARE / DONE slide up 24px (0.5s each) |

Final glow at rest: 100% `.3`, partial `.22`, 0% `.12`.

## Implementation notes (React Native)
- **One shared clock.** Drive everything from one `useSharedValue(t)` (e.g. `withTiming(END, {duration, easing: linear})`). Every value above is a pure function of `t` (and of the data), computed in `useDerivedValue` / `useAnimatedProps`. Don't mix the native and JS drivers.
- Ring arcs: `Animated.createAnimatedComponent(Circle)` with animated `strokeDasharray` / `strokeDashoffset` / `strokeOpacity`. Per-segment props come from the same `t`.
- Haptics/sound: fire from `useAnimatedReaction` when `t` crosses each `land_i`, `LOCK` and `FUSE` (`runOnJS`). Light impact per segment. `notificationAsync(Success)` + bell at LOCK. Rigid impact at FUSE. Sounds respect the app mute. Missed segments fire nothing.
- `expo-linear-gradient` isn't needed. The top glow is a fixed-size radial (SVG `RadialGradient` in an absolute fill). Never wrap auto-sized content in a gradient.
- **Share image**: capture the card view only (no outer glow, no actions). Every element's final state is fully opaque and in place. Sparks, pulse and flash are all at 0 by then, and particles are decorative. The final static frame is complete.
- **Tap card** = jump `t` to its end (cancel the timing, set `t = END`). Haptics already fired stay fired. Unfired ones are skipped, except the LOCK success haptic, which still plays once.
- **Reduce Motion**: set `t = END` right away and fade the backdrop + card + actions 0→1 over 200ms. No particles drift.
- **Backdrop tap** does nothing. DONE closes the modal.

## Data
| Prop | Type | Notes |
|---|---|---|
| programName | string | 2 lines max, shrink to fit |
| dayName | string | |
| date | string | always rendered LTR |
| blocks[] | `{ name, accentColor, status: 'completed' \| 'missed' }` | workout order |
| blocksCompleted / blocksTotal | number | |
| completionPct | number | `round(completed / total × 100)` |
| totalReps | number | `toLocaleString('en-US')` → "1,240" |
| exercisesDone | number | |
| durationSeconds | number | `m:ss`, or `h:mm:ss` when ≥ 1h |
| bodyweightKg | number \| null | only if logged this week. null → 4-stat grid |

## Edge cases (all available as SCENARIO chips)
- **1 block**: no gaps; one smooth 1.4s sweep like the Static ring, then lock (and fuse if completed). The fuse is invisible with no gaps, so only the flash and sparks play.
- **8 blocks**: gap ~5.4°, segDur 0.385s, step ~0.26s. Hero lasts 2.2s.
- **100%**: full lock + fuse + flash + sparks.
- **Partial** (3 of 5, Skills and Accessories missed): those two get gap markers and never light. Calm lock: smaller bump, softer pulse, no fuse, no flash, no sparks.
- **0% (everything missed)**: no ticks. The lock is a soft haptic with **no bell**: no bump, pulse, bloom or glow peak. The counter stays at 0%. Eyebrow switches to **"SESSION LOGGED"** so the card stays honest and dignified. *This is a proposal; revert to "WORKOUT COMPLETE" if you prefer one string.* Particles turn neutral gray at 30%.
- **Long data**: a 43-char program name drops to 22px over 2 lines. Duration 1:32:10 and reps 1,240 drop to 20px, nowrap.
- **Bodyweight missing**: the grid reflows from 3+2 to 2×2 with no empty cell.
- **Arabic / RTL**: card and actions use `direction: rtl`, so the header mirrors (label right, date left) and stat labels align right. Arabic strings are set in Cairo with letter-spacing 0. All numbers, %, the date and "4/5" are LTR-isolated in Oswald. The ring runs **counter-clockwise** from 12 o'clock (the SVG is mirrored with `scale(-1,1)`), and the spark angles mirror too. The LEAP ARENA pill stays LTR.
  - Strings: تدريب · اكتمل التمرين · تم تسجيل الجلسة · مكتمل · البلوكات · المدة · إجمالي العدّات · التمارين · وزن الجسم · كغ · مشاركة · تم
- **Light mode**: the palette table above. The glow multiplier is 0.55 so the red bloom doesn't wash out on white.

## Design decision vs. brief
The segmented ring was kept. It reads as "the blocks come together", maps one-to-one to haptic ticks, and sits naturally next to the Static ring and the Endurance bezel. The **fuse** (gaps closing) is the 100% extra beat. The color bands stay visible after fusing, so the share image still shows the shape of the session.

## Open items
- Official LEAP ARENA logo SVG (the mark + Michroma wordmark are placeholders).
- Confirm "SESSION LOGGED" for 0%.
- Bell sound asset.

## Files
- `Leap Workout Complete.dc.html`: design reference
- `support.js`: runtime the reference needs
