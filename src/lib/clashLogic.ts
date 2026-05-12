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

const DEVELOPING_GROUPS = [
  [
    { id: 'banded_pullups', name: 'Banded Pull-ups', baseReps: 10 },
    { id: 'inverted_row', name: 'Inverted Row', baseReps: 15 },
  ],
  [
    { id: 'squats', name: 'Air Squats', baseReps: 30 },
    { id: 'lunges', name: 'Lunges', baseReps: 10 },
  ],
  [
    { id: 'dips', name: 'Bench Dips', baseReps: 25 },
    { id: 'knees', name: 'Knee-ups', baseReps: 20 },
  ],
  [
    { id: 'burpees', name: 'Burpees', baseReps: 8 },
    { id: 'hanging_knees', name: 'Hanging Knee Raises', baseReps: 15 },
  ],
];

const ELITE_GROUPS = [
  [
    { id: 'muscleups', name: 'Muscle-ups', baseReps: 8 },
  ],
  [
    { id: 'weighted_dips', name: 'Weighted Dips (+20kg)', baseReps: 15 },
    { id: 'dips', name: 'Dips', baseReps: 30 },
  ],
  [
    { id: 'weighted_squats', name: 'Weighted Squats (+20kg)', baseReps: 20 },
    { id: 'pistol_squats', name: 'Pistol Squats', baseReps: 10 },
  ],
  [
    { id: 'burpees_elite', name: 'Burpees', baseReps: 10 },
    { id: 'toes_to_bar', name: 'Toes to Bar', baseReps: 15 },
  ],
  [
    { id: 'weighted_pullups', name: 'Weighted Pull-ups (+10kg)', baseReps: 12 },
    { id: 'pullups', name: 'Pull-ups', baseReps: 15 },
  ],
];

export class ClashLogic {
  /**
   * Generates a randomized 3-movement workout protocol for a bracket
   * Ensures one movement per category group
   */
  static generateProtocol(bracket: 'developing' | 'elite'): ClashProtocol {
    const groups = bracket === 'developing' ? DEVELOPING_GROUPS : ELITE_GROUPS;
    
    // 1. Pick 3 random unique categories
    const shuffledGroups = [...groups].sort(() => 0.5 - Math.random());
    const selectedGroups = shuffledGroups.slice(0, 3);

    // 2. Pick 1 random exercise from each chosen category
    const movements: ClashMovement[] = selectedGroups.map(group => {
      const movement = group[Math.floor(Math.random() * group.length)];
      return {
        id: movement.id,
        name: movement.name,
        reps: movement.baseReps + (Math.floor(Math.random() * 5) - 2) // Variance of exactly -2, -1, 0, 1, or 2
      };
    });

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
