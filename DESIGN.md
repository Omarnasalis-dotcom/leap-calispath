<!-- Adapted for React Native: this is a native app (StyleSheet objects, not CSS/Tailwind), so the
     component tokens below describe style props directly, and no HTML/CSS sidecar or browser
     "live mode" was generated — neither applies to a native iOS/Android app shell. -->
---
name: Leap Arena
description: A gamified calisthenics progression tracker with a Spartan-ranked tier system.
colors:
  ember-red: "#FF5252"
  danger-red: "#e24b4a"
  static-violet: "#7E57C2"
  endurance-orange: "#FF7043"
  matte-black: "#050505"
  charcoal: "#0A0A0A"
  surface: "#111111"
  surface-border: "rgba(255,255,255,0.05)"
  ink-primary: "rgba(255,255,255,0.85)"
  ink-secondary: "rgba(255,255,255,0.45)"
  ink-tertiary: "rgba(255,255,255,0.2)"
typography:
  display:
    fontFamily: "Orbitron_900Black"
    fontWeight: 900
  label:
    fontFamily: "PlusJakartaSans-ExtraBold"
    letterSpacing: "1-3px, uppercase"
  title:
    fontFamily: "PlusJakartaSans-Bold"
  body:
    fontFamily: "PlusJakartaSans-Regular"
rounded:
  pill: "20px+"
  card: "12-24px"
  circle: "50%"
components:
  button-primary:
    backgroundColor: "{colors.ember-red}"
    textColor: "#000"
    rounded: "{rounded.card}"
    padding: "14px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ember-red}"
    rounded: "{rounded.card}"
---

# Design System: Leap Arena

## 1. Overview

**Creative North Star: "The Disciplined Arsenal"**

Leap Arena is a dark, matte training tool for serious calisthenics athletes — a Spartan-ranked tier system (Helot → Eternity) expressed through restraint rather than spectacle. The identity is warrior/military at its root (rank names, tier progression, "the arena"), but the execution goal is precision: a near-black surface, a single disciplined red as the primary voice, and typography that's heavy and uppercase only where it earns its place (tier names, section labels, ranks) rather than everywhere.

This system explicitly rejects the generic template fitness-app / SaaS look — gradient hero stat cards, identical repeated stat tiles, decorative card grids with no hierarchy. Every screen should read as built for this app specifically, not assembled from a component library's defaults.

**Key Characteristics:**
- Matte near-black surfaces (`#050505`) with a single disciplined red accent (`#FF5252`), used sparingly and consistently as the "you are here / this matters" signal
- Each training discipline (Strength/Power = red, Static = violet, Endurance/1MM = orange) carries its own accent, so the app color-codes *what world you're in* rather than using one accent everywhere
- Heavy, uppercase, wide-tracked labels (PlusJakartaSans ExtraBold) for anything structural (tier names, section headers, stat labels) — this is the app's signature typographic voice
- Flat, bordered surfaces over shadows; depth comes from subtly ascending background lightness (`#050505` → `#0A0A0A` → `#111111`), not drop shadows

## 2. Colors

The palette is disciplined-dark: one near-black base, one primary accent, and a small set of per-discipline accents that color-code training modes rather than decorating pages.

### Primary
- **Ember Red** (`#FF5252`): the primary accent — tier rings, active states, primary CTAs, the Strength and Power disciplines. This is the app's "you are here" color; it should read as intentional and rare, not sprayed across every element.

### Secondary
- **Static Violet** (`#7E57C2`): reserved for the Static (isometric holds) discipline — headers, mastery rings, leaderboard rows on that screen only. Never mixed with Ember Red on the same screen.
- **Endurance Orange** (`#FF7043`): reserved for the 1MM (endurance) discipline, same rule — its own screen, its own color, no bleed into other disciplines.

### Tertiary
- **Danger Red** (`#e24b4a`): destructive actions only (delete account). Deliberately distinct from Ember Red so a destructive action never gets read as "the same red as everything else" — don't collapse these into one red.

### Neutral
- **Matte Black** (`#050505`): primary background — the base surface, used for maximum screen area.
- **Charcoal** (`#0A0A0A`): secondary background, one step up from Matte Black (gradient base, subtle depth).
- **Surface** (`#111111`): card/panel background, one step up again — this is where content sits.
- **Surface Border** (`rgba(255,255,255,0.05)`): the only border treatment in the system — a barely-there hairline, never a heavier stroke.
- **Ink Primary / Secondary / Tertiary** (`rgba(255,255,255,0.85 / 0.45 / 0.2)`): the three-step text opacity ramp used everywhere instead of separate gray hex values — primary for values/names, secondary for labels/subtext, tertiary for disabled/locked states.

### Named Rules
**The One World, One Color Rule.** A screen belongs to exactly one discipline accent (Strength/Power = red, Static = violet, Endurance = orange). Never mix two discipline accents on the same screen; never use a discipline's accent outside its own screen.

## 3. Typography

**Display Font:** Orbitron (900 Black weight)
**Body/UI Font:** PlusJakartaSans (Regular, Medium, SemiBold, Bold, ExtraBold)

**Character:** Orbitron is a sci-fi/geometric display face reserved almost exclusively for the Leap brand mark (splash logo, locked-feature emphasis) — it should stay rare, never used for body UI. PlusJakartaSans carries everything else: a humanist grotesk that reads clean at both the heavy uppercase-label weight and the lighter body weight, which is what lets the same family cover both "shout" (tier names, section headers) and "inform" (descriptions, values) without feeling like two different apps.

### Hierarchy
- **Display** (Orbitron 900, brand mark only): the Leap logo and locked-feature callouts. Not for headings, not for tier names — this is a logo font, not a heading font.
- **Label** (PlusJakartaSans ExtraBold, uppercase, 1-3px letter-spacing): tier names, section headers, stat labels, tab labels — the app's signature "structural" voice. This is what makes the interface feel disciplined rather than soft.
- **Title** (PlusJakartaSans Bold/ExtraBold): names, big numeric values (tier number, scores), primary button text.
- **Body** (PlusJakartaSans Regular/Medium): descriptions, secondary info, modal copy.

### Named Rules
**The Shout-Sparingly Rule.** ExtraBold + uppercase + wide tracking is the loudest voice in the system. Reserve it for things that are genuinely structural (tier names, section labels) — using it for body copy or descriptions cancels its own signal.

**Known inconsistency to fix:** `app.json`'s `expo-font` plugin only registers `PlusJakartaSans-Regular`, `-Bold`, and `-ExtraBold`. Several components (e.g. `EditProfileModal`'s `infoValue` style) reference `PlusJakartaSans-Medium` or `-SemiBold`, which aren't linked at build time and will silently fall back to the system font on those specific text elements. Either register the missing weights in `app.json` or stop referencing them.

## 4. Elevation

The system is flat by default — depth comes from tonal layering (each surface a step lighter than the one behind it: `#050505` → `#0A0A0A` → `#111111`), not from drop shadows. Shadows appear only as a deliberate exception for floating/overlay elements (modal cards, the coach-prompt card, small circular badges) where they signal "this is above the page," not as general card styling.

### Named Rules
**The Tonal-Not-Dropshadow Rule.** Default elevation is a lighter background tone plus a hairline border (`rgba(255,255,255,0.05)`), never a shadow. Shadows are reserved for true overlays (modals, floating badges) — using one on a regular in-flow card is the generic-template tell to avoid.

## 5. Components

### Buttons
- **Shape:** 12-14px corner radius on rectangular buttons; fully rounded (pill) on filter/tab chips.
- **Primary:** Ember Red fill, black text, no border — used for the single primary action on screen (start trial, primary CTA).
- **Outline/Secondary:** transparent background, Ember Red border and text — used for secondary actions and for a "practice" or lower-emphasis variant of the primary action.
- **Locked state:** surface-colored fill, hairline border, tertiary-ink text — visually inert on purpose, so a locked action never competes with an active one.

### Pills / Chips (tier selector, gender filter, bottom tab bar)
- **Style:** rounded-full, hairline border by default; filled with the active discipline's accent color when selected, with contrasting text color flip (white-on-accent or accent-on-transparent).
- **Locked tiers:** dimmed opacity + a lock glyph overlay, distinct from the "just not selected" state.

### Cards (WarriorCard primitive)
- **Corner style:** 12-24px depending on context (tier cards run larger/rounder than list rows).
- **Background:** Surface (`#111111`), occasionally a very low-opacity accent tint (`accent + '05'`–`'15'`) for the "accent" card variant.
- **Border:** hairline `rgba(255,255,255,0.05)`, or accent-tinted border on the "accent" variant.
- **Shadow strategy:** none by default (see Elevation) — depth comes from the background/border treatment.

### Signature Component: Concentric Tier Ring
The tier-avatar treatment (a stack of concentric segmented rings around a large centered tier number) is the app's most distinctive visual signature — it should be protected and reused rather than replaced with a generic circular avatar or progress ring when new tier-related UI is built.

## 6. Do's and Don'ts

### Do:
- **Do** keep one discipline accent per screen (red for Strength/Power, violet for Static, orange for Endurance) — this is how the app tells users which world they're in without a label.
- **Do** use the three-step ink opacity ramp (`0.85 / 0.45 / 0.2`) for all text hierarchy instead of introducing new gray hex values.
- **Do** reserve ExtraBold-uppercase-tracked type for structural labels (tier names, section headers) — it's the signature voice precisely because it's not used everywhere.
- **Do** build depth via tonal layering (background steps) and hairline borders, not drop shadows, on in-flow cards.

### Don't:
- **Don't** ship a generic template SaaS/fitness-app look: gradient hero stat cards, identical repeated stat tiles, or default card-grid layouts with no hierarchy (direct anti-reference from PRODUCT.md).
- **Don't** mix two discipline accents (e.g. red and violet) on the same screen.
- **Don't** use Orbitron for anything beyond the brand mark / locked-feature emphasis — it is not a body or heading font.
- **Don't** reference `PlusJakartaSans-Medium` or `-SemiBold` until they're registered in `app.json`'s `expo-font` plugin (see Typography's known inconsistency).
- **Don't** add drop shadows to regular in-flow cards; that reads as the generic-template default this system is deliberately avoiding.
