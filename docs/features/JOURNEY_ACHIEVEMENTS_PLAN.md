# Journey Achievements — build plan

Design: `assets/design_handoff_journey_achievements` (README + `.dc.html` + `journey-badges.js` + `badges/`).
Owner decisions (2026-10-14): achievements from **lifetime** Journey points, never lost · community leaderboard ranks by the **last 7 days (rolling)** · **community-only** (locked "join" state otherwise) · names RISING · CONSISTENT · COMMITTED · DETERMINED · WARRIOR · CHAMPION · ELITE · LEGEND (100 / 300 / 750 / 1,500 / 3,000 / 5,000 / 8,000 / 12,000) · privacy: username, initials, badge, weekly points, rank only · existing users get the badges they already earned (one celebration, highest only).

Priority: build this before the next release. Small steps, each tested on a device before the next.

---

## Performance rules (apply to every step)

The handoff animates up to ~70 elements at once in LEGEND, each with a glow shadow. Ported literally that stutters on mid-range Android. These rules keep the look and make it smooth everywhere:

1. **One clock per animation.** A single Reanimated shared value drives every style as a pure function of `t`, computed in worklets on the UI thread. No React re-renders while an animation runs, except the lifetime-points counter, which is its own leaf component (≤ 30 text updates/s).
2. **Animate only `transform` and `opacity`.** Never width/height/top/left/margins/borderWidth/shadows. The only animated SVG prop is `strokeDashoffset` on the RISING draw ring (proven on device).
3. **No animated shadows or blur.** Particle glows from the handoff are dropped (brighter colours instead); each hero gets one static glow disc that animates only opacity/scale.
4. **Move groups, not pieces, where the shape allows it.** Light beams sit in one container that rotates (1 animated view instead of 12). Orbit particles stay individual (a squashed rotating group would flatten each dot into a line) but are capped at 12, 6 in lite. Sparks keep their own paths and are capped.
5. **Element budget.** At most ~30 animated views at any moment in the full profile, ~15 in lite. LEGEND goes from ~70 to ~30.
6. **Mount on demand.** Only the current level's reveal is mounted. Transient effects unmount at END, so nothing keeps animating on the final frame (battery, share capture). The leaderboard sheet loads its data only when opened.
7. **Rasterize complex badges while they move** (`renderToHardwareTextureAndroid` / `shouldRasterizeIOS` on the badge layer views during the reveal, off at END).
8. **Precompute.** Seeded particle tables are built once with `useMemo`; worklets allocate nothing per frame.
9. **Adaptive quality.** A lite profile (half the particles, no orbit) on old Android (API < 29) and automatically after a janky run (a frame callback counts slow frames; the result is remembered on the device). Reduce Motion: straight to the final frame.
10. **Keep the JS thread free.** Marking a celebration seen, share capture and analytics run after the animation ends.
11. **Never overlap with the points reward FX** (a different animation system): the celebration starts after the +points burst lands.
12. **Leaderboard list:** FlatList with fixed row heights (`getItemLayout`), memoized rows, the 20-px simple badge, and an entry fade on the first 8 rows only.

Every step ends with `tsc` (0 errors), the full Jest suite, then a device check with the performance monitor (UI and JS ≥ 55 fps) on an iPhone and an older Android phone or low-end emulator, in English and Arabic, dark and light.

---

## Steps

### Step 0 — Animation toolkit (no visible change) — DONE 2026-10-14
- `src/lib/fx/`: `useFxClock` (one clock, skip-to-end, Reduce Motion), quality profile (full / lite + adaptive frame monitor), seeded particle tables and timeline maths (pure, unit-tested).
- `src/components/fx/`: `SparkBurst`, `OrbitRing` (rotating group), `BeamFan` (rotating group), `ShockRing`, `Flash` — transform/opacity only, no shadows.
- Tests: timeline maths, seeded tables, element budget per level.

### Step 1 — Database (live with `db push`, invisible on its own) — written + tested 2026-10-14 (`20261014120000_journey_achievements.sql`)
- `journey_levels` (8 rows: key, EN/AR name, threshold) and `journey_achievements` (user, level, reached_at, celebrated_at). RLS: read own; writes only in SECURITY DEFINER functions.
- `journey_points_award` records newly reached levels from the **full lifetime ledger** (never the current-program view).
- `journey_points_summary` adds `achievement`: level, lifetime points, next threshold, and the pending celebration (highest uncelebrated level + skipped ones + points before/after).
- `journey_mark_celebrated(level)`: marks that level and every lower one as celebrated (once, on any device).
- `get_journey_community_board(p_tz)`: caller's community only; weekly points over each member's OWN last 7 local days (profile time zone; the caller's from the app), so nobody's latest day is cut off across time zones; ties by who reached the total first; badge = the higher of recorded levels and the level their lifetime total earns (members who haven't opened Journey since launch still show their badge); returns username, badge level, weekly points, rank, is_you only.
- Verified on a throwaway pg18 replica as users in two communities (no cross-community data, no direct table writes, levels from lifetime even after a program switch).

### Step 2 — Badges — DONE 2026-10-14 (device-checked; dev gallery: long-press the Journey points counter in a dev build)
- Port `journey-badges.js` to memoized `react-native-svg` components: full (hero) and simple (40 / 20 px) for all 8 + the empty slot; LEGEND/ELITE/CHAMPION also as layers (rays, wingL, wingR, body, gem); DETERMINED's hot palette. Real `LeapLogo` arc geometry at the centre. No metadata from the exported files.
- A dev-only gallery to check every badge at 160 / 40 / 20, dark and light.
- Device check: gradients on iOS and Android.

### Step 3 — Badge in the top bar + achievements sheet — DONE 2026-10-14 (device-checked)
- Owner feedback: Journey auto-scrolls to the current day, so cards above the lane are never seen. Instead: **your badge (32 px) in the pinned top bar, next to the points, with a small coral "#rank" tag** (community rank this week; hidden when unranked or without a community).
- Tap the badge → one sheet (the Worlds' leaderboard sheet): your badge, level progress to the next badge, then the community podium (20-px badges on avatars), ranked rows, your row pinned in the footer when you're off the podium, share icon (Journey style of the share card, "MY COMMUNITY", never the community name), and the locked / empty-week / solo states. The old step 8 is merged here.
- The community board loads once when Journey opens (cached 1 min). Only two hook lines and two props are added to MilestoneLaneScreen.

### Step 4 — Celebration shell + RISING, CONSISTENT, COMMITTED
- `AchievementCelebration`: shared shell, copy, skipped line, stats panel (bar + counter leaf), LEAP ARENA pill, DONE + share, fit-to-screen (compact), skip, Reduce Motion, haptics/sound cues, share image. Triggered after the points FX; marked celebrated after close.
- Reveals 1–3: ring draw, pop, spin-in, small bursts.

### Step 5 — DETERMINED and WARRIOR
- Forge (3 hammer strikes, hot layer cooling, spark sprays with gravity) and shield slam (drop, card shake, flash, shock rings).

### Step 6 — CHAMPION and ELITE
- Wings unfold on their pivots, glint, gold ring; orbiting particles (rotating group), gem ignite.

### Step 7 — LEGEND + quality tuning
- Charge, prismatic burst, beam fan (rotating group), wings, crown + gems, halo. Tune the lite profile on an older Android phone.

### Step 8 — (merged into step 3)
- Sheet with podium header (20-px badges on avatars), rows, pinned YOU row (`onViewableItemsChanged`), all states, share icon → leaderboard share card in a new Journey style (shows "MY COMMUNITY", never the community name).

### Step 9 — Final pass
- Every scenario from the handoff in EN + AR, dark + light, Reduce Motion, compact screens; performance pass on the oldest available Android; then commit and include in the next build.

---

## Not in scope
- Changing Journey points rules, the existing top bar or lane cards.
- A global (non-community) Journey leaderboard.
- New sound assets (LEGEND plays the existing bell twice).
