# Handoff: Leap Arena — Onboarding Welcome

## Overview
The first screen a new user sees after signup: a ~4s animated welcome over a looping background video that greets the user by name and leads into the assessment / first workout. Includes a Skip button. Ends on a held final line, after which the app routes to the next onboarding step.

## About the Design Files
Files in this bundle are **design references built in HTML/React** — prototypes of intended look, motion and timing, not production code. Recreate them in the target codebase (React Native, SwiftUI, Flutter, web, etc.) using its own animation library and patterns. The `animations-v3.jsx`, `ios-frame.jsx`, `tweaks-panel.jsx` and `support.js` files are prototyping scaffolding only (timeline engine, device bezel, design tweak panel) — do not port them.

## Fidelity
**High-fidelity.** Final copy, colors, type, timing and easing. Recreate pixel-accurately.

## Chosen direction: D — Slide
The prototype contains six motion options (A Rise, B Leap, C Fill, D Slide, E Type, F Focus — switchable in the Tweaks panel). **D — Slide is the selected direction**; the others are reference only.

## Screen
Canvas: 402 × 874 pt (iPhone 15/16 Pro logical size), full-bleed, status bar light content.

### Layers (back → front)
1. **Poster/fallback** — `assets/day-cover.png`, `cover`, centered. Shown until video loads or if it fails.
2. **Background video** — `assets/welcome-bg-2.mp4`, muted, looping, inline, `object-fit: cover`.
   - Playback rate **0.9×**
   - Filter ("Clean" look): `saturate(0.85) contrast(1.05) brightness(0.95)` + `blur(7px)`
   - Slow push-in: `scale(1.04 + blur·0.01 + t·0.004)` → starts at 1.11, grows ~0.4%/s
3. **Darkening gradient** (dim = 0.7), top → bottom:
   - 0%: `rgba(0,0,0,0.56)` · 35%: `rgba(0,0,0,0.35)` · 62%: `rgba(0,0,0,0.35)` · 100%: `rgba(0,0,0,0.80)`
4. **Kicker** — "LEAP ARENA", centered, top 110. Oswald 600, 12px, letter-spacing 4px, `#FC5454`. Fades in + rises 8px over 0.05–0.45s (easeOutCubic).
5. **Headline line** — left 32, right 32, top 350. Oswald 700, 46px, line-height 1.05, uppercase, letter-spacing 0.4px, `text-wrap: balance`. White, highlight words in `#FC5454`.
   - Underline bar below: margin-top 18, height 3, radius 2, `#FC5454`, width grows 0 → 56px.
6. **Progress dots** — centered row, bottom 120, gap 6. One dot per line. Dot: 6×6, radius 3. Active dot stretches to 24×6 (pill), `#FC5454`. Past dots `rgba(252,84,84,0.55)`, upcoming `rgba(255,255,255,0.28)`.
7. **Skip button** — top 58, right 20. Height 44, padding 0 18, radius 22, border `1px solid rgba(255,255,255,0.35)`, background `rgba(0,0,0,0.28)` + `backdrop-filter: blur(8px)`. Label "SKIP", Oswald 600, 13px, letter-spacing 2px, white, no text shadow.

All headline/kicker text carries a soft shadow: `0 2px 12px rgba(0,0,0,0.45), 0 1px 2px rgba(0,0,0,0.35)`.

### Copy (in order; **bold** = coral highlight)
1. Hi, **{firstName}**
2. Welcome to **Leap Arena**
3. **3 steps** to your first workout — held as the final frame

`{firstName}` = user's first name, trimmed. Fallback if empty: omit the line or use "Hi, **there**" (product decision — prototype falls back to "Jordan").

## Timing (playback seconds)
| Line | Start | Duration |
|---|---|---|
| 1 Hi, name | 0.0 | 1.1 |
| 2 Welcome to Leap Arena | 1.1 | 1.5 |
| 3 3 steps… (hold) | 2.6 | 1.6 → end at 4.2 |

Per line (t = time since line start, d = line duration):
- **In:** translateX 240 → 0 px and opacity 0 → 1 (opacity reaches 1 at ~70% of the move), t 0.02–0.60s, **easeOutExpo**
- **Underline:** width 0 → 56, t 0.25–0.80s, easeOutExpo
- **Out** (all but last line): translateX 0 → −240 px, opacity 1 → 0, last 0.30s of the line, **easeInCubic**
- **Dots:** incoming dot widens 6 → 24 over 0.4s (easeOutCubic); the previous dot shrinks back over the same 0.4s.

Final line stays on screen; the app then advances (auto-advance after hold, or a tap/CTA — product decision).

## Interactions & Behavior
- **Skip:** immediately ends the sequence and continues to the next onboarding step (in the prototype it jumps to the final frame). Hidden once the sequence completes.
- Video autoplays muted; if it fails, keep the poster image.
- **Reduced motion:** recommend showing all three lines statically (or crossfades only) and a still poster instead of video.
- Respect safe areas; Skip sits below the status bar/Dynamic Island.

## State
- `firstName: string`
- `lineIndex: 0 | 1 | 2` (driven by timeline)
- `completed: boolean` → hides Skip, triggers navigation
- `onSkip()` / `onComplete()` → route to assessment / first-workout flow

## Design Tokens
- Coral (accent): `#FC5454`
- White text: `#FFFFFF`
- Base background: `#000000` (page `#050505`)
- Inactive dot: `rgba(255,255,255,0.28)` · past dot: `rgba(252,84,84,0.55)`
- Font: **Oswald** (Google Fonts) 600/700; fallback `'Arial Narrow', sans-serif`
- Type: headline 46/1.05 · kicker 12, ls 4 · skip 13, ls 2
- Radii: dot 3 · underline 2 · skip pill 22

## Assets
- `assets/welcome-bg-2.mp4` — background loop (supplied by user)
- `assets/day-cover.png` — poster/fallback still
Replace with final licensed footage; keep it dark-friendly and loopable.

## Files
- `Leap Onboarding Welcome v2.dc.html` — entry; holds timing (`OM_SCENES`) and current settings (`TWEAK_DEFAULTS`)
- `onboarding-welcome-v2.jsx` — all screen logic: copy (`lines()`), `SlideD` (chosen), other variants, `VideoBG`, `SkipBtn`
- Scaffolding (don't port): `animations-v3.jsx`, `ios-frame.jsx`, `tweaks-panel.jsx`, `support.js`
