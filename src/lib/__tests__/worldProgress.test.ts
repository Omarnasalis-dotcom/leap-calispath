import {
  clamp01,
  powerLevelProgress,
  powerMovementProgress,
  staticHoldProgress,
  staticLevelProgress,
  oneMMTarget,
  oneMMProgress,
  rankGapProgress,
  STATIC_HOLD_TARGET_SECONDS,
} from '../worldProgress';

describe('worldProgress', () => {
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

  describe('powerLevelProgress', () => {
    it('is empty at 0 points', () => {
      const { progress, nextLevel, gap } = powerLevelProgress(0);
      expect(progress).toBe(0);
      expect(nextLevel?.name).toBe('AMPERE');
      expect(gap).toBe(100);
    });

    it('fills toward AMPERE at 100 points', () => {
      expect(powerLevelProgress(50).progress).toBe(0.5);
    });

    it('fills toward TESLA once in AMPERE', () => {
      const { progress, nextLevel } = powerLevelProgress(125);
      expect(nextLevel?.name).toBe('TESLA');
      expect(progress).toBe(0.5);
    });

    it('is full at max level with no next level', () => {
      const { progress, nextLevel, gap } = powerLevelProgress(300);
      expect(progress).toBe(1);
      expect(nextLevel).toBeNull();
      expect(gap).toBe(0);
    });
  });

  describe('powerMovementProgress', () => {
    it('is empty with nothing logged', () => {
      expect(powerMovementProgress(0, 0)).toBe(0);
    });

    it('fills toward a quarter of the next level threshold', () => {
      // Next level AMPERE at 100 → fair share 25 pts per movement.
      expect(powerMovementProgress(12.5, 50)).toBe(0.5);
      expect(powerMovementProgress(25, 50)).toBe(1);
    });

    it('shows logged movements as full at max level', () => {
      expect(powerMovementProgress(80, 300)).toBe(1);
      expect(powerMovementProgress(0, 300)).toBe(0);
    });
  });

  describe('staticHoldProgress', () => {
    it('is empty at 0 seconds and full at the 30s target', () => {
      expect(staticHoldProgress(0)).toBe(0);
      expect(staticHoldProgress(STATIC_HOLD_TARGET_SECONDS)).toBe(1);
      expect(staticHoldProgress(15)).toBe(0.5);
    });
  });

  describe('staticLevelProgress', () => {
    it('is empty at 0 points with IRON as next', () => {
      const { progress, nextLevel } = staticLevelProgress(0);
      expect(progress).toBe(0);
      expect(nextLevel?.name).toBe('IRON');
    });

    it('is full at TITAN', () => {
      const { progress, nextLevel } = staticLevelProgress(500);
      expect(progress).toBe(1);
      expect(nextLevel).toBeNull();
    });
  });

  describe('oneMM targets', () => {
    it('uses the handoff-specified 20-rep knee push-up target', () => {
      expect(oneMMTarget('knee_push_ups')).toBe(20);
      expect(oneMMProgress('knee_push_ups', 0)).toBe(0);
      expect(oneMMProgress('knee_push_ups', 10)).toBe(0.5);
      expect(oneMMProgress('knee_push_ups', 40)).toBe(1);
    });

    it('falls back to a default target for unknown movements', () => {
      expect(oneMMTarget('unknown')).toBe(20);
    });
  });

  describe('rankGapProgress', () => {
    it('is honestly empty for unranked users (the original 100%-at-rank-0 bug)', () => {
      expect(rankGapProgress(0, 0, 0)).toBe(0);
      expect(rankGapProgress(0, 50, 0)).toBe(0);
    });

    it('is full only at genuine rank 1', () => {
      expect(rankGapProgress(200, 0, 1)).toBe(1);
    });

    it('fills by share of the next rank score', () => {
      expect(rankGapProgress(50, 50, 3)).toBe(0.5);
    });
  });
});
