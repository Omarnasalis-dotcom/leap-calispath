# Handoff: Journey Achievements, Badges & Community Leaderboard

## Overview
Three connected pieces for the Journey tab:
1. **8 achievements**, each with its own **badge** (a family that clearly escalates).
2. An **achievement celebration** card: the shared sibling shell, with a different, more intense hero reveal for each level.
3. A **community leaderboard sheet** on Journey that ranks members by points from the last 7 days, with each member's badge.

Siblings: `design_handoff_pr_celebrations`, `design_handoff_workout_complete`, `design_handoff_leaderboard_share` (same shell, tokens and timeline style).

## About the design files
`Leap Journey Achievements.dc.html` is a **design reference built in HTML**, not production code. Open it in a browser with `support.js` and `journey-badges.js` next to it.
- Side panel: **ACHIEVEMENT** and **LEADERBOARD** scenario chips, **MODIFIERS** (Arabic RTL, Compact 375×667, Reduce Motion), a live **HAPTIC / SOUND CUE** readout and **REPLAY**.
- Tweaks: all mock data (`fromPoints`, `toPoints`, `date`, `communityName`, `members`, `youUsername`, `inCommunity`) plus `theme` (both / dark / light), `rtl`, `compact`, `reduceMotion`. Use the **FROM TWEAKS** chip to see them.
- `members` is written as `name=weeklyPts/badgeLevel; …` (badgeLevel 0–8).
- Tap the card to skip to the final frame. On the leaderboard, tap the COMMUNITY row to open the sheet, and scroll it to see your pinned row hand off to your in-list row.
- Below the phones: the **badge family** at 160 / 40 / 20 px on dark and light.
- `journey-badges.js`: the badge generator (exact geometry, gradients and colors). `badges/*.svg`: every badge exported at full detail (`n-name.svg`, 160) and the simplified small variant (`n-name-small.svg`, for 40 and 20).

## Fidelity
**High-fidelity.** Colors, type, spacing and timings are final. Data is mock. The Journey screen behind the sheet is a placeholder: merge the badge chip and the COMMUNITY row into the existing Journey top bar (see design_handoff_journey_points).

---

## Rules
- Achievements come from **lifetime** Journey points and never go down. A badge, once earned, is kept forever (switching programs never removes it).
- The leaderboard ranks by points earned in the **last 7 days (rolling)**. Members with 0 weekly points are not ranked.
- The leaderboard is **community-only**. Without a community: locked state with JOIN. Achievements and badges still work.
- Privacy: username, initials avatar, badge, weekly points and rank only. Never country, gender, email, full name or user ids. Initials rule (same as the share card): split the username on `. _ -`, take the first letter of the first two parts; with one part, its first 2 letters; uppercase.

## Achievements
| # | EN | AR | Lifetime pts | Material / shape | Tone |
|---|---|---|---|---|---|
| 0 | (no badge) | لا شارة | 0–99 | dashed outline slot | slot `#5a5a5a` / light `#a8a2a0` |
| 1 | RISING | الصاعد | 100 | Stone disc, 1 rim | `#A3AAB2` |
| 2 | CONSISTENT | المواظب | 300 | Tempered slate disc + 12 rhythm ticks | `#7FC0D8` |
| 3 | COMMITTED | الملتزم | 750 | Bronze octagon, dark inner disc | `#E3A774` |
| 4 | DETERMINED | المثابر | 1,500 | Forged-steel hexagon, 6 rivets, heat line | `#FF8A4C` |
| 5 | WARRIOR | المحارب | 3,000 | Crimson enamel shield, silver rim + chevron | `#F0524A` |
| 6 | CHAMPION | البطل | 5,000 | Royal-blue shield, gold rim, star, **gold wings** | `#FFD36B` |
| 7 | ELITE | النخبة | 8,000 | Amethyst crest, platinum rim + wings, **cut gem** | `#A98BFF` |
| 8 | LEGEND | الأسطورة | 12,000 | Night crest, **prismatic** rim + wings (world colours), **crown with 3 world gems**, light rays + halo | `#FF7BB0` |

`tone` drives the card border, top radial, outer glow, draw ring, progress bar and the "TO NEXT" label for that achievement. The UI accent (DONE, header label, LEAP ARENA pill, YOU) stays coral `#FC5454`.

## 1. Badges
- viewBox `0 0 160 160`, static `react-native-svg`: flat fills + `LinearGradient`/`RadialGradient` only. No filters, no blur.
- **Leap mark** at the centre (r 20–22, stroke 3, round caps): three arcs with 34° gaps at −90° / 30° / 150°, with gap dots (r = 0.17·r) in Static `#8E6BFF` (top), Power `#FF4A3D`, Endurance `#FF6B2C`. Swap for the official LeapLogo geometry when you build; the frame doesn't depend on it.
- Escalation runs on **shape** (circle → ticked circle → octagon → hexagon → shield → winged shield → gem crest → crowned crest with rays) and **add-ons** (ticks, rivets, chevron, wings, gem, crown, rays), not only on material. Gold appears only from level 6, always with blue enamel and wings, so it never reads as the podium's 1st-place gold.
- **Sizes**
  | Size | Variant | Where |
  |---|---|---|
  | 160 (128 compact) | full | celebration hero |
  | 40 | simple | Journey top-bar chip |
  | 20 | simple | leaderboard rows, podium avatar corner |
  The **simple** variant drops mark gaps/dots, ticks, rivets, inner hairlines, rays and the star; it thickens strokes to 9–10 units (≈1.2px at 20px) and turns feathers into one blade per side. Every simple badge keeps a unique silhouette and colour.
- **Layers** (for the reveals): levels 6–8 are exported as separate groups `rays`, `wingL`, `wingR`, `body`, `gem` in the same viewBox, so each can be its own `Animated.View`. Wing pivots: left `25.6% 40%`, right `74.4% 40%`; gem pivot `50% 14%`.
- Determined also has a **hot** palette (`hot: true`: `#ffe8a0 → #ff7a2c → #9e1c0c`) used only during the forge reveal.

## 2. Achievement celebration

### Layout (402×874; compact 375×667)
- **Group**: card + actions in one column, vertically centred (padding `50 24 24`; compact `34 16 16`). Actions attach 14px under the card (compact 10).
- **Card**: radius 30 (compact 26), padding `22 22 24` (compact `16 18 18`), bg `#0c0b0d` / `#fff`, 1px border tone @ .5 (light .6), top radial tone @ .16 (light .10; Legend uses the 3-spot world radial), outer glow `0 0 {spread}px rgba(tone, glow)`.
  1. Header row: Journey icon 14 + "JOURNEY" / "الرحلة" (11/600, ls 2.4, coral) · date (11/500, ls 1.6, text 5, LTR).
  2. Eyebrow "ACHIEVEMENT UNLOCKED" / "إنجاز جديد" (12/600, ls 4, text 2, margin-top 18).
  3. Hero box: height badge + 30 (compact + 16), badge 160 (compact 128) centred, glow disc 1.6× badge behind.
  4. Title: badge name 30/700, ls 2 (compact 26; Arabic Cairo −2px, lh 1.35).
  5. Warm line: "You earned the Champion badge" / "حصلت على شارة البطل" (14/400, text 3, margin-top 6).
  6. Optional skipped line (12/600, tone): "+ Warrior badge earned too" / "+ شارة المحارب أيضًا". Several: "+ Rising & Consistent badges earned too".
  7. Stats panel (margin-top 18, radius 16, 1px row border, fill white @ .025 / `#faf8f7`, padding `13 15`, gap 9):
     - Row: "LEVEL 6 OF 8" (12/600, ls 2, text 1) · "LIFETIME POINTS" (10/600, ls 1.8, text 4).
     - Bar: 8px, radius 4, track `#1c1a1d` / `#efe9e7`, fill tone + glow (Legend: world gradient → `#FFD36B`). Width = `lifetime / nextThreshold`. RTL fills from the right.
     - Line: lifetime (16/700 tabular, counting) · "/ 8,000" (13/500, text 4) · "TO ELITE" (11/600, ls 1.8, tone; end-aligned).
     - LEGEND: "12,160 PTS" · "ALL BADGES EARNED" / "حصلت على كل الشارات", bar full.
  8. LEAP ARENA pill (margin-top 16), as siblings.
- **Actions**: DONE (flex 1, 56, radius 16, coral) + SHARE 56×56 square outline. Nothing else.

### Shared timeline (seconds)
| t | What happens |
|---|---|
| 0.00–0.35 | Backdrop fades in |
| 0.05–0.60 | Card enters: opacity, translateY 40→0, scale .9→1 (easeOutBack c=1.5) |
| 0.30 | Eyebrow fades up 8px (0.5s) |
| 0.45 → LOCK | **Hero reveal** (per level, below) |
| **LOCK** | success haptic + bell (stronger per level). Outer glow peaks .5 / spread +40, settles to .26 over 0.9s. Hero glow peaks (see table), settles to .35 |
| L+0.10 | Title fades up 10px |
| L+0.20 | Warm line fades up 8px |
| L+0.30 | Skipped line (if any) |
| L+0.35 | Stats panel fades up 10px |
| L+0.45 → L+1.25 | Bar fills 0 → target and lifetime counts `fromPoints → toPoints` (easeOutCubic). Light tick at L+1.25 |
| L+0.60 | Logo pill fades up 6px |
| L+0.80 / L+0.85 | DONE / SHARE slide up 24px (0.5s) |
| L+1.50 | END. Static and complete |

LOCK per level: **1.30 · 1.50 · 1.60 · 1.60 · 1.65 · 1.85 · 2.00 · 2.40** (END 2.8 → 3.9s).

### Hero reveals (absolute seconds; "pop" = easeOutBack)
| Level | Reveal | Cues |
|---|---|---|
| 1 RISING | The empty slot is shown; a tone ring (r 72, 3px) **draws** clockwise 0.50→1.05 (strokeDashoffset). The badge pops 0.75→1.30 (scale .6→1). The slot fades 0.75→1.0. Soft glow peak .5. The ring fades out L→L+0.5 | tick 0.9 · LOCK success + bell |
| 2 CONSISTENT | Previous badge (Rising) is shown; the ring draws 0.50→1.35. At L−0.2 the old badge swells 8% and fades; the new one pops (scale .85→1, c=2). **8-spark** burst (4px, tone + white, 34 out) | ticks 0.9 / 1.2 · LOCK |
| 3 COMMITTED | As 2, and the new badge **rotates in** −40°→0. **12-spark** burst (5px, 48 out). Glow .6 | ticks 0.9 / 1.2 · LOCK |
| 4 DETERMINED | **Forge**: the badge appears red-hot (hot layer @1). Three **hammer strikes** at 0.80 / 1.20 / 1.60(=LOCK): before each, a 4px lift; on hit, squash (x+6%, y−7%, 0.2s sin), white flash .32 (.55 last), and an upward **spark spray** with gravity (10 / 10 / 18 sparks, orange/yellow/white). After each strike the hot layer cools a third (0.3s). Glow .7 | medium impact ×2 · LOCK heavy + success + bell |
| 5 WARRIOR | Previous badge shrinks to .7 and fades 0.80→1.0. The shield **drops** from scale 2.4 → 1 (easeIn cubic, 1.15→1.65) and **slams**: card shake ±7px decaying over 0.45s, flash .6, **3 shockwave rings** (1/4 vs 3px tone, 0.7→2.5, staggered 0.08s), 16-spark burst (80 out) | tick 0.9 · LOCK heavy + success + bell |
| 6 CHAMPION | Previous badge (Warrior) is shown, then **upgrades**: crossfade 0.85→1.05 with a pop. **Wings unfold** 1.05→1.75: rotate ∓95°→0 around the pivot, scale .3→1 (easeOutBack c=1.3). LOCK: a 4-point white **glint** twinkles on the right wing (0.6s), gold ring (0.8→2.0), 18 gold sparks. Glow .85 | ticks 1.0 / 1.25 / 1.55 · LOCK success + bell+ |
| 7 ELITE | Previous badge (Champion) upgrades to the crest + platinum wings (0.85→1.10). **14 particles orbit** (ellipse 86×26, accelerating, depth-faded) from 1.0. The **gem ignites** 1.60→2.0 (scale 0→1, c=2.6, flash .35, 12 micro-sparks from the gem). LOCK: 18-spark burst. Orbit fades out by L+1.1 | tick 1.0 · medium 1.6 · LOCK success + bell+ |
| 8 LEGEND | Previous badge (Elite) **charges** 0.6→1.2: trembles ±3px and grows 10%. **Prismatic burst** at 1.20: full white flash (0.45s), 12 rotating light beams in the world colours (fade out L+0.3→L+1.2), the Legend body lands (scale 1.3→1). **Wings unfold** 1.45→2.05. **Crown + 3 gems pop** 2.05→2.40. 18 world-coloured particles orbit from 1.3. LOCK: 2 shock rings (pink + gold), 24-spark world-colour burst, static rays + halo fade in L→L+0.6. Glow 1.0 | ticks 0.8 / 1.0 · heavy 1.2 · tick 2.05 · LOCK success ×2 + bell chord |

At END every transient (sparks, orbit, beams, rings, glint, flash, hot layer, previous badge) is at 0, and every badge layer is at opacity 1, transform identity.

### Behaviour
- Plays **once per achievement** (persist the highest celebrated level).
- **Multiple achievements at once**: celebrate only the highest. The "previous badge" in the reveal is the last badge already owned (or the empty slot). The skipped badges are listed in the skipped line. See chips **DOUBLE JUMP** (2,900 → 5,240: Champion, Warrior mentioned) and **FIRST EVER** (0 → 120).
- **Tap card** = jump `t` to END. Haptics that already fired stay fired; unfired ones are skipped, except LOCK, which plays once.
- **Reduce Motion**: `t = END` at once; backdrop + card + actions fade 0→1 over 200ms. No haptic sequence except one success at the end.
- **Share image** = the card view only (no outer glow, no actions), captured at END.
- Sounds respect the app mute setting. Escalation: bell (1–3) → bell + heavy impact (4–5) → brighter bell (6–7) → bell chord + double success (8).

## 3. Community leaderboard sheet

### Entry (Journey top area)
- **Badge chip** (52 tall, radius 16, 1px border): 40px simple badge + badge name (12/600, ls 1.6, tone) + lifetime points (11/500, text 4). No badge: dashed slot + "NO BADGE YET".
- **COMMUNITY row** (60 tall, radius 16, margin-top 14, coral @ .35 border + coral tint): 36px rounded icon tile (people) · "COMMUNITY" (10/600, ls 2, text 4) over the community name (15/600, ellipsis) · your rank "#9" (22/700, coral, LTR) over "THIS WEEK" (9.5/600) · chevron. Tap opens the sheet.
- No community: lock tile, "Join a community to compete", no rank. Tap opens the locked sheet.

### Sheet
- Top 190 (compact 150) to the bottom; radius 28 top; bg `#0e0d0f` / `#fff`; 1px top border; handle 38×4. Opens with translateY 105% → 0 (0.4s easeOutCubic) and the backdrop fade. **Light haptic** on open. Tap the backdrop or ✕ to close.
- **Header** (padding `14 20`, bottom divider): community name (22/700, 2 lines max) · SHARE icon button 40×40 (opens the existing leaderboard share card; dimmed and inert on an empty week; hidden when locked) · close 40×40.
  - Sub-line 1: 6px coral dot · "THIS WEEK" (11/600, ls 1.8, coral) · "· 14 MEMBERS" (text 4).
  - Sub-line 2: "Points from the last 7 days, rolling" (12/300, text 4).
- **Scroll content** (padding 0 16):
  - **Podium** (the share-card language, smaller): visual order 2·1·3, always LTR. Avatars 54 / 44 / 44, blocks 72 / 54 / 42, medal top edge + gradient, crown on 1st. A **20px badge** sits on each avatar's bottom-right corner. Username 12/500 ellipsis, points 17 / 14 /700 + PTS. Your podium avatar ring and name use coral and your block gets a 2px inset coral stroke. Blocks rise 3 → 2 → 1 at 0.45 / 0.60 / 0.75 (0.35s), no haptics. Empty places are dashed ghosts.
  - **Rows** from #4 (56 tall, radius 16, gap 6, fade up from 0.85 + 0.04·i): rank (16/600 text 3, LTR, 26 wide) · 32 avatar · username (14/500, ellipsis) + 20px badge (+ YOU tag on your row) · weekly points (16/700 tabular) + PTS. Your row: coral tint + coral border, rank in coral.
- **Pinned YOU row**: when your row is outside the visible list (and you're not on the podium), the same row is pinned at the bottom over a fade-to-sheet gradient (padding `14 16 26`). It hides as soon as your real row is fully in view (measure with `onViewableItemsChanged` on the FlatList).

### States (all chips)
| State | What shows |
|---|---|
| LOCKED | Sheet title "COMMUNITY", lock circle 68, "Join a community to compete" (22/700), body copy, JOIN A COMMUNITY (56, coral). No podium, no share |
| EMPTY WEEK | Ghost podium, dashed note "No points yet this week · Log a workout to take #1.", no rows; share dimmed; entry rank "—" |
| 1 MEMBER | You on the 1st block, 2 ghosts, note "You're the only member so far · Invite friends to compete with you." |
| 2 MEMBERS | 1st + 2nd filled, 3rd ghost |
| 14 · YOU #9 | Rows 4–14; your row starts below the fold, so it's pinned; scroll and it unpins |
| YOU #1 | You on the 1st block with crown; no pinned row |
| LONG NAMES | 30-char usernames and a long community name: names ellipsize in every column and row; the title wraps to 2 lines |
| You with 0 pts | Not ranked: pinned row shows "—" rank and "—" points |

Ties: equal weekly points share the order of who reached it first (server-side). Show distinct ranks.

## Arabic / RTL
- Card, sheet header, entry row, rows and actions are `direction: rtl` (DONE on the right, SHARE on the left; rank on the right of each row). The podium and the LEAP ARENA pill stay LTR.
- Numbers, points, ranks, dates and usernames are LTR-isolated in Oswald. Arabic strings use Cairo with letter-spacing 0. The progress bar fills from the right.
- Strings: الرحلة · إنجاز جديد · حصلت على شارة {name} · + شارة {name} أيضًا · المستوى {n} من 8 · نقاط الرحلة · حتى {next} · حصلت على كل الشارات · تم · المجتمع · هذا الأسبوع · {n} عضو · نقاط آخر 7 أيام، تتجدد يوميًا · أنت · نقطة · انضم لمجتمع لتنافس · انضم لمجتمع · لا توجد نقاط هذا الأسبوع بعد · سجّل تمرينًا لتتصدّر. · أنت العضو الوحيد حتى الآن · ادعُ أصدقاءك لينافسوك. · لا شارة بعد
- **Compact** (MODIFIERS → COMPACT, 375×667): hero badge 128, smaller paddings and gaps, title 26. Use it when the screen height is under ~760pt, or whenever DONE wouldn't be fully visible (measure the group: it must fit `screenHeight − safeAreas`). Arabic fits in both sizes at 874.

## Palette
Same as the leaderboard share card (screen, backdrop, text 1–5, medals, light-mode glow ×0.55), plus:
| Token | Dark | Light |
|---|---|---|
| card bg | `#0c0b0d` | `#fff` |
| sheet bg / border | `#0e0d0f` / `#222` | `#fff` / `#e8e4e1` |
| row bg / border | `#121113` / `#1d1b1e` | `#faf8f7` / `#efeae8` |
| bar track | `#1c1a1d` | `#efe9e7` |
| empty slot | `#5a5a5a` | `#a8a2a0` |

## Implementation notes (React Native)
- **One shared clock** per animation: `t = useSharedValue(0)` → `withTiming(END, { duration: END*1000, easing: Easing.linear })`. Every style above is a pure function of `t` in `useAnimatedStyle`. No native-driver/JS-driver mixing.
- **Badge layers** are static `react-native-svg` components (one per part), each wrapped in an `Animated.View` that animates opacity + transform only. The draw ring is the only animated SVG prop (`strokeDashoffset` on an `AnimatedCircle`, dasharray fixed at 452.4).
- **Sparks, orbit particles, beams, shock rings, glint, flash**: plain Views (fixed size) with animated transform + opacity, generated from a deterministic seed table (see `SP()` / `burst()` / `orbit()` in the reference for exact math). Beams use `expo-linear-gradient` inside a fixed-size View.
- **Counters** (lifetime points): `ReText` / animated `TextInput` with tabular figures, so only the text re-renders.
- **Haptics / sound**: `useAnimatedReaction` on `t` crossing each cue time (table above) → `runOnJS(fire)`. Mute respected.
- Leaderboard: FlatList with the podium as `ListHeaderComponent`. Pinned row = absolutely positioned copy, shown when your index isn't in `viewableItems`.

## Data
| Prop | Type | Notes |
|---|---|---|
| fromPoints / toPoints | number | lifetime before / after; levels crossed are derived |
| date | string | LTR |
| communityName | string \| null | null → locked |
| members[] | `{ username, weeklyPoints, badgeLevel }` | badgeLevel 0–8 |
| you | `{ username, weeklyPoints, badgeLevel, lifetimePoints }` | |

## Open items
- Official LeapLogo geometry to replace the mark placeholder (the frames are built around a 40–44 unit circle).
- Bell / chord sound assets (shared with siblings).
- Copy check: rolling-window line and empty/solo notes.

## Files
- `Leap Journey Achievements.dc.html`: design reference
- `journey-badges.js`: badge generator (source of truth for geometry/colours)
- `badges/`: exported SVGs (full + small for each level, plus empty slot)
- `support.js`: runtime the reference needs
