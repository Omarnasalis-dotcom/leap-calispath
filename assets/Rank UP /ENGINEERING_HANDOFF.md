# Engineering Handoff: Strength Trial Rank-Up Animation

Audit of the current rank-up code + the design reference in this folder, reconciled into a build plan. Read this alongside `README.md` (design spec) and `level-up-piece.jsx` (authoritative timing/motion values).

## 1. Current state (as of this audit)

Trial completion is handled entirely in `src/screens/TrialScreen.tsx`. Three different, inconsistent outcome UIs exist today:

| Outcome | Component | Where | Style |
|---|---|---|---|
| Tier advances (`result.tier_advanced`) | `VictoryScreen` (in-file, line ~776) | Full-screen replace | Pure black bg, bronze/gold seal (`#CD7F32`), red CTA (`#8B0000`), simple fade+scale-in, no fontFamily set (falls back to system font) |
| First-ever completion of a tier, no advance | `TrialFeedbackModal` (in-file, line ~698) | Modal overlay | Dark card `#13131A`, bronze accent `#CD7F32`, different palette from VictoryScreen |
| New best time, no advance | same `TrialFeedbackModal` | Modal overlay | same |
| Attempt (no PR, no advance) | same `TrialFeedbackModal` | Modal overlay | same |

**Bugs / gaps found in `VictoryScreen`:**
- `tier={trial.tier}` is passed at the call site (line ~511) — this is the tier of the trial just **completed**, not the tier reached. It should be `trial.tier + 1`. Rank name and seal currently show the wrong rank on every tier-up.
- The trial's name (e.g. "Lochagos Trial") is never passed in or displayed — no "what did I just complete" copy exists.
- No `fontFamily` is set on any `victory*` style, so this screen silently renders in the OS default font while the rest of the app uses `Orbitron` / `BarlowCondensed` / `PlusJakartaSans`.
- No entrance choreography — everything fades/scales in together as one block.

**Data available at the trial-complete call site** (`handleClaimRank` in `TrialScreen.tsx`):
- `trial.tier` — the tier of the trial just run
- `trial.name` — e.g. `"Lochagos Trial"` (from `RITES_OF_PASSAGE` in `src/lib/trials.ts`)
- `timeSeconds` — elapsed time, format with `formatTime()` → `"6:34"`
- RPC response (`submit_trial_result`, see `supabase/migrations/20260806100000_fix_strength_overtake_on_first_completion.sql`) returns: `success`, `is_first_completion`, `is_new_best`, `tier_advanced`, `previous_best_time_seconds`, `overtaken_notification_id` — **no `new_tier` field**, so the new tier must be derived client-side as `trial.tier + 1`.
- `TIER_NAMES[newTier]` (from `src/types/index.ts`) — 10 entries, `Helot` (0) → `Eternity` (9).
- This screen only ever fires for **progression mode** completions (`TrialService.submitResult` sends `isProgression: initialMode === 'progression'`), never for `practice` or `eternal` mode. Confirmed constraint, not an open question.

Separately, `src/screens/RankRevealScreen.tsx` is a **different, richer** rank-reveal screen used only in onboarding (`app/rank-reveal.tsx`), after the initial assessment. It's not part of the trial-completion flow and out of scope here, but it's the closest existing prior art for a "rank assigned" moment.

## 2. Design reference (`assets/Rank UP /`)

Built as an HTML/React "Design Component" (not production code — see the file's own disclaimer). High-fidelity per its README: colors/type/spacing/timing are meant to be final.

**Palette:** coral `#FC5454` (primary), coral-dim `#4A2020` (inactive), black `#000000` (bg), muted gray `#808080`, white.
**Type:** Oswald, weights 400–700, condensed.
**Sequence (single continuous play, ~5–5.7s total — see discrepancy below):**
1. Impact flash + soft glow bloom (0–0.4s)
2. Two rings expand + 6 sparks fly outward (0.4–1.2s)
3. 5 concentric "tier rings" thrown into place one-by-one with rotation+overshoot, then tier number pops into center (0.4–1.8s / 1.1–1.4s)
4. Rank name reveals with a diagonal shimmer sweep (1.2–2.1s)
5. "TIER N OF 9" sub-label fades up (1.35–2.25s)
6. "Time: m:ss" stat fades up (2.2–2.6s)
7. Progress bar fills 0→100% with rising confetti bits, ending in a glow burst + "TIER PROGRESS · MAXED" label (2.4–3.5s)
8. "CONTINUE" pill CTA pops in (3.6–4.4s), scene holds (4.4–5.2s)

Canvas assumed 402×874 (iPhone-class portrait), full-bleed black, no scroll.

## 3. Reconciliation — where the design conflicts with the real codebase

| # | Conflict | Detail | Needs a decision |
|---|---|---|---|
| 1 | **Accent color** | Design uses coral `#FC5454`. The app's actual, documented strength accent is `#FF5252` ("ember-red", per `DESIGN.md` and `constants/worldThemes.ts` → `WORLD_THEMES.strength`). These are close but not identical. | Yes — use `#FF5252` to match the rest of the app, or introduce `#FC5454` as a special "celebration" accent used only on this screen? |
| 2 | **Font** | Design specifies Oswald. The app has never loaded Oswald — `hooks/useFonts.ts` loads Orbitron/BarlowCondensed/Barlow, and `app.json`'s `expo-font` plugin only bundles PlusJakartaSans. `DESIGN.md` specifies `Orbitron_900Black` for display text and `PlusJakartaSans` for labels/body. | Yes — add Oswald as a new font dependency (more setup, per `FONT_SETUP.md`'s pattern), or substitute `BarlowCondensed-ExtraBold`/`Orbitron_900Black`, both already vendored and visually similar (condensed/bold)? |
| 3 | **Tier-ring stack visual** | The design's badge is 5 concentric rings "thrown in" one per tier, and its README claims this "mirrors the app's own tier-ring stack." No such component exists — the real Profile header (`ScoreRingHero` / `WorldRing`) is a **single** progress ring with one arc, not concentric per-tier rings. | Yes — build this multi-ring badge as new, screen-only artwork, or simplify to match the single-ring language used everywhere else in the app? |
| 4 | **Trial name not shown** | The design has no field for "which trial did I just complete" — only rank name, tier number, and time. Earlier in this conversation we'd discussed showing the completed trial's name (e.g. "Lochagos Trial") as part of the reveal. | Yes — add a trial-name line (breaks pixel-fidelity to the handoff), or drop that requirement and follow the design as-is? |
| 5 | **"TIER PROGRESS · MAXED" bar** | The progress bar fills 0→100% on every rank-up, captioned "maxed." There's no real per-tier "progress" metric in the data model for strength trials (they're pass/fail on time, not point-scored like Power World) — it reads as pure celebratory flourish. | Confirm: is this bar always a decorative 0→100% fill (no real data behind it), or should it map to something real (e.g. tier index / 9, leaderboard percentile)? |
| 6 | **Fixed 402×874 canvas** | The design assumes one fixed iPhone-class canvas. RN must run on many real device sizes. | Not a real open question — just flag that all absolute px positions in the spec need converting to relative/responsive layout, not copied literally. |
| 7 | **Scope vs. `TrialFeedbackModal`** | This handoff only covers the tier-advance case. The three non-advancing outcomes (first completion / new best / attempt) still use the old bronze `TrialFeedbackModal` palette, which will now visually clash with a coral/Oswald rank-up screen. | Should `TrialFeedbackModal` get a matching restyle in the same pass, or stay as-is for now? |
| 8 | **"Share" action** | Flagged as unresolved in the design's own README ("scoped in an earlier iteration but not in the current build"). | Carry forward — confirm with design if still wanted. |
| 9 | **Timeline total mismatch** | README states "~5.7s total"; summing the JSX's own `OM_SCENES` durations (0.4+0.8+1.4+1.0+0.6+0.8) gives 5.0s. Per the design file's own instructions, `level-up-piece.jsx`'s numbers are authoritative when anything is ambiguous — use 5.0s, not the README's 5.7s. | No — informational only, already resolved by the file's own stated precedence. |
| 10 | **Replace vs. coexist** | Should this fully replace `VictoryScreen`, or ship behind a flag for a staged rollout? | Yes — need a call before starting. |

## 4. Tech approach

No new animation dependencies needed — the app already has:
- `react-native-reanimated` (~4.1.1) — drives all timed motion (fade/rise, pop-with-overshoot via spring configs, ring expand, shimmer sweep via interpolated gradient or masked overlay, confetti particles as small animated `View`s).
- `react-native-svg` (15.12.1) — renders the ring badge (concentric or single, per decision above) and any circular strokes.

No Lottie or Skia in the project; don't add either just for this — Reanimated + SVG can reproduce every beat in the spec (ring expand/fade, throw-in rotation+scale-overshoot, shimmer sweep, confetti drift+rotate+fade, progress-bar fill+glow, button pop). `level-up-piece.jsx`'s `MOTION` helpers (`enter`, `pop`, `ring`) map directly to `withTiming`/`withSpring`/`withSequence` in Reanimated.

## 5. Implementation plan

1. **Fix the data bug first** (small, independent): in `TrialScreen.tsx`, change the `VictoryScreen` call to pass `tier={trial.tier + 1}` and a new `trialName={trial.name}` prop (pending decision #4 on whether trial name ships).
2. **Resolve open questions 1–5, 7, 8, 10 above** with design before building — they change color tokens, font choice, badge artwork, and scope.
3. **Build a `RankUpBadge` component** (SVG): ring(s) per the resolved decision #3, animated tier-number pop at center.
4. **Build the choreography container**: a single `Animated.View` sequence driven by one shared timeline (mirrors `CUES` in the JSX: Impact/Rings/Forge/Reveal/Stats/Hold), using Reanimated shared values + `withDelay`/`withSequence` so every child element's start time is relative to one clock, matching the JSX's cue-based structure.
5. **Port each beat**: impact flash, glow bloom, expanding rings + sparks, thrown tier ring(s), rank-name shimmer (`MaskedView` or animated gradient overlay + `react-native-svg`'s `LinearGradient`), sub-label, time stat, progress bar + confetti + completion burst, CTA pop-in.
6. **Wire real data**: rank name = `TIER_NAMES[newTier]`, sub-label = `TIER {newTier} OF 9`, time = `formatTime(timeSeconds)`, (trial name if approved).
7. **Convert all absolute positions/canvas size to responsive layout** (flex/percentage based on screen dimensions, not the fixed 402×874 reference).
8. **Decide and implement `TrialFeedbackModal` restyle** if scope question #7 says yes, for visual consistency across all four outcome states.
9. **QA pass**: verify against real device sizes (small phones, tablets), reduced-motion accessibility setting, and rapid-tap-through (can user skip/interrupt the animation? not specified in the design — worth deciding).
10. **Remove or flag old `VictoryScreen`** per decision #10.

## 6. Open questions to clarify before implementation starts

1. Coral `#FC5454` (new) vs. existing ember-red `#FF5252` (`DESIGN.md`, `worldThemes.ts`) — which accent ships?
2. Add Oswald as a new font, or substitute an already-vendored family (Orbitron / BarlowCondensed)?
3. Build the 5-ring concentric badge as new artwork, or align with the app's real single-ring (`WorldRing`) visual language?
4. Show the completed trial's name on this screen, or follow the design exactly (rank/tier/time only)?
5. Does the progress bar represent anything real, or is it purely decorative on every rank-up?
6. Restyle `TrialFeedbackModal` (first completion / new best / attempt) in the same pass for consistency, or leave it for later?
7. Is "Share" in scope for this pass?
8. Full replace of `VictoryScreen`, or behind a flag for staged rollout?
9. Can the user tap through/skip the ~5s animation, or must it always play to completion?
