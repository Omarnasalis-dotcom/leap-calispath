# Handoff: Rank Up Celebration Screen

## Overview
A milestone celebration screen shown when a user completes a trial and advances to a new tier/rank in the Leap Spartan-calisthenics app. Replaces a flat "level up" state with a choreographed, ~5.7s reveal sequence: impact flash → expanding rings/sparks → tier-ring stack "thrown" into place → rank name shimmer reveal → stats → progress bar with confetti burst → CTA.

## About the Design Files
The bundled files are **design references built in HTML/React** (a Claude "Design Component" using a custom lightweight composition/animation engine) — they demonstrate exact layout, timing, colors, and motion curves, not production code to copy verbatim. Recreate this in the target app's real stack (React Native/Swift/Kotlin/etc., whichever this codebase uses) using its existing animation primitives (Reanimated, Core Animation, Lottie, etc.) and component patterns.

## Fidelity
**High-fidelity.** Colors, type, spacing, and motion timings below are final and sampled directly from the live app's own screenshots (coral accent, pure black background) — implement pixel- and timing-accurate.

## Screen: Rank Up
**Purpose:** Confirms trial completion and celebrates the new tier reached; leads to Continue (primary) or Share.

**Canvas:** 402×874pt (iPhone-class portrait). Pure black (`#000000`) background, full bleed, no scroll.

### Timeline (total ~5.7s, single continuous sequence, plays once)
| Time (s) | Beat | What happens |
|---|---|---|
| 0.0–0.55 | Impact | Screen flashes white at opacity 0.4 → 0, ease-out cubic. A soft coral radial glow (`#FC5454` at ~13% opacity, `radial-gradient` 340×340 circle centered on badge) fades in over the same span. |
| 0.4–1.2 | Rings + sparks | Two circular rings (220px, 1px coral stroke) expand from scale 0.3 → 2.8 / 2.1 respectively, staggered 0.15s apart, fading out as they grow (ease-out cubic). 6 small coral dot sparks (3.5px→1.5px) fly outward from center at angles 10/70/130/190/250/310°, staggered ~0.05s each, distance 120–168px, fading out past 50% progress. |
| 0.4–1.8 | Tier rings "throw in" | 5 concentric rings (radii 40,54,68,82,96px) are flung into place one at a time, 0.16s apart, each animating rotation −140°→0° and scale 0.3→1.0 with ease-out-back (overshoot). All rings use dim coral (`#4A2020`) except the outermost/current ring, which is full coral (`#FC5454`, 3px stroke) — mirrors the app's own tier-ring stack. |
| 1.1–1.4 | Tier number pop | Big number ("5") pops into the ring stack's center, scale 0→1 with ease-out-back overshoot, fill coral, 60px Oswald bold. |
| 1.2–2.1 | Rank name reveal | "LOCHAGOS" fades/rises up (18px, ease-out cubic) with a diagonal white→coral→white shimmer sweeping left to right over 0.8s. |
| 1.35–2.25 | Sub-label | "TIER 5 OF 9" fades/rises in below the rank name, coral, 15px, letter-spacing 2px. |
| 2.2–2.6 | Stats | "Time: 6:34" fades/rises in, muted gray (`#808080`), 16px. |
| 2.4–3.0 | Progress bar fill + confetti | An 8px-tall pill progress bar (track `#4A2020`, fill `#FC5454`) fills 0%→100% over 0.6s (ease-out cubic). 8 small coral/dim confetti rectangles (6×10px, rounded 2px) rise and fade out behind/around the bar, staggered starts, each drifting 220–280px upward while rotating 140–370°. |
| 3.0–3.5 | Completion burst | At fill completion, a 20px coral dot at the bar's right end scales 1→3.2 while fading out (glow burst), and the bar's fill gains an intensifying box-shadow glow. Label "TIER PROGRESS · MAXED" sits below in muted gray, 12px, caps. |
| 3.6–4.4 | CTA | "CONTINUE" pill button pops in (scale 0→1, ease-out-back) at the bottom. |
| 4.4–5.2 | Hold | Scene holds on final state. |

### Components
**Badge / tier-ring stack** — centered horizontally, top ≈150px, 200×200px SVG viewbox −100..100.
- 5 concentric circles, radii 40/54/68/82/96, stroke width 2px (dim) / 3px (outermost/current)
- Dim ring color `#4A2020`, active/current ring color `#FC5454`
- Center number: Oswald bold, 60px, fill `#FC5454`

**"RANK UP" label** — top 68px, centered, coral `#FC5454`, 13px, letter-spacing 5px, weight 500.

**Rank name** — top 388px, centered, Oswald bold 38px, letter-spacing 2px, white base with coral shimmer sweep.

**Sub-label (tier)** — top 440px, centered, coral `#FC5454`, 15px, letter-spacing 2px, weight 500.

**Stat line (time)** — top 484px, centered, `#808080`, 16px, weight 300.

**Progress bar** — positioned left/right 60px inset, top 560px. Track height 8px, radius 4px, background `#4A2020`; fill background `#FC5454` with glow shadow.

**CTA button** — left/right 40px inset, bottom 90px, height 58px, radius 16px, background `#FC5454`, centered white Oswald 600 text "CONTINUE", 15px, letter-spacing 3px, box-shadow `0 10px 24px rgba(252,84,84,0.27)`.

## Interactions & Behavior
- Auto-plays once on screen entry, no user input required to progress.
- "Continue" advances to next screen (e.g., dashboard/next trial).
- A "Share" secondary action was scoped in an earlier iteration but is not in the current build — confirm with design if still wanted.
- No loading/error states — this is a static celebratory reveal triggered after a trial-completion API call already resolved successfully.
- All motion uses only three easing patterns: fade+rise (ease-out cubic), pop/overshoot (ease-out-back), and ring-expand (ease-out cubic) — keep to matching native equivalents (e.g. `UIView.animate` spring / `withSpring` in Reanimated for the overshoot beats).

## Design Tokens
**Colors**
- Coral (primary accent): `#FC5454`
- Coral dim (inactive ring/track): `#4A2020`
- Background: `#000000`
- Muted text: `#808080`
- White: `#FFFFFF`

**Typography**
- Family: Oswald (condensed sans), weights 400/500/600/700
- Rank name: 38px / 700 / letter-spacing 2px
- Tier number: 60px / 700
- Section label ("RANK UP"): 13px / 500 / letter-spacing 5px
- Sub-label ("TIER 5 OF 9"): 15px / 500 / letter-spacing 2px
- Stat line: 16px / 300
- Button label: 15px / 600 / letter-spacing 3px
- Micro-label ("TIER PROGRESS · MAXED"): 12px / letter-spacing 1px

**Spacing / geometry**
- Canvas: 402×874
- Badge: 200×200, centered, top 150
- Progress bar: inset 60px L/R, top 560, height 8, radius 4
- CTA: inset 40px L/R, bottom 90, height 58, radius 16

**Shadows**
- CTA button: `0 10px 24px rgba(252,84,84,0.27)`
- Progress fill glow: `0 0 6–16px` coral (intensifies on completion burst)
- Completion burst dot: `0 0 20px` coral

## Assets
No image/icon assets — everything is drawn (SVG circles/text + CSS shapes). Font loaded from Google Fonts (Oswald); swap for the app's bundled Oswald asset if already vendored.

## Files
- `Leap Level Up.dc.html` — entry file, scene/cue timeline definition
- `level-up-piece.jsx` — the full composition: all components and their exact motion math (every timing/easing value is authoritative — read this file for exact numbers if anything above is ambiguous)
