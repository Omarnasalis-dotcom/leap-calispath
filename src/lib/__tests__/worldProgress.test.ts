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
});

describe('staticWithinLevel', () => {
  it('measures progress inside Stone/Iron/Titan', () => {
    expect(staticWithinLevel(75)).toMatchObject({ progress: 0.5, gap: 75 });
    expect(staticWithinLevel(275).progress).toBeCloseTo(0.5); // Iron 150→400
    expect(staticWithinLevel(500)).toEqual({ progress: 1, nextLevel: null, gap: 0 });
  });
});
