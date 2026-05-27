import { TrialService } from '../TrialService';
import { TIER_HARD_FLOORS } from '../../constants/Progression';

describe('TrialService', () => {
  describe('isTimeValid', () => {
    it('should return false if tier does not exist in TIER_HARD_FLOORS', () => {
      expect(TrialService.isTimeValid(99, 100)).toBe(false);
    });

    it('should return false if time is exactly at the floor but slightly lower due to decimals', () => {
      const tier = 0;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor - 0.1)).toBe(false);
    });

    it('should return false if time is significantly below the floor', () => {
      const tier = 4;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor - 10)).toBe(false);
    });

    it('should return true if time is exactly at the floor', () => {
      const tier = 2;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor)).toBe(true);
    });

    it('should return true if time is above the floor', () => {
      const tier = 8;
      const floor = TIER_HARD_FLOORS[tier];
      expect(TrialService.isTimeValid(tier, floor + 50)).toBe(true);
    });
  });
});
