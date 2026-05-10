# UX Edge Cases & Failure Scenarios

A guide for QA and developers on how the system handles (or should handle) exceptional states.

## 1. Competitive Integrity (Clash & Tournaments)

### Race Condition: Simultaneous Finish
- **Scenario**: Two users finish a clash within 10ms of each other.
- **Handling**: The `finish_clash_session` RPC uses `FOR UPDATE` on the database row. The first request to arrive will update the status and set the `winner_id`. The second request will see the status as `finished` and return the existing winner without overwriting.
- **UX Impact**: One user will see "VICTORY", the other "DEFEAT", even if their local timers were identical.

### The "Ghost Match" Medians
- **Scenario**: A user is in a knockout match against a "Ghost" because of an uneven bracket.
- **Handling**: User must beat the **median score** of all other active participants.
- **Edge Case**: If nobody else has submitted a score yet, the median is 0. The user wins automatically.

### Anti-Cheat: The "Dishonor" Gate
- **Scenario**: User attempts to submit a 10-minute workout in 5 seconds.
- **Handling**: `TrialService` blocks the submission and shows a high-contrast warning.
- **Vulnerability**: Currently enforced on the client. A sophisticated user could bypass this by calling the Supabase REST API directly if RLS is not strict enough on the `strength_tier` update.

## 2. Navigation & State

### Assessment Lockout
- **Scenario**: User signs up but quits during the assessment.
- **Handling**: Upon return, the `AssessmentGateScreen` detects `strength_tier = 0` and forces them back into the diagnostic. They cannot "skip" into the main app.

### Offline Sync
- **Scenario**: User finishes a trial while their internet drops.
- **Handling**: The app will fail to write to Supabase. There is currently no local persistence for "pending results".
- **Risk**: User loses the effort of a completed 10-minute trial.
- **Suggestion**: Implement `AsyncStorage` to cache pending results and sync them upon reconnection.

## 3. Data & Corrupted States

### Missing Best Times
- **Scenario**: A user somehow bypasses the assessment (manual DB entry) but has no `best_times`.
- **Handling**: Tiers in the profile might show `NaN` or 0 if default values are missing.
- **Prevention**: `handle_new_user` trigger ensures `best_times` starts as an empty JSONB object `{}`.

### Empty Brackets
- **Scenario**: User enters a tournament where they are the only participant.
- **Handling**: They will be matched against themselves or a ghost in Round 1 and win the tournament immediately upon the round deadline passing.

## 4. Abuse Scenarios

### Leaderboard Spam
- **Scenario**: User creates multiple accounts to fill the top 10 of a leaderboard.
- **Prevention**: The app relies on Supabase Auth (Email confirmation). Future requirement: Device ID binding or SMS verification.

### Clash Invite Spamming
- **Scenario**: User repeatedly sends invites to a specific warrior to annoy them.
- **Current State**: No "Block Warrior" feature.
- **Suggestion**: Implement a cooldown on sending invites to the same user or a "DND" toggle in profiles.
