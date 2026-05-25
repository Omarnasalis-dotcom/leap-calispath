# Phase 1 working rules — read before every task

## Current branch
All work happens on: phase1/stabilize
Never commit to main directly.

## Recovery commands

# Throw away uncommitted changes instantly
git stash

# See what changed since the start
git diff main -- src/screens/ProfileScreen.tsx

# Full reset to original (nuclear option)
git checkout main
git branch -D phase1/stabilize
git checkout -b phase1/stabilize

## Restore points
- Tag: SAFE_ORIGINAL (56ecdaa) — original codebase
- Tag: best-version-20260501-130407 — your previous best version
- Remote: origin/main — cloud backup on GitHub

## The extraction rules (non-negotiable)
1. ZERO logic changes — copy JSX and styles only
2. ZERO new imports that do not already exist in the source file
3. ZERO variable renames
4. ONE component extracted per commit
5. After each commit, open the app and verify the screen works

## File targets
ProfileScreen.tsx        2211 lines → target under 300 lines
ProgramBuilderScreen     2269 lines → target under 400 lines
WarriorProgramScreen     2007 lines → target under 350 lines

## Extraction order
Week 1 — ProfileScreen breakdown
  [ ] 1. ScoreBar.tsx
  [ ] 2. ProfileHeader.tsx
  [ ] 3. WorldSelectorGrid.tsx
  [ ] 4. TierSelectorRow.tsx
  [ ] 5. StrengthWorldView.tsx
  [ ] 6. PowerWorldView.tsx
  [ ] 7. ProfileScreen.tsx becomes orchestrator only

Week 2 — Navigation + errors
  [ ] 8. Navigation unification audit
  [ ] 9. useToast hook + error states

Week 3 — Security
  [ ] 10. Edge Function: submit-trial-result
