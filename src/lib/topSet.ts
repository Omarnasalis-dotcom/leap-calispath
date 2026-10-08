/**
 * Makes logged set rows agree with the log sheet's Top set (kg), because
 * Performance charts the heaviest set row of each session (_performance_for):
 * - a set with no weight gets the Top set;
 * - when the Top set was changed in the sheet, no set stays above it and the
 *   heaviest set (the last one when tied) becomes it.
 * Untouched, typed per-set weights are kept as entered. Mutates `rows`.
 */
export function applyTopSet(
  rows: { weight_used: number | null }[],
  top: number,
  changed: boolean,
): void {
  if (rows.length === 0) return;
  rows.forEach(r => {
    if ((r.weight_used ?? 0) <= 0) r.weight_used = top > 0 ? top : null;
    else if (changed && r.weight_used! > top) r.weight_used = top > 0 ? top : null;
  });
  if (changed && top > 0) {
    const heaviest = rows.reduce((a, b) => ((b.weight_used ?? 0) >= (a.weight_used ?? 0) ? b : a));
    heaviest.weight_used = top;
  }
}
