# Handoff: Milestone Lane Onboarding

## Overview
Replaces the flat Q&A onboarding with a visual "milestone lane" — a vertical connected path with nodes for each onboarding step. Built to extend into the future "My Journey" tab (streaks, daily guidance, weekly challenges, all 3 worlds) without redesign: nodes/lane use one repeatable visual language, and a "ghost node" at the bottom of every lane state previews that the path continues.

## About the Design File
`Leap Milestone Lane.dc.html` is a **design reference** (Claude "Design Component") — five artboards side-by-side, two of which are live/replayable CSS animations (not the final animation code — reference for exact timing/easing/colors only). Recreate in the app's real stack (Reanimated/Core Animation/Lottie etc.).

## Fidelity
High-fidelity. Colors, type, spacing sampled from the live app (Oswald, coral `#FC5454`, pure black) — same tokens as the Rank-Up, Program Days and Workout Runner screens already handed off. Tier number/name in the reveal are placeholders — dynamic in production.

## Artboards (402×874, dark, full-bleed black)

**A — Lane Start.** Node 1 (Assessment) active: segmented coral ring, pulsing "YOU ARE HERE" label, START pill CTA. Nodes 2–3 locked (dim ring + lock glyph, 20%/45% text opacity). Dashed connector between nodes. A dashed "ghost node" below node 3, label "YOUR JOURNEY CONTINUES" — the extensibility seed; a 4th/5th/Nth node appends here with zero visual-language change.

**B — Tier Reveal** (milestone 1 complete). Full-bleed celebration modeled beat-for-beat on the app's existing rank-up animation. Live-replayable in the file (REPLAY CELEBRATION button).

**C — Node Unlock 1→2.** The lighter transition when milestone 2 finishes: no full celebration, just node 1 filling to a coral check and node 2 lighting up from locked to active. Live-replayable (REPLAY UNLOCK button).

**D — Program Choice** (milestone 3). Three stacked cards: AI Coach, Customize Program, Ready Template. Selecting one exits onboarding — no return to the lane.

**E — Exit → Training Center.** Composited transition frame: the completed lane (all 3 nodes checked) recedes/dims/blurs while Training Center's hub cards crossfade in from below through a coral radial wipe.

## Motion Specs

### B. Tier-Reveal Celebration (~5.4s total, plays once, auto-starts on milestone-1 return)
| Time | Beat |
|---|---|
| 0–0.6s | White-ish coral radial flash fades in→out behind badge (ease-out) |
| 0.4–1.6s | 5 concentric tier rings (radii 40/54/68/82/96px around center) throw into place one at a time, 0.16s apart: `rotate(-140deg) scale(.3) opacity 0` → overshoot to `rotate(8deg) scale(1.06)` at 70% → settle `rotate(0) scale(1)`, cubic-bezier(.22,1.6,.4,1). All dim coral (`#4A2020`, 2px) except outermost (coral `#FC5454`, 3px), which then holds a slow glow-pulse loop (2.2s, box-shadow 22px↔40px blur) indefinitely. |
| 0.9–1.8s | 8-point spark burst radiating from center at 45° increments, 150–176px travel, staggered 0.05s, fading+shrinking out (ease-out) |
| 1.5–2.0s | Tier number pops into ring center: `scale(0)→1.12→1`, overshoot spring |
| 2.0–3.0s | Rank name (e.g. "EPHEBE") fades/rises up with a white→coral→white diagonal shimmer sweep (1s) |
| 2.2–2.7s | "TIER n OF 9" sub-label fades/rises in below |
| 2.7–3.2s | "Milestone 1 of 3 complete" stat line fades/rises in, muted |
| 2.9–3.5s | Progress pill bar (8px, track `#4A2020`, fill `#FC5454` w/ glow) fills to 33% |
| 3.0–4.7s | 9-piece confetti (mixed white/coral/dim, 6×10px rounded rects) drifts up ~130px staggered 0.13s, rotating, fading out |
| 4.6–5.0s | CONTINUE pill pops in with overshoot spring at bottom; a soft diagonal sheen sweep loops across it continuously afterward (3s cycle) |

### C. Node Unlock 1→2 (~1.2s total, lighter — no confetti/sparks)
| Time | Beat |
|---|---|
| 0–0.35s | Node 1's ring+number layer fades out (ease-in) while a filled coral circle + checkmark crossfades in underneath with a spring pop (0.2–0.6s) |
| 0.25–0.65s | Connector line: dashed→solid coral draws top-down (`scaleY(0)→1`, transform-origin top, ease-out) while a small glowing dot travels down the same span, fading out on arrival |
| 0.5–0.75s | Node 2's dim lock-ring fades out (ease-in) as a soft coral radial burst blooms behind it (0.55–1.15s) |
| 0.58–1.03s | Node 2's active coral ring + number spring in (overshoot) |
| 0.65–1.05s | Node 2's copy brightens (dim→full-opacity crossfade), pulsing "YOU ARE HERE" label, START pill CTA fades/rises in |
| — | Node 3 stays locked/static throughout — unaffected by this transition |

### Ambient / idle motion (all lane states, not just during transitions)
- Any **active** node: continuous soft radial glow-pulse behind its ring (2.4s ease-in-out loop, opacity .45↔1, scale 1↔1.18) — reads as "current step," not a one-off.
- Any **completed** (solid coral) connector line: a faint light streak travels top-to-bottom continuously (2.6s linear loop) — subtle "energy flowing forward" cue.
- Locked nodes/lines: fully static — no motion until unlocked, by design (draws contrast/attention to what's active).
- CTA pills (START/CONTINUE/BUILD): a soft diagonal white sheen sweeps across every ~3–3.2s, looping — matches the shine treatment already used on primary buttons elsewhere in the app.

### D. Program Choice — entrance
Cards stagger in on screen entry (fade+rise, ~80ms apart). Tap: 96% scale press (100ms), then border sweeps to full coral (150ms), then navigates straight to Training Center (no return to lane — this is onboarding's exit point).

### E. Exit → Training Center (~600ms, single continuous motion, no hard cut)
Lane content scales to 0.94, shifts up 14px, blurs 1px, dims to ~25% opacity. A coral radial wipe expands from the milestone-3 node's position over ~450ms (ease-in-out). Training Center content crossfades in beneath it starting ~200ms in.

## Design Tokens
- Coral (primary accent): `#FC5454` — reserve for active/current + CTAs, don't saturate the screen
- Coral dim (locked ring/track): `#4A2020`
- Background: `#000000` full-bleed
- Text: white at 85% / 45% / 20% opacity for primary/secondary/tertiary — no separate gray palette
- Type: Oswald, weights 300–700. Structural labels (milestone titles, "YOU ARE HERE", tier callouts) are extrabold/uppercase/wide-tracked — used sparingly
- Node circle: 64px, 2px ring (dim) / 3px (active/segmented), coral fill + white check icon (complete)
- Connector line: 2px, dashed `rgba(255,255,255,.12)` (locked ahead) / solid coral (complete)
- Ghost/extensibility node: 1.5px dashed `rgba(255,255,255,.12)` circle, no fill, 20%-opacity label

## Extensibility Note
The lane's visual grammar (node states: locked/active/complete + dashed-vs-solid connector) already generalizes past 3 nodes — the ghost node in every lane artboard demonstrates a 4th+ node appending below with no new component needed. This is the same grammar to reuse for "My Journey" (daily workouts, weekly challenges, per-world progress).

## Files
- `Leap Milestone Lane.dc.html` — all 5 artboards + the two live/replayable animations (tier-reveal, node-unlock). Exact keyframe percentages and easing curves in the `<script data-dc-script>` block are authoritative if anything above is ambiguous.
