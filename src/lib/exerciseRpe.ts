// Per-exercise RPE (owner, 2026-11-06): straight-set blocks with 2+ exercises
// rate each exercise. Saved as block_exercise_id -> 1-10; the block's own RPE
// is their average, which log_block_with_sets works out on the server.

export type ExerciseRpe = Record<string, number>;

/** Supersets and circuits are logged as one round card, so they keep one RPE. */
export function asksExerciseRpe(kind: string, isRounds: boolean, cardCount: number): boolean {
  return kind === 'sets' && !isRounds && cardCount >= 2;
}

/** Only the given exercises' ratings (a "not done" exercise has none). */
export function ratingsFor(ratings: ExerciseRpe, ids: string[]): ExerciseRpe {
  return Object.fromEntries(ids.filter(id => ratings[id] != null).map(id => [id, ratings[id]]));
}

/** Rounded the same way as the server: 7.5 -> 8. Null when nothing is rated. */
export function averageRpe(ratings: ExerciseRpe): number | null {
  const values = Object.values(ratings);
  return values.length === 0 ? null : Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}
