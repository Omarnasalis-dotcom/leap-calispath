import { ClashLogic } from '../clashLogic';

describe('ClashLogic', () => {
  describe('generateProtocol', () => {
    it('should always return exactly 3 movements', () => {
      const protocol = ClashLogic.generateProtocol('developing');
      expect(protocol.movements).toHaveLength(3);
    });

    it('should always return exactly 3 movements for elite bracket', () => {
      const protocol = ClashLogic.generateProtocol('elite');
      expect(protocol.movements).toHaveLength(3);
    });

    it('should always return estimatedMinutes of 4', () => {
      const protocol = ClashLogic.generateProtocol('developing');
      expect(protocol.estimatedMinutes).toBe(4);
    });

    it('should return unique movement ids', () => {
      const protocol = ClashLogic.generateProtocol('developing');
      const ids = protocol.movements.map(m => m.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should return reps within valid variance range for developing', () => {
      for (let i = 0; i < 20; i++) {
        const protocol = ClashLogic.generateProtocol('developing');
        protocol.movements.forEach(m => {
          expect(m.reps).toBeGreaterThanOrEqual(6); // min baseReps(8) - 2
          expect(m.reps).toBeLessThanOrEqual(32);   // max baseReps(30) + 2
        });
      }
    });

    it('should only use developing movements for developing bracket', () => {
      const developingIds = [
        'banded_pullups', 'inverted_row', 'squats', 'lunges',
        'dips', 'knees', 'burpees', 'hanging_knees'
      ];
      for (let i = 0; i < 20; i++) {
        const protocol = ClashLogic.generateProtocol('developing');
        protocol.movements.forEach(m => {
          expect(developingIds).toContain(m.id);
        });
      }
    });

    it('should only use elite movements for elite bracket', () => {
      const eliteIds = [
        'muscleups', 'weighted_dips', 'dips', 'weighted_squats',
        'pistol_squats', 'burpees_elite', 'toes_to_bar',
        'weighted_pullups', 'pullups'
      ];
      for (let i = 0; i < 20; i++) {
        const protocol = ClashLogic.generateProtocol('elite');
        protocol.movements.forEach(m => {
          expect(eliteIds).toContain(m.id);
        });
      }
    });
  });

  describe('calculateProgress', () => {
    const protocol = {
      movements: [
        { id: 'squats', name: 'Air Squats', reps: 100 },
        { id: 'dips', name: 'Bench Dips', reps: 50 },
        { id: 'burpees', name: 'Burpees', reps: 50 },
      ],
      estimatedMinutes: 4,
    };

    it('should return 0 when nothing completed', () => {
      expect(ClashLogic.calculateProgress(protocol, {})).toBe(0);
    });

    it('should return 100 when everything completed', () => {
      const completed = { squats: 100, dips: 50, burpees: 50 };
      expect(ClashLogic.calculateProgress(protocol, completed)).toBe(100);
    });

    it('should return 50 when half completed', () => {
      const completed = { squats: 50, dips: 25, burpees: 25 };
      expect(ClashLogic.calculateProgress(protocol, completed)).toBe(50);
    });

    it('should cap at 100 even if reps exceed target', () => {
      const completed = { squats: 999, dips: 999, burpees: 999 };
      expect(ClashLogic.calculateProgress(protocol, completed)).toBe(100);
    });

    it('should handle missing movement ids as 0', () => {
      const completed = { squats: 100 };
      expect(ClashLogic.calculateProgress(protocol, completed)).toBe(50);
    });
  });
});
