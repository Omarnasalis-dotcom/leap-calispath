# Handoff: Leap Coach — Chat Window & Live Activity Status

## Overview
The full conversation view for **Leap Coach**, the app's AI training assistant, plus the **live activity indicator** that tells the user what the coach is doing while it works ("Reading your last 11 logs", "Writing your plan", …).

This is the screen the FAB opens into (see `design_handoff_leap_coach_fab/`). It supersedes the "full conversation view is not yet designed" flag in that handoff.

## About the Design File
`Leap Coach FAB.dc.html` is a **design reference in HTML/React** — exact layout, colors, motion timings, and interaction behavior. Not production code. Rebuild in the app's real stack (React Native / Swift / Kotlin) with its existing animation primitives.

The file renders **two phones side by side**: left = the FAB over a Profile mock (already handed off; the Profile backdrop is context only, do not implement), right = **the chat window described here**. Only the right phone is in scope for this document.

## Fidelity
**High-fidelity.** Colors and type sampled from the real app. Sizes and timings below are final.

---

## Screen structure (top → bottom)

1. Status bar (system)
2. **Chat header** (fixed)
3. **Message list** (scrolling)
4. **Quick-reply chip rail** (fixed, horizontally scrollable)
5. **Composer** (fixed)

All content is **data-driven** — nothing below is hardcoded copy. Every string, stat, and card in the mock is placeholder for a real API value.

---

## 1. Chat header

Height ~62pt, bottom border 1pt `#191010`.

| Element | Spec |
|---|---|
| Back chevron | `‹` `#8a8a8a`, 22pt, pops the view |
| Coach avatar mark | 34×34pt circle, 1.5pt coral border + 10pt solid coral center dot. Ring **pulses**: scale 1.0 → 1.12, opacity 0.9 → 0.45, 2.4s ease-in-out loop |
| Title | "LEAP COACH" — white, 15pt, weight 600, letter-spacing 2.4 |
| **Status line** | Coral `#FC5454`, 9.5pt, weight 500, letter-spacing 1.6, uppercase. **Dynamic** — see §3.1 |
| New-chat button | 30×30pt, radius 10, 1pt border `#241414`, coral `+`. Pressed bg `#160c0c`. Starts a fresh thread |

**Status line contract:** `"ONLINE · " + <current activity verb>` while the coach is working; plain `"ONLINE"` when idle; `"OFFLINE"` / `"RECONNECTING"` on network loss. It is the same state machine that drives the activity bubble — one source of truth, two renderings.

---

## 2. Message list

Vertical stack, 14pt gap, 16pt horizontal padding, 16pt top. Newest at the bottom, auto-scrolls to bottom on new message. Scroll container only — the header/rail/composer never move.

**Date divider:** centered, `#3f3f3f`, 9pt, weight 500, letter-spacing 2.4, uppercase — e.g. "TODAY · 2:48". Insert whenever the day changes between messages.

**Message entrance:** each bubble fades in + translateY 14pt → 0 + scale 0.97 → 1 over 0.4s `cubic-bezier(.2,.9,.3,1.2)`. In the mock the bubbles are staggered 0.12s to show a backlog animating in; **in production a newly arriving message animates alone with no delay.**

### 2.1 Coach bubble (inbound)
- Aligned left, max width **84%** of the list
- Background `#0B0707`, 1pt border `#2a1616`, radius `16 16 16 4` (the 4pt corner is the tail-side corner, bottom-left)
- Padding 13pt vertical / 15pt horizontal
- Body text `#D4D4D4`, 14pt, weight 300, line-height 1.55
- Timestamp below, outside the bubble: `#3f3f3f`, 9pt, letter-spacing 1, 5pt gap, left-aligned

### 2.2 User bubble (outbound)
- Aligned right, max width **78%**
- Background coral `#FC5454`, radius `16 16 4 16`, no border
- Text white, 14pt, weight 400, line-height 1.5
- Timestamp below, right-aligned, same style as above

### 2.3 Rich blocks inside a coach bubble
The coach can attach structured content under its text. These are **response block types** — the renderer should switch on a `type` field, not parse prose. Three are designed:

**a) Stat bars** — separated from the text above by a 1pt `#1d1111` rule with 12pt padding above/below; rows in a 9pt-gap grid. Each row: label (52pt fixed width, `#7a7a7a`, 10pt, letter-spacing 1.2, uppercase) · track (flex, 5pt tall, radius 3, background `#1a1a1a`) · fill (radius 3, width = value / category max) · value (white, 11pt, weight 600, 32pt wide, right-aligned).
Category colors are the app's existing discipline colors: **Static `#8b5cf6`**, **1MM `#f97316`**, **Power `#FC5454`**.
Any row the coach is calling out (the weak one) renders its label **and** value in coral at weight 600/700 — that emphasis flag comes from the response, not the client.
Bars should animate width 0 → value over ~0.5s ease-out when the bubble enters.

**b) Numbered steps** — 8pt-gap grid, 12pt below the text. Each row: coral index (11pt, weight 700, 12pt fixed width) + text (`#9a9a9a`, 13pt, weight 300, line-height 1.45). Count is variable.

**c) Session card** (tappable CTA) — 13pt below content. Padding 11pt, radius 11, 1pt border `#241414`, background `#0d0606`. Left: 30×30pt coral square, radius 9 (**slot for the discipline icon** — use the existing tab-bar glyph for that discipline). Middle: title white 13pt/600/letter-spacing 0.8 uppercase, subtitle `#6d6d6d` 10pt/letter-spacing 1.2 uppercase (e.g. "3 MOVEMENTS · ~14 MIN" — derive from the session payload). Right: coral `›` 17pt. Pressed/hover: border → `#FC5454`. Tapping deep-links into that session.

---

## 3. Live activity indicator ★ (the new piece)

Replaces the old three-bouncing-dots bubble. Purpose: while the coach works, **say what it is doing** instead of showing an opaque spinner. It occupies the position of the pending coach message, left-aligned, max width 84%, same bubble shell as a coach bubble (`#0B0707` / `#2a1616` / radius `16 16 16 4`), min width 232pt, and `overflow: hidden`.

**Anatomy, top to bottom:**

| Part | Spec |
|---|---|
| **Scanline** | 1pt line pinned to the bubble's top edge, `linear-gradient(90deg, transparent, #FC5454, transparent)`, sweeping translateX −100% → +100% → −100%, 2.6s ease-in-out loop. Clipped by the bubble. |
| **Spinner** | 17×17pt. Base ring 1.5pt `#2a1616`; over it a 1.5pt ring with only top+right edges coral, rotating 360° in 0.85s linear, infinite. |
| **Verb** | Current activity verb, coral, 9.5pt, weight 600, letter-spacing 2, uppercase — e.g. "READING". |
| **Counter** | Right-aligned, `#3f3f3f`, 9pt, weight 500, letter-spacing 1.2 — `"<current> / <total>"`. Omit if the total is unknown (streaming with no plan). |
| **Label** | Full-sentence description, 13.5pt, weight 300, line-height 1.4, 9pt below the row. Rendered as a **shimmer**: a `#5a5a5a → #F0F0F0 → #5a5a5a` gradient (220% width) clipped to the glyphs, sliding right→left over 1.9s linear, infinite. Fall back to solid `#9a9a9a` if gradient-clipped text isn't available on the platform. |
| **Progress ticks** | Row of segments, 5pt gap, 12pt below the label — one per stage. 3pt tall, radius 2. Completed **and** current = coral `#FC5454`; upcoming = `#2a1616`. The current one is **22pt wide**, all others **10pt**. Width and color animate over 0.5s (`cubic-bezier(.2,.9,.3,1.2)` for width, ease for color). |

### 3.1 Stage model — keep this dynamic
The mock cycles four stages every 1.9s **purely for demo**. In production the stages are **emitted by the backend as the request progresses** — do not fake a timer.

Each stage is:

```json
{ "verb": "READING", "label": "Reading your last 11 logs" }
```

The client holds `stages: Stage[]` and `currentIndex: number`, and renders: header status = `ONLINE · {verb}`, bubble verb = `verb`, label = `label`, counter = `currentIndex+1 / stages.length`, ticks from `currentIndex`.

Rules:
- **Labels must be real and specific.** "Reading your last 11 logs" uses the user's actual log count; "Comparing Static · Power · 1MM" names their actual disciplines. Never ship generic filler like "Thinking…" — the whole point is telling the user what is happening to *their* data.
- **The stage list is variable-length**, from 1 to ~6. Layout must not assume 4. If the backend can't declare the list up front, append stages as they arrive and hide the counter until the total is known.
- If a stage runs **> ~6s**, keep the shimmer going but don't invent a new stage — silence is better than a lie.
- On completion the bubble is **replaced in place** by the real coach message (crossfade ~0.2s, no layout jump — reserve the same left alignment).
- On failure, swap the bubble to an error state (coral border, "COULDN'T FINISH" + retry affordance) rather than leaving it spinning.
- Reduce-motion: drop the scanline, spinner rotation, and shimmer; keep the static label, verb, and tick progress — the *information* is not decoration.
- Accessibility: the bubble is an `aria-live="polite"` region announcing the label on each stage change; the ticks are `role="progressbar"` with `valuenow/valuemax`.

---

## 4. Quick-reply chip rail

Horizontal row above the composer, 12pt top padding, 8pt gap, 16pt horizontal padding, scrolls horizontally, no wrap.

Chip: padding 8pt / 13pt, radius 999, 1pt border `#2a1818`, coral text 11pt weight 500 letter-spacing 1.4, uppercase, `white-space: nowrap`. Pressed: bg `#160c0c`, border `#FC5454`.

Chips are **contextual to the last coach message** and returned with it (mock: "SCALE IT DOWN", "FORM CHECK", "WHY THIS?"). Tapping one sends it as the user's next message and clears the rail until the next response. Hide the rail entirely when the response carries no suggestions.

---

## 5. Composer

Row, 10pt gap, padding 14pt top / 16pt sides / 26pt bottom (safe area).

- **Input:** flex, 46pt tall, radius 23, background `#0d0909`, 1pt border `#211414`, 16pt horizontal padding. Placeholder "Ask your coach" `#5a5a5a`, 14pt weight 300. Caret is a 1.5×17pt coral bar blinking on a 1.1s step-end cycle (native caret tinted coral is fine).
- **Send / voice button:** 46×46pt coral circle, shadow `0 8px 20px rgba(252,84,84,0.4)`. Contains three 2.5pt white waveform bars animating height 8 → 18pt, staggered 0.15s — same motif as the FAB. Hover `scale(1.07)`, pressed `scale(0.93)`, 0.18s `cubic-bezier(.2,.9,.3,1.4)`.
- The icon should **swap to a send arrow once the input is non-empty** (voice when empty, send when typing). Disable the button while a response is in flight.

---

## Design Tokens

**Colors**
| Token | Value |
|---|---|
| Coral / brand accent | `#FC5454` |
| Screen background | `#000000` |
| Coach bubble bg | `#0B0707` |
| Coach bubble border | `#2a1616` |
| Header divider | `#191010` |
| Rich-block divider | `#1d1111` |
| Card bg / border | `#0d0606` / `#241414` |
| Chip border / pressed | `#2a1818` / `#160c0c` |
| Input bg / border | `#0d0909` / `#211414` |
| Coach body text | `#D4D4D4` |
| Secondary text | `#9a9a9a` |
| Muted label | `#7a7a7a` |
| Dim meta | `#6d6d6d` |
| Timestamp / faint | `#3f3f3f` |
| Track (empty bar) | `#1a1a1a` |
| Shimmer dark → light | `#5a5a5a` → `#F0F0F0` |
| Static (discipline) | `#8b5cf6` |
| 1MM (discipline) | `#f97316` |

**Typography** — Oswald (condensed sans), already bundled
| Use | Size / weight / tracking |
|---|---|
| Header title | 15 / 600 / 2.4 |
| Header status | 9.5 / 500 / 1.6 |
| Message body | 14 / 300 / line-height 1.55 |
| User message | 14 / 400 / line-height 1.5 |
| Activity label | 13.5 / 300 / line-height 1.4 |
| Activity verb | 9.5 / 600 / 2 |
| Step text | 13 / 300 / line-height 1.45 |
| Card title / sub | 13 / 600 / 0.8 · 10 / 400 / 1.2 |
| Chips | 11 / 500 / 1.4 |
| Timestamps, dividers | 9 / 500 / 1–2.4 |

**Motion**
| Name | Value |
|---|---|
| Message in | 0.4s `cubic-bezier(.2,.9,.3,1.2)`, fade + Y14 + scale .97 |
| Spinner | 0.85s linear, infinite |
| Shimmer | 1.9s linear, infinite |
| Scanline | 2.6s ease-in-out, infinite |
| Avatar ring pulse | 2.4s ease-in-out, infinite |
| Tick change | 0.5s `cubic-bezier(.2,.9,.3,1.2)` |
| Press | 0.18s `cubic-bezier(.2,.9,.3,1.4)` |
| Waveform bar | 1.0s ease-in-out, 0.15s stagger |

---

## Integration checklist
- [ ] Header status, activity verb, label, counter, and ticks all read from **one** stage state object.
- [ ] Stage labels come from the backend and reference real user data; no client-side filler strings.
- [ ] Stage list length is variable; layout tested at 1, 2, and 6 stages.
- [ ] Activity bubble → real message swap is a crossfade in place, no scroll jump.
- [ ] Failure and offline states designed in (error bubble, `RECONNECTING` status).
- [ ] Rich blocks render from typed response blocks (`stat_bars`, `steps`, `session_card`), unknown types degrade to plain text.
- [ ] Stat-bar fills use discipline colors and the emphasis flag from the payload.
- [ ] Session card deep-links; icon slot filled with the real discipline glyph.
- [ ] Chip rail hidden when no suggestions; chips clear after tap.
- [ ] Send button swaps voice ↔ send on input state; disabled while in flight.
- [ ] Reduce-motion path keeps all information, drops decoration.
- [ ] `aria-live` on the activity bubble, `role="progressbar"` on the ticks.
- [ ] Auto-scroll to bottom on new message; date dividers inserted on day change.

## Assets
None to export — everything is shapes and CSS. Two icon **slots** reference existing app glyphs: the session-card discipline icon and the composer send arrow.

## Files
- `Leap Coach FAB.dc.html` — the design reference. Exact timings live in the `@keyframes` block at the top; the stage model lives in the logic class at the bottom (`stages()` / `renderVals()`). Read those if any number here is ambiguous.
- See also `design_handoff_leap_coach_fab/README.md` for the FAB, its idle animations, and the first-turn coach panel.
