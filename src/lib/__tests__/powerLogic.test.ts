import {
  calculatePowerPoints,
  calculateTotalPowerScore,
  getPowerLevel,
  isPowerWorldUnlocked,
  POWER_LEVELS
} from '../powerLogic';

describe('powerLogic', () => {
  describe('calculatePowerPoints', () => {
    it('should return 1x for pull_up, dip, and squat', () => {
      expect(calculatePowerPoints('pull_up', 50)).toBe(50);
      expect(calculatePowerPoints('dip', 30)).toBe(30);
      expect(calculatePowerPoints('squat', 100)).toBe(100);
    });

    it('should return 2x for muscle_up', () => {
      expect(calculatePowerPoints('muscle_up', 10)).toBe(20);
    });

    it('should return 0 for unknown movement', () => {
      expect(calculatePowerPoints('unknown_move', 100)).toBe(0);
    });
  });

  describe('calculateTotalPowerScore', () => {
    it('should correctly sum all movements with multipliers', () => {
      const pbs = {
        pull_up: 50,
        dip: 30,
        squat: 100,
        muscle_up: 10,
      };
      // 50 + 30 + 100 + (10*2) = 200
      expect(calculateTotalPowerScore(pbs)).toBe(200);
    });

    it('should handle missing values as 0', () => {
      const pbs = { pull_up: 50 };
      expect(calculateTotalPowerScore(pbs)).toBe(50);
    });
  });

  describe('getPowerLevel', () => {
    it('should return Level 1 (VOLTAIC) for points below 100', () => {
      expect(getPowerLevel(99)).toEqual(POWER_LEVELS[1]);
      expect(getPowerLevel(0)).toEqual(POWER_LEVELS[1]);
    });

    it('should return Level 2 (AMPERE) for points between 100 and 249', () => {
      expect(getPowerLevel(100)).toEqual(POWER_LEVELS[2]);
      expect(getPowerLevel(249)).toEqual(POWER_LEVELS[2]);
    });

    it('should return Level 3 (TESLA) for points 250 and above', () => {
      expect(getPowerLevel(250)).toEqual(POWER_LEVELS[3]);
      expect(getPowerLevel(1000)).toEqual(POWER_LEVELS[3]);
    });
  });

  describe('isPowerWorldUnlocked', () => {
    it('should return true if tier is 6 or above', () => {
      expect(isPowerWorldUnlocked(6)).toBe(true);
      expect(isPowerWorldUnlocked(9)).toBe(true);
    });

    it('should return false if tier is below 6', () => {
      expect(isPowerWorldUnlocked(5)).toBe(false);
      expect(isPowerWorldUnlocked(0)).toBe(false);
    });
  });
});
