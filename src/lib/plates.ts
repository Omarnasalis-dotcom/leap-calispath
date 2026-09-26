/**
 * Plate-loader maths for the Power log sheet
 * (assets/design_handoff_worlds/README.md §2.3).
 *
 * The kg number is always the source of truth; plates are only a picture of
 * it. A typed value is split greedily (heaviest first); anything a plate set
 * can't represent (e.g. 21.3) simply stays in the kg total.
 */

export const PLATES = [20, 10, 5, 2.5, 1.25] as const;
export type Plate = (typeof PLATES)[number];

/** Handoff: at most 6 plates drawn per side; the rest read "+N MORE PLATES". */
export const MAX_DRAWN_PLATES = 6;

const EPS = 1e-9;

/** Greedy heaviest-first split of `kg` into plates. */
export function decompose(kg: number): Plate[] {
  const out: Plate[] = [];
  let rest = Math.max(0, kg);
  for (const p of PLATES) {
    while (rest >= p - EPS) {
      out.push(p);
      rest -= p;
    }
  }
  return out;
}

/** Adds a plate: kg goes up by exactly the plate, stack stays heaviest-first. */
export function addPlate(kg: number, stack: Plate[], plate: Plate): { kg: number; stack: Plate[] } {
  return { kg: round2(kg + plate), stack: [...stack, plate].sort((a, b) => b - a) };
}

/** UNDO removes the smallest plate on the bar (and its weight). */
export function undoPlate(kg: number, stack: Plate[]): { kg: number; stack: Plate[] } {
  if (stack.length === 0) return { kg, stack };
  const smallest = Math.min(...stack) as Plate;
  const next = stack.slice();
  next.splice(next.lastIndexOf(smallest), 1);
  return { kg: round2(Math.max(0, kg - smallest)), stack: next };
}

/** Sets an absolute kg (typed, ±2.5, CLEAR) and re-derives the plates. */
export function setKg(kg: number): { kg: number; stack: Plate[] } {
  const v = round2(Math.max(0, kg));
  return { kg: v, stack: decompose(v) };
}

/** Bar width shrinks as plates are added: max(44, 110 − drawn×11). */
export function barWidth(stack: Plate[]): number {
  return Math.max(44, 110 - Math.min(MAX_DRAWN_PLATES, stack.length) * 11);
}

export function hiddenPlates(stack: Plate[]): number {
  return Math.max(0, stack.length - MAX_DRAWN_PLATES);
}

export const PLATE_STYLE: Record<Plate, { height: number; width: number; color: string }> = {
  20: { height: 88, width: 13, color: '#FF4A3D' },
  10: { height: 72, width: 11, color: '#c7372d' },
  5: { height: 56, width: 9, color: '#8a2620' },
  2.5: { height: 44, width: 7, color: '#d0d0d0' },
  1.25: { height: 34, width: 7, color: '#8a8a8a' },
};

/**
 * Sanitises typed kg: digits and one dot, ≤ 6 chars, ≤ `max`.
 * Returns the raw string to show and the numeric value.
 */
export function parseKgInput(text: string, max: number): { raw: string; kg: number } {
  const raw = text.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 6);
  const kg = Math.min(max, parseFloat(raw) || 0);
  return { raw, kg };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
