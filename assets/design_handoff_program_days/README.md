# Handoff: LEAP Program — Days Screen

One screen only: the **custom program day list** (`Leap Program Days.dc.html`). This is the redesign of the existing "MY CUSTOM PROGRAM" screen — program identity, discipline score panel, bodyweight, and the day/session cards.

Not in scope: the Day Blocks screen, the timer runner, the Training Center hub. Those have their own handoffs.

## About the Design File
`Leap Program Days.dc.html` is a **design reference in HTML/React** — exact layout, colors, motion timings and interaction behavior. Not production code. Rebuild in the app's real stack (React Native / Swift / Kotlin).

The file renders a **left rail** next to the phone frame. **The rail is a prototype control only — do not implement it.** Everything inside the phone frame is in scope.

## Fidelity
**High-fidelity.** Colors and type are sampled from the live app. All content is placeholder for real API data — see §5.

## Contents
- §0 — Data contract
- §1 — Screen anatomy
- §2 — Program identity card
- §3 — Program Load panel
- §4 — Session (day) cards
- §5 — What must be dynamic
- §6 — State matrix
- §7 — Content inventory (the exact mock data)
- §8 — Edge cases & failure states
- §9 — Accessibility
- §10 — Analytics events
- §11 — Design tokens
- §12 — Integration checklist

---

## Why the redesign

The current screen has five problems, and every decision below is aimed at one of them:

1. **The gradient SWITCH WORKOUT bar was the loudest element on screen** — louder than START. It has been demoted to a small outlined control inside the program card.
2. **Three loose glowing rings** floated with no container, no total, and the `0` ring glowed as brightly as the `60`. They are now one panel with a total and a dim zero state.
3. **The gold bodyweight pill was an orphan**, centered in dead space. It is now the panel's footer strip.
4. **Day cards said only "DAY 1 · 12 MOVEMENTS · ~45 MIN"** — nothing about what the session *is*. They now carry a discipline mix bar, a session name, points on deck, and a movement preview.
5. **Every card was identical**, so nothing told you where you were. Exactly one card is now coral: the one you should do next.

---

# 0. Data contract

```json
{
  "programId": "p_88",
  "name": "My Custom Program",
  "coach": { "id": "leap", "displayName": "LEAP" },
  "sessionsTotal": 3,
  "sessionsDoneThisWeek": 2,
  "bodyweightKg": 66,
  "disciplineScores": [
    { "key": "STATIC", "label": "STATIC PTS", "value": 17.5 },
    { "key": "POWER",  "label": "POWER PTS",  "value": 60 },
    { "key": "1MM",    "label": "1MM PTS",    "value": 0 }
  ],
  "days": [
    {
      "dayId": "d_1",
      "dayNumber": 1,
      "title": "Push & Pull Base",
      "focus": "FULL BODY",
      "status": "next",
      "movementCount": 12,
      "estimatedMinutes": 45,
      "pointsOnDeck": 6.4,
      "disciplineMix": [
        { "key": "STATIC", "movements": 4 },
        { "key": "POWER",  "movements": 5 },
        { "key": "1MM",    "movements": 3 }
      ],
      "previewMovements": ["Pull-Ups", "Dips", "L-Sit"]
    }
  ]
}
```

| Field | Values | Drives |
|---|---|---|
| `disciplineScores[].key` | `STATIC` · `POWER` · `1MM` | Arc + label color (§11 map). Unknown → coral. |
| `disciplineScores[].value` | number ≥ 0 | Arc length, value color, dim-zero state. |
| `days[].status` | `done` · `next` · `scheduled` | Card treatment and CTA (§4.5). |
| `days[].disciplineMix` | array, movement count per discipline | The 3pt proportional bar across the card top. |
| `days[].pointsOnDeck` | number | Coral `+{n} PTS` in the meta row. |
| `days[].previewMovements` | string[] | Preview chips; the client appends `+{n} MORE`. |

**Derived — compute, never store:**

```
totalPts        = sum(disciplineScores[].value)
arcFraction(d)  = max(d.value / max(disciplineScores[].value), 0.03)
mixWeight(m)    = m.movements / sum(disciplineMix[].movements)
previewOverflow = movementCount - previewMovements.length
```

`arcFraction` is normalised against the **highest** discipline, not a fixed ceiling — the panel reads as a comparison between disciplines, which is the actual question ("where am I weak?"). The 0.03 floor keeps a non-zero score from rendering as an empty ring. A true zero renders dim, with no arc.

---

# 1. Screen anatomy

Top to bottom:

| # | Element | Fixed / scrolls |
|---|---|---|
| 1 | Status bar | fixed |
| 2 | Header — close, LEAP / PROGRAM wordmark, gradient rule | fixed |
| 3 | Program identity card | scrolls |
| 4 | Program Load panel (arcs + bodyweight footer) | scrolls |
| 5 | `SESSIONS` section rule | scrolls |
| 6 | Day cards | scrolls |

**Ambient glow** — a decorative radial sits above the screen top: 420 × 300pt, centered, `top: -140`, `radial-gradient(circle, rgba(252,84,84,.16) 0%, rgba(139,92,246,.09) 45%, transparent 70%)`, `blur(20px)`, breathing 6s ease-in-out between .45 and .9 opacity, `pointer-events: none`. It is what makes the black feel lit rather than flat. Drop it under reduce-motion.

**Screen background** is pure `#000`; the surrounding page uses `radial-gradient(1200px 700px at 50% -10%, #141014, #080808 60%)`.

## 1.1 Header

| Element | Spec |
|---|---|
| Close | 34 × 34pt, radius 12, border `#241c24`, bg `rgba(255,255,255,.02)`, 13pt `#8a8a8a` ✕ glyph. The old outlined "CLOSE" text pill is gone — an icon at the same weight as everything else. |
| Wordmark | `LEAP` white 19pt/600, **letter-spacing 7** · `PROGRAM` gold `#C9A227` 8pt/500, **letter-spacing 4.6**, 5pt below. Optically centered: a 34pt spacer balances the close button. |
| Rule | 1pt, 14pt below the wordmark: `linear-gradient(90deg, transparent, #8b5cf6 18%, #FC5454 52%, #f97316 82%, transparent)` at **opacity .55**. Full-strength was a hard line; the fade is what makes it feel like a masthead. |

Header padding: 16pt top / 20pt sides / 14pt bottom.

---

# 2. Program identity card

Radius 20, border `#1e1a20`, `linear-gradient(150deg,#120e14 0%,#0b0909 55%,#090707 100%)`, padding 16/17. Enters `rowIn` 0.45s `cubic-bezier(.2,.9,.3,1.2)`.

**Left column**
- Eyebrow `ACTIVE PROGRAM` — `#5a5a5a` 8.5pt/500, letter-spacing 2.4.
- **Program name** — white 21pt/600, letter-spacing .6, line-height 1.15, `text-wrap: pretty`. Wraps to two lines; do not truncate a user-authored name.
- Meta row — 5pt coral dot pulsing (`pulseDot` 1.7s ease-in-out, opacity 1 → .3 / scale 1 → .65) + `"{n} sessions · {n} done this week"` in `#9a9a9a` 11pt/300. The pulse is the only "this is live" signal on the screen; keep it.

**Right column** (stacked, right-aligned, 9pt gap)
- **Coach chip** — radius 9, border `#2a2230`, bg `rgba(255,255,255,.02)`, padding 6/10. Gold person glyph + `COACH` `#6d6d6d` 8.5pt/500/1.4 + coach name in gold 600. Read-only.
- **SWITCH control** — radius 9, border `#2a2230`, padding 7/11, purple swap glyph + `#c4b5fd` 9pt/600/1.5 label. Carries a slow sheen: `linear-gradient(100deg, transparent 38%, rgba(255,255,255,.06) 50%, transparent 62%)` at `background-size: 250% 100%`, animating `background-position -160% → 280%` over 5s ease-in-out infinite.

**This is the single most important change on the screen.** The old full-width gradient bar competed with START for attention and won. The sheen is what keeps the control discoverable at this reduced size — do not replace it with a flat button, and do not restore the gradient bar.

---

# 3. Program Load panel

One card replacing three floating rings. Radius 20, border `#1a1616`, bg `#0A0808`, `overflow: hidden`. Enters `rowIn` at 0.07s.

**3.1 Header row** (14pt top, 17pt sides) — `PROGRAM LOAD` eyebrow (`#4a4a4a` 8.5pt/2.4) left; right, the **total**: value white 16pt/700 + `TOTAL PTS` label `#4a4a4a` 8.5pt/1.6, baseline-aligned. The total is new — three numbers with no sum forced mental arithmetic.

**3.2 Arc trio** — 3-column grid, 12pt top / 8pt sides.

Each cell: a 74pt SVG rotated −90°.
- Track: `r=27`, 3pt `#161212`.
- Arc: `r=27`, 3pt, round cap, `stroke-dasharray: 170`, `stroke-dashoffset = 170 − 170 × arcFraction`.
- Arc color = discipline color; **`#2a2222` when the value is 0**.
- Glow `drop-shadow(0 0 6px {color}55)` — **only when value > 0.**
- Draw-in: `arcDraw` 1s `cubic-bezier(.2,.9,.3,1)`, staggered 0.12s per column.

Center value: discipline color, **21pt/700 under 10, 19pt/700 at 10 and above** (so `60` and `0` occupy the same optical weight), letter-spacing .3. Zero renders `#3a3232`.

Label below: 8.5pt/500, letter-spacing 1.7 — `#7a7a7a` when scored, `#4a4a4a` when zero.

The dim-zero rule matters: in the current screen the `0` ring glows as brightly as the `60`, which reads as an achievement. A zero is an absence and should look like one.

**3.3 Bodyweight footer** — 14pt above, border-top `#161212`, bg `rgba(255,255,255,.012)`, padding 11/17. Left: gold kettlebell glyph + `BODYWEIGHT` (`#6d6d6d` 9.5pt/500/1.6) + value (white 12pt/600). Right: gold `EDIT` (9pt/600/1.6), tappable.

Folding bodyweight in here removes the orphaned gold pill and puts the number next to the scores it actually modifies.

---

# 4. Session (day) cards

Section rule first: `SESSIONS` (`#3f3f3f` 8.5pt/2.6) · 1pt `#161212` line · `"{n} DAYS"` (`#4a4a4a` 8.5pt/1.6). List padding 13pt top / 20pt sides / 34pt bottom, 12pt gap.

Card: radius 20, `overflow: hidden`, entering `rowIn` 0.5s `cubic-bezier(.2,.9,.3,1.2)` staggered 0.08s.

**4.1 Discipline mix bar** — the card's top edge: a 3pt-tall flex row, 2pt gap, one segment per discipline, `flex: movements / totalMovements`, colored by discipline. Opacity .95 next / .55 scheduled / .35 done. Grows in with `barGrow` 0.7s `cubic-bezier(.2,.9,.3,1)`, staggered 0.06s per segment after the card's own delay.

This is the highest-value addition: it tells you a day is static-heavy or conditioning-heavy before you read a word.

**4.2 Day plate** — 46pt wide, radius 14, padding 8/0/9, border `#3a1d1d` next / `#1c1818` otherwise, bg `rgba(252,84,84,.08)` next / `rgba(255,255,255,.015)` otherwise. Stacked: `DAY` (7.5pt/500/1.6, `#8a5555` next / `#4a4444`) over the number (22pt/700, coral next / `#8a8a8a`).

**4.3 Body**
- Status chip + focus label: chip `UP NEXT` (coral bg, white text) / `COMPLETED` / `SCHEDULED` (`rgba(255,255,255,.03–.05)`, `#5a5a5a`–`#7a7a7a`), 7.5pt/700/1.3, radius 5; focus label `#3f3f3f` 8.5pt/500/1.5.
- **Session name** — 17pt/600/.5, white; `#8a8a8a` + strikethrough when done. This replaces "DAY 1" as the card's headline; the day number lives in the plate.
- Meta row — sliders glyph + `"{n} MOVEMENTS"` · 1pt × 10pt `#221c1c` divider · clock glyph + `"~{n} MIN"` · divider · `"+{n} PTS"`. Text `#7a7a7a` 10.5pt/400/.9; the points value is coral on the next card, `#6d6d6d` otherwise.

**4.4 Movement preview** — chips indented to 75pt (aligned under the body, not the plate), 6pt gap, wrapping, 14pt bottom padding. Chip: padding 5/9, radius 7, border `#1d1919`, bg `rgba(255,255,255,.022)`, `#8a8a8a` 8.5pt/500/1.2. The `+{n} MORE` chip is borderless and `#4a4444` — it's a hint, not an item.

**4.5 Card states**

| State | Border | Background | Opacity | Plate / CTA |
|---|---|---|---|---|
| **Up next** | `#3a1d1d` | `linear-gradient(155deg,#170a0a,#0c0707 55%,#0a0606)` + shadow `0 14px 34px rgba(252,84,84,.10)` | 1 | Coral plate · coral **START** (padding 11/17, radius 12, 11.5pt/700/1.7, shadow `0 8px 20px rgba(252,84,84,.34)`) |
| **Scheduled** | `#191515` | `linear-gradient(155deg,#0d0b0b,#090808)` | 1 | Grey plate · outlined **START** (border `#241f1f`, `#9a9a9a` 10.5pt/700/1.6) |
| **Completed** | `#191515` | same as scheduled | .62 | Grey plate · 34pt outlined `✓` (border `#2a1d1d`, coral 14pt) |

**Exactly one card is coral at a time.** That is the whole hierarchy: the eye lands on the next session, and every other card is legible but quiet. Never render two `next` days.

---

# 5. What must be dynamic

- **Day count, movement counts, durations, points** — all from the payload. No hardcoded 3 days.
- **Discipline mix** is per-day and proportional; a day with one discipline renders one full-width segment.
- **Discipline colors** come from one shared map with a coral fallback (§11).
- **Arc scale** normalises against the highest score in the set, not a constant.
- **Zero handling** is a rule, not a special case: dim arc, dim value, dim label, no glow.
- **The `next` day is server-decided**, not "index 0" — it's the first incomplete scheduled day.
- **Preview chips** come from the day's first N movements; `+{n} MORE` is computed against the real movement count.
- **Coach name** from the program record; the chip is read-only.
- **Bodyweight** unit follows the user's locale setting (kg / lb) — the label is `BODYWEIGHT`, the unit lives in the value.
- **Program name** is user-authored: any length, any casing. Never uppercase it, never truncate to one line.

---

# 6. State matrix

| # | State | Trigger | Renders |
|---|---|---|---|
| 1 | **Fresh program** | no days completed | Day 1 is `next` (coral), rest scheduled; meta reads "0 done this week" |
| 2 | **Mid-week** | ≥1 day done | Done cards dim + strike through, the next incomplete day takes coral |
| 3 | **All done** | every day complete | No coral card; the program card meta reads "{n} of {n} done" and the CTA-less list is fine — do **not** fake a next day |
| 4 | **Zero-score discipline** | value = 0 | Dim arc `#2a2222`, value `#3a3232`, label `#4a4a4a`, no glow |
| 5 | **All scores zero** | new user | Panel renders, total `0`, all three dim; do not hide the panel |
| 6 | **Switching program** | SWITCH tapped | Push to the program picker; confirm before replacing an active program |
| 7 | **Editing bodyweight** | EDIT tapped | Inline sheet; on save, the discipline scores may recompute — re-run the arc animation |

---

# 7. Content inventory (the mock data)

Fixture content, for 1:1 comparison. **Replace with real API data.**

**Program:** name "My Custom Program" · coach LEAP · meta "3 sessions · 2 done this week" · bodyweight 66 KG.

**Scores:** Static 17.5 · Power 60 · 1MM 0 · total 77.5.

| Day | Focus | Title | Status | Movements | Duration | Points | Mix (S/P/1MM) | Preview |
|---|---|---|---|---|---|---|---|---|
| 1 | FULL BODY | Push & Pull Base | up next | 12 | ~45 MIN | +6.4 | 4 / 5 / 3 | PULL-UPS · DIPS · L-SIT · +9 MORE |
| 2 | UPPER | Static Control | scheduled | 8 | ~26 MIN | +4.1 | 5 / 2 / 1 | TUCK PLANCHE · FRONT LEVER · +6 MORE |
| 3 | CONDITIONING | 1MM Engine | scheduled | 9 | ~25 MIN | +3.6 | 1 / 3 / 5 | PUSH-UPS · AIR SQUATS · BURPEES · +6 MORE |

**Copy strings**

| Where | String |
|---|---|
| Wordmark | `LEAP` / `PROGRAM` |
| Program eyebrow | `ACTIVE PROGRAM` |
| Program meta | `{n} sessions · {n} done this week` |
| Coach chip | `COACH {name}` |
| Switch control | `SWITCH` |
| Panel eyebrow | `PROGRAM LOAD` |
| Panel total | `TOTAL PTS` |
| Arc labels | `STATIC PTS` · `POWER PTS` · `1MM PTS` |
| Bodyweight strip | `BODYWEIGHT` · value · `EDIT` |
| Section rule | `SESSIONS` · `{n} DAYS` |
| Day plate | `DAY` + number |
| Status chips | `UP NEXT` · `SCHEDULED` · `COMPLETED` |
| Day meta | `{n} MOVEMENTS` · `~{n} MIN` · `+{n} PTS` |
| Preview overflow | `+{n} MORE` |
| Day CTA | `START` · `✓` |

---

# 8. Edge cases & failure states

| Case | Required behavior |
|---|---|
| **Long program name** | Wraps to 2 lines at 21pt with `text-wrap: pretty`; at 3+ lines, clamp to 2 with an ellipsis. Never shrink the type. |
| **Single day program** | One card, `next`. Section rule reads "1 DAY" (singular). |
| **10+ days** | List scrolls; keep the stagger cap at ~8 cards, then render the rest without delay so the tail doesn't crawl in. |
| **Day with one discipline** | Mix bar is a single full-width segment — still render it, it's a signal. |
| **Day with 0 preview movements** | Omit the chip row entirely; the card shrinks. Don't render an empty indented block. |
| **Very long movement names** | Chips are single-line; ellipsize a chip rather than wrapping inside it. |
| **Discipline not in the map** | Coral fallback, and log it — a new discipline needs a token before ship. |
| **Score > 99** | Value drops to 17pt so 3 digits fit inside the 54pt arc interior. |
| **Bodyweight unset** | Strip shows `— —` with EDIT in coral instead of gold, prompting the entry. |
| **Program load fails** | Skeleton the two cards (same radii, `#0d0b0b`, no arcs) and show a retry row where the day list would be. Never show a half-empty screen with live chrome. |
| **Offline** | Cached program renders fully; SWITCH and EDIT disable with a "reconnect to change" note. |
| **Reduce motion** | Drop ambient glow, sheen, dot pulse, stagger, arc draw-in, and bar grow. Keep final arc lengths, bar proportions and every string — no information is motion-only. |
| **Large accessibility text** | Cards grow vertically; meta-row labels need `nowrap` + `flex-shrink: 0` with the row allowed to wrap (this bit us on the Day Blocks screen — same fix applies here). |

---

# 9. Accessibility

- **Arcs** — each is `role="progressbar"` with `aria-valuenow` = the score, `aria-valuemax` = the highest score, `aria-label` = "Static points, 17.5 of 60".
- **Zero state** — must be announced as "0 points", never skipped.
- **Mix bar** — decorative to screen readers (`aria-hidden`); the composition is conveyed in the card's label instead: "Day 1, Push & Pull Base, 12 movements, 45 minutes, up next".
- **Day card** — one button per card; the ✓ on a completed card is `aria-label="Completed"` and non-interactive.
- **Status chip** — included in the card's accessible name, not announced separately.
- **Hit targets** — the 34pt close button, the SWITCH control and the `EDIT` text all need padded 44pt touch regions.
- **Color is never the only signal** — completed carries `✓` + strikethrough, up-next carries the `UP NEXT` chip, zero scores carry the digit `0`.
- **Contrast** — `#4a4a4a` and `#3f3f3f` are for non-essential eyebrows only. Nothing actionable sits below `#7a7a7a`.

---

# 10. Analytics events

| Event | Properties |
|---|---|
| `program_days_opened` | programId, dayCount, doneCount, totalPts |
| `day_card_tapped` | dayId, dayNumber, status, position |
| `day_started` | dayId, source (`start_button` / `card`) |
| `switch_program_tapped` | programId, fromScreen |
| `bodyweight_edit_opened` / `bodyweight_saved` | oldValue, newValue, unit |
| `discipline_panel_viewed` | staticPts, powerPts, oneMmPts, weakestKey |
| `program_load_failed` | reason, retryCount |

`weakestKey` on the panel view is the one worth wiring — it's the input to any "your 1MM is at zero" coaching nudge.

---

# 11. Design Tokens

**Discipline map** — one source, coral fallback.

| Key | Color |
|---|---|
| STATIC | `#8b5cf6` |
| POWER | `#FC5454` |
| 1MM | `#f97316` |
| unknown | `#FC5454` |

**Colors**
| Token | Value |
|---|---|
| Coral / primary | `#FC5454` |
| Purple | `#8b5cf6` |
| Orange | `#f97316` |
| Gold (coach, bodyweight, wordmark sub) | `#C9A227` |
| Purple text (switch label) | `#c4b5fd` |
| Screen bg | `#000000` |
| Program card gradient | `#120e14 → #0b0909 55% → #090707` |
| Program card border | `#1e1a20` · chip border `#2a2230` |
| Panel bg / border | `#0A0808` / `#1a1616` |
| Panel divider | `#161212` · arc track `#161212` |
| Panel footer wash | `rgba(255,255,255,.012)` |
| Day card (next) | `#170a0a → #0c0707 55% → #0a0606`, border `#3a1d1d` |
| Day card (rest) | `#0d0b0b → #090808`, border `#191515` |
| Plate border / bg | `#1c1818` / `rgba(255,255,255,.015)` |
| Chip border / bg | `#1d1919` / `rgba(255,255,255,.022)` |
| Divider (meta) | `#221c1c` |
| Zero arc / zero value | `#2a2222` / `#3a3232` |
| Primary text | `#FFFFFF` |
| Body text | `#9a9a9a` |
| Secondary | `#8a8a8a` · `#7a7a7a` |
| Muted | `#6d6d6d` · `#5a5a5a` |
| Faint | `#4a4a4a` · `#4a4444` · `#3f3f3f` · `#3a3232` |
| Coral shadow | `rgba(252,84,84,.34)` CTA · `rgba(252,84,84,.10)` card |

**Typography** — Oswald (200–700 loaded)
| Use | Size / weight / tracking |
|---|---|
| Program name | 21 / 600 / 0.6, lh 1.15 |
| Day number | 22 / 700 |
| Wordmark `LEAP` | 19 / 600 / **7.0** |
| Arc value (<10) | 21 / 700 / 0.3 |
| Arc value (≥10) | 19 / 700 / 0.3 |
| Session name | 17 / 600 / 0.5 |
| Panel total | 16 / 700 / 0.4 |
| Status bar | 13 / 500 |
| Bodyweight value | 12 / 600 / 0.6 |
| CTA (next) | 11.5 / 700 / 1.7 |
| Program meta | 11 / 300 / 0.6 |
| Day meta · CTA (scheduled) | 10.5 / 400 / 0.9 · 10.5 / 700 / 1.6 |
| Bodyweight label | 9.5 / 500 / 1.6 |
| Switch label · EDIT | 9 / 600 / 1.5 · 9 / 600 / 1.6 |
| Coach chip · preview chips | 8.5 / 500 / 1.4 · 8.5 / 500 / 1.2 |
| Section eyebrows | 8.5 / 500 / 2.4–2.6 |
| Arc labels · panel total label | 8.5 / 500 / 1.7 · 8.5 / 500 / 1.6 |
| Focus label | 8.5 / 500 / 1.5 |
| Wordmark `PROGRAM` | 8 / 500 / **4.6** |
| Status chip · plate eyebrow | 7.5 / 700 / 1.3 · 7.5 / 500 / 1.6 |

**Motion**
| Name | Value |
|---|---|
| Card enter (`rowIn`) | 0.45–0.5s `cubic-bezier(.2,.9,.3,1.2)`, Y+15 + scale .985; program 0s, panel .07s, days .14s + .08s each |
| Arc draw (`arcDraw`) | 1s `cubic-bezier(.2,.9,.3,1)`, stagger .12s |
| Mix bar (`barGrow`) | 0.7s `cubic-bezier(.2,.9,.3,1)`, scaleX 0 → 1, origin left, stagger .06s |
| Live dot (`pulseDot`) | 1.7s ease-in-out infinite, opacity 1 → .3 / scale 1 → .65 |
| Switch sheen | 5s ease-in-out infinite, background-position −160% → 280% |
| Ambient glow | 6s ease-in-out infinite, opacity .45 → .9 |

**Layout constants**: side padding 20pt · card radius 20 · chip/plate radius 5–14 · day list gap 12pt · phone frame 402 × 874 at radius 40 (reference only) · no bottom bar on this screen — the list ends with 34pt padding.

---

# 12. Integration checklist
- [ ] SWITCH is a small outlined control inside the program card **with the sheen**; the full-width gradient bar is gone.
- [ ] Program name renders user casing, wraps to 2 lines, is never uppercased or single-line-truncated.
- [ ] Live dot pulses on the program meta row.
- [ ] Three arcs live in one panel with a TOTAL PTS figure.
- [ ] Arc scale normalises against the highest score; 0.03 floor for non-zero values.
- [ ] Zero discipline: dim arc, dim value, dim label, **no glow**.
- [ ] Arc value type size switches at 10 (21pt → 19pt) so digits stay optically equal.
- [ ] Bodyweight sits in the panel footer with a gold EDIT; the standalone gold pill is gone.
- [ ] Every day card carries a proportional discipline mix bar from real movement counts.
- [ ] Day headline is the **session name**; the day number lives in the plate.
- [ ] Meta row shows movements · duration · coral points on deck.
- [ ] Preview chips from real movements, with a computed `+{n} MORE`.
- [ ] Exactly one coral `next` card; done cards dim + strike through; scheduled get an outlined START.
- [ ] `next` comes from the server, not index 0; all-done renders no coral card.
- [ ] Discipline colors from one map with coral fallback.
- [ ] Meta labels `nowrap` + `flex-shrink: 0`, rows allowed to wrap.
- [ ] Loading skeleton and retry state for a failed program load.
- [ ] Reduce-motion path keeps all values and proportions.
- [ ] 44pt touch regions on close, SWITCH, EDIT and each card.

# Assets
None to export — all shapes, inline SVG and CSS. Glyphs used (close ✕, coach person, swap arrows, kettlebell, sliders, clock) should be swapped for the app's existing icon set at the same optical sizes.

# Files
- `Leap Program Days.dc.html` — the design reference. Exact timings live in the `@keyframes` block at the top; the discipline map, arc math and day-state logic are in the logic class at the bottom. Read those if any number here is ambiguous.
