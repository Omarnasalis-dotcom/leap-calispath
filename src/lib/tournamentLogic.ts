/**
 * ⚖️ TOURNAMENT HANDICAP LOGIC
 * This utility balances the battlefield by applying multipliers based on 
 * the participant's Strength Tier at the start of the tournament.
 */

export const TOURNAMENT_MULTIPLIERS: Record<number, number> = {
  0: 10,
  1: 10,
  2: 10,
  3: 6,
  4: 6,
  5: 3,
  6: 3,
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
