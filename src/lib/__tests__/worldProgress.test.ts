import { clamp01, powerWithinLevel, staticWithinLevel } from '../worldProgress';

describe('clamp01', () => {
  it('renders 0 as honestly empty', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(-5)).toBe(0);
  });

  it('clamps above 1', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(1)).toBe(1);
  });

  it('handles non-finite values as empty', () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(Infinity)).toBe(1);
    expect(clamp01(-Infinity)).toBe(0);
    expect(clamp01(undefined as unknown as number)).toBe(0);
  });

  it('passes through real ratios', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe('powerWithinLevel', () => {
  it('measures progress inside the current level', () => {
    expect(powerWithinLevel(0)).toMatchObject({ progress: 0, gap: 100 });
    expect(powerWithinLevel(175).progress).toBeCloseTo(0.5); // Ampere 100→250
    expect(powerWithinLevel(175).nextLevel?.name).toBe('TESLA');
    expect(powerWithinLevel(300)).toEqual({ progress: 1, nextLevel: null, gap: 0 });
  });

  it('keeps the highest tier reached after a lower save', () => {
    // Tesla kept, points now in the Ampere range: still MAX.
    expect(powerWithinLevel(240, 3)).toEqual({ progress: 1, nextLevel: null, gap: 0 });
    // Ampere kept, points in the Voltaic range: aims at Tesla, not Ampere.
    expect(powerWithinLevel(80, 2)).toMatchObject({ progress: 0, gap: 170 });
    expect(powerWithinLevel(80, 2).nextLevel?.name).toBe('TESLA');
    // A kept tier below the points level changes nothing.
    expect(powerWithinLevel(175, 1)).toEqual(powerWithinLevel(175));
  });
});

describe('staticWithinLevel', () => {
  it('measures progress inside Stone/Iron/Titan', () => {
    expect(staticWithinLevel(75)).toMatchObject({ progress: 0.5, gap: 75 });
    expect(staticWithinLevel(275).progress).toBeCloseTo(0.5); // Iron 150→400
    expect(staticWithinLevel(500)).toEqual({ progress: 1, nextLevel: null, gap: 0 });
  });
});
