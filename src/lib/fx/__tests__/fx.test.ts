jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { bump, clamp01, easeOutBack, easeOutCubic, flashAt, seg } from '../easing';
import { buildBurst, buildOrbit, jitter, orbitAt, sparkAt } from '../particles';
import { FX_BUDGET, initialQuality, isJankyRun, particleCount } from '../quality';

describe('easing', () => {
  it('clamps and windows', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(seg(0.5, 0, 1)).toBe(0.5);
    expect(seg(-1, 0, 1)).toBe(0);
    expect(seg(5, 0, 1)).toBe(1);
    expect(seg(1, 1, 1)).toBe(1); // zero-length window
  });

  it('eases with the right ends', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutBack(1, 2.6)).toBeCloseTo(1);
    expect(easeOutBack(0.6, 2)).toBeGreaterThan(1); // overshoots
  });

  it('bumps and flashes only inside their window', () => {
    expect(bump(1, 1, 0.4)).toBe(0);
    expect(bump(1.2, 1, 0.4)).toBeCloseTo(1);
    expect(bump(2, 1, 0.4)).toBe(0);
    expect(flashAt(1, 1, 0.2, 0.6)).toBeCloseTo(0.6);
    expect(flashAt(1.3, 1, 0.2, 0.6)).toBe(0);
  });
});

describe('particles', () => {
  it('matches the handoff seed table', () => {
    expect(jitter(0, 1)).toEqual({ j: 11 / 17, k: 7 / 13 });
  });

  it('builds the same burst every time', () => {
    const o = { count: 12, colors: ['#a', '#b'], dist: 48, size: 5, r0: 56 };
    expect(buildBurst(o)).toEqual(buildBurst(o));
    const b = buildBurst(o);
    expect(b).toHaveLength(12);
    expect(b[1].color).toBe('#b');
    b.forEach(p => {
      expect(p.dist).toBeGreaterThanOrEqual(48 * 0.65);
      expect(p.dist).toBeLessThanOrEqual(48 * 1.2);
      expect(p.delay).toBeLessThan(0.12);
    });
  });

  it('keeps an angle window when given', () => {
    const b = buildBurst({ count: 10, colors: ['#a'], a0: -Math.PI * 0.95, a1: -Math.PI * 0.05 });
    b.forEach(p => {
      expect(p.angle).toBeGreaterThanOrEqual(-Math.PI * 0.95);
      expect(p.angle).toBeLessThanOrEqual(-Math.PI * 0.05 + 1e-9);
    });
  });

  it('shows a spark only during its life', () => {
    expect(sparkAt(0.9, 1, 0, 50, 0, 0.9, 30, false).opacity).toBe(0); // before
    expect(sparkAt(1.4, 1, 0, 50, 0, 0.9, 30, false).opacity).toBeGreaterThan(0);
    expect(sparkAt(2.5, 1, 0, 50, 0, 0.9, 30, false).opacity).toBe(0); // after
    expect(sparkAt(1.9, 1, 0, 50, 0, 0.9, 30, false).x).toBeCloseTo(80); // r0 + full dist
    expect(sparkAt(1.9, 1, 0, 50, 0, 0.9, 30, true).y).toBeCloseTo(30); // gravity drop
  });

  it('fades orbit particles in and out of their window', () => {
    expect(orbitAt(0.9, 1, 3, 0, 86, 26, 2).opacity).toBe(0);
    expect(orbitAt(2, 1, 3, 0, 86, 26, 2).opacity).toBeGreaterThan(0);
    expect(orbitAt(3, 1, 3, 0, 86, 26, 2).opacity).toBe(0);
    expect(buildOrbit(14, ['#a', '#b'])).toHaveLength(14);
  });
});

describe('quality', () => {
  it('starts old Android on lite', () => {
    expect(initialQuality('android', 28)).toBe('lite');
    expect(initialQuality('android', 33)).toBe('full');
    expect(initialQuality('ios', '17.0')).toBe('full');
  });

  it('halves particles on lite', () => {
    expect(particleCount(24, 'lite')).toBe(12);
    expect(particleCount(9, 'lite')).toBe(5);
    expect(particleCount(24, 'full')).toBe(24);
    expect(FX_BUDGET.lite).toBeLessThan(FX_BUDGET.full);
  });

  it('flags a run as janky only with enough slow frames', () => {
    expect(isJankyRun(100, 25)).toBe(true);
    expect(isJankyRun(100, 10)).toBe(false);
    expect(isJankyRun(10, 9)).toBe(false); // too short to judge
  });
});
