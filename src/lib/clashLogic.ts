import { StaticMovement } from './staticLogic';

export interface ClashMovement {
  id: string;
  name: string;
  reps: number;
}

export interface ClashProtocol {
  movements: ClashMovement[];
  estimatedMinutes: number;
}

const DEVELOPING_POOL = [
  { id: 'pushups', name: 'Push-ups', baseReps: 30 },
  { id: 'pullups', name: 'Pull-ups', baseReps: 15 },
  { id: 'squats', name: 'Air Squats', baseReps: 40 },
  { id: 'dips', name: 'Bench Dips', baseReps: 25 },
  { id: 'knees', name: 'Knee-ups', baseReps: 20 },
];

const ELITE_POOL = [
  { id: 'muscleups', name: 'Muscle-ups', baseReps: 8 },
  { id: 'weighted_dips', name: 'Weighted Dips (+20kg)', baseReps: 15 },
  { id: 'pistol_squats', name: 'Pistol Squats', baseReps: 20 },
  { id: 'toes_to_bar', name: 'Toes to Bar', baseReps: 15 },
  { id: 'weighted_pullups', name: 'Weighted Pull-ups (+10kg)', baseReps: 12 },
];

export class ClashLogic {
  /**
   * Generates a randomized 3-movement workout protocol for a bracket
   */
  static generateProtocol(bracket: 'developing' | 'elite'): ClashProtocol {
    const pool = bracket === 'developing' ? DEVELOPING_POOL : ELITE_POOL;
    
    // Randomly shuffle and pick 3 unique movements
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    const movements: ClashMovement[] = selected.map(m => ({
      id: m.id,
      name: m.name,
      reps: m.baseReps + (Math.floor(Math.random() * 6) - 2) // Add small random variance (+/- 2 reps)
    }));

    return {
      movements,
      estimatedMinutes: 4
    };
  }

  /**
   * Calculates current progress percentage (0-100)
   */
  static calculateProgress(protocol: ClashProtocol, completedReps: Record<string, number>): number {
    const totalReps = protocol.movements.reduce((acc, m) => acc + m.reps, 0);
    const totalCompleted = protocol.movements.reduce((acc, m) => acc + (completedReps[m.id] || 0), 0);
    
    return Math.min(100, Math.round((totalCompleted / totalReps) * 100));
  }
}
