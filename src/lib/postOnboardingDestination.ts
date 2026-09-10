// A tiny synchronous, in-memory (not persisted) signal for "where to land
// once onboarding_completed_at flips true" -- set by the Program Ready
// celebration's Start Program choice, consumed once by app/index.tsx's own
// redirect.
//
// Why not just call router.replace() directly after the mutation: doing so
// races AuthGuard's own declarative <Redirect> (app/_layout.tsx), which
// fires the instant onboarding_completed_at changes and the screen making
// the call is itself one AuthGuard is about to navigate away from --
// app/assessment.tsx's own comment documents this exact race causing an
// intermittent "REPLACE ... not handled by any navigator" crash previously.
// Threading the choice through AsyncStorage instead would work but adds an
// async gate (and a visible flash) to app/index.tsx's redirect for every
// fully-onboarded user's app-open, forever, just to support this one-time
// choice. A plain module-level variable is synchronous (zero latency for
// the default/normal case) and lives only as long as this JS session needs
// it to -- the whole flow (button tap -> mutation -> refreshProfile ->
// AuthGuard redirect -> index.tsx redirect) completes within milliseconds.
let postOnboardingDestination: '/my-journey' | null = null;

export function setPostOnboardingDestination(dest: '/my-journey' | null) {
  postOnboardingDestination = dest;
}

export function consumePostOnboardingDestination(): '/my-journey' | null {
  const dest = postOnboardingDestination;
  postOnboardingDestination = null;
  return dest;
}
