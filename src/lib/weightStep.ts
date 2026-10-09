import { parseKg } from './parseKg';

/** kg added or removed by one tap of the set rows' − / + (same as the log sheet's Top set). */
export const WEIGHT_STEP = 2.5;

/** "20", "22.5", "" for nothing. */
export function formatKg(kg: number): string {
  return kg > 0 ? String(Math.round(kg * 100) / 100) : '';
}

/**
 * The kg box's − / +: steps the typed weight by 2.5 kg. An empty box starts
 * from `suggested` (the weight of the previous set) when there is one, so
 * the usual case is one tap, else from 2.5. Going to 0 or below clears it.
 */
export function stepWeight(text: string, direction: 1 | -1, suggested?: number): string {
  const current = parseKg(text);
  if (current === undefined || current <= 0) {
    if (direction < 0) return '';
    return formatKg(suggested && suggested > 0 ? suggested : WEIGHT_STEP);
  }
  return formatKg(Math.max(0, current + direction * WEIGHT_STEP));
}
