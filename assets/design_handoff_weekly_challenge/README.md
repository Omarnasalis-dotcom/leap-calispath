# Handoff: Leap Arena — Weekly Challenge v1

## Overview
A new challenge drops every week, and each week has its own leaderboard. There are two formats:
- **FOR TIME**: finish every rep in order. The **lowest time** ranks first.
- **AMRAP** (as many rounds as possible): do as many rounds as you can in a fixed time. Every rep has a point rate. When the time runs out, the user logs how many **full rounds** they finished plus the **reps done in the unfinished round**. The **highest points** rank first.

The flow has four screens: **Challenge → Active → Log → Submitted**.

## About the design files
`Leap Weekly Challenge v1.dc.html` is a **design reference built in HTML**, not production code. Rebuild it in the target codebase (React Native, SwiftUI, etc.) using that codebase's own patterns. To view it, open the file in a browser with `support.js` in the same folder. Its Tweaks switch the format (`forTime` / `amrap`), whether the user already has an entry (`hasEntry`), and the timer speed (`timerSpeed` 1x/10x/60x, for demo only).

## Fidelity
**High-fidelity.** Match the colors, type, spacing, radii and states exactly. Names, times, points, dates and movement data are mock data.

---

## Design tokens
- Font: **Oswald** 300–700 (Google Fonts), fallback `'Arial Narrow', sans-serif`. Labels are uppercase with wide letter-spacing (1.2–3px).
- Coral (primary): `#FC5454` · coral tint bg `#130909` · coral border `rgba(252,84,84,.45)` · coral soft `rgba(252,84,84,.07/.12/.14)`
- Green (success / new best): `#4CC38A`, border `rgba(76,195,138,.45)`, soft fill `rgba(76,195,138,.14)`
- Gold / Silver / Bronze: `#E8B64C` / `#C9CED6` / `#C98B5A`
- Backgrounds: `#000` screen · `#0a0a0a` · `#0d0d0d` card · `#111` control · `#141414` · `#1a1a1a` · `#1a0f0f` index dot
- Lines: `#111`, `#161616`, `#181818`, `#1a1a1a`, `#1f1f1f`, `#2a2a2a`
- Text: `#fff` · `#d0d0d0` · `#a0a0a0` · `#8a8a8a` (labels) · `#6a6a6a` · `#4a4a4a` (empty values)
- Radii: 5 (YOU pill), 7–8 (chips), 10–12 (small buttons), 14 (rows), 16 (primary button), 18–22 (cards), 26 (hero card)
- Easing: `cubic-bezier(.4,0,.2,1)`
- Frame: 402×874 (iPhone 16 Pro). Screen padding is 24px on each side.
- Standard label style used throughout: 10.5–11px / 500, letter-spacing 2px, `#8a8a8a`.

---

## Screen 1 — Challenge (overview)
The content scrolls, with 120px of bottom padding so it clears the fixed CTA.

**Header** (padding `14px 24px 0`, gap 14)
- Back button: 40×40, radius 12, `#111`, 1px `#1f1f1f` border, with a white chevron (stroke 2.2).
- "LEAP ARENA": 11px / 500, letter-spacing 2.4px, `#8a8a8a`.
- Below it, "WEEKLY CHALLENGE": 24px / 700, letter-spacing 1.4px, white.

**Week switcher** (padding `20px 24px 0`, spaced between)
- Prev/next buttons: 36×36, radius 11.
  - Enabled: `#111` fill, `#1f1f1f` border, white icon.
  - Disabled: transparent, `#141414` border, `#3a3a3a` icon.
- Center shows the date range ("SEP 26 – OCT 2", 15px / 600, letter-spacing 1.6px) with a status chip under it:
  - Live: "● LIVE · ENDS IN 3D 14H", `rgba(252,84,84,.12)` fill, coral text.
  - Ended: "ENDED · FINAL", 1px `#2a2a2a` border, `#8a8a8a` text.
  - Both chips: padding `3px 9px`, radius 7, 10.5px / 700, letter-spacing 1.6px.
- Prev goes to older weeks; next goes to newer ones. The next button is disabled on the live week.

**Hero card** (margin-top 18, radius 26, padding 22, overflow hidden)
- Background and border:
  - Live week: `#130909` fill, 1px `rgba(252,84,84,.45)` border.
  - Ended week: `#0d0d0d` fill, `#1f1f1f` border.
- Ghost week number ("39"): absolutely positioned at right −6, top −30. 170px / 700, letter-spacing −4, transparent fill with a 1.5px text stroke (`rgba(252,84,84,.2)` when live, `rgba(255,255,255,.06)` when ended). Not interactive.
- Top row:
  - Division chip "WARRIORS · TIER 3–6": 1px `#2a2a2a` border, `#d0d0d0` text.
  - Format chip ("FOR TIME" / "AMRAP · 12 MIN"): coral fill, black text.
  - Both chips: padding `4px 10px`, radius 8, 10.5px / 600–700, letter-spacing 1.6px.
- Challenge name: 44px / 700, letter-spacing 1.2px, line-height 1, margin-top 22.
- Level ("INTERMEDIATE"): 12px / 500, letter-spacing 3px, `#8a8a8a`.
- Rule line: 14px / 300, line-height 1.5, `#d0d0d0`.
  - For time: "Finish every rep, in order. Fastest time takes #1."
  - AMRAP: "As many rounds as you can in 12:00. Every rep scores points — most points takes #1."
- Stats row: 3 equal columns with 1px `#1f1f1f` dividers between them, a top border, and 14px padding-top. Labels use the standard label style; values are 24px / 600.
  - **YOUR BEST**: `M:SS` (for time) or the points number (AMRAP). Shows "—" in `#4a4a4a` if the user has no entry.
  - **RANK**: "#N", followed by "of {count}" (11.5px, `#6a6a6a`). Shows "—" and "unranked" if the user has no entry.
  - **GAP TO #1**: "+M:SS" or "−N" points. Shows "KING" in gold when the user is #1, and "—" when unranked.

**Movements** (padding-top 28, gap 10)
- Header: "MOVEMENTS" on the left. On the right, "130 REPS · IN ORDER" (for time) or "1 ROUND = 70 PTS" (AMRAP), 12px / 500, `#d0d0d0`.
- Each row: min-height 60, padding `0 16px`, radius 14, `#0d0d0d` fill, 1px `#1a1a1a` border, gap 14. It contains:
  - An index dot: 26px, `#1a0f0f` fill, coral 12px / 700 number.
  - The name: 16px / 500, white.
  - Reps: 22px / 600 number, followed by "REPS" (11px, `#8a8a8a`).
  - AMRAP only: a rate line under the name ("3 PTS / REP", 11px, `#8a8a8a`), and a points total on the far right ("15 PTS", 14px / 600, coral, min-width 54).

**Leaderboard** (padding-top 32, gap 16). This matches the Strength/World podium.
- Title: "LEADERBOARD" on the live week, "FINAL STANDINGS" on ended weeks (19px / 600, letter-spacing 2px). Count on the right: "{n} WARRIORS".
- Podium: 3 columns in the order **#2, #1, #3**, bottom-aligned, gap 8.
  - Avatar: 56px for #1, 44px for the others. `#141414` fill, 2px ring in the rank color (coral if it's the user), initials in white.
  - Name: 12px, `#a0a0a0`. The user's own spot shows "You" in coral / 600 instead.
  - Value: 16px / 600, white.
  - Blocks: heights 84 / 60 / 46 for #1 / #2 / #3. Radius `12 12 0 0`, 2px top border in the rank color. Fill: `linear-gradient(#1c1710,#0c0c0c)` for #1, `linear-gradient(#161616,#0c0c0c)` for the others. Each block shows the rank number (26px for #1, 20px for the others, in the rank color) and the country code (10px, `#6a6a6a`).
- "You" row: only shown when the user's rank is 4 or lower and the full list is collapsed.
  - 62px tall, radius 16, `rgba(252,84,84,.07)` fill, 1px `rgba(252,84,84,.4)` border.
  - Rank in coral (18px / 700), the name, and a YOU pill (coral fill, black text, 10px / 700).
  - On the right: the value, with "{gap} TO #1" under it.
- Full list (toggled open): container radius 16, 1px `#1a1a1a` border, `#0a0a0a` fill.
  - Rows: 56px tall, separated by 1px `#161616` lines.
  - Rank: gold/silver/bronze for the top 3, `#6a6a6a` for the rest.
  - Country badge: 26×18, `#1a1a1a` fill.
  - On the right: the value, with the gap under it ("LEADER" for #1).
  - The user's row is tinted `rgba(252,84,84,.07)`.
- Toggle button: 48px tall, radius 14, `#111` fill, `#1f1f1f` border. Label "SEE ALL {n}" / "SHOW LESS", 13px / 600, letter-spacing 2px, `#d0d0d0`.

**Fixed CTA** (live week only)
- Container: padding `26px 24px 32px`, background `linear-gradient(transparent, #000 38%)`.
- Button: 56px tall, radius 16, coral fill, black 16px / 700 text, letter-spacing 2.6px, shadow `0 10px 30px rgba(252,84,84,.25)`.
- Label: "START CHALLENGE" if the user has no entry, otherwise "START · BEAT {best}".
- Ended weeks have no CTA; they're view-only.

---

## Screen 2 — Active
- Top bar: a close button (✕, 40×40, same style as the back button) that cancels the attempt and returns to the Challenge screen. In the center: the format chip text (12px / 600, coral, letter-spacing 3px) over the challenge name (15px / 600, white).
- Timer block (padding-top 30, centered):
  - Label: "ELAPSED" (for time, counts up) or "TIME LEFT" (AMRAP, counts down).
  - Time: 96px / 700, tabular numbers, white.
  - Progress bar: full width, 4px, `#1f1f1f` track with a coral fill.
    - For time: fill = movements done ÷ total.
    - AMRAP: fill = time elapsed ÷ time cap.
  - Caption under the bar (12px / 500, `#d0d0d0`): "{done} OF {n} MOVEMENTS DONE" or "{rounds} ROUNDS · {pts} PTS".

**For time body:** a list of steps (gap 8). All state changes animate with `all .3s cubic-bezier(.4,0,.2,1)`.
- Current step:
  - Row min-height 84, `#130909` fill, 1.5px coral border.
  - A "NOW" eyebrow (10.5px, coral) above the name.
  - Name 24px / 600, reps 34px.
  - Index dot: coral fill, black number.
- Done step:
  - 52px tall, `#0a0a0a` fill, opacity .55.
  - Name crossed out in `#a0a0a0`.
  - Index dot shows ✓ in green on `rgba(76,195,138,.14)`.
- Upcoming step:
  - 52px tall, `#0d0d0d` fill.
  - Index dot: `#1a1a1a` fill, `#8a8a8a` number.
- CTA (60px tall, coral, pinned to the bottom): "DONE · NEXT {MOVEMENT}". On the last movement it becomes "FINISH", which stops the timer and opens the Log screen.

**AMRAP body:** one card (radius 22, `#0d0d0d` fill, `#1f1f1f` border, padding 20).
- "ROUNDS DONE" with a big count (68px / 700) on the left.
- "NOW ON · ROUND {n+1}" on the right (20px / 600, coral).
- A 2×2 grid of the round's movements: tiles on `#141414`, radius 12, showing the name and reps.
- CTA: "+1 ROUND" (increments the round count).
- Text link under the CTA: "END & LOG SCORE".
- When the timer reaches 0, the Log screen opens automatically with the round count pre-filled.

---

## Screen 3a — Log (For Time)
- Centered, padding-top 110:
  - "FINISHED · {NAME}" (12px, coral, letter-spacing 3px).
  - The time: 112px / 700.
  - A status pill (padding `6px 14px`, radius 10, 12px / 700):
    - "NEW BEST · −M:SS" in green with a green border.
    - "BEST STAYS M:SS" in gray with a `#2a2a2a` border.
    - "FIRST ATTEMPT" if the user has no previous entry.
- Card with 2 columns (radius 18): "THIS RANKS #N of {count}" and "GAP TO #1".
- "SUBMIT RESULT" (primary button) and a "DISCARD" text link.

## Screen 3b — Log (AMRAP)
The content scrolls; the actions are pinned to the bottom with a 1px `#111` top border.
- Title: "TIME'S UP · {NAME}" eyebrow, then "LOG YOUR SCORE" (32px / 700).
- **Full rounds card:**
  - Header: "FULL ROUNDS" on the left, "× 70 PTS" on the right.
  - Stepper: 52px buttons (− on `#1a1a1a`, + on coral) around a 64px / 700 value.
  - Formula line under it: "5 × 70 = 350 PTS".
- **Unfinished round card:**
  - Helper text: "Reps you got done before the clock hit zero."
  - One 58px row per movement:
    - Name and rate.
    - Stepper: 36px − and + buttons around "n / max". The value is 20px / 600, white, or `#6a6a6a` when 0.
    - Points added ("+6", coral).
  - Reps are clamped between 0 and that movement's reps.
- **Total card:** `#130909` fill, coral border.
  - "TOTAL SCORE": 44px / 700 number followed by "PTS" in coral.
  - Breakdown line: "5 RDS (350) + 36 PTS".
  - On the right: "RANKS #N of {count}".
  - Updates live as the steppers change.
- "SUBMIT SCORE" (primary button) and a "DISCARD" text link.

## Screen 4 — Submitted
- Coral check circle: 64px, with a halo `0 0 0 8px rgba(252,84,84,.14)`.
- "YOUR RANK THIS WEEK", then the rank "#N" at 128px / 700.
- Delta pill:
  - Green: "▲ UP N PLACES", "NEW BEST · SAME RANK" or "FIRST ENTRY".
  - Gray: "NOT A NEW BEST".
- Card with 2 columns: "THIS RESULT" and "YOUR BEST".
- Note text (13px / 300, `#8a8a8a`): "You hold #1. Defend it until the week closes." or "{gap} to #1 · Week closes in 3d 14h".
- "BACK TO CHALLENGE" returns to Screen 1, which now shows the updated best, rank and leaderboard.

---

## Scoring logic
```
FOR TIME
  score  = finish time in seconds
  rank   = sort ascending (lower = better)
  gap    = score − leader  → "+M:SS"

AMRAP
  roundPts = Σ (movement.reps × movement.ptsPerRep)
  score    = fullRounds × roundPts + Σ (partialReps[i] × movement[i].ptsPerRep)
  rank     = sort descending (higher = better)
  gap      = leader − score → "−N PTS"

Best result  = the better of the new score and the previous best (only the best one counts on the board)
Projected rank = rank the new score would get, computed before submitting
```
The mock AMRAP ("ENGINE 12", 12:00 cap) has these movements, for a round total of **70 pts**:
- Pull ups 5 × 3 pts
- Dips 10 × 2 pts
- Push ups 15 × 1 pt
- Squats 20 × 1 pt

The mock For time challenge is "100 CHALLENGE": Pull ups 20, Dips 20, Push ups 30, Squats 30.

## State
- **From the backend:**
  - The challenge: `{ id, weekStart, weekEnd, status: live|ended, division, tierRange, name, level, format: forTime|amrap, timeCapSec?, movements: [{ name, reps, ptsPerRep? }] }`
  - The leaderboard: `[{ userId, handle, countryCode, score }]`
  - The user's current best, if they have one.
- **Local UI state:**
  - Navigation: `weekIndex`, `screen` (overview|active|log|done), `showAll`.
  - During an attempt: `elapsed`, `running`, `step` (for time), `rounds` (AMRAP, live counter).
  - On the log screen: `logRounds`, `partial[]`.
  - After submitting: `lastResult { score, newBest, prevRank, newRank }`.
- The timer should run from timestamps (start time vs. now), not from a tick counter, so it stays correct when the app goes to the background.

## Open questions / placeholders
- Real challenges, time caps and point rates.
- Whether For time needs a time cap, and what happens if the user doesn't finish within it.
- Whether a "3-2-1" countdown should run before the timer starts.
- Division rules (which tiers see which challenge).
- The exact time the week closes and its timezone.
- Whether multiple attempts are allowed (the prototype keeps only the best result).
- Proof and verification (video upload?) for top ranks.
- Whether the full leaderboard needs pagination.
- Community and gender filters (as used in the world leaderboards).

## Files
- `Leap Weekly Challenge v1.dc.html`: the interactive reference.
- `support.js`: the runtime the reference needs.
