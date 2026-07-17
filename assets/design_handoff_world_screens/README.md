# Handoff: Gamified World Screens Redesign (Power, Strength, Static, 1MM/Endurance)

## Overview
UX redesign of the four "world" screens in the Leap calisthenics app — Power, Strength, Static, and 1MM (Endurance). Each screen tracks the user's progress in a specific training discipline: rank vs. other users, a total score, tier/level progression, per-exercise logging circles, and (where applicable) a leaderboard and a next-milestone card. The redesign fixes a recurring set of UX bugs found across the original screens and establishes a consistent, honest, and more tappable interaction pattern that should now be applied consistently to all four (and any future "world" screens).

## About the Design Files
The files in this bundle are **design references built as interactive HTML prototypes** (self-contained `.dc.html` files that run in a browser) — they are not production code to copy directly into the app. The task is to **recreate these designs in the app's real codebase** (its existing iOS/Android/React Native/web stack, whatever that is) using the codebase's existing component patterns, navigation, and data layer. Treat the HTML/CSS/JS here as an exact visual and interaction spec, not as a library to import.

## Fidelity
**High-fidelity.** Colors, typography, spacing, iconography, and interaction states shown are final-intent, not placeholders. Reproduce them pixel-for-pixel where feasible; where the target platform has its own equivalent (e.g. native SF Symbols instead of inline SVG, or platform-native round-rect buttons), keep the exact metrics (sizes, radii, spacing, color) called out below.

## Original bugs fixed (apply this pattern everywhere)
These same issues appeared, in some combination, on every one of the 4 screens. Fix all of them, everywhere, not just where a screenshot happened to show them:

1. **Progress rings/bars that render 100% full at 0 progress.** The original app drew the "total score" ring and several milestone/progress bars with a full stroke/fill even when the underlying value was `0.00`, which visually claims "complete" when nothing has happened yet. Fix: ring stroke-dashoffset and bar width must always be computed from the real value (`0` renders as an empty/near-invisible track), never hard-coded full.
2. **Confusing empty-state copy.** Placeholders like `#--`, `+0`, a bare `-`, or two stacked placeholder rows per exercise circle read as broken/loading UI. Fix: use explicit, friendly copy — "UNRANKED" instead of `#--`, "TAP TO LOG" / "TAP TO TIME" under an exercise circle with no logged value yet, one number per circle (not two ambiguous placeholder rows).
3. **Tiny tap targets.** The only interactive affordance on each exercise circle was a small `+` or stopwatch badge (~28–32px), well under the 44px minimum. Fix: the entire circle (80–100px) is the tap target; the small colored badge in the corner is decorative/reinforcing, not the only hit area.
4. **Identical circles with no way to visually distinguish exercises.** All exercise circles used the same ring + text with no icon, forcing users to read every label. Fix: a distinct linear icon per exercise (pull-up bar, dip bars, squat chevrons, muscle-up, handstand variants, push-up/row/squat variants, etc.), so the row scans visually before reading text.
5. **Horizontal tab/pill rows that crop abruptly at the screen edge** with no indication more content is scrollable. Fix: a fade-to-background gradient over the last ~36px plus a small `›` arrow hint, so users know to swipe.

## Screens

### 1. Power (`Leap Power Screen - Redesign.dc.html`)
**Purpose:** Track "Power" discipline — pull-up, dip, squat, muscle-up rep counts, an aggregate Power Score, and progress to the next milestone tier ("AMPERE").
**Accent color:** `#FF4B3E` (red). **Background:** `#050302` with a faint radial red glow at the top (`radial-gradient(120% 60% at 50% 0%, rgba(255,74,62,0.10), transparent 60%)`).

**Layout (top → bottom, single scrolling column, 402px reference width):**
- Top pill button, full width minus 20px side margins, 50px tall, pill radius, 1.5px border in accent @ 55% opacity, translucent accent fill, centered "POWER WORLD" label (15px, weight 700, letter-spacing 3px) with a small lightning-bolt icon. Tap → navigate to the discipline's world/leaderboard hub.
- 3-circle row, centered, 10px gaps, 26px top margin:
  - Left circle: 96×96px, 1.5px white-14%-opacity border, no fill. Contents: "GLOBAL RANK" label (8.5px/700/1px tracking, 45% white), big rank number (24px/800, white) OR "UNRANKED" (14px/800, 35% white) if the user has 0 total points, "OF WORLD" caption (8px/600).
  - Center circle: 150×150px. An SVG ring (68px radius, 6px stroke) — background track at accent 15% opacity, foreground arc in accent color, `stroke-dasharray = circumference`, `stroke-dashoffset = circumference - circumference * (score/100)`, rotated -90° so it starts at 12 o'clock, with a 0.6s ease transition on offset changes. Center text: "POWER SCORE" (10px/700, accent color), big total score number (33px/800, 2 decimals), "TOTAL" caption. A 44×44px circular badge overlaps the bottom-right of the ring (3px border matching page background, accent fill, bar-chart icon) — tap → view stats.
  - Right circle: same style as left, showing "LEVEL GAP" label, gap-to-next-milestone number, "PTS TO AMPERE" caption.
- Section heading "YOUR PEAK PERFORMANCE" (20px/800, 1.5px tracking, centered, 36px top margin).
- Horizontally scrollable pill-tab row (36px top margin): "OVERALL POWER" (active — accent border + fill + 👑 emoji), "VOLTAIC", "AMPERE", "STATIC" (inactive — 1.5px white-16% border). 40px tall pills, 10px gaps, 20px side padding. Right edge has the fade+arrow scroll hint described above.
- 4-exercise-circle row (26px top margin, `justify-content: space-between`, 20px side padding): Pull-up, Dip, Squat, Muscle-up. Each is an 80×80px circle: SVG progress ring (34px radius, 5px stroke, same honest-progress rule as above, this time filling toward "5 logged reps = 100%"), centered icon (18×18 linear SVG specific to the exercise) + rep count number (only shown once count > 0), a 34×34px circular "+" badge bottom-right (3px border matching bg, accent fill). Below the circle: exercise name (11px/700), then either "`{count}` LOGGED" (accent color, 9px/700) or "TAP TO LOG" (9px/600, 35% white) depending on whether that exercise has any logged reps.
- Milestone card (32px top margin, 20px side margins): 24px radius, 1.5px accent border @ 32% opacity, accent fill @ 6% opacity, 20px padding. Row: 44×44px rounded-12px icon tile (accent 16% fill, trophy/shield icon) + "`{score}` Points to AMPERE" (19px/700) + "YOUR NEXT MAJOR MILESTONE" caption (11px/700, 1px tracking, 45% white). Below: an 8px-tall pill-track progress bar (accent @ 15% opacity track, solid accent fill, width = score%, 0.5s transition — **must render as an empty track at 0%**, this was the biggest bug on this screen type). Below that: "PROGRESS" label (left) and "`{score}` / 100 PTS" (right, accent color, 13px/700).

**Bottom tab bar:** fixed to the bottom of the screen (not part of the scroll area), black background, 1px top border (8% white), 5 evenly-spaced items (Profile / Strength / Power / Static / 1MM), each a stacked icon (20×20 linear SVG) + 9px/700 uppercase label. The active tab (Power) shows a small 20×3px accent-colored pill above its icon and renders both icon and label in the accent color; inactive tabs are 40% white.

**Interactions:** Tapping any of the 4 exercise circles increments that exercise's logged rep count by 1, triggers a brief 1.1× scale "pulse" (250ms) on that circle, updates its ring fill, updates the aggregate Power Score ring/number, and updates the milestone progress bar — all live, no page reload.

**Design tokens:** Font — Barlow Condensed, weights 500/600/700/800, Google Fonts. Corner radii — 999px (pill/circle), 24px (cards), 12–16px (small tiles/badges). Border weight — 1.5px throughout. Shadow — none (flat design, glow badges use a colored circular fill with a border matching the page background instead of a drop shadow).

---

### 2. Strength (`Leap Strength Screen - Redesign.dc.html`)
**Purpose:** Track tier-based strength progression (a 9-tier ladder e.g. Strategos → Olympian → Demigod → Eternity), a timed "trial" challenge to advance tiers, and a gender-filterable leaderboard.
**Accent color:** `#FF4B3E` (red, same as Power — this and Power share the "red" half of the app's world-color system). **Background:** same treatment as Power.

**Layout:**
- Same top pill ("STRENGTH WORLD", icon is crossed swords instead of a bolt).
- Same 3-circle row pattern as Power, but center circle shows "TIER 7" / "OLYMPIAN" / "`{pct}`% TO TIER 8" instead of a raw score, and the two side circles are "RANK" (real number, e.g. `#4`) and "GAP" (a real time delta, e.g. `2'15"`, captioned "TO #1 SPOT") — **both must always show real, consistent numbers**; the original bug here was the rank circle claiming "no time set yet" directly next to a tier ring that was already 78% complete, which contradicts itself.
- A labeled progress bar directly under the 3 circles: "TIER 7 OF 9" (left) / "`{pct}`% COMPLETE" (right, accent color) over an 8px pill track — same honest-fill rule.
- "STRENGTH TIERS" section heading (12px/700, 3px tracking, 50% white), then a horizontally scrollable row of 92px-wide tier chips (10px gaps), each in one of 3 explicit states — don't just use "filled vs. padlock":
  - **Complete**: green (`#4ADE80`) 1.5px border @ 40% opacity, green 8% fill, checkmark icon, tier name, "COMPLETE" caption in green.
  - **Current**: accent-color border + 16% fill + `box-shadow: 0 0 16px rgba(255,74,62,0.35)` glow, "CURRENT" caption, tier name, tier number.
  - **Locked**: 1.5px white-10% border, 3% white fill, 55% opacity overall, a padlock icon, tier name, "AT TIER `{n}`" caption stating exactly what unlocks it.
  Scroll fade + arrow hint on the right edge, same as Power's tab row.
- "Next Challenge" card (30px top margin, same 24px-radius/accent-border/6%-fill card style as Power's milestone card): "NEXT CHALLENGE" caption, a headline stating the actual target ("Beat 9:45 to reach Demigod" — not a generic label), then a 52px-tall solid-accent CTA button "START OLYMPIAN TRIAL" (16px/800, dark text on accent fill for contrast).
- "LEADERBOARD" heading + "`{n}` WARRIORS" caption, then a 3-way segmented filter (ALL / MALE / FEMALE, 38px tall pills, active = solid accent fill with dark text, inactive = 1.5px white-14% border).
- Leaderboard list: each row is a full-width 60px-min-height tappable card (not just a small time badge) inside one rounded-18px container with row dividers — rank badge (28px circle, gold/silver/bronze/accent tinted background + a plain number, not an emoji trophy, so all ranks read consistently), country flag emoji, username (truncates with ellipsis if long), and a time value in a small accent-tinted pill on the right.

**Interactions:** Tapping "START OLYMPIAN TRIAL" increments the tier-progress percentage by +6 (demonstrating what a completed attempt does to the ring above); in production this should submit the actual trial result and recompute tier progress server-side.

---

### 3. Static (`Leap Static Screen - Redesign.dc.html`)
**Purpose:** Track static-hold skills (handstand variants, front/back lever, planche) with a tier ladder (Stone/Iron/Titan) and a skill sub-filter (Handstand/Front Lever/Back Lever/Planche), plus per-hold timers.
**Accent color:** `#8B5CF6` (purple). **Background:** `#050308` with the same radial glow treatment, tinted purple.

**Layout:** Same overall skeleton as Power (top pill "STATIC WORLD", 3-circle row: STATIC RANK / STATIC SCORE (center ring) / GAP TO RANK UP), same honest-empty-state rule (rank circle shows "UNRANKED" not "#--" when score is 0; center ring is a true 0%-filled arc, not a full circle, when score is 0).

**Two distinct, explicitly labeled tab rows** (this is Static's specific fix — the original had two visually-identical pill rows with no indication of what each one controlled):
- "TIER" label (10px/700, 2px tracking, 40% white) above a scrollable row: OVERALL STATIC (active, 👑) / STONE / IRON / TITAN.
- "SKILL" label above a second scrollable row: HANDSTAND (active, solid accent fill) / FRONT LEVER / BACK LEVER / PLANCHE (inactive options at 55% opacity to read as "not yet selected," not locked).

- 3-exercise-circle row (Wall Handstand / Freestanding Handstand / One Arm Handstand), 100×100px circles (slightly larger than Power's 4-up row since there are only 3), each: SVG ring (43px radius, 5px stroke, honest fill toward a 30-second target), a hold-specific icon, a live seconds counter, "SEC" caption, and the same 34px "+"-badge / whole-circle-tappable pattern as Power. Below: "PB `{n}`s" once a hold has been logged, else "TAP TO TIME."
- Milestone card: "Log a hold to rank up" headline, "YOUR NEXT TARGET: `{n}`s WALL HANDSTAND" caption (states the actual target, not a generic label), pill progress bar — **this bar rendering fully filled at 0.00 pts was the single most misleading bug found across the whole app; it must always start empty and fill only with real logged seconds.**

**Interactions:** Tapping a hold circle adds 5 seconds to that hold's logged time, pulses the circle (1.08× scale, 260ms), updates its ring, updates the aggregate Static Score ring, and updates the milestone bar toward the 30-second target.

---

### 4. 1MM / Endurance (`Leap Endurance Screen - Redesign.dc.html`)
**Purpose:** Track high-rep endurance/bodyweight-conditioning movements across a difficulty ladder (Entry/Main/Advanced), 6 exercises at once.
**Accent color:** `#FF6B35` (orange). **Background:** `#050301` with the radial glow tinted orange.

**Layout:** Same 3-circle header pattern ("1MM RANK" / "1MM SCORE" center ring / "GAP TO RANK UP"), same single scrollable tier-tab row (ENDURANCE active / ENTRY / MAIN / ADVANCED — no second "skill" row needed here since these are just difficulty bands of the same movement list).

- **6 exercises in a 3-column × 2-row CSS grid** (22px row gap, 8px column gap) rather than a single row — Knee Push-ups, Inverted Row, Bench Dips, Air Squats, Incline Push-ups, Assisted Pull-ups. Each circle is 88×88px (smaller than Power's 4-up row to fit 6), same honest-ring/whole-circle-tappable/movement-specific-icon pattern, one rep count number, "TAP TO LOG" caption when empty.
  - **Specific bug fixed here:** each circle previously stacked a bare `-` over a `#--` (two separate ambiguous placeholders per circle) — replace with exactly one number (or the "TAP TO LOG" caption), never two stacked placeholders.
- Milestone card: "Log a result to rank up" / "YOUR NEXT TARGET: 20 KNEE PUSH-UPS" / progress bar toward 20 reps on the first exercise (same must-start-empty rule).

**Interactions:** Tapping any of the 6 circles adds 4 reps to that exercise, pulses the circle, updates its ring, the aggregate score ring, and the milestone bar (tracks Knee Push-ups specifically toward the 20-rep target).

---

## Shared Design Tokens (apply across all 4 screens + any future world screens)

**Typography:** Barlow Condensed (Google Fonts, weights 500/600/700/800) for everything — headings, labels, numbers, body copy. No secondary typeface.

**Colors:**
| Role | Power / Strength | Static | 1MM |
|---|---|---|---|
| Accent | `#FF4B3E` | `#8B5CF6` | `#FF6B35` |
| Page background | `#050302` | `#050308` | `#050301` |
| Card/track fill (inactive) | `rgba(accent, 0.05–0.08)` | same pattern | same pattern |
| Border (inactive UI) | `rgba(255,255,255,0.14–0.16)` | same | same |
| Primary text | `#fff` | `#fff` | `#fff` |
| Secondary/caption text | `rgba(255,255,255,0.35–0.5)` | same | same |
| CTA button text (on solid accent fill) | dark near-black tuned to the accent hue (e.g. `#1a0605` on red, `#1a0f2e` on purple, `#1a0603` on orange) | | |

**Radii:** 999px pills/circles, 24px large cards, 12–18px small tiles/rows/inputs.
**Borders:** 1.5px standard weight everywhere.
**Progress rings/bars — the one rule that matters most:** never hard-code a full stroke or 100% width. Always compute from the real ratio (`value / target`), so `0` renders visibly empty. This was the most common and most visible bug in the original app across all 4 screens.
**Minimum tap target:** 44px, or the full exercise circle (80–100px) — never a small corner badge alone.

## Assets
No bitmap/photo assets. All iconography is hand-drawn inline linear SVG (stroke-based, 2px stroke weight, round caps/joins) matching each exercise/action — no icon font, no emoji except for a small set of decorative accents that already existed in the original app's voice (👑 on the "overall" tab, 💪/🧠 on a couple of callout cards, and flag/medal emoji in leaderboards). The iOS device chrome around each screen (status bar, notch, home indicator) comes from a reusable frame component (`ios-frame.jsx`, included in this bundle) — you won't need this in production, it's only in the reference to make each screen look like a real device.

## Files in this bundle
- `Leap Power Screen - Redesign.dc.html`
- `Leap Strength Screen - Redesign.dc.html`
- `Leap Static Screen - Redesign.dc.html`
- `Leap Endurance Screen - Redesign.dc.html`
- `ios-frame.jsx` — device-frame wrapper used only to preview the screens; not part of the design itself.

Each `.dc.html` file is self-contained and can be opened directly in a browser to see/interact with the live design (tap the exercise circles, tier chips, etc. to see the intended micro-interactions). Open the file and search for the `<style data-dc-script>`-adjacent `<script>` block at the bottom for the exact interaction/state logic (what increments on tap, how percentages are computed) if the prose above leaves anything ambiguous.
