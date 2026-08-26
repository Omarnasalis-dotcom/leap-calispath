# Handoff: Leap Arena — Single-Screen Landing Page

## Overview
A single-viewport marketing landing page for "Leap Arena," a gamified calisthenics app. One hero screen (no scrolling sections, no footer) whose sole job is to sell the app in under 5 seconds and drive an App Store / Google Play download. Built and iterated as an HTML prototype; this package hands it off for implementation in a real codebase.

## About the Design Files
The files in this bundle (`Leap Arena Landing Page - Single Screen.dc.html` + `/assets`) are **design references created in HTML** — a working prototype showing the intended look, copy, layout, and micro-interactions. They are **not production code to copy directly**. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, plain HTML/CSS site builder, etc.) using its established component patterns, build pipeline, and asset system — or, if no frontend environment exists yet for the marketing site, choose the most appropriate lightweight framework (e.g. plain HTML/CSS/JS, or Next.js/Astro if the rest of the stack is React-based) and implement it there.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, copy, and interaction behavior are final. Recreate pixel-perfectly using the codebase's existing libraries/tooling; only the *implementation* (markup, CSS approach, componentization) should change to match that codebase's conventions.

## Screens / Views
Only one screen: **Hero / Landing**.

**Purpose:** Communicate "gamified calisthenics app" instantly and drive a store download. No scrolling — everything fits one viewport on desktop; on narrow/short viewports the layout is allowed to grow taller and scroll rather than clip content.

**Layout**
- Full-bleed root container, `min-height: 100vh`, flex column: `nav` → `section` (hero content).
- Background: dark near-black (`#0b0b0d`) with two soft radial red glows (top-left ~22%/0%, and bottom-right ~90%/95%), plus a very faint 64px grid-line texture masked to fade out radially from the upper-left, plus a mouse-reactive soft red "spotlight" radial gradient that follows the cursor (see Interactions).
- `nav`: height clamps between 64–84px depending on viewport height; flex row, space-between; logo image on the left, single red pill CTA button on the right.
- `section`: flex:1, horizontal padding clamps 20–80px depending on viewport width. Contains a centered max-width (1200px) two-column flex row that wraps to a single stacked column on narrow widths, vertically/horizontally centered.
  - **Left column** (text): flex-basis 440px, min-width 280px, left-aligned, vertically centered.
  - **Right column** (device mockup): flex-basis 260px, min-width 200px, max-width 340px, centered.
  - A single 1px vertical gradient line sits decoratively at ~top:8%/right:6% of the section (subtle red fade, no functional role).

**Components (left column, top to bottom)**
1. **Status badge**: pill, height 34px, red 1.5px border (`rgba(255,74,62,0.5)`), red-tinted fill (`rgba(255,74,62,0.08)`), a small 7px pulsing red dot + label `NOW LIVE ON iOS`, 12px/800-weight/3px letter-spacing, all-caps, color `#FF4B3E`.
2. **Headline** (`h1`): "Turn your calisthenics workout into a **game.**" — the word "game." is colored `#FF4B3E`; rest is white. All-caps via `text-transform:uppercase`. Font-size clamps 32–68px, weight 800, line-height 1.05, letter-spacing -0.5px, max-width 560px, `text-wrap:balance` (let it wrap naturally to balanced lines — never force a manual line break here; a prior iteration with a hard `<br>` produced an orphaned single word and was rejected).
3. **Subcopy** (`p`): "Track every rep, climb tier ladders across Power, Static and Endurance, and turn your training into a game you keep coming back to." Font-size clamps 15–20px, color `rgba(255,255,255,0.55)`, weight 500, line-height 1.55, max-width 460px.
4. **Store badges row** (flex row, gap 14px, wraps on narrow width): two "default style" store badges, NOT the red brand button —
   - **Apple App Store**: black (`#000`) rounded-rect (12px radius), 1px `rgba(255,255,255,0.14)` border, height 56px, padding 0 20px. White Apple glyph (22×22) + two-line label ("Download on the" 10px/600 at 70% white opacity, "App Store" 17px/800 white).
   - **Google Play**: same black badge shell, four-color Play-triangle glyph (blue `#00d2ff`, yellow `#ffcf00`, red `#ff3a44`, green `#38d47f` — standard Play Store mark colors), two-line label ("GET IT ON" / "Google Play") same type treatment.
   - Both badges: `hover` → background lightens to `#161616`, `translateY(-1px)`.

**Components (right column — device mockup)**
- A phone-frame mock (9px `#1a1a1c` border, 38px border-radius, black `#050302` fill) containing the **real app Profile screen screenshot** (`assets/profile-mockup-leap.png` — the user's own name in that screenshot has been edited to read "LEAP" as a brand placeholder; a real implementation should swap in whatever real/representative screenshot the team wants, at the same aspect ratio ~1206:2622).
- Width: `min(232px, 34vh, 62vw)` — i.e. capped by both viewport height and width so it never overflows on short or narrow screens.
- A soft ambient red glow blurs behind the phone (`radial-gradient` circle, blurred 30px, animated opacity/scale pulse ~4s loop).
- A soft dark blurred ellipse sits under the phone as a grounding "shadow" cue.
- A subtle diagonal glass-sheen overlay (linear-gradient white fade top-left corner) sits on top of the screenshot inside the rounded frame.
- **Floating stat chip**: dark glass card (`rgba(21,17,19,0.92)` + `backdrop-filter: blur(8px)`, 1.5px red border, 16px radius) positioned fully to the **left of and outside** the phone frame (`left:0; transform:translateX(-108%)`, `top:8%`) so it never overlaps the real screenshot content or the nav — this was iterated on explicitly; do not let this chip overlap either the header nav or any part of the phone image. Content: "TIER 7 · OLYMPIAN" (9px/700/1.5px tracking, 45%-white) over "+110 PTS THIS WEEK" (18px/800, `#FF4B3E`). Gentle continuous float animation (translateY ±12px, ~4.4s ease-in-out).

## Interactions & Behavior
- **Cursor parallax tilt**: the phone mockup's 3D transform (`perspective(1400px) rotateY() rotateX() rotate(1.5deg) translateY()`) responds to mouse position within the hero container. Base tilt is `rotateY(-8deg) rotateX(3deg)`; moving the cursor adds up to ±16deg of Y-rotation and ±12deg of X-rotation based on horizontal/vertical cursor position (0–1 normalized), plus a small vertical translate. Transitions smoothly (`0.25s ease-out`) back to the idle pose (`mx:0.66, my:0.42` — i.e. resting slightly right/up, not dead-center) on mouse-leave.
- **Cursor spotlight**: a `radial-gradient(420px circle at {x%} {y%}, rgba(255,74,62,0.16), transparent 62%)` full-bleed overlay follows the same normalized cursor position, at low opacity, purely ambient/atmospheric.
- **Status dot pulse**: 1.8s ease-in-out infinite opacity/scale pulse on the "NOW LIVE" dot.
- **Hover states**: nav CTA and both store badges lift slightly (`translateY(-1px)`) and brighten on hover; standard cursor pointer.
- **Responsive behavior**: this is a fluid, breakpoint-free layout — all sizing uses `clamp()`/`vh`/`vw`/`%` rather than fixed breakpoints, so it scales continuously rather than snapping. On narrow viewports the two-column row wraps to a stacked single column (device below text), and the outer container switches from a hard-clipped single viewport to a natural-height, scrollable page (no content should ever be clipped — an earlier iteration with `overflow:hidden` + fixed `100vh` clipped the bottom of the phone/stat-row on short viewports and was corrected to `min-height:100vh` + `overflow-x:hidden` only).

## State Management
No real state/data — this is a static marketing page. The only "state" is UI-only and ephemeral:
- `mx, my` (0–1 normalized cursor position within the hero) — drives the tilt + spotlight. Defaults to `(0.66, 0.42)` at rest.
- No forms, no auth, no API calls. Both CTAs should link out to the real App Store / Google Play listings once available (currently placeholder `#download` anchors).

## Design Tokens

**Colors**
- Background: `#0b0b0d` (near-black)
- Accent (brand red): `#FF4B3E`
- Text on accent (buttons): `#1a0605`
- Primary text: `#ffffff`
- Secondary text: `rgba(255,255,255,0.55)` (body copy), `rgba(255,255,255,0.4–0.45)` (micro-labels)
- Card/glass fill: `rgba(21,17,19,0.92)`
- Store badge fill: `#000` / hover `#161616`
- Google Play glyph: `#00d2ff`, `#ffcf00`, `#ff3a44`, `#38d47f`

**Typography**
- Font family: "Barlow Condensed" (Google Fonts), weights 500/600/700/800, fallback `system-ui, sans-serif`
- Headline: 32–68px (fluid), weight 800, uppercase, -0.5px tracking, 1.05 line-height
- Body: 15–20px (fluid), weight 500, 1.55 line-height
- Micro-labels/eyebrow: 9–12px, weight 700–800, 1.5–3px letter-spacing, uppercase

**Spacing / Sizing**
- Nav height: 64–84px fluid
- Section horizontal padding: 20–80px fluid
- Content max-width: 1200px
- Phone mockup width: `min(232px, 34vh, 62vw)`

**Border radius**
- Buttons/badges: 12–14px
- Chips/cards: 16px
- Phone frame: 38px
- Pills (status badge, nav CTA): 999px (full)

**Shadows**
- CTA buttons: `0 16px 34px -12px rgba(255,74,62,0.65)` (red glow drop-shadow)
- Phone frame: `0 50px 90px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.06)`
- Floating chip: `0 16px 34px -10px rgba(0,0,0,0.55)`

## Assets
- `assets/leap-logo.png` — LEAP wordmark, cropped/extracted from the app's own splash screen (white glyph on transparent background). Use the team's real vector logo file if/when available instead of this raster crop.
- `assets/profile-mockup-leap.png` — a real screenshot of the app's Profile screen, with the sample user's name pixel-edited to read "LEAP" as a placeholder. **Replace with a real, approved screenshot** (or re-shoot with a demo account) before shipping — do not ship a doctored screenshot to production.

## Files
- `Leap Arena Landing Page - Single Screen.dc.html` — the full working prototype (open directly in a browser). All markup/styling is inline; the only JS is the cursor-parallax logic described above.
