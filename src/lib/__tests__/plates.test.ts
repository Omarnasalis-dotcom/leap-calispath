import { addPlate, barWidth, decompose, hiddenPlates, parseKgInput, setKg, undoPlate } from '../plates';

describe('plates', () => {
  it('greedy split, heaviest first', () => {
    expect(decompose(47.5)).toEqual([20, 20, 5, 2.5]);
    expect(decompose(0)).toEqual([]);
    expect(decompose(3.75)).toEqual([2.5, 1.25]);
  });

  it('keeps unrepresentable remainder in kg only', () => {
    const s = setKg(21.3);
    expect(s.kg).toBe(21.3);
    expect(s.stack).toEqual([20, 1.25]);
  });

  it('addPlate adds exact weight and keeps order', () => {
    const a = addPlate(20, [20], 5);
    const b = addPlate(a.kg, a.stack, 20);
    expect(b).toEqual({ kg: 45, stack: [20, 20, 5] });
  });

  it('undo removes the smallest plate', () => {
    expect(undoPlate(47.5, [20, 20, 5, 2.5])).toEqual({ kg: 45, stack: [20, 20, 5] });
    expect(undoPlate(0, [])).toEqual({ kg: 0, stack: [] });
  });

  it('undo never goes negative when kg was typed below the plates', () => {
    expect(undoPlate(1, [1.25]).kg).toBe(0);
  });

  it('bar width and hidden plate count', () => {
    expect(barWidth([])).toBe(110);
    expect(barWidth([20, 20])).toBe(88);
    expect(barWidth(decompose(200))).toBe(44);
    expect(hiddenPlates(decompose(200))).toBe(4);
  });

  it('parses typed kg', () => {
    expect(parseKgInput('12.5.3kg', 500)).toEqual({ raw: '12.53', kg: 12.53 });
    expect(parseKgInput('9999', 500).kg).toBe(500);
    expect(parseKgInput('', 500)).toEqual({ raw: '', kg: 0 });
  });
});
