# Handoff: Profile Screen Redesign

## Overview
UX redesign of the Leap calisthenics app's Profile screen — the user's identity, tier-level progress, cross-discipline achievement summary, community actions, and quick links to their workout program and weekly challenge.

## About the Design Files
The bundled file is a **design reference built as an interactive HTML prototype** (a self-contained `.dc.html` file that opens in a browser) — it is not production code to copy directly into the app. The task is to **recreate this design in the app's real codebase** (its existing iOS/Android/React Native/web stack) using the codebase's existing component patterns, navigation, and data layer. Treat the HTML/CSS/JS here as an exact visual and interaction spec, not as a library to import.

## Fidelity
**High-fidelity.** Colors, typography, spacing, iconography, and interaction states are final-intent. Reproduce pixel-for-pixel where feasible; substitute native platform equivalents (e.g. a native text input instead of an HTML `<input>`) while keeping the exact metrics called out below.

## Screen: Profile
**Purpose:** Show the signed-in (or guest) user's identity and tier level, a cross-discipline "Well-Rounded Athlete" achievement summary, quick actions to create/join a training community, three at-a-glance stat cards, and entry points to "My Workout Program" and the current "Weekly Challenge."

**Reference viewport:** 402×874 (iPhone-class screen). **Accent color:** `#FF4B3E` (red — same accent used on the Power/Strength world screens; this is the app's primary/default brand accent). **Background:** `#050302` with a faint radial red glow at the top: `radial-gradient(120% 60% at 50% 0%, rgba(255,74,62,0.10), transparent 60%)`. **Typography:** Barlow Condensed (Google Fonts), weights 500/600/700/800, used exclusively throughout.

### Layout (top → bottom)

1. **Guest banner** (conditional — only rendered when the user is not signed in): full-width minus 20px side margins, 12px/16px padding, 14px border radius, 1.5px accent border @ 40% opacity, accent fill @ 8% opacity, `display:flex` row with a person icon, a two-line text block ("You're browsing as a guest" 13.5px/700 white + "Sign in to save your progress across devices" 10.5px/regular @ 45% white), and a right-aligned "SIGN IN" label (12px/800, accent color, 1px letter-spacing). The entire banner is tappable → triggers sign-in. If the app doesn't have a guest mode, omit this block entirely; don't leave a placeholder.

2. **Identity header**, 18px top margin, 20px side margins, laid out as a **centered column** (avatar, name, tier line all center-aligned) with the settings gear as a separate icon absolutely positioned at the top-right of this block (not inline in the row — keeping the gear out of the flex row is what allows the name/tier text to be truly centered rather than off-center due to asymmetric icon widths):
   - Avatar: 62×62px circle, 2px accent border @ 50% opacity, user's photo (falls back to a placeholder state if no photo set).
   - Name: "OMAR NASSER" — 23px/800, white, 0.5px letter-spacing, 10px margin-top from avatar.
   - Tier line: "OLYMPIAN · TIER 7 OF 9" — 11.5px/700, accent color, 1.5px letter-spacing, 3px margin-top.
   - Settings gear: 40×40px rounded-12px tile, `rgba(255,255,255,0.06)` background (hover: 0.1), centered gear icon (18px, stroke `rgba(255,255,255,0.6)`, 1.8px stroke width), positioned `top:0; right:0` relative to the header block.

3. **Tier-level ring badge**, 22px top margin, centered, 150×150px: a set of **N concentric circles where N equals the numeric tier level** (7 rings for tier 7) — this is a deliberate design rule, not a fixed decoration count. Rings are evenly spaced from an inner radius of 34px to an outer radius of 73px; every ring except the outermost is a faded accent red (opacity ramps from ~0.22 at the innermost ring up to ~0.5 approaching the outer rings); **the outermost ring is solid, full-opacity accent color**. Centered inside all the rings: the tier number itself ("7") at 42px/800, accent color, no other text inside the rings (no caption/label — keep this area to just the number). If tier level changes, regenerate the ring set (recompute radii spacing and ring count) rather than hard-coding 7.

4. **"Well-Rounded Athlete" achievement card**, 20px top margin, 20px side margins, 18px border radius, 1.5px accent border @ 30% opacity, accent fill @ 5% opacity, 15px/16px padding:
   - Header row: a small trophy/medal icon (16px, accent stroke) + "Well-Rounded Athlete" (15.5px/700 white) on the left; the total combined score (18px/800, accent color) right-aligned.
   - Subcaption directly below, indented to align with the title text (not the icon): "Static · Power · 1MM" (10.5px/600, 40% white).
   - Progress bar, 13px margin-top: 7px-tall pill track, `rgba(255,255,255,0.08)` background, filled portion in solid accent color, width = `(total score / target) * 100%`. **This bar must always compute from the real total — never hard-code a full/100% bar when the score is 0.** This was a real bug in the original app (also present on the Static and 1MM world screens) and must not be reintroduced.
   - Legend row, 11px margin-top, 17px gaps: three inline groups, each a 7px color dot + bold value + label — purple dot (`#8B5CF6`) "Static", accent-red dot "Power", orange dot (`#FF6B35`) "1MM". These three colors are the app's fixed per-discipline color code (purple=Static, red=Power, orange=1MM/Endurance) and should be used consistently anywhere these three disciplines are shown together.

5. **Two side-by-side action buttons**, 18px top margin, 10px gap, each `flex:1`, 48px tall, 13px border radius:
   - "CREATE COMMUNITY" (left): 1.5px border @ 14% white, transparent fill, a people icon (15px, `rgba(255,255,255,0.7)` stroke), label 13px/700 @ 80% white.
   - "JOIN COMMUNITY" (right): solid accent fill, a door/arrow icon (15px, dark stroke matching the on-accent text color), label 13px/800, dark text (`#1a0605`) for contrast on the accent background.
   - **Tapping "Create Community" opens a bottom-sheet modal** — see "Create Community Modal" below.

6. **Three-column stat grid**, 14px top margin, 10px gaps, each card 13px border radius with a 1.5px border @ 30% opacity + matching 6% fill in that card's tint color, 11px/7px padding:
   - Card 1 "STATIC" — purple tint (`#8B5CF6`), an icon, the label "STATIC" (11px/700 white), and a caption "SUGGESTED NEXT" (8.5px/600 @ 40% white) — this is a recommendation, not a stat/count.
   - Card 2 "+`{weekly points}`" — accent-red tint, an up-trend icon, the number (14px/800 white, prefixed with `+`), caption "PTS THIS WEEK" (8.5px/600) — a rolling weekly stat.
   - Card 3 "`{workout count}`" — orange tint (`#FF6B35`), a target/rings icon, the number (14px/800 white), caption "WORKOUTS LOGGED" (8.5px/600) — a lifetime count.
   - **Each card's caption must state what kind of number it is** (suggestion vs. weekly stat vs. lifetime count) — in the original app these three cards looked visually identical with no indication of what distinguished them.

7. **"MY WORKOUT PROGRAM" button**, 16px top margin, 20px side margins, 52px tall, 15px border radius, 1.5px accent border @ 40% opacity, accent fill @ 6% opacity, a workout/calendar icon (16px, accent stroke) + label (14px/700, white, 1px letter-spacing). **Border must be a single consistent accent color — do not use a multi-color (e.g. purple-to-orange) gradient border here**, since no other element on this screen mixes unrelated hues; a mixed-color border reads as a rendering glitch, not an intentional design choice.

8. **"WEEKLY CHALLENGE" button**, 14px top margin, 20px side margins, 56px tall, 15px border radius, solid accent fill, a trophy/shield icon (18px, dark stroke) + label (15px/800, dark text `#1a0605`, 1.5px letter-spacing). Press state: scale to 0.98.

9. **Bottom tab bar** (fixed, not part of the scrolling area): black background, 1px top border @ 8% white, 5 evenly spaced tabs (Profile / Strength / Power / Static / 1MM), each a 20×20px icon + 9px/700 uppercase label. Active tab (Profile, since this is the Profile screen) shows a small 20×3px accent-colored pill above its icon and renders icon+label in accent color; inactive tabs render at 40% white opacity.

### Create Community Modal (opens on tapping "Create Community")
A bottom sheet, not a centered dialog: absolutely positioned over the whole screen (`position:absolute; inset:0`), a `rgba(0,0,0,0.65)` scrim behind it, content anchored to the bottom (`align-items:flex-end`). The sheet itself: full width, rounded top corners only (24px), dark fill (`#0e0908`), 1px border @ accent 25% opacity, 22px/20px/28px padding.
- Header row: "CREATE COMMUNITY" title (22px/800, white) + a 32×32px circular close (X) button on the right.
- "COMMUNITY NAME" field: label (11px/700, 1.5px tracking, 45% white) with a live character counter on the right ("`{n}`/30"); a 50px-tall text input below (12px border radius, 1.5px border @ 16% white, placeholder "e.g. Iron Warriors Gym", 30-character max).
- "JOIN CODE" field, 20px top margin: label above a 50px-tall **read-only** display row (not an input — this is a key fix from the original design) showing an **auto-generated code** (e.g. "IRON4821", format: `IRON` + 4 random digits) in accent color, with a "SHUFFLE" control (refresh icon + label, accent color) on the right that regenerates a new random code on tap. Helper text below (11px, 40% white): "Generated automatically — share it with people you want to join. It can't be changed after you create the community." — **the original design had this as a blank input field asking the user to invent their own unique code, which is confusing and error-prone; auto-generating it with a shuffle/regenerate option is the intended behavior.**
- "CREATE" button, 24px top margin, 54px tall, 14px border radius: **disabled state until the community name field is non-empty** — disabled renders as `rgba(255,255,255,0.08)` background with `rgba(255,255,255,0.3)` text and a default (non-pointer) cursor; enabled renders as solid accent fill with dark (`#1a0605`) text and a pointer cursor. Tapping while enabled submits and closes the sheet.

## Interactions & Behavior
- Tapping the guest banner (if present) → begin sign-in flow; in this prototype it just toggles a demo boolean.
- Tapping "Create Community" → opens the bottom-sheet modal described above.
- Modal's name field is a controlled text input (max 30 chars, live counter).
- Modal's join code is generated client-side on first render and can be regenerated via "Shuffle"; in production this should be generated/validated server-side to guarantee uniqueness.
- "CREATE" is inert while the name field is empty/whitespace-only; once valid, tapping it should call the create-community API, then navigate/dismiss.
- "My Workout Program" and "Weekly Challenge" buttons navigate to their respective screens (out of scope for this handoff — see companion Workout Program / Weekly Challenge specs if provided separately).
- The achievement progress bar, the three stat cards, and the tier ring must all be computed from live user data — none of them should ever render a "fake full" or placeholder state that doesn't correspond to the actual underlying number.

## State Management
- `isGuest: boolean` — controls whether the guest banner renders.
- `communityName: string`, `joinCode: string` — local form state for the Create Community modal.
- `showCreateModal: boolean` — modal visibility.
- Derived: `canCreate = communityName.trim().length > 0` (drives the CREATE button's enabled/disabled visual and interactivity).
- Data needed from the backend: user's display name, avatar URL, tier level (integer) and tier name (e.g. "Olympian"), per-discipline scores (Static/Power/1MM) and their combined total + the achievement's target score, weekly points earned, lifetime workout count, and a "suggested next discipline" recommendation.

## Design Tokens
- **Colors:** accent `#FF4B3E`; discipline colors — Static `#8B5CF6` (purple), Power `#FF4B3E` (red, same as accent), 1MM `#FF6B35` (orange); page background `#050302`; primary text `#fff`; secondary/caption text `rgba(255,255,255,0.35–0.5)`; card borders `rgba(255,255,255,0.14–0.16)` for neutral cards, or the relevant accent/discipline color at 30% opacity for tinted cards.
- **Radii:** 999px (pills/circles/avatar), 24px (modal sheet top corners), 12–18px (cards/buttons/tiles).
- **Border weight:** 1.5px standard.
- **Minimum tap target:** 44px — the two community-action buttons (48px) and the two bottom CTAs (52/56px) all clear this; the settings gear (40px) is a secondary/infrequent action and is an accepted exception matching the rest of the app's icon-button sizing.

## Assets
No bitmap/photo assets other than the user's own avatar photo (user-provided, not a design asset). All iconography is hand-drawn inline linear SVG (2px stroke, round caps/joins) — no icon font. The iOS device chrome (status bar, notch, home indicator) in the reference file comes from a reusable frame component (`ios-frame.jsx`) — this is only used to preview the screen like a real device and is not part of the production design; the `image-slot.js` helper (a drag-and-drop image placeholder web component) is likewise only a prototyping convenience for the avatar and not needed in production, where the avatar will bind to the real user photo.

## Files in this bundle
- `Leap Profile Screen - Redesign.dc.html` — the screen itself, fully interactive (open directly in a browser to try the guest-banner toggle and the Create Community modal).
- `ios-frame.jsx`, `image-slot.js` — prototyping-only support files referenced by the screen; not part of the production design.
