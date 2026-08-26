# Handoff: Admin Dashboard Redesign

## Overview
Visual redesign of the Leap Arena admin dashboard (`leap-arena-admin.vercel.app`) — the landing screen admins see after sign-in, showing arena-wide health at a glance: account counts, growth/activity trends, per-discipline participation, coach engagement, and the weekly-challenge configuration status.

## About the Design Files
The bundled file is a **design reference built as an interactive HTML prototype** (a self-contained `.dc.html` file that opens in a browser) — not production code to copy directly. Recreate this design in the admin app's real codebase (its existing web stack — React/Next/etc.) using its existing routing, data-fetching, and component patterns. Treat the HTML/CSS here as an exact visual spec.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and layout are final-intent. Chart data shown is placeholder — wire each chart to the real query described under "Data needed" below.

## Screen: Dashboard
**Reference viewport:** designed for desktop admin use (1600px+ wide), fluid down to ~1000px via flex-wrap (no fixed breakpoints — panels reflow rather than hide). **Accent color:** `#FF4B3E` (coral-red — the app's primary brand accent, switched from the previous amber/gold admin theme). **Warning/alert color:** `#F0A920` (amber) — reserved for "needs attention" states (the challenge-gap banner, "missing" pills), kept distinct from the brand accent so warnings read as a different signal than brand/action color. **Background:** `#0b0b0d` (page) / `#050302` (sidebar). **Typography:** Barlow Condensed (Google Fonts), weights 500/600/700/800, used exclusively.

### Layout (left → right, top → bottom)

**1. Sidebar** (250px fixed width, sticky full-height, `#050302` fill, 1px right border @ 6% white):
- "LEAP" wordmark (21px/800) + "ADMIN" pill badge (accent text on accent-tinted 12%-opacity background).
- Nav: Dashboard / Users / Leaderboards, then three labeled groups — CHALLENGES (Week editor, Templates, Analytics), COACHING (Clients, Program builder, Exercise library, Analytics), ARENA (Communities, Waitlist, Tournaments). Section labels: 10px/700, 1.5px tracking, 32% white. Active item ("Dashboard"): accent-tinted 10%-opacity background pill + 6px accent dot. Inactive items: 55% white, hover → 4%-opacity white background + full white text.
- Bottom-pinned "Sign out" button (42px tall, 1px border @ 12% white, hover fill 5% white).

**2. Challenge-gap banner** — full width, amber themed (border `rgba(240,169,32,0.35)`, fill `rgba(240,169,32,0.08)`), bold amber label + plain message. Only render when at least one active/upcoming week is missing a challenge for any tier group.

**3. Header row** — "Dashboard" title (33px/800) + "Arena-wide activity at a glance." subtitle, with a right-aligned last-updated pill (clock icon + "Updated just now" — replace with a real relative timestamp).

**4. Stat strip** — 6 cards in a wrapping flex row (`flex:1 1 148px` each), `rgba(255,255,255,0.03)` fill, 1px border @ 8% white, 16px radius: Warriors (total accounts), Assessed (completed onboarding), Active this week (logged anything since Saturday), Coaches, Communities, Waitlist (pending requests). Each card: small uppercase label, big number (32px/800), caption, and an optional colored delta badge top-right (green `#3DDC84` for positive, red `#F0625A` for negative) — only show a delta when there's a real week-over-week comparison; omit otherwise (don't fabricate deltas for counts like Coaches/Communities that don't have a trend).

**5. Charts, row 1** (flex-wrap row, 18px gap):
- **Warrior growth** (flex `2 1 480px`) — area + line chart, last 8 weeks of cumulative total-warrior count. Accent-colored line (3px stroke) with a soft accent-to-transparent gradient fill beneath, a solid dot marking the latest point, and week labels below the chart.
- **World participation** (flex `1 1 280px`) — horizontal bar list, one row per discipline (Strength, Power, Static, 1-Min-Max), each a label/value header row + a colored progress-style bar sized to that value's share of the largest value. Discipline colors are fixed brand tokens (see Design Tokens) — reuse them consistently anywhere these disciplines appear together across the app.

**6. Charts, row 2** (flex-wrap row, 18px gap):
- **Weekly activity** (flex `1 1 380px`) — vertical bar chart, active-warrior count for each of the last 6 weeks, bars scaled against a fixed-height track (not flex-basis — see implementation note below) so heights are truly proportional; current week's bar highlighted in accent color, prior weeks in muted white.
- **Coach engagement** (flex `1 1 380px`) — one row per coach: name, "`{clients}` clients · `{active%}`% active" caption, and an accent-filled horizontal progress bar showing active-client percentage.

**7. Weekly challenges panel** — full width, "This week" / "Next week" side-by-side columns, each showing the week's date and a row of pill badges (one per tier group — Recruits/Warriors/Legends) in amber "missing" styling when unconfigured, or a filled/green style once a challenge is assigned (not shown in this placeholder state since all groups are currently missing). "BOARDS →" link top-right routes to the full challenge board management screen.

## Implementation notes
- **Weekly-activity bar heights:** give each bar a fixed-pixel-height track container (e.g. `height: 96px`) and size the bar itself as a percentage of *that* fixed height. Don't apply a percentage height directly to a flex item sharing a `flex-direction:column` container with sibling labels — the percentage then resolves against the column's main-axis (flex-basis) instead of a fixed value, and bars stop being proportional to their data.
- All layout uses flexbox with `flex-wrap` and `gap` (no CSS grid dependency, no media queries) so panels reflow naturally at narrower widths rather than requiring explicit breakpoints.

## Data needed (per chart/panel)
- Stat strip: live counts for total accounts, completed-onboarding count, "active this week" (any log since last Saturday), coach count, community count, waitlist count; week-over-week deltas for Warriors and Active-this-week only.
- Warrior growth: cumulative total-warrior count sampled once per week, last 8 weeks.
- World participation: count of warriors with logged activity in each discipline (Strength/Power/Static/1-Min-Max), current period.
- Weekly activity: count of distinct active warriors per week, last 6 weeks.
- Coach engagement: per-coach assigned-client count + % of those clients active in the current period.
- Weekly challenges: per upcoming/current week, whether a challenge exists for each of the three tier groups (Recruits/Warriors/Legends).

## Design Tokens
- **Colors:** brand accent `#FF4B3E`; warning/amber `#F0A920`; discipline colors — Strength `#FF4B3E` (same as accent), Power `#F0A920` (amber), Static `#8B5CF6` (purple), 1-Min-Max `#FF6B35` (orange); positive delta `#3DDC84`; negative delta `#F0625A`; page background `#0b0b0d`; sidebar/panel-adjacent background `#050302`; card fill `rgba(255,255,255,0.03)`; card border `rgba(255,255,255,0.08)`.
- **Radii:** 16–18px (cards/panels), 10–11px (nav items/pills), 999px (progress bars/badges).
- **Border weight:** 1px standard for cards, 1.5px for nav/button outlines.

## Assets
No bitmap assets. All icons are hand-drawn inline linear SVG (stroke-based, round caps/joins, 1.8–2px stroke) — no icon font.

## Files in this bundle
- `Leap Admin Dashboard - Redesign.dc.html` — the screen itself, fully interactive (open directly in a browser).
