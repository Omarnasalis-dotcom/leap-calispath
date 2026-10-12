# Handoff: Leap Arena · Shareable Leaderboard card (Strength · Weekly Challenge · Well-Rounded)

## Overview
This is a full-screen modal that turns a leaderboard into an animated card the athlete can share. It opens from the share icon on three boards. It's a sibling of the World PR cards (`design_handoff_pr_celebrations`) and the Workout Complete card (`design_handoff_workout_complete`): same shell, same timeline style. The hero is an **animated podium of the top 3**. Then the athlete's own **YOU row** slides in and their rank counts down to its final value.

## About the design file
`Leap Leaderboard Share.dc.html` is a **design reference built in HTML**, not production code. Open it in a browser with `support.js` next to it.
- Side panel: **REPLAY**, **SCENARIO** chips (every edge case below), and a live **HAPTIC / SOUND CUE** readout.
- Tweaks: all mock data, plus `theme` (both / dark / light), `rtl` and `reduceMotion`.
- `top3` is written as `name=score; name=score; name=score`, 1st first. Use `m:ss` for time scores. For Well-Rounded, write `name=static/power/endurance`; the total is their sum.
- Tap the card to skip to the final frame.

## Fidelity
**High-fidelity.** Colors, type, spacing and timings are final. Data is mock.

---

## Privacy (hard rules: this image leaves the app)
- Shown: **username, rank, score**, and only for the top 3 and the sharing athlete. No other rows.
- Never shown: country, flags, gender or gender filters, email, full name, user IDs, community name.
- Avatars are **initials only**. Rule: split the username on `. _ -` and take the first letter of the first two parts; if there's only one part, take its first 2 letters; then uppercase.
- The only filter that can appear is the neutral **MY COMMUNITY** chip.

## Tokens

### Shared (from the siblings)
- Font: **Oswald** 300–700. Arabic UI strings: **Cairo** (letter-spacing 0). Numbers, dates and scores always stay in Oswald and LTR.
- LEAP ARENA pill: **Michroma** 11px, ls 2, plus a 12px double-chevron mark in the accent. Both are placeholders until the official logo SVG arrives.
- Easing: `easeOutCubic`, `easeOutQuart` (rank countdown), `easeOutBack` (c = 1.5).

### Variant accents
| Variant | Accent | Card bg (dark) | Board icon | Score type |
|---|---|---|---|---|
| Strength | `#FC5454` | `#0e0808` | mountain | time (lower is better) |
| Weekly Challenge | `#FC5454` | `#0e0808` | flag | `reps` / `time` / `rounds`, set by the challenge |
| Well-Rounded | `#8E6BFF` (UI accent) + world colors Static `#8E6BFF`, Power `#FF4A3D`, Endurance `#FF6B2C` | `#0b0a12` | tri-ring (3 circles) | points, 2 decimals |

**Well-Rounded decision:** a UI needs one accent for the border, DONE, the YOU row and the glow, so it uses Static purple. The three world colors show in the tri-ring icon, in a three-spot top radial glow (purple at the left, power red in the middle, orange at the right), in each podium athlete's split bar, and in the lock sparks.

### Medals
Gold `#E8B64C` · Silver `#C9CED6` (light mode: `#8E949C` for contrast on white) · Bronze `#C98B5A`. These are used for the avatar ring, the block's top edge, the block's gradient tint and the place number. **The sharing athlete's own avatar ring uses the accent instead** of the medal color, and their name on the podium is in the accent.

### Palette
| Token | Dark | Light |
|---|---|---|
| screen | `#000` | `#f3f1ef` |
| backdrop | `rgba(0,0,0,.78)` + blur 6 | `rgba(30,18,18,.42)` + blur 6 |
| card bg | per variant (above) | `#fff` |
| card border | accent @ .5 | accent @ .45 |
| top radial | accent @ .15 | accent @ .09 |
| outer glow multiplier | ×1 | ×0.55 |
| text 1–5 | `#fff` `#d0d0d0` `#a0a0a0` `#8a8a8a` `#6a6a6a` | `#141010` `#3a3434` `#5e5858` `#6e6868` `#7a7474` |
| podium floor line | `#241a1a` | `#eee4e2` |
| podium block fill | `linear(180°, medal @ .30 → medal @ .04)` | medal @ .34 → .04 |
| YOU row bg / border | accent @ .09 / @ .45 | accent @ .06 / @ .45 |
| logo pill border | accent @ .28 | accent @ .22 |
| SHARE outline | `#3a2a2a` | `#e6d3d1` |
| particles | accent @ .6 | accent @ .35 |

---

## Layout (402×874 frame)
- **Group**: the card and the action row are **one column, vertically centered** (padding top 50 for the status bar, sides 24, bottom 24). The actions are attached to the card with a 14px gap, not pinned to the bottom of the screen.
- **Card**: radius 30, padding `22 22 24`, 1px border, overflow hidden. Outer shadow `0 0 {spread}px rgba(accent, glow)`.
  1. **Header row**. Left: board icon 13px + label (11px / 600, ls 2.4, accent): STRENGTH / WEEKLY CHALLENGE / WELL-ROUNDED. Right: date (11px / 500, ls 1.6, text 5, LTR).
  2. **Eyebrow** (12px / 600, ls 4, text 2, centered, margin-top 18): "LEADERBOARD", or **"FINAL STANDINGS"** for a weekly challenge with `live = false`.
  3. **Context** (margin-top 8):
     - Title: 30px / 700, ls 1.4, centered, max 2 lines, shrink to fit. Reference steps: ≤18 chars 30px, ≤30 chars 26px, else 22px.
     - Sub line: 13px / 500, ls 1.6, text 3, margin-top 6. Weekly + live adds a 6px accent dot before it that pulses (opacity .45 ↔ 1, about 1s period, with an 8px glow).
     - Optional chip (margin-top 10): 24px tall, radius 12, accent @ .38 border, accent tint fill, people icon 11px + "MY COMMUNITY" (10px / 600, ls 2, text 2).
  4. **Podium** (margin-top 16, padding-top 22 for crown room): a 3-column grid, gap 8, items aligned to the bottom, 1px floor line under it. **The visual order is always 2nd · 1st · 3rd** (the podium is forced LTR, even in RTL).
     | Place | Avatar | Block height | Place number |
     |---|---|---|---|
     | 1st | 60 | 84 | 30px / 700 |
     | 2nd | 48 | 60 | 22px / 700 |
     | 3rd | 48 | 46 | 20px / 700 |
     - Avatar: circle with a 2px ring (medal, or the accent for you) and a fill of the ring color @ .14. Initials in Oswald 600: 20px for 1st, 16px for the others, text 1. Your avatar also gets a 16px accent glow.
     - 1st only: a **crown** (22×16, gold) sits 19px above the avatar.
     - Username: 12px / 500, text 2, 1 line, ellipsis, margin-top 7.
     - Score: tabular Oswald 700. 1st is 18px (15px when longer than 7 chars); the others are 15px (13px when longer than 6). Unit 9px / 500, ls 1.2, text 4 (REPS / ROUNDS / PTS; no unit for time).
     - Well-Rounded: under the score, a **62×4 split bar** with three segments (Static / Power / Endurance) sized by that athlete's share of their own total, gap 1.5, radius 2.
     - Block: radius `12 12 0 0`, 2px medal top edge, medal gradient fill, place number centered near the top (padding-top 10 for 1st, 7 for the others).
  5. **YOU row** (margin-top 16): radius 18, 1px accent border, accent tint fill, padding `12 14 11`.
     - Line 1: rank (26px / 700 tabular; 20px at 5+ chars) · 34px initials avatar (accent ring) · username (14px / 600, ellipsis) + **YOU** badge (16px tall, radius 5, accent fill, 9px / 700 white) with "OF 238 WARRIORS" under it (10px / 500, ls 1.2, text 4; wraps instead of truncating so the count stays readable) · score (18px / 700) + unit, right-aligned.
     - Line 2, under a 1px accent @ .18 divider: the gap line (11px / 600, ls 1.8).
       - Ranked 2+: `+12 REPS TO #1` / `−0:16 TO #1` (time) / `+86.12 PTS TO #1`, in the accent.
       - Ranked 1st: `LEADER`, in gold.
       - Not ranked: `NOT RANKED YET` (text 3). The rank shows `—`, the score shows `—`, and the "OF…" line becomes the calm line "Post a score to join the board".
     - On the podium (#1–#3), the rank number takes the medal color.
  6. **LEAP ARENA pill** (margin-top 16): 30px tall, radius 15, mark + wordmark, gap 8.
- **Actions** (row, gap 10): **DONE** `flex:1`, 56px, radius 16, accent fill, white 16px / 700, ls 2.6, shadow `0 10px 30px rgba(accent,.3)`. **SHARE** is a 56×56 square, radius 16, 1.5px outline, share icon 20px in text 1. There are no other buttons.

## Hero timeline (seconds)
| t | What happens |
|---|---|
| 0.00–0.35 | Backdrop fades in |
| 0.05–0.60 | Card enters: opacity 0→1, translateY 40→0, scale .9→1 (easeOutBack) |
| 0.35 / 0.45 | Eyebrow fades up 8px / title block fades up 10px (0.5s each) |
| 0.75 → 1.20 | **3rd block rises** from the floor: translateY(h → 0) inside an h-tall clip, easeOutCubic 0.45s |
| 1.00 → 1.45 | **2nd block rises** |
| 1.25 → 1.70 | **1st block rises** |
| each landing | **Light haptic + tick.** The block settles (3px sin dip over 0.25s). At landing − 0.05 the avatar stack (avatar, name, score) **drops** from −26px (easeOutBack, 0.4s) and the score **counts up** from 0 over 0.6s (easeOutCubic) |
| **LOCK = 1.70** | **Success haptic + bell.** The outer glow peaks at .5, spread +40, then settles to .26 over 0.9s. A **gold shimmer** (45%-wide white @ .55 diagonal band) sweeps across the 1st block in 0.6s. A **pulse ring** (2px gold, inset −4) on the 1st avatar scales 1→1.7 and fades (0.8s). The **crown** pops in (easeOutBack 0.35s). An **18-spark burst** (4–6px squares rotated 45°, gold / white / pale gold; Well-Rounded uses the three world colors) flies 36–72px out from the 1st avatar, mostly upward, spinning and fading over 0.9s |
| L+0.25 | **YOU row** fades up 16px (0.5s) |
| L+0.25 (on podium) | Instead of a countdown, **your block pulses**: inset 2px accent stroke + 22px inner accent glow, 2 beats over 1.2s, resting at .35. **Light haptic** |
| L+0.30 | Ambient particles fade in (13 dots, accent, drifting up) |
| L+0.40 → L+1.40 | **Rank counts down** from `totalWarriors` to `rank` (easeOutQuart). Ranked and off the podium only, and skipped when rank = total |
| L+1.40 | Settle: rank scales up 14% (sin, 0.3s) with an accent text-glow. **Light tick** |
| L+0.60 | Logo pill fades up 6px |
| L+0.80 / +0.85 | DONE / SHARE slide up 24px (0.5s) |

End of timeline ≈ 3.4s. The final frame is static and complete.

## Implementation notes (React Native)
- **One shared clock**: `useSharedValue(t)` driven by `withTiming(END, linear)`. Every value above is a pure function of `t` and the data, computed in `useDerivedValue` / `useAnimatedStyle`. Don't mix native-driver and JS-driver animations.
- **Podium blocks** are Views: animated `translateY` inside a fixed-height `overflow: hidden` parent. The block gradient is `expo-linear-gradient` as an **absolute fill inside the fixed-size block**. Same for the shimmer band (fixed size, animated `translateX`).
- **Sparks / pulse / crown** are Views with animated transform and opacity. No SVG animation is needed. The crown and the icons are static `react-native-svg`.
- **Counters** (scores, rank): derive the displayed string from `t` on the UI thread. Use `ReText` or an animated `TextInput`, with tabular figures so widths don't jump.
- **Haptics / sound**: fire from `useAnimatedReaction` when `t` crosses each landing time (light), LOCK (success + bell) and the rank settle or podium pulse (light). Sounds respect the app's mute setting. Empty podium places fire nothing.
- **Share image**: capture the **card view only** (no outer glow, no actions). By the end, every element is fully opaque and in its final place; sparks, pulse and shimmer are at 0.
- **Tap card** = jump `t` to END. Haptics that already fired stay fired; unfired ones are skipped, except LOCK, which plays once.
- **Reduce Motion**: set `t = END` at once and fade the backdrop + card + actions 0→1 over 200ms. Particles don't drift and the live dot doesn't pulse.

## Data
| Prop | Type | Notes |
|---|---|---|
| variant | `'strength' \| 'weekly' \| 'wellRounded'` | picks the accent, icon and score type |
| date | string | always LTR |
| title | string | 2 lines max, shrink to fit |
| subLine | string | |
| live | boolean | weekly only. false → eyebrow "FINAL STANDINGS", no live dot |
| communityScoped | boolean | shows the MY COMMUNITY chip |
| scoreType | `'time' \| 'reps' \| 'rounds' \| 'points'` | Strength = time, Well-Rounded = points |
| top3[] | `{ username, initials, score, isYou }` | 0–3 entries |
| totalWarriors | number | the countdown start |
| you | `{ rank \| null, username, score, gapToFirst, isLeader }` | rank null = not ranked |
| wellRounded only | per athlete `{ staticPts, powerPts, endurancePts }` | split bar |

Formatting: time `m:ss` (or `h:mm:ss` when ≥ 1h) · reps/rounds `toLocaleString('en-US')` → "1,240" · points 2 decimals, grouped → "1,204.75". Time gaps are written with `−` (you need to be faster); everything else uses `+`.

## Edge cases (all available as SCENARIO chips)
- **You #1**: your avatar is on the 1st block with an accent ring; the rank shows gold "#1"; the gap line reads "LEADER"; your block pulses; no countdown.
- **You #2 / #3**: same, with your block pulsing and the rank in the medal color. The gap line still shows the distance to #1.
- **You #14 / #238**: the countdown runs from the total. When rank = total (#238 of 238), the number is static (no countdown, no settle tick).
- **Not ranked**: the podium plays as usual. The YOU row shows `—`, "NOT RANKED YET" and the calm line. No countdown.
- **Only 1 or 2 on the board**: empty places keep their slot and height. The block and avatar are drawn as **dashed ghosts** (text 5, 60% opacity) with name "—" and no score. They rise on the same rhythm but fire no tick. The layout never collapses.
- **Long data**: 30-char usernames ellipsize per column and in the YOU row. A 51-char title drops to 22px over 2 lines. 1,240 reps and a 5-digit total ("OF 12,840 WARRIORS", "#12840" while counting) step down in size.
- **Weekly live vs. final** · **time vs. reps**: the eyebrow, the live dot, the gap sign and the unit all switch.
- **Community-scoped**: chip shown; public: no chip.
- **Arabic / RTL**: the card and actions are `direction: rtl`, so the header, YOU row and actions mirror (DONE on the right, SHARE on the left). The podium stays LTR (2·1·3). Ranks, scores, dates and usernames are LTR-isolated in Oswald. The LEAP ARENA pill stays LTR.
  - Strings: لوحة الصدارة · الترتيب النهائي · القوة · التحدي الأسبوعي · متكامل · مجتمعي · أنت · من {n} محارب · للمركز الأول · في الصدارة · غير مصنّف بعد · سجّل نتيجة لتنضم للترتيب · عدّة · جولة · نقطة · تم
- **Light mode**: see the palette above. Glow multiplier 0.55.

## Design decisions vs. brief
- I kept the suggested podium rise (3 → 2 → 1). I added a **crown** and an **avatar pulse ring** on #1 at the lock, so the lock reads clearly even in the static share image (crown + shimmer-lit gold block).
- The rank countdown uses **easeOutQuart**, so big totals spin fast and then slow into place, and the final digits are readable before the settle.
- Ghost places rise on the same rhythm so the timing feels the same whether 1 or 3 people are on the board.

## Open items
- Official LEAP ARENA logo SVG.
- Bell sound asset (shared with the siblings).
- Confirm the not-ranked calm line copy.

## Files
- `Leap Leaderboard Share.dc.html`: design reference
- `support.js`: runtime the reference needs
