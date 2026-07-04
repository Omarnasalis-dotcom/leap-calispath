export interface StaticMovement {
  id: string;
  name: string;
  multiplier: number;
  level: 1 | 2 | 3;
  category: 'handstand' | 'front_lever' | 'back_lever' | 'planche';
}

export const STATIC_MOVEMENTS: StaticMovement[] = [
  // Handstand
  { id: 'wall_handstand', name: 'Wall Handstand', multiplier: 0.5, level: 1, category: 'handstand' },
  { id: 'freestanding_handstand', name: 'Freestanding Handstand', multiplier: 2, level: 2, category: 'handstand' },
  { id: 'one_arm_handstand', name: 'One Arm Handstand', multiplier: 8, level: 3, category: 'handstand' },

  // Front Lever
  { id: 'tuck_front_lever', name: 'Tuck Front Lever', multiplier: 0.25, level: 1, category: 'front_lever' },
  { id: 'straddle_front_lever', name: 'Straddle Front Lever', multiplier: 1, level: 2, category: 'front_lever' },
  { id: 'full_front_lever', name: 'Full Front Lever', multiplier: 6, level: 3, category: 'front_lever' },

  // Planche
  { id: 'tuck_planche', name: 'Tuck Planche', multiplier: 1, level: 1, category: 'planche' },
  { id: 'straddle_planche', name: 'Straddle Planche', multiplier: 2, level: 2, category: 'planche' },
  { id: 'full_planche', name: 'Full Planche', multiplier: 8, level: 3, category: 'planche' },

  // Back Lever
  { id: 'tuck_back_lever', name: 'Tuck Back Lever', multiplier: 0.25, level: 1, category: 'back_lever' },
  { id: 'straddle_back_lever', name: 'Straddle Back Lever', multiplier: 1, level: 2, category: 'back_lever' },
  { id: 'full_back_lever', name: 'Full Back Lever', multiplier: 3, level: 3, category: 'back_lever' },
];

export const STATIC_LEVELS = {
  1: { name: 'STONE', subtitle: 'The Foundation', minPoints: 0 },
  2: { name: 'IRON', subtitle: 'The Control', minPoints: 150 },
  3: { name: 'TITAN', subtitle: 'The Mastery', minPoints: 400 },
};

export const STATIC_CATEGORIES = {
  handstand: { name: 'Handstand' },
  front_lever: { name: 'Front Lever' },
  back_lever: { name: 'Back Lever' },
  planche: { name: 'Planche' },
};

export function calculatePoints(movementId: string, seconds: number): number {
  const movement = STATIC_MOVEMENTS.find(m => m.id === movementId);
  if (!movement) return 0;
  return seconds * movement.multiplier;
}

export function getLevelMovements(level: 1 | 2 | 3): StaticMovement[] {
  return STATIC_MOVEMENTS.filter(m => m.level === level);
}

export function getCategoryMovements(category: string): StaticMovement[] {
  return STATIC_MOVEMENTS.filter(m => m.category === category);
}

export function isStaticWorldUnlocked(strengthTier: number): boolean {
  return strengthTier >= 1;
}

export function getStaticLevel(totalPoints: number): 1 | 2 | 3 {
  if (totalPoints >= STATIC_LEVELS[3].minPoints) return 3;
  if (totalPoints >= STATIC_LEVELS[2].minPoints) return 2;
  return 1;
}
