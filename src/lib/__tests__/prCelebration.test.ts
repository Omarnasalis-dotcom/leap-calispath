import {
  formatKg,
  gainOf,
  plateBreakdown,
  plateStack,
  prevMarkerAngle,
  ringProgress,
  RING_LOCK,
  settledAt,
  timeAtFill,
  tickLayout,
} from '../prCelebration';

describe('plate breakdown (handoff examples)', () => {
  it.each([
    [50, [20, 20, 10]],
    [55, [20, 20, 10, 5]],
    [52.5, [20, 20, 10, 2.5]],
    [20, [20]],
    [7.5, [5, 2.5]],
    [3.75, [2.5, 1.25]],
  ])('%p kg → %p', (kg, plates) => {
    expect(plateBreakdown(kg)).toEqual(plates);
  });

  it('drops a remainder no plate can make', () => {
    expect(plateBreakdown(51)).toEqual([20, 20, 10]);
    expect(plateBreakdown(1)).toEqual([]);
  });
});

describe('plate stack', () => {
  it('stacks upward from the floor with 3px gaps and times the drops', () => {
    const s = plateStack(50);
    expect(s.plates.map(p => p.top)).toEqual([201, 174, 152]);
    [0.6, 0.9, 1.2].forEach((t, i) => expect(s.plates[i].start).toBeCloseTo(t));
    expect(s.plates[2].land).toBeCloseTo(1.46);
    expect(s.plates.map(p => p.loaded)).toEqual([20, 40, 50]);
    expect(s.numberStart).toBeCloseTo(1.62);
    expect(s.lock).toBeCloseTo(1.92);
  });

  it('squeezes a tall stack into 128px and hides labels under 12px', () => {
    const s = plateStack(200); // ten 20 kg plates: 270px raw
    const used = 225 - s.stackTop;
    expect(used).toBeCloseTo(128, 5);
    expect(s.plates.every(p => !p.showLabel)).toBe(true);
    // 10 plates: each 0.15s apart
    expect(s.plates[9].start).toBeCloseTo(0.6 + 9 * 0.15);
  });

  it('still slams the number when there is no plate', () => {
    const s = plateStack(1);
    expect(s.plates).toEqual([]);
    expect(s.lock).toBeCloseTo(1.02);
  });
});

describe('values', () => {
  it('formats kg on the 0.25 step', () => {
    expect(formatKg(100)).toBe('100');
    expect(formatKg(92.5)).toBe('92.5');
    expect(formatKg(52.26)).toBe('52.25');
  });

  it('computes gain and percent, or null for a first record', () => {
    expect(gainOf(11, 8)).toEqual({ gain: 3, pct: 38 });
    expect(gainOf(100, 92.5)).toEqual({ gain: 7.5, pct: 8 });
    expect(gainOf(24, null)).toBeNull();
    expect(gainOf(24, 0)).toBeNull();
  });

  it('places the PREV marker by fraction of the new value', () => {
    expect(prevMarkerAngle(15, 60)).toBeCloseTo(Math.PI / 2);
    expect(prevMarkerAngle(90, 60)).toBeCloseTo(Math.PI * 2);
  });
});

describe('endurance ticks', () => {
  it('uses one tick per rep up to 60', () => {
    expect(tickLayout(24, 18)).toMatchObject({ n: 24, prevTicks: 18 });
    const big = tickLayout(120, 90);
    expect(big.n).toBe(60);
    expect(big.prevTicks).toBe(45);
    expect(big.width).toBeGreaterThanOrEqual(4);
    expect(tickLayout(5, null).prevTicks).toBe(0);
    expect(tickLayout(5, null).width).toBe(12);
  });
});

describe('timeline', () => {
  it('fills over 0.6–2.1s and settles after the actions', () => {
    expect(ringProgress(0.6)).toBe(0);
    expect(ringProgress(RING_LOCK)).toBe(1);
    expect(ringProgress(1.35)).toBeCloseTo(0.5);
    expect(settledAt(2.1)).toBeCloseTo(3.6);
    expect(timeAtFill(0.5)).toBeCloseTo(1.35);
    expect(ringProgress(timeAtFill(8 / 11))).toBeCloseTo(8 / 11);
  });
});
