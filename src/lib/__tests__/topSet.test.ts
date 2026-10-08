import { applyTopSet } from '../topSet';

const rows = (...w: (number | null)[]) => w.map(weight_used => ({ weight_used }));
const weights = (r: { weight_used: number | null }[]) => r.map(x => x.weight_used);

describe('applyTopSet', () => {
  it('the reported case: 3 sets typed at 15, Top set raised to 20 → the top set is saved at 20', () => {
    const r = rows(15, 15, 15);
    applyTopSet(r, 20, true);
    expect(weights(r)).toEqual([15, 15, 20]);
    expect(Math.max(...weights(r).map(w => w ?? 0))).toBe(20); // what Performance charts
  });

  it('raising the Top set lifts the heaviest set, not the lighter ones', () => {
    const r = rows(10, 15, 12.5);
    applyTopSet(r, 20, true);
    expect(weights(r)).toEqual([10, 20, 12.5]);
  });

  it('lowering the Top set caps every heavier set', () => {
    const r = rows(20, 22.5, 15);
    applyTopSet(r, 17.5, true);
    expect(weights(r)).toEqual([17.5, 17.5, 15]);
  });

  it('untouched Top set keeps typed weights as entered', () => {
    const r = rows(10, 15, 12.5);
    applyTopSet(r, 15, false);
    expect(weights(r)).toEqual([10, 15, 12.5]);
  });

  it('ticked sets with no weight get the Top set', () => {
    const r = rows(null, 0, 15);
    applyTopSet(r, 15, false);
    expect(weights(r)).toEqual([15, 15, 15]);
  });

  it('Top set of 0 leaves unweighted sets empty', () => {
    const r = rows(null, null);
    applyTopSet(r, 0, false);
    expect(weights(r)).toEqual([null, null]);
  });

  it('no rows: nothing happens', () => {
    expect(() => applyTopSet([], 20, true)).not.toThrow();
  });
});
