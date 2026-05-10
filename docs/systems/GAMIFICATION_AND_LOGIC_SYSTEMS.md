# Gamification & Logic Systems

Anti-Gravity (Leap CalisPath) is built on a "Hard Progression" philosophy where every point of Glory and every Rank must be earned through verified physical performance.

## 1. Glory Score Formula (The Unified Standing)
The Glory Score is the primary metric for global ranking. It is calculated via a server-side PostgreSQL function to ensure integrity.

**The Formula:**
```sql
GLORY = (S_TIER * 200) + (P_TIER * 150) + (ST_TIER * 150) +
        (PULLUPS * 4) + (PUSHUPS * 2) + (DIPS * 3) +
        (MUSCLE_UPS * 12) + (STREAK * 5)
```

**Reverse-Engineered Weighting:**
- **Tier Dominance**: Tiers are the most valuable assets. One Strength Tier increase is worth 50 Pull-ups.
- **Complexity Bonus**: Muscle-ups are weighted 6x higher than Push-ups.
- **Consistency Bonus**: Every day of active streak adds +5 Glory, rewarding long-term engagement over short bursts.

## 2. Tournament Handicap System
To allow "Helots" to compete with "Obsidians", a handicap multiplier is applied based on the tier at the start of the tournament.

| Tier Range | Multiplier | Rationale |
| :--- | :--- | :--- |
| **0 - 2** | 10x | High boost to encourage growth for beginners. |
| **3 - 4** | 6x | Significant boost for intermediate athletes. |
| **5 - 6** | 3x | Moderate boost for elite athletes. |
| **7 - 8** | 1x | No boost (The "Pure" score for the Gods). |

**Arena Score Calculation:**
`FINAL_SCORE = RAW_REPS * TIER_MULTIPLIER`

## 3. The Sudden Death Finish Logic
Detected in the `ClashService` and `finish_clash_session` RPC.
- Unlike traditional racing where everyone finishes and then ranks are compared, Anti-Gravity uses a "Kill-Switch" finish.
- The **first** user to submit a completion time triggers a status change to `finished` for the entire session.
- This creates an intense UX where users can see their opponent's progress in real-time and must finish faster to "steal" the win before the opponent can submit.

## 4. Static Hold Mastery (Multipliers)
Isometric holds are weighted by difficulty (multiplier) and duration (seconds).

| Movement | Multiplier | Level |
| :--- | :--- | :--- |
| **Wall Handstand** | 1x | Stone |
| **Tuck Front Lever** | 3x | Stone |
| **Full Back Lever** | 10x | Iron |
| **Straddle Planche** | 25x | Titan |
| **Full Planche** | 50x | Titan |

**Mastery Score**: `Duration (Seconds) * Multiplier`
*The logic enforces that only the Personal Best (PB) per movement contributes to the score.*

## 5. Anti-Cheat: The "Dishonor" Gate
Implemented in `TrialService.isTimeValid`.
- **Logic**: Each tier has a "Hard Floor" (`TIER_HARD_FLOORS`). If a trial is completed in less time than this floor, it is rejected.
- **Message**: "DISHONOR: Time defies human limits for this tier."
- **Intent**: To prevent users from manually entering impossible completion times (e.g., 5 seconds for a 50-rep workout).
