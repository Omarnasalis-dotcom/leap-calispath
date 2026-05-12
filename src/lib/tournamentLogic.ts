/**
 * ⚖️ TOURNAMENT HANDICAP LOGIC
 * This utility balances the battlefield by applying multipliers based on 
 * the participant's Strength Tier at the start of the tournament.
 */

export const TOURNAMENT_MULTIPLIERS: Record<number, number> = {
  0: 4,
  1: 4,
  2: 4,
  3: 3,
  4: 3,
  5: 2,
  6: 2,
  7: 1,
  8: 1,
};

export class TournamentLogic {
  /**
   * Calculates the balanced "Arena Score" for a participant.
   * @param reps The raw number of reps achieved.
   * @param tier The participant's strength tier (0-8).
   * @returns The final balanced score.
   */
  static calculateFinalScore(reps: number, tier: number): number {
    const multiplier = TOURNAMENT_MULTIPLIERS[tier] || 1;
    return Math.round(reps * multiplier);
  }
}
